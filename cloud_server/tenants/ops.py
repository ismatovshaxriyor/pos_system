"""
Jonli monitor ("Ops") uchun ma'lumot qatlami: Ona serverining o'z holati,
Bolalar (restoranlar) holati va ular ustida amallar.

Dizayn qoidalari:
- Hech narsa DB'ga tez-tez yozilmaydi: tarix (sparkline) Redis keshida
  (`cache`), Bola heartbeat'i DB-yozuv siyosatiga (write-cheap) tegilmaydi.
- Hamma tashqi tekshiruv (Celery inspect, website HTTP, backup papka) qisqa
  muddatga keshlanadi - sahifa har 3 soniyada so'rov yuborsa ham og'irlashmaydi.
- Bolalardan kelgan matnlar (xato xabarlari, nomlar) NOISHONCH ma'lumot:
  bu modul ularni xom holda qaytaradi, frontend faqat textContent bilan chiqaradi.
"""
import os
import platform
import socket
import time
import urllib.request
from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import psutil
from django.conf import settings
from django.contrib.admin.models import CHANGE, LogEntry
from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from packaging.version import InvalidVersion, Version

from .models import ErrorLog, License, RemoteCommand, Restaurant, SyncedOrder, SyncedOrderItem, SyncedPayment
from .signals import compute_default_license_expiry
from .updates import UPDATE_MODE_WINDOW, UPDATE_MODES, update_payload

OPS_TZ = ZoneInfo('Asia/Tashkent')  # Bola'dagi RESTAURANT_TZ bilan bir xil - "bugun" shu bo'yicha

SAMPLES_KEY = 'ops:samples'
SAMPLES_MAX = 360          # 30s * 360 = 3 soat
HIST_KEY = 'ops:hist:{}'
HIST_MAX = 180             # 60s * 180 = 3 soat
BEAT_KEY = 'ops:beat_last'

OFFLINE_FRESH_SECONDS = 150          # heartbeat shundan yangi bo'lsa - onlayn
OFFLINE_CRITICAL_MINUTES = 10
LICENSE_WARNING_DAYS = 7
BACKUP_STALE_HOURS = 36


# --------------------------------------------------------------------------
# Tarix (Redis keshi)
# --------------------------------------------------------------------------

def record_heartbeat(restaurant_id, metrics):
    """Bola heartbeat'ida chaqiriladi: oxirgi 3 soatlik metrikalar tarixi. Xatolari yutiladi."""
    try:
        key = HIST_KEY.format(restaurant_id)
        hist = cache.get(key) or []
        hist.append({
            'ts': time.time(),
            'cpu': metrics.get('cpu_percent'),
            'ram': metrics.get('ram_percent'),
            'disk': metrics.get('disk_percent'),
            'unsynced': metrics.get('unsynced_count'),
            'v': metrics.get('app_version', ''),
        })
        cache.set(key, hist[-HIST_MAX:], timeout=24 * 3600)
    except Exception:  # monitoring hech qachon heartbeat'ni buzmasligi kerak
        pass


def record_server_sample():
    """Celery beat har 30 soniyada: Ona serverining yengil namunasi (grafik tarixi uchun)."""
    now = time.time()
    net = psutil.net_io_counters()
    sample = {
        'ts': now,
        'cpu': psutil.cpu_percent(interval=None),
        'ram': psutil.virtual_memory().percent,
        'disk': psutil.disk_usage('/').percent,
        'load1': os.getloadavg()[0],
        'net_sent': net.bytes_sent,
        'net_recv': net.bytes_recv,
    }
    samples = cache.get(SAMPLES_KEY) or []
    samples.append(sample)
    cache.set(SAMPLES_KEY, samples[-SAMPLES_MAX:], timeout=24 * 3600)
    cache.set(BEAT_KEY, now, timeout=24 * 3600)
    return sample


def server_history():
    return cache.get(SAMPLES_KEY) or []


# --------------------------------------------------------------------------
# Server holati
# --------------------------------------------------------------------------

def _timed(fn):
    t = time.perf_counter()
    try:
        data = fn() or {}
        data.setdefault('ok', True)
    except Exception as exc:  # holat sahifasi tekshiruv xatosidan yiqilmasin
        data = {'ok': False, 'error': f'{type(exc).__name__}: {exc}'[:200]}
    data['latency_ms'] = round((time.perf_counter() - t) * 1000, 1)
    return data


def _check_db():
    with connection.cursor() as cur:
        cur.execute('SELECT 1')
        cur.execute('SELECT pg_database_size(current_database())')
        size = cur.fetchone()[0]
        cur.execute('SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()')
        conns = cur.fetchone()[0]
        cur.execute('SHOW max_connections')
        max_conns = int(cur.fetchone()[0])
        cur.execute('SHOW server_version')
        version = cur.fetchone()[0]
    return {'size_bytes': size, 'connections': conns, 'max_connections': max_conns, 'version': version}


_redis_client = None


def _redis():
    global _redis_client
    if _redis_client is None:
        import redis
        _redis_client = redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_timeout=1.5, socket_connect_timeout=1.5)
    return _redis_client


def _check_redis():
    r = _redis()
    r.ping()
    info = r.info()
    return {
        'version': info.get('redis_version'),
        'used_memory': info.get('used_memory'),
        'maxmemory': info.get('maxmemory'),
        'clients': info.get('connected_clients'),
        'ops_per_sec': info.get('instantaneous_ops_per_sec'),
        'uptime_s': info.get('uptime_in_seconds'),
        'keys': sum(v.get('keys', 0) for k, v in info.items() if k.startswith('db') and isinstance(v, dict)),
        'queue_len': r.llen('celery'),
    }


def _check_celery():
    """Worker'lar tirikligi. inspect() 1s gacha bloklaydi - shuning uchun 10s keshlanadi."""
    cached = cache.get('ops:celery')
    if cached is not None:
        return cached

    def run():
        from config.celery import app
        insp = app.control.inspect(timeout=1.0)
        ping = insp.ping() or {}
        active = insp.active() or {}
        workers = [
            {'name': name, 'active_tasks': len(active.get(name, []))}
            for name in sorted(ping)
        ]
        return {'ok': bool(workers), 'workers': workers, 'error': '' if workers else 'Hech bir worker javob bermadi'}

    data = _timed(run)
    beat_ts = cache.get(BEAT_KEY)
    data['beat_age_s'] = round(time.time() - beat_ts) if beat_ts else None
    data['beat_ok'] = beat_ts is not None and time.time() - beat_ts < 120
    cache.set('ops:celery', data, timeout=10)
    return data


def _check_website():
    cached = cache.get('ops:website')
    if cached is not None:
        return cached
    url = getattr(settings, 'OPS_WEBSITE_URL', 'http://website:80/')

    def run():
        with urllib.request.urlopen(url, timeout=1.5) as resp:  # noqa: S310 - ichki Docker tarmog'i
            return {'status': resp.status, 'ok': 200 <= resp.status < 400}

    data = _timed(run)
    cache.set('ops:website', data, timeout=10)
    return data


def _backups():
    """`db_backup` va deploy oldidagi pg_dump fayllari (./backups papkasi web'ga faqat o'qish uchun ulangan)."""
    cached = cache.get('ops:backups')
    if cached is not None:
        return cached
    root = getattr(settings, 'OPS_BACKUP_DIR', '/backups')
    files = []
    if os.path.isdir(root):
        for d, _, names in os.walk(root):
            for n in names:
                if n.endswith(('.sql', '.sql.gz', '.gz')):
                    p = os.path.join(d, n)
                    try:
                        st = os.stat(p)
                    except OSError:
                        continue
                    files.append((st.st_mtime, st.st_size, n))
    if not files:
        data = {'available': os.path.isdir(root), 'count': 0, 'ok': False, 'error': 'Zaxira fayli topilmadi'}
    else:
        files.sort(reverse=True)
        newest = files[0]
        age_h = (time.time() - newest[0]) / 3600
        data = {
            'available': True, 'count': len(files), 'newest_name': newest[2], 'newest_size': newest[1],
            'newest_age_h': round(age_h, 1), 'total_size': sum(f[1] for f in files),
            'ok': age_h <= BACKUP_STALE_HOURS,
            'error': '' if age_h <= BACKUP_STALE_HOURS else f'Oxirgi zaxira {age_h:.0f} soat oldin',
        }
    cache.set('ops:backups', data, timeout=60)
    return data


def _top_processes(limit=8):
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'cmdline', 'memory_info']):
        try:
            mi = p.info['memory_info']
            if not mi:
                continue
            cmd = ' '.join(p.info['cmdline'] or [p.info['name'] or '?'])
            procs.append({'pid': p.info['pid'], 'cmd': cmd[:90], 'rss': mi.rss})
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x['rss'], reverse=True)
    return procs[:limit]


def server_snapshot(request=None):
    now = time.time()
    percpu = psutil.cpu_percent(interval=0.2, percpu=True)
    vm = psutil.virtual_memory()
    sw = psutil.swap_memory()
    disk = psutil.disk_usage('/')
    net = psutil.net_io_counters()
    dio = psutil.disk_io_counters()
    try:
        load = os.getloadavg()
    except OSError:
        load = (0, 0, 0)

    services = {
        'db': _timed(_check_db),
        'redis': _timed(_check_redis),
        'celery': _check_celery(),
        'website': _check_website(),
    }
    backups = _backups()

    cf = {}
    if request is not None:
        cf = {
            'via_cloudflare': bool(request.META.get('HTTP_CF_CONNECTING_IP')),
            'ray': request.META.get('HTTP_CF_RAY', ''),
            'country': request.META.get('HTTP_CF_IPCOUNTRY', ''),
        }

    alerts = []
    if vm.percent >= 90:
        alerts.append({'level': 'critical', 'text': f'Server RAM {vm.percent:.0f}% band'})
    elif vm.percent >= 80:
        alerts.append({'level': 'warn', 'text': f'Server RAM {vm.percent:.0f}% band'})
    if disk.percent >= 90:
        alerts.append({'level': 'critical', 'text': f'Server disk {disk.percent:.0f}% to\'lgan'})
    elif disk.percent >= 80:
        alerts.append({'level': 'warn', 'text': f'Server disk {disk.percent:.0f}% to\'lgan'})
    names = {'db': 'Postgres', 'redis': 'Redis', 'celery': 'Celery worker', 'website': 'Sayt (nginx)'}
    for key, svc in services.items():
        if not svc.get('ok'):
            alerts.append({'level': 'critical', 'text': f"{names[key]} ishlamayapti: {svc.get('error', '')}"})
    if services['celery'].get('ok') and not services['celery'].get('beat_ok'):
        alerts.append({'level': 'critical', 'text': 'Celery beat ishlamayapti (jadvalli vazifalar to\'xtagan)'})
    if services['redis'].get('ok') and (services['redis'].get('queue_len') or 0) > 100:
        alerts.append({'level': 'warn', 'text': f"Celery navbati to'planmoqda: {services['redis']['queue_len']} ta vazifa"})
    if backups.get('available') and not backups.get('ok'):
        alerts.append({'level': 'warn', 'text': f"Zaxira: {backups.get('error')}"})

    return {
        'ts': now,
        'host': {
            'hostname': socket.gethostname(),
            'platform': platform.platform(),
            'python': platform.python_version(),
            'cpu_count': psutil.cpu_count(),
            'uptime_s': round(now - psutil.boot_time()),
            'debug': settings.DEBUG,
        },
        'cpu': {'percent': round(sum(percpu) / len(percpu), 1) if percpu else 0, 'per_core': percpu, 'load': [round(x, 2) for x in load]},
        'ram': {'total': vm.total, 'used': vm.total - vm.available, 'percent': vm.percent},
        'swap': {'total': sw.total, 'used': sw.used, 'percent': sw.percent},
        'disk': {'total': disk.total, 'used': disk.used, 'percent': disk.percent},
        'net': {'sent': net.bytes_sent, 'recv': net.bytes_recv},
        'diskio': {'read': dio.read_bytes, 'write': dio.write_bytes} if dio else None,
        'services': services,
        'backups': backups,
        'cloudflare': cf,
        'processes': _top_processes(),
        'alerts': alerts,
    }


# --------------------------------------------------------------------------
# Bolalar (restoranlar) holati
# --------------------------------------------------------------------------

def _ver(v):
    try:
        return Version(v)
    except (InvalidVersion, TypeError):
        return None


def _target_version(restaurants, live_versions):
    """Flot uchun "kutilgan" versiya: eng yuqori desired_version yoki hisobot qilingan eng yuqori versiya."""
    candidates = [r.desired_version for r in restaurants if r.desired_version] + list(live_versions)
    parsed = [(_ver(v), v) for v in candidates if _ver(v)]
    return max(parsed)[1] if parsed else ''


def _day_start():
    local_now = timezone.now().astimezone(OPS_TZ)
    return local_now.replace(hour=0, minute=0, second=0, microsecond=0)


def _fmt_age(seconds):
    seconds = int(seconds)
    if seconds < 90:
        return f'{seconds} soniya'
    if seconds < 5400:
        return f'{round(seconds / 60)} daqiqa'
    if seconds < 172800:
        return f'{round(seconds / 3600)} soat'
    return f'{round(seconds / 86400)} kun'


def fleet_snapshot():
    now = timezone.now()
    day_start = _day_start()
    restaurants = list(Restaurant.objects.select_related('license', 'status').order_by('name'))
    ids = [r.id for r in restaurants]

    live = cache.get_many([f'restaurant_metrics_{i}' for i in ids])
    hists = cache.get_many([HIST_KEY.format(i) for i in ids])

    revenue = {
        row['order__restaurant_id']: row['total']
        for row in SyncedPayment.objects.filter(is_voided=False, received_at__gte=day_start)
        .values('order__restaurant_id').annotate(total=Sum('amount'))
    }
    orders_today = {
        row['restaurant_id']: row['n']
        for row in SyncedOrder.objects.filter(status='completed', closed_at__gte=day_start)
        .values('restaurant_id').annotate(n=Count('id'))
    }
    errors = {
        row['restaurant_id']: row
        for row in ErrorLog.objects.filter(is_resolved=False).values('restaurant_id').annotate(
            n=Count('id'), critical=Count('id', filter=Q(level='CRITICAL')), last=Max('received_at'),
        )
    }
    cmds_open = {
        row['restaurant_id']: row['n']
        for row in RemoteCommand.objects.filter(status__in=['pending', 'sent', 'acknowledged'])
        .values('restaurant_id').annotate(n=Count('id'))
    }
    cmds_failed = {
        row['restaurant_id']: row['n']
        for row in RemoteCommand.objects.filter(status='failed', created_at__gte=now - timedelta(hours=24))
        .values('restaurant_id').annotate(n=Count('id'))
    }

    live_versions = []
    for r in restaurants:
        m = live.get(f'restaurant_metrics_{r.id}')
        st = getattr(r, 'status', None) if hasattr(r, 'status') else None
        v = (m or {}).get('app_version') or (st.app_version if st else '')
        if v:
            live_versions.append(v)
    target = _target_version(restaurants, live_versions)
    target_v = _ver(target)

    items = []
    summary = {'total': len(restaurants), 'online': 0, 'offline': 0, 'blocked': 0, 'expired': 0, 'pending': 0}
    versions = {}
    severity_counts = {'critical': 0, 'warn': 0}

    for r in restaurants:
        lic = getattr(r, 'license', None)
        m = live.get(f'restaurant_metrics_{r.id}')
        hist = hists.get(HIST_KEY.format(r.id)) or []
        st = getattr(r, 'status', None)

        hb_ts = hist[-1]['ts'] if hist else None
        hb_age = (time.time() - hb_ts) if hb_ts else None
        last_seen = r.last_seen.timestamp() if r.last_seen else None
        if hb_ts and (not last_seen or hb_ts > last_seen):
            last_seen = hb_ts
        seen_age = (time.time() - last_seen) if last_seen else None

        online = bool(m) or (hb_age is not None and hb_age < OFFLINE_FRESH_SECONDS) or (
            r.is_online and seen_age is not None and seen_age < 180
        )

        cpu = (m or {}).get('cpu_percent', st.cpu_percent if st else None)
        ram = (m or {}).get('ram_percent', st.ram_percent if st else None)
        disk = (m or {}).get('disk_percent', st.disk_percent if st else None)
        version = (m or {}).get('app_version') or (st.app_version if st else '')
        unsynced = (m or {}).get('unsynced_count', st.unsynced_count if st else None)
        last_order = (m or {}).get('last_order_at') or (st.last_order_at.isoformat() if st and st.last_order_at else None)

        days_left = None
        expired = False
        lic_active = True
        bound = False
        if lic:
            lic_active = lic.is_active
            bound = bool(lic.hardware_hash)
            delta = lic.expires_at - now
            days_left = delta.days if delta.total_seconds() >= 0 else -((-delta).days + 1)
            expired = delta.total_seconds() < 0

        if not r.is_active or not lic_active:
            state = 'blocked'
        elif expired:
            state = 'expired'
        elif not bound and not last_seen:
            state = 'pending'
        elif online:
            state = 'online'
        else:
            state = 'offline'
        summary[state] = summary.get(state, 0) + 1

        err = errors.get(r.id)
        alerts = []

        def add(level, code, text):
            alerts.append({'level': level, 'code': code, 'text': text})

        if state == 'offline':
            mins = (seen_age or 0) / 60
            add('critical' if mins >= OFFLINE_CRITICAL_MINUTES else 'warn', 'offline',
                f'Oflayn: {_fmt_age(seen_age)} oldin oxirgi signal' if seen_age else 'Oflayn')
        if state == 'pending':
            add('info', 'pending', 'Hali faollashtirilmagan (Bola ulanmagan)')
        if state == 'blocked':
            add('critical', 'blocked', 'Tizim bloklangan')
        if expired:
            add('critical', 'license_expired', f'Litsenziya muddati o\'tgan ({-days_left} kun)' if days_left is not None else 'Litsenziya muddati o\'tgan')
        elif days_left is not None and days_left <= LICENSE_WARNING_DAYS:
            add('warn', 'license_soon', f'Litsenziya {days_left} kundan keyin tugaydi')
        if disk is not None:
            if disk >= 90:
                add('critical', 'disk', f'Disk {disk:.0f}% to\'lgan')
            elif disk >= 80:
                add('warn', 'disk', f'Disk {disk:.0f}% to\'lgan')
        if ram is not None:
            if ram >= 90:
                add('critical', 'ram', f'RAM {ram:.0f}% band')
            elif ram >= 80:
                add('warn', 'ram', f'RAM {ram:.0f}% band')
        if cpu is not None and cpu >= 95:
            add('warn', 'cpu', f'CPU {cpu:.0f}%')
        if unsynced is not None and unsynced >= 100:
            add('critical' if unsynced >= 500 else 'warn', 'unsynced', f'{unsynced} ta buyurtma Ona\'ga yetkazilmagan')
        if version and target_v and _ver(version) and _ver(version) < target_v:
            add('warn', 'outdated', f'Eski versiya: {version} (kutilgan {target})')
        if err:
            add('critical' if err['critical'] else 'warn', 'errors', f"{err['n']} ta hal qilinmagan xato")
        if cmds_failed.get(r.id):
            add('warn', 'cmd_failed', f"{cmds_failed[r.id]} ta buyruq xato bilan tugadi (24 soat)")

        for a in alerts:
            if a['level'] in severity_counts:
                severity_counts[a['level']] += 1

        if version:
            versions[version] = versions.get(version, 0) + 1

        spark = hist[-40:]
        items.append({
            'id': str(r.id), 'name': r.name, 'subdomain': r.subdomain, 'state': state,
            'is_active': r.is_active, 'online': online,
            'last_seen': last_seen, 'seen_age_s': round(seen_age) if seen_age is not None else None,
            'cpu': cpu, 'ram': ram, 'disk': disk, 'version': version, 'desired_version': r.desired_version,
            'unsynced': unsynced, 'last_order_at': last_order,
            'license': {
                'active': lic_active, 'expires_at': lic.expires_at.isoformat() if lic else None,
                'days_left': days_left, 'bound': bound,
            },
            'today': {'revenue': str(revenue.get(r.id, Decimal('0'))), 'orders': orders_today.get(r.id, 0)},
            'errors_open': err['n'] if err else 0,
            'cmds_open': cmds_open.get(r.id, 0),
            'alerts': alerts,
            'spark': {'cpu': [s['cpu'] for s in spark], 'ram': [s['ram'] for s in spark]},
        })

    # Eng muammolilar yuqorida
    rank = {'critical': 0, 'warn': 1, 'info': 2}
    items.sort(key=lambda x: (min([rank[a['level']] for a in x['alerts']] or [3]), x['name'].lower()))

    total_revenue = sum((Decimal(i['today']['revenue']) for i in items), Decimal('0'))
    daily = [
        {'day': row['d'].isoformat(), 'revenue': str(row['total'] or 0)}
        for row in SyncedPayment.objects.filter(is_voided=False, received_at__gte=day_start - timedelta(days=6))
        .annotate(d=TruncDate('received_at', tzinfo=OPS_TZ)).values('d').annotate(total=Sum('amount')).order_by('d')
    ]

    summary.update({
        'revenue_today': str(total_revenue),
        'orders_today': sum(i['today']['orders'] for i in items),
        'alerts_critical': severity_counts['critical'],
        'alerts_warn': severity_counts['warn'],
        'errors_open': sum(i['errors_open'] for i in items),
        'unsynced_total': sum(i['unsynced'] or 0 for i in items),
        'target_version': target,
        'versions': versions,
        'daily_revenue': daily,
    })
    return {'summary': summary, 'restaurants': items}


def recent_events():
    errors = [
        {
            'id': str(e.id), 'restaurant': e.restaurant.name, 'restaurant_id': str(e.restaurant_id), 'level': e.level,
            'message': e.message[:300], 'logger': e.logger_name, 'module': e.module,
            'received_at': e.received_at.timestamp(), 'resolved': e.is_resolved,
        }
        for e in ErrorLog.objects.select_related('restaurant').order_by('-received_at')[:20]
    ]
    commands = [
        {
            'id': str(c.id), 'restaurant': c.restaurant.name, 'restaurant_id': str(c.restaurant_id),
            'type': c.command_type, 'label': c.get_command_type_display(), 'status': c.status,
            'payload': c.payload, 'result': c.result, 'created_at': c.created_at.timestamp(),
        }
        for c in RemoteCommand.objects.select_related('restaurant').order_by('-created_at')[:20]
    ]
    audit = [
        {
            'user': le.user.get_username(), 'object': le.object_repr, 'message': le.get_change_message()[:200],
            'at': le.action_time.timestamp(),
        }
        for le in LogEntry.objects.select_related('user').order_by('-action_time')[:15]
    ]
    return {'errors': errors, 'commands': commands, 'audit': audit}


def restaurant_detail(restaurant_id):
    r = Restaurant.objects.select_related('license', 'status').get(pk=restaurant_id)
    lic = getattr(r, 'license', None)
    now = timezone.now()
    day_start = _day_start()
    hist = cache.get(HIST_KEY.format(r.id)) or []

    sales_days = [
        {'day': row['d'].isoformat(), 'revenue': str(row['total'] or 0)}
        for row in SyncedPayment.objects.filter(
            order__restaurant=r, is_voided=False, received_at__gte=day_start - timedelta(days=13),
        ).annotate(d=TruncDate('received_at', tzinfo=OPS_TZ)).values('d').annotate(total=Sum('amount')).order_by('d')
    ]
    methods = {
        row['method']: str(row['total'])
        for row in SyncedPayment.objects.filter(order__restaurant=r, is_voided=False, received_at__gte=day_start)
        .values('method').annotate(total=Sum('amount'))
    }
    top_products = [
        {'name': row['product_name'], 'qty': row['qty']}
        for row in SyncedOrderItem.objects.filter(order__restaurant=r, order__closed_at__gte=day_start - timedelta(days=6))
        .values('product_name').annotate(qty=Sum('quantity')).order_by('-qty')[:6]
    ]
    last_orders = [
        {
            'amount': str(o.final_amount), 'waiter': o.waiter_name, 'type': o.order_type, 'status': o.status,
            'at': (o.closed_at or o.received_at).timestamp(),
        }
        for o in r.synced_orders.order_by('-received_at')[:8]
    ]
    errors = [
        {
            'id': str(e.id), 'level': e.level, 'message': e.message[:500], 'traceback': e.traceback[-2500:],
            'module': e.module, 'func': e.func_name, 'line': e.line_no, 'at': e.received_at.timestamp(),
            'resolved': e.is_resolved,
        }
        for e in r.error_logs.order_by('-received_at')[:25]
    ]
    commands = [
        {
            'id': str(c.id), 'type': c.command_type, 'label': c.get_command_type_display(), 'status': c.status,
            'payload': c.payload, 'result': c.result, 'at': c.created_at.timestamp(),
        }
        for c in r.commands.order_by('-created_at')[:20]
    ]
    admin_account = getattr(r, 'admin_account', None)
    return {
        'id': str(r.id), 'name': r.name, 'subdomain': r.subdomain, 'address': r.address or '',
        'contact': r.contact_info or '', 'is_active': r.is_active, 'created_at': r.created_at.timestamp(),
        'desired_version': r.desired_version,
        'update_window': f'{r.update_window_start:%H:%M}-{r.update_window_end:%H:%M}',
        'telegram_configured': bool(r.telegram_bot_token and r.telegram_chat_id),
        'admin_phone': admin_account.phone if admin_account else '',
        'license': {
            'key_masked': ('••••-••••-' + lic.key[-4:]) if lic else '',
            'active': lic.is_active if lic else None,
            'expires_at': lic.expires_at.isoformat() if lic else None,
            'bound': bool(lic and lic.hardware_hash),
            'hardware_prefix': (lic.hardware_hash or '')[:10] if lic else '',
            'seconds_left': int((lic.expires_at - now).total_seconds()) if lic else None,
        },
        'history': hist,
        'sales_days': sales_days, 'payment_methods': methods, 'top_products': top_products, 'last_orders': last_orders,
        'errors': errors, 'commands': commands,
    }


# --------------------------------------------------------------------------
# Amallar
# --------------------------------------------------------------------------

ACTIONS = {
    'block': 'Tizimni bloklash',
    'unblock': 'Blokdan chiqarish',
    'renew': 'Litsenziyani yangilashga majburlash',
    'update': 'Yangilanishni yuborish',
    'mark_paid': "To'lov qilindi (muddatni uzaytirish)",
    'resolve_errors': 'Xatolarni hal qilingan deb belgilash',
    'reset_hardware': "Qurilma bog'lanishini tozalash",
    'offline_token': 'Oflayn yangilash kodi',
}

COMMAND_FOR_ACTION = {'block': 'block_system', 'unblock': 'unblock_system', 'renew': 'force_license_renew'}


def _audit(user, restaurant, text):
    LogEntry.objects.log_actions(user.pk, [restaurant], CHANGE, change_message=f'Jonli monitor: {text}')


def perform_action(user, action, restaurant_ids, params=None):
    """
    Natija: {'ok': bool, 'message': str, 'count': int, 'token': ...}. Har bir amal admin tarixiga
    (LogEntry) yoziladi - kim, qachon, nima qilgani ko'rinib turadi.
    """
    params = params or {}
    if action not in ACTIONS:
        return {'ok': False, 'message': "Noma'lum amal."}
    restaurants = list(Restaurant.objects.filter(pk__in=restaurant_ids).select_related('license'))
    if not restaurants:
        return {'ok': False, 'message': 'Restoran tanlanmadi.'}

    if action == 'offline_token':
        if len(restaurants) != 1:
            return {'ok': False, 'message': 'Oflayn kod bir vaqtda faqat bitta restoran uchun yaratiladi.'}
        lic = getattr(restaurants[0], 'license', None)
        if not lic or not lic.hardware_hash:
            return {'ok': False, 'message': "Qurilma hali bog'lanmagan - avval oddiy kalit bilan faollashtirish kerak."}
        if not lic.is_active or lic.expires_at < timezone.now():
            return {'ok': False, 'message': 'Litsenziya nofaol yoki muddati tugagan - avval uni uzaytiring.'}
        from sync.jwt_utils import issue_license_token
        token, expires_at = issue_license_token(lic)
        _audit(user, restaurants[0], "oflayn yangilash kodi yaratildi")
        return {'ok': True, 'count': 1, 'token': token, 'expires_at': expires_at.isoformat(),
                'message': 'Kod yaratildi. U faqat shu restoranga tegishli.'}

    count = 0
    skipped = 0
    for r in restaurants:
        if action in COMMAND_FOR_ACTION:
            RemoteCommand.objects.create(restaurant=r, command_type=COMMAND_FOR_ACTION[action])
        elif action == 'update':
            version = (params.get('version') or '').strip()
            if not version:
                return {'ok': False, 'message': 'Versiya kiritilmadi.'}
            mode = params.get('mode') if params.get('mode') in UPDATE_MODES else UPDATE_MODE_WINDOW
            if not r.is_active:
                skipped += 1
                continue
            r.desired_version = version
            r.save(update_fields=['desired_version'])
            RemoteCommand.objects.create(
                restaurant=r, command_type='update_app', payload=update_payload(r, version, mode),
            )
        elif action == 'mark_paid':
            lic = getattr(r, 'license', None)
            if not lic:
                skipped += 1
                continue
            lic.expires_at = compute_default_license_expiry()
            lic.save(update_fields=['expires_at'])  # is_active'ga ataylab tegilmaydi (admin _mark_paid bilan bir xil)
        elif action == 'resolve_errors':
            ErrorLog.objects.filter(restaurant=r, is_resolved=False).update(
                is_resolved=True, resolved_at=timezone.now(), resolved_by=user,
            )
        elif action == 'reset_hardware':
            lic = getattr(r, 'license', None)
            if not lic:
                skipped += 1
                continue
            lic.hardware_hash = None
            lic.save(update_fields=['hardware_hash'])
        _audit(user, r, ACTIONS[action] + (f" ({params.get('version')})" if action == 'update' else ''))
        count += 1

    msg = f"{ACTIONS[action]}: {count} ta restoran."
    if skipped:
        msg += f' {skipped} tasi o\'tkazib yuborildi.'
    return {'ok': True, 'count': count, 'message': msg}
