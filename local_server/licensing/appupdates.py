"""
Xodim ilovalarini (Kassir/Ofitsiant/Menejer) Ona'dan Bola'ga yetkazish va qurilmalarga tarqatish.

Ona har heartbeat javobida joriy versiyalar ro'yxatini beradi (`app_releases`); Bola yangi/o'zgargan
faylni o'ziga yuklab oladi, sha256 bilan tekshiradi va `/api/license/app-updates/` orqali LAN'dagi
ilovalarga beradi. Ilovalar faqat Bola bilan gaplashadi - internet kerak emas.
"""
import hashlib
import logging
import os
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.utils import timezone

from .models import AppRelease

logger = logging.getLogger(__name__)

# Xato/qotib qolgan yuklashni shundan keyin qayta urinamiz (har heartbeat'da 100 MB qayta yuklamaslik uchun).
RETRY_AFTER = timedelta(minutes=15)
MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024  # 1 GB: kutilmagan katta fayldan diskni himoya qiladi


def version_key(version):
    """'1.2.10' -> (1, 2, 10). Raqam bo'lmagan qismlar (masalan 'beta') e'tiborsiz."""
    return tuple(int(n) for n in re.findall(r'\d+', version or ''))


def is_newer(candidate, current):
    a, b = version_key(candidate), version_key(current)
    width = max(len(a), len(b))
    return a + (0,) * (width - len(a)) > b + (0,) * (width - len(b))


def sync_releases(items):
    """
    Ona ro'yxatini lokal jadvalga moslaydi. Yuklanishi kerak bo'lgan `AppRelease.pk`lar ro'yxatini qaytaradi.
    Ro'yxatda yo'qlari (Ona'da o'chirilgan/nofaol) fayli bilan birga o'chiriladi.
    """
    seen = set()
    to_download = []
    now = timezone.now()
    for item in items:
        slug, platform = item.get('slug'), item.get('platform')
        url = item.get('download_url') or ''
        if not slug or not platform or urlparse(url).scheme not in ('http', 'https'):
            continue
        seen.add((slug, platform))
        obj, created = AppRelease.objects.get_or_create(
            slug=slug, platform=platform,
            defaults={'version': str(item.get('version', '')), 'source_url': url},
        )
        changed = (
            created
            or obj.version != str(item.get('version', ''))
            or obj.sha256 != (item.get('sha256') or '')
            or not obj.file
        )
        obj.version = str(item.get('version', ''))
        obj.is_required = bool(item.get('is_required'))
        obj.size_mb = item.get('size_mb') or 0
        obj.sha256 = item.get('sha256') or ''
        obj.notes = item.get('notes') or []
        obj.source_url = url
        if changed and obj.status == 'ready':
            obj.status = 'pending'
        # `updated_at` ga tegmaymiz: u "oxirgi yuklash urinishi" vaqti vazifasini bajaradi (qayta urinish kutishi).
        obj.save(update_fields=['version', 'is_required', 'size_mb', 'sha256', 'notes', 'source_url', 'status'])

        if obj.status == 'pending':
            to_download.append(obj.pk)
        elif obj.status in ('failed', 'downloading') and now - obj.updated_at > RETRY_AFTER:
            to_download.append(obj.pk)

    for stale in AppRelease.objects.all():
        if (stale.slug, stale.platform) not in seen:
            _remove_file(stale)
            stale.delete()
    return to_download


def _remove_file(release):
    if release.file:
        try:
            release.file.delete(save=False)
        except OSError:
            logger.warning("Eski ilova fayli o'chirilmadi: %s", release.file.name)


def download_release(pk):
    """
    Faylni oqim (stream) bilan yuklaydi, sha256 ni tekshiradi va `MEDIA_ROOT/app_releases/` ga
    atomik (`os.replace`) joylashtiradi. Tarmoq xatosi yuqoriga ko'tariladi (Celery qayta urinadi).
    """
    # Bir vaqtda ikkita worker bir faylni yuklamasin: faqat "ready" bo'lmaganini "downloading"ga o'tkazgan olsin.
    if not AppRelease.objects.filter(pk=pk).exclude(status='ready').update(status='downloading', error='', updated_at=timezone.now()):
        return False
    release = AppRelease.objects.get(pk=pk)

    folder = Path(settings.MEDIA_ROOT) / 'app_releases'
    folder.mkdir(parents=True, exist_ok=True)
    suffix = Path(urlparse(release.source_url).path).suffix or ''
    safe_name = re.sub(r'[^A-Za-z0-9._-]', '_', f"{release.slug}-{release.platform}-{release.version}{suffix}")
    final = folder / safe_name
    partial = folder / f"{safe_name}.part"

    digest = hashlib.sha256()
    total = 0
    try:
        with requests.get(release.source_url, stream=True, timeout=(10, 60)) as response:
            response.raise_for_status()
            with open(partial, 'wb') as out:
                for chunk in response.iter_content(chunk_size=1024 * 256):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        raise ValueError("Fayl juda katta")
                    digest.update(chunk)
                    out.write(chunk)
    except requests.RequestException:
        partial.unlink(missing_ok=True)
        AppRelease.objects.filter(pk=pk).update(
            status='failed', error="Tarmoq xatosi (keyinroq qayta uriniladi)", updated_at=timezone.now(),
        )
        raise
    except ValueError as exc:
        partial.unlink(missing_ok=True)
        AppRelease.objects.filter(pk=pk).update(status='failed', error=str(exc), updated_at=timezone.now())
        return False

    if release.sha256 and digest.hexdigest() != release.sha256:
        partial.unlink(missing_ok=True)
        AppRelease.objects.filter(pk=pk).update(
            status='failed', error="sha256 mos kelmadi - fayl buzilgan", updated_at=timezone.now(),
        )
        logger.error("Ilova %s v%s: sha256 mos kelmadi", release.slug, release.version)
        return False
    if not release.sha256:
        logger.warning("Ilova %s v%s: Ona sha256 bermadi - tekshiruvsiz qabul qilindi", release.slug, release.version)

    old_name = release.file.name if release.file else ''
    os.replace(partial, final)
    new_name = f"app_releases/{safe_name}"
    AppRelease.objects.filter(pk=pk).update(file=new_name, status='ready', error='')
    if old_name and old_name != new_name:
        try:
            (Path(settings.MEDIA_ROOT) / old_name).unlink(missing_ok=True)
        except OSError:
            pass
    return True
