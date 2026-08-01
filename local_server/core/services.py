import logging
import re
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password, check_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.authtoken.models import Token

from .models import DeviceRegistrationCode, StaffDevice, User

logger = logging.getLogger(__name__)

CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # 0/O, 1/I kabi chalkash belgilar chiqarib tashlangan
CODE_TTL = timedelta(minutes=15)
PIN_REGEX = re.compile(r'^\d{6}$')

PIN_MAX_ATTEMPTS = 5
PIN_LOCKOUT_SECONDS = 300


class ServiceError(Exception):
    """Xodim autentifikatsiyasi/qurilma boshqaruvidagi kutilgan xatoliklar uchun."""
    def __init__(self, message, status=400):
        self.message = message
        self.status = status
        super().__init__(message)


def build_table_qr_url(table, request=None, domain_override=None):
    """
    Stol uchun ommaviy QR menu havolasini shakllantiradi.
    Ustuvorlik tartibi:
    1. domain_override (query parameter bo'yicha)
    2. RestaurantConfig.public_domain (lokal bazadagi sozlama)
    3. settings.PUBLIC_DOMAIN (.env faylidagi sozlama)
    4. request.get_host() (agar so'rov mavjud bo'lsa)
    5. '/table/<qr_code>/' (fallback)
    """
    from django.conf import settings

    domain = (domain_override and domain_override.strip()) or None

    if not domain:
        try:
            from core.models import RestaurantConfig
            config = RestaurantConfig.objects.first()
            if config and config.public_domain and config.public_domain.strip():
                domain = config.public_domain.strip()
        except Exception:
            pass

    if not domain and getattr(settings, 'PUBLIC_DOMAIN', ''):
        domain = settings.PUBLIC_DOMAIN.strip()

    if domain:
        if '://' in domain:
            scheme_host = domain
        else:
            scheme = 'https' if 'hamrohpos.uz' in domain else 'http'
            scheme_host = f"{scheme}://{domain}"
        return f"{scheme_host.rstrip('/')}/table/{table.qr_code}/"

    path = f"/table/{table.qr_code}/"
    if request:
        return request.build_absolute_uri(path)
    return path



def generate_registration_code(user, created_by):
    """
    Admin generatsiya qiladi, xodim planshetida kiritadi. 6-xonali raqamli kod.
    PIN bilan kiruvchi (is_staff=False) xodim uchun - admin hisobi parol bilan
    kiradi, unga registratsiya kodi kerak emas.

    Har bir xodim uchun kod FAQAT BIR MARTA - ishlatilmagan bo'lsa, keyingi
    har qanday chaqiruv (tugma qayta bosilsa, muddati tugagan bo'lsa, yoki
    xodimning boshqa maydonlari - ism/telefon - tahrirlangan bo'lsa ham) xuddi
    o'sha kod qiymatini qaytaradi, faqat `expires_at`ni yangilaydi - yangi
    tasodifiy qiymat bilan ALMASHTIRILMAYDI. Aks holda menejer xodimga
    Telegram/og'zaki aytib qo'ygan kod muddat tugashi bilan sababsiz
    ishlamay qolib, xodim endi boshqa (o'ziga aytilmagan) kod bilan
    duch kelardi. Kod faqat haqiqatan `redeem_registration_code` orqali
    ISHLATILGANDA (`used_at` to'ldirilganda) navbatdagi chaqiruv haqiqiy
    yangi kod yaratadi (masalan qurilma almashtirilib qayta ro'yxatdan
    o'tkazilganda).
    """
    if user.is_staff:
        raise ServiceError("Admin foydalanuvchi uchun PIN kirish kerak emas.")

    existing = DeviceRegistrationCode.objects.filter(user=user, used_at__isnull=True).first()
    if existing:
        existing.expires_at = timezone.now() + CODE_TTL
        existing.save(update_fields=['expires_at'])
        return existing

    code = get_random_string(6, allowed_chars='0123456789')
    return DeviceRegistrationCode.objects.create(
        user=user, code=code, created_by=created_by,
        expires_at=timezone.now() + CODE_TTL,
    )


def _evict_active_device(*, user=None, device_id=None):
    qs = StaffDevice.objects.filter(is_active=True, is_approved=True)
    if user is not None:
        qs = qs.filter(user=user)
    if device_id is not None:
        qs = qs.filter(device_id=device_id)
    for device in qs:
        revoke_device(device)


def redeem_registration_code(phone, code, device_id, pin, device_label=''):
    """
    Kodni tasdiqlaydi va qurilmani shu foydalanuvchiga bog'laydi. Ikkala
    qisman unique constraint (StaffDevice.Meta) tufayli ikki tomonlama
    chetlashtirish kerak: shu foydalanuvchining eski qurilmasi VA (agar
    boshqa userga tegishli bo'lsa) shu device_id'dagi eski bog'lanish.
    """
    if not PIN_REGEX.match(pin or ''):
        raise ServiceError("PIN 6 ta raqamdan iborat bo'lishi kerak.")
    if not device_id:
        raise ServiceError("device_id majburiy.")

    try:
        user = User.objects.get(username=phone, is_staff=False)
    except User.DoesNotExist:
        # Enumeration'ni oldini olish uchun "user topilmadi" bilan "kod
        # noto'g'ri" bir xil umumiy xabar bilan qaytariladi.
        raise ServiceError("Kod noto'g'ri yoki muddati tugagan.")

    registration = DeviceRegistrationCode.objects.filter(user=user, code=code).first()
    if not registration:
        raise ServiceError("Kod noto'g'ri yoki muddati tugagan.")

    if not registration.is_valid():
        # Retry-idempotentlik: restoran WiFi'si uzilib klient javobni olmasa-yu
        # so'rovni AYNAN shu (kod, device_id, pin) bilan qayta yuborsa, bu kod
        # `used_at` tufayli endi "invalid" ko'rinadi - lekin agar birinchi
        # urinish aslida muvaffaqiyatli bo'lgan bo'lsa (shu kod shu qurilmani
        # shu PIN bilan allaqachon bog'lagan), xato qaytarish kassirni
        # chalkashtiradi: u "kod noto'g'ri" deb o'ylab qoladi, holbuki
        # qurilmasi allaqachon ishlaydi. Shu holatda xatosiz, mavjud tokenni
        # qaytaramiz - boshqa har qanday holatda (haqiqatan eskirgan/boshqa
        # qurilmada ishlatilgan kod) oddiy umumiy xabar saqlanadi.
        already_registered = (
            registration.used_at is not None
            and check_password(pin, user.pin_hash)
            and StaffDevice.objects.filter(
                user=user, device_id=device_id, is_active=True, is_approved=True,
            ).exists()
        )
        if already_registered:
            token, _ = Token.objects.get_or_create(user=user)
            return user, token
        raise ServiceError("Kod noto'g'ri yoki muddati tugagan.")

    with transaction.atomic():
        _evict_active_device(user=user)
        _evict_active_device(device_id=device_id)
        StaffDevice.objects.create(
            user=user, device_id=device_id, device_label=device_label,
            is_active=True, is_approved=True, last_login_at=timezone.now(),
        )
        user.pin_hash = make_password(pin)
        user.set_unusable_password()
        user.save(update_fields=['pin_hash', 'password'])
        registration.used_at = timezone.now()
        registration.save(update_fields=['used_at'])
        token, _ = Token.objects.get_or_create(user=user)

    return user, token


def revoke_device(device, kicked_by=None):
    """
    Soft-revoke: is_active=False (audit tarixi saqlanadi) + foydalanuvchi
    Token'ini o'chirish (keyingi HTTP so'rov avtomatik 401 qaytaradi) +
    ochiq WebSocket ulanishini ham darhol uzish - Token o'chirilishi faqat
    KEYINGI HTTP so'rovlariga ta'sir qiladi, allaqachon ochiq WS ulanishiga
    emas.
    """
    device.is_active = False
    device.save(update_fields=['is_active'])
    Token.objects.filter(user=device.user).delete()

    from . import realtime
    realtime.force_disconnect(device.user_id)


def _pin_lock_key(device_id):
    return f'pin_login:lock:{device_id}'


def _pin_attempts_key(device_id):
    return f'pin_login:attempts:{device_id}'


def _is_locked(device_id):
    return cache.get(_pin_lock_key(device_id)) is not None


def _register_failure(device_id):
    key = _pin_attempts_key(device_id)
    try:
        attempts = cache.incr(key)
    except ValueError:
        cache.set(key, 1, PIN_LOCKOUT_SECONDS)
        attempts = 1
    if attempts >= PIN_MAX_ATTEMPTS:
        cache.set(_pin_lock_key(device_id), True, PIN_LOCKOUT_SECONDS)


def _clear_failures(device_id):
    cache.delete_many([_pin_attempts_key(device_id), _pin_lock_key(device_id)])


def verify_pin_login(device_id, pin):
    if not device_id or not pin:
        raise ServiceError("Qurilma yoki PIN noto'g'ri.")

    if _is_locked(device_id):
        raise ServiceError("Juda ko'p noto'g'ri urinish. Birozdan so'ng qayta urining.", status=429)

    device = StaffDevice.objects.filter(device_id=device_id, is_active=True, is_approved=True).select_related('user').first()
    if not device:
        _register_failure(device_id)
        raise ServiceError("Qurilma yoki PIN noto'g'ri.")

    matched_user = None
    if device.user and device.user.pin_hash and check_password(pin, device.user.pin_hash):
        matched_user = device.user
    else:
        candidate_users = User.objects.filter(is_active=True, is_staff=False).exclude(pin_hash='')
        for user in candidate_users:
            if check_password(pin, user.pin_hash):
                matched_user = user
                break

    if not matched_user:
        _register_failure(device_id)
        raise ServiceError("Qurilma yoki PIN noto'g'ri.")

    _clear_failures(device_id)
    if device.user_id != matched_user.id:
        # Smena almashinuvi: shu kassa plansheti boshqa xodimga (matched_user)
        # o'tmoqda. Agar matched_user allaqachon BOSHQA faol+tasdiqlangan
        # qurilmaga ega bo'lsa (masalan bir necha kassa terminali bo'lgan
        # restoranda), uni avval evict qilmasdan shu qatorni matched_user'ga
        # bog'lash `uniq_active_approved_device_per_user` constraint'ini
        # buzardi (IntegrityError -> 500 - kassir umuman kira olmay qolardi).
        with transaction.atomic():
            _evict_active_device(user=matched_user)
            device.user = matched_user
            device.last_login_at = timezone.now()
            device.save(update_fields=['user', 'last_login_at', 'updated_at'])
    else:
        device.last_login_at = timezone.now()
        device.save(update_fields=['last_login_at', 'updated_at'])
    token, _ = Token.objects.get_or_create(user=matched_user)
    return matched_user, token



import math

def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    """
    Ikki nuqta orasidagi masofani metrda hisoblaydi.
    """
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        raise ServiceError("Koordinatalar to'liq emas.")
        
    lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    
    R = 6371000.0  # Earth radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    
    return R * c


def check_in_employee(user, latitude, longitude):
    """
    Xodimni belgilangan koordinatalar bo'yicha check-in qiladi.
    """
    from .models import RestaurantConfig, Attendance
    
    # 1. Restoran sozlamalarini olish
    config = RestaurantConfig.objects.first()
    if not config or config.latitude is None or config.longitude is None:
        raise ServiceError("Restoran koordinatalari kiritilmagan. Admin bilan bog'laning.")

    # 2. Masofani hisoblash
    distance = calculate_haversine_distance(latitude, longitude, config.latitude, config.longitude)
    if distance > config.attendance_radius:
        raise ServiceError(f"Siz ishxonadan juda uzoqdasiz. Masofa: {int(distance)}m, ruxsat etilgan radius: {config.attendance_radius}m")

    # 3. Yopilmagan check-in borligini tekshirish
    active_attendance = Attendance.objects.filter(user=user, check_out__isnull=True).first()
    if active_attendance:
        raise ServiceError("Sizda allaqachon yopilmagan check-in mavjud.")

    # 4. Yangi check-in yaratish
    return Attendance.objects.create(
        user=user,
        check_in_latitude=latitude,
        check_in_longitude=longitude
    )


def check_out_employee(user, latitude, longitude):
    """
    Faol check-in ni yopadi (check-out).
    """
    from .models import RestaurantConfig, Attendance
    
    # 1. Restoran sozlamalarini olish
    config = RestaurantConfig.objects.first()
    if not config or config.latitude is None or config.longitude is None:
        raise ServiceError("Restoran koordinatalari kiritilmagan. Admin bilan bog'laning.")

    # 2. Masofani hisoblash
    distance = calculate_haversine_distance(latitude, longitude, config.latitude, config.longitude)
    if distance > config.attendance_radius:
        raise ServiceError(f"Siz ishxonadan juda uzoqdasiz. Masofa: {int(distance)}m, ruxsat etilgan radius: {config.attendance_radius}m")

    # 3. Faol check-in ni topish
    attendance = Attendance.objects.filter(user=user, check_out__isnull=True).first()
    if not attendance:
        raise ServiceError("Sizda faol check-in topilmadi.")

    # 4. Check-out yozish
    attendance.check_out = timezone.now()
    attendance.check_out_latitude = latitude
    attendance.check_out_longitude = longitude
    attendance.save(update_fields=['check_out', 'check_out_latitude', 'check_out_longitude', 'updated_at'])
    return attendance


# ==============================================================================
# KASSA SESSIYASI (Register open/close)
# ==============================================================================

def close_register(*, closed_by):
    """
    Kassani (bugungi savdoni) yopadi: `RegisterSession.is_open=False` qiladi
    (`OrderViewSet.create` shu bayroqni tekshirib yangi buyurtmani rad etadi)
    va barcha ochiq (check-out qilinmagan) `Attendance` yozuvlarini avtomatik
    yopadi - xodim ilovasi shu bilan navbatdagi so'rovda/WS push'da davomat
    (check-in) ekraniga qaytadi. Bulk `.update()` emas, har birini `.save()`
    bilan yopamiz - aks holda `django-simple-history` signal orqali ishlagani
    uchun avtomatik check-out audit izsiz qolib ketardi.
    """
    from .models import Attendance, RegisterSession
    from .realtime import broadcast_event

    with transaction.atomic():
        session, _ = RegisterSession.objects.select_for_update().get_or_create(pk=1)
        if not session.is_open:
            raise ServiceError("Kassa allaqachon yopiq.")

        now = timezone.now()
        checked_out = 0
        for attendance in Attendance.objects.select_for_update().filter(check_out__isnull=True):
            attendance.check_out = now
            attendance.save(update_fields=['check_out', 'updated_at'])
            checked_out += 1

        session.is_open = False
        session.closed_at = now
        session.closed_by = closed_by
        session.save(update_fields=['is_open', 'closed_at', 'closed_by', 'updated_at'])

    broadcast_event('register_closed', {
        'closed_by': closed_by.id if closed_by else None,
        'checked_out_count': checked_out,
    })
    return session, checked_out


def open_register(*, opened_by):
    """
    Kassani ochadi - yangi kun boshlanishi yoki yopilgandan keyin majburiy
    qayta ochish uchun. Kassir ochsa menejerlarga `Notification` + WS orqali
    xabar boradi (kassir smenadan tashqarida kassani ochishi nazorat talab
    qiladigan istisno holat); menejer/admin ochganda bildirishnoma shart emas.
    """
    from .models import Notification, RegisterSession
    from .realtime import broadcast_event

    with transaction.atomic():
        session, _ = RegisterSession.objects.select_for_update().get_or_create(pk=1)
        if session.is_open:
            raise ServiceError("Kassa allaqachon ochiq.")

        session.is_open = True
        session.opened_at = timezone.now()
        session.opened_by = opened_by
        session.save(update_fields=['is_open', 'opened_at', 'opened_by', 'updated_at'])

    notified = bool(opened_by and opened_by.role == 'cashier')
    if notified:
        actor_name = opened_by.first_name or opened_by.username
        Notification.objects.create(
            recipient=None, notif_type='register_opened_by_cashier',
            message=f"Kassa {actor_name} (kassir) tomonidan majburiy ochildi.",
            payload={'opened_by': opened_by.id},
        )

    broadcast_event('register_opened', {
        'opened_by': opened_by.id if opened_by else None,
        'notified_managers': notified,
    })
    return session


def login_waiter(phone, password, device_id, device_label=''):
    """
    Ofitsiantni telefon raqami va paroli orqali tizimga kiritadi.
    TOFU (Trust-On-First-Use) hamda manager tasdiqlashi oqimini tekshiradi.
    """
    if not device_id:
        raise ServiceError("device_id majburiy.")

    # 1. Autentifikatsiya
    try:
        user = User.objects.get(username=phone, is_active=True)
    except User.DoesNotExist:
        raise ServiceError("Telefon raqami yoki parol noto'g'ri.")

    if not user.check_password(password):
        raise ServiceError("Telefon raqami yoki parol noto'g'ri.")

    if user.role != 'waiter':
        raise ServiceError("Faqat ofitsiantlar ushbu endpoint orqali kira oladilar.")

    # 2. Qurilma tekshiruvi
    # Ushbu foydalanuvchining allaqachon tasdiqlangan qurilmasi bormi?
    approved_device = StaffDevice.objects.filter(user=user, is_active=True, is_approved=True).first()

    if not approved_device:
        # TOFU: Birinchi marta kirish. Ushbu qurilma avtomatik tasdiqlanadi.
        with transaction.atomic():
            # Agar ushbu device_id boshqa birovga tegishli bo'lsa uni evict qilamiz
            _evict_active_device(device_id=device_id)
            device = StaffDevice.objects.create(
                user=user,
                device_id=device_id,
                device_label=device_label,
                is_active=True,
                is_approved=True,
                last_login_at=timezone.now()
            )
            token, _ = Token.objects.get_or_create(user=user)
            return user, token
    
    if approved_device.device_id == device_id:
        # O'zining faol va tasdiqlangan qurilmasidan kirmoqda
        approved_device.last_login_at = timezone.now()
        approved_device.save(update_fields=['last_login_at'])
        token, _ = Token.objects.get_or_create(user=user)
        return user, token

    # Yangi qurilmadan kirishga urinish!
    # Agar bu qurilma uchun oldin pending so'rov ochilmagan bo'lsa, yaratamiz.
    # get_or_create emas: (user, device_id) bo'yicha bir nechta tarixiy qator
    # bo'lishi mumkin (masalan registratsiya-kod oqimi har safar yangi qator
    # yaratadi) - MultipleObjectsReturned 500 bermasligi uchun eng so'nggisini
    # olamiz. Topilgan qator ILGARI approved bo'lgan (keyin boshqa qurilma
    # tasdiqlanganda deaktivlangan) eski qurilma bo'lishi ham mumkin - unda
    # is_approved'ni majburan False qilamiz: faqat is_active=True qilib
    # qo'yish uni user'ning hozirgi faol qurilmasi bilan birga ikkinchi
    # "active+approved" qatorga aylantirib, uniq_active_approved_device_per_user
    # constraint'ini buzar edi (IntegrityError -> 500). Eski qurilmaga
    # qaytish ham menejer tasdig'ini talab qiladi - xavfsizlik modeliga mos.
    pending_device = (
        StaffDevice.objects.filter(user=user, device_id=device_id)
        .order_by('-id')
        .first()
    )
    if pending_device is None:
        pending_device = StaffDevice.objects.create(
            user=user,
            device_id=device_id,
            device_label=device_label,
            is_active=True,
            is_approved=False,
        )
    else:
        pending_device.is_active = True
        pending_device.is_approved = False
        pending_device.device_label = device_label
        pending_device.save(update_fields=['is_active', 'is_approved', 'device_label', 'updated_at'])

    # Manager uchun bildirishnoma yaratish
    from .models import Notification
    message = f"Xodim {user.first_name} ({user.username}) yangi qurilmadan ({device_label or device_id[:8]}) kirishga urindi. Tasdiqlash kutilmoqda."
    Notification.objects.get_or_create(
        recipient=None,
        notif_type='device_approval_requested',
        message=message,
        payload={
            'user_id': user.id,
            'device_pk': pending_device.id,
            'device_id': device_id,
            'device_label': device_label
        }
    )

    raise ServiceError("Yangi qurilmadan kirish taqiqlangan. Menejer tasdig'i kutilmoqda.", status=403)


def approve_device(device_pk, manager_user):
    """
    Menejer tomonidan yangi qurilmani tasdiqlash.
    """
    if manager_user.role != 'manager':
        raise ServiceError("Faqat menejerlar qurilmani tasdiqlashlari mumkin.", status=403)

    try:
        pending_device = StaffDevice.objects.get(pk=device_pk, is_active=True, is_approved=False)
    except StaffDevice.DoesNotExist:
        raise ServiceError("Tasdiqlanishi kutilayotgan faol qurilma topilmadi.")

    with transaction.atomic():
        # 1. Xodimning eski tasdiqlangan barcha qurilmalarini nofaol (revoked) qilish
        StaffDevice.objects.filter(user=pending_device.user, is_approved=True).update(is_active=False)
        
        # 2. Ushbu device_id boshqa biron kimda faol bo'lsa uni evict qilish
        _evict_active_device(device_id=pending_device.device_id)

        # 3. Yangi qurilmani tasdiqlangan (approved) qilish
        pending_device.is_approved = True
        pending_device.last_login_at = timezone.now()
        pending_device.save(update_fields=['is_approved', 'last_login_at', 'updated_at'])

        # 4. Foydalanuvchining tokenini o'chirish (eski seanslar uzilishi uchun)
        Token.objects.filter(user=pending_device.user).delete()
        token, _ = Token.objects.get_or_create(user=pending_device.user)

        # 5. Eski qurilma websocket ulanishini yopish
        from . import realtime
        realtime.force_disconnect(pending_device.user_id)

    return pending_device


def send_order_to_kitchen(order):
    """
    Buyurtmaning hali chop etilmagan barcha taomlarini mos keladigan
    printerlarga yo'naltiradi va PrintJob yaratadi.
    """
    from .models import OrderItem, Printer, PrintJob
    from .realtime import broadcast_event
    
    # Faqat void bo'lmagan va chop etilmagan taomlarni olish
    items_to_print = order.items.filter(is_printed=False, is_voided=False).select_related('product__category__printer')
    # Ombor sarfini shu ro'yxatdan hisoblaymiz - is_printed pastda True'ga
    # o'zgargach queryset qayta baholansa bo'sh chiqadi, shuning uchun ro'yxatga
    # materializatsiya qilamiz (bir marta - grouping ham, consumption ham shundan).
    printed_items = list(items_to_print)
    if not printed_items:
        return []

    # Printer bo'yicha guruhlash
    printer_groups = {}

    # Asosiy printerni topish yoki generatsiya qilish
    default_printer = Printer.objects.filter(is_active=True).first()

    for item in printed_items:
        printer = None
        if item.product.category and item.product.category.printer:
            printer = item.product.category.printer
        
        # Agar printer belgilanmagan bo'lsa, default printerga yo'naltirish
        if not printer:
            printer = default_printer
            
        if not printer:
            printer, _ = Printer.objects.get_or_create(name="Asosiy printer (standart)", defaults={'is_active': True})
            default_printer = printer
            
        if printer.id not in printer_groups:
            printer_groups[printer.id] = {
                'printer': printer,
                'items': []
            }
        printer_groups[printer.id]['items'].append(item)

    created_jobs = []
    
    with transaction.atomic():
        for group_data in printer_groups.values():
            printer = group_data['printer']
            items = group_data['items']
            
            # Chek uchun ma'lumotlarni yig'ish (snapshot)
            items_snapshot = []
            for item in items:
                items_snapshot.append({
                    'id': item.id,
                    'name': item.product.name,
                    'quantity': item.quantity,
                    'note': item.note,
                    'modifiers': item.modifiers
                })
                
            # PrintJob yaratish
            job = PrintJob.objects.create(
                printer=printer,
                order=order,
                items_snapshot=items_snapshot,
                status='pending'
            )
            
            # Hamma yuborilgan itemlarni is_printed=True qilish
            order.items.filter(id__in=[item.id for item in items]).update(is_printed=True)
            
            created_jobs.append(job)
            
            # WebSocket orqali real-vaqtda xabar berish
            broadcast_event('new_print_job', {
                'job_id': job.id,
                'printer_id': printer.id,
                'printer_name': printer.name,
                'order_id': order.id,
                'waiter': order.waiter.first_name if order.waiter else "Noma'lum afitsiant",
                'table_name': order.table.name if order.table else "Takeaway",
                'items': items_snapshot,
                'created_at': job.created_at.isoformat() if job.created_at else timezone.now().isoformat()
            })

    # Jismoniy (IP kiritilgan) printerlarga ESC/POS chop etishni navbatga
    # qo'yish. on_commit shart: job qatorlari tranzaksiya commit bo'lmaguncha
    # celery workerga ko'rinmaydi (OrderViewSet.start buni tashqi atomic +
    # select_for_update ichida chaqiradi).
    network_job_ids = [job.id for job in created_jobs if job.printer.is_network]
    if network_job_ids:
        from .tasks import print_job_to_printer

        def _dispatch_to_hardware(job_ids=tuple(network_job_ids)):
            for job_id in job_ids:
                print_job_to_printer.delay(job_id)

        transaction.on_commit(_dispatch_to_hardware)

    # Ombor: oshxonaga yuborilgan (sotilgan) taomlar bo'yicha ingredient
    # zaxirasini kamaytirish. Xatolik POS/kitchen oqimini TO'XTATMASLIGI kerak -
    # zaxira ikkilamchi ledger, chop etish esa kritik. Log ERROR handler orqali
    # Ona'ga ham yetib boradi.
    try:
        consume_stock_for_items(printed_items, order=order)
    except Exception:
        logger.exception("Ombor zaxirasini kamaytirishda xatolik (order #%s)", order.id)

    return created_jobs

# ==============================================================================
# CRYPTOGRAPHIC COUPLING (Capability Pattern)
# ==============================================================================

# CIPHERTEXT "1.00000000" matnining yashirin hmac kaliti bilan XOR qilingan holati
_MULTIPLIER_CIPHERTEXT = b'\xa2\xfb\x95\xe4Ydyw\x9d\xc1'

def _decode_multiplier(key: bytes) -> float:
    """
    Kalit yordamida koeffitsientni deshifrlaydi.
    Agar kalit to'g'ri bo'lsa (yaroqli litsenziya), 1.0 chiqadi.
    Noto'g'ri kalit bo'lsa, xato beradi va yashirincha noto'g'ri koeffitsient qaytariladi.
    """
    try:
        plaintext = bytes([c ^ key[i % len(key)] for i, c in enumerate(_MULTIPLIER_CIPHERTEXT)])
        return float(plaintext.decode('utf-8'))
    except Exception:
        # Silent corruption: Tizim ishlayveradi, lekin summalar xato bo'ladi.
        return 1.1472

def calculate_order_financials(order, context=None):
    """
    Buyurtmaning moliyaviy hisob-kitobini litsenziya konteksti bilan birga
    bajaradi. Bu Cython orqali himoyalanadi va xaker uni osongina o'chira olmaydi.
    Qaytaradi: (total_amount, final_amount, balance_due)
    """
    from decimal import Decimal
    from django.db.models import Sum

    if context is None:
        from licensing.jwt_utils import LicenseContext
        context = LicenseContext.from_active_state()

    key = context.get_anti_piracy_key()
    multiplier = _decode_multiplier(key)

    # 1. Asosiy summani hisoblash (Faqat bekor qilinmagan (voided=False) taomlar)
    raw_total = sum(
        (item.price * item.quantity for item in order.items.all() if not item.is_voided),
        Decimal('0'),
    )

    # 2. Yashirin koeffitsientni qo'llash (Litsenziya yaroqsiz bo'lsa, raw_total buziladi)
    total_amount = Decimal(str(float(raw_total) * multiplier))

    # 3. Xizmat haqini hisoblash (RestaurantConfig'da foiz kiritilgan bo'lsa)
    from .models import RestaurantConfig
    config = RestaurantConfig.objects.first()
    if config and config.service_charge_rate > Decimal('0'):
        service_charge = (total_amount * (config.service_charge_rate / Decimal('100'))).quantize(Decimal('0.01'))
    else:
        service_charge = order.service_charge

    # 4. Yakuniy summani hisoblash
    final_amount = max(total_amount - order.discount_amount + order.tax_amount + service_charge, Decimal('0'))
    
    # 4. To'langan qismini hisoblash
    amount_paid = order.payments.filter(is_voided=False).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    
    # 5. Qolgan qarz
    balance_due = max(final_amount - amount_paid, Decimal('0'))

    return total_amount, final_amount, balance_due


# ==============================================================================
# QARZ DAFTAR (Customer debt ledger)
# ==============================================================================

def _dispatch_telegram_alert(message):
    """
    Telegram xabarini `transaction.on_commit` orqali Celery task'ga topshiradi -
    chaqiruvchi (masalan `close_on_credit`/`repay`) `select_for_update()` bilan
    qator qulfini ushlab turgan bo'lishi mumkin, shuning uchun tarmoq so'rovi
    (sekin/ishlamay qolgan Telegram) shu qulfni band qilib turmasligi kerak.
    """
    def _enqueue():
        from .tasks import send_telegram_notification_task
        send_telegram_notification_task.delay(message)

    transaction.on_commit(_enqueue)


def record_credit_sale(*, order, customer, amount, created_by, due_date=None):
    """
    Buyurtma kreditga (nasiyaga) yopilganda: `DebtTransaction(credit_sale, +amount)` yaratadi,
    `Customer.balance` ni oshiradi va Telegram orqali adminga xabar yuboradi.
    `due_date` ixtiyoriy - "qachon OLINDI" `created_at`dan (BaseModel) ma'lum,
    "qachon QAYTARILISHI KERAK" shu maydonda, kassir kiritmasa muddatsiz qoladi.
    """
    from django.db.models import F
    from .models import Customer, DebtTransaction

    DebtTransaction.objects.create(
        customer=customer, amount=amount, txn_type='credit_sale',
        order=order, created_by=created_by, due_date=due_date,
    )
    Customer.objects.filter(pk=customer.pk).update(balance=F('balance') + amount)
    customer.refresh_from_db(fields=['balance'])

    cashier_name = created_by.first_name if (created_by and created_by.first_name) else (created_by.username if created_by else "Kassir")
    cust_name = f"{customer.first_name} {customer.last_name}".strip()
    phone_val = customer.phone if customer.phone else "Kiritilmagan"
    amt_str = f"{int(amount):,} so'm".replace(',', ' ')
    bal_str = f"{int(customer.balance):,} so'm".replace(',', ' ')
    due_str = due_date.strftime('%d.%m.%Y') if due_date else "Kiritilmagan"

    msg = (
        f"🔴 <b>YANGI QARZ YOZILDI (NASIYA)</b>\n\n"
        f"👤 <b>Mijoz:</b> {cust_name}\n"
        f"📞 <b>Telefon:</b> {phone_val}\n"
        f"💰 <b>Qarz summasi:</b> {amt_str}\n"
        f"📊 <b>Mijozning jami qarzi:</b> {bal_str}\n"
        f"📅 <b>Qaytarish muddati:</b> {due_str}\n"
        f"📋 <b>Buyurtma #:</b> #{order.id}\n"
        f"👨‍💼 <b>Kassir:</b> {cashier_name}"
    )
    _dispatch_telegram_alert(msg)


def record_repayment(*, customer, amount, method, created_by, note=''):
    """
    Mijoz qarzni to'laganda: `DebtTransaction(repayment, -amount)` yaratadi,
    `Customer.balance` ni kamaytiradi va Telegram orqali adminga xabar yuboradi.
    """
    from django.db.models import F
    from .models import Customer, DebtTransaction

    DebtTransaction.objects.create(
        customer=customer, amount=-amount, txn_type='repayment',
        method=method, created_by=created_by, note=note,
    )
    Customer.objects.filter(pk=customer.pk).update(balance=F('balance') - amount)
    customer.refresh_from_db(fields=['balance'])

    cashier_name = created_by.first_name if (created_by and created_by.first_name) else (created_by.username if created_by else "Kassir")
    cust_name = f"{customer.first_name} {customer.last_name}".strip()
    phone_val = customer.phone if customer.phone else "Kiritilmagan"
    amt_str = f"{int(amount):,} so'm".replace(',', ' ')
    bal_str = f"{int(customer.balance):,} so'm".replace(',', ' ')

    msg = (
        f"🟢 <b>QARZ TO'LANDI (QAYTARILDI)</b>\n\n"
        f"👤 <b>Mijoz:</b> {cust_name}\n"
        f"📞 <b>Telefon:</b> {phone_val}\n"
        f"💵 <b>To'langan summa:</b> {amt_str} ({method})\n"
        f"📊 <b>Mijozning qolgan qarzi:</b> {bal_str}\n"
        f"👨‍💼 <b>Qabul qildi:</b> {cashier_name}"
    )
    if note:
        msg += f"\n📝 <b>Izoh:</b> {note}"
    _dispatch_telegram_alert(msg)


# ==============================================================================
# OMBOR (Inventory: consumption, kirim, tuzatish, past-zaxira ogohlantirish)
# ==============================================================================

def _notify_low_stock(ingredient):
    """Ingredient min_stock'dan pastga tushganda menejerlarga bildirishnoma + WS."""
    from .models import Notification
    from .realtime import broadcast_event

    message = (
        f"Zaxira kam qoldi: {ingredient.name} - {ingredient.current_stock} "
        f"{ingredient.unit} (chegara: {ingredient.min_stock})"
    )
    Notification.objects.create(
        recipient=None, notif_type='low_stock', message=message,
        payload={'ingredient_id': ingredient.id, 'current_stock': str(ingredient.current_stock)},
    )
    broadcast_event('low_stock', {'ingredient_id': ingredient.id, 'message': message})


def consume_stock_for_items(items, *, order=None, created_by=None):
    """
    Oshxonaga yuborilgan (sotilgan) taomlar uchun retsept bo'yicha ingredient
    zaxirasini kamaytiradi. Retsepti yo'q mahsulot - kamaytirmaydi. Zaxira
    tugasa ham SOTUVNI TO'XTATMAYDI (foydalanuvchi qarori: ogohlantir, lekin
    sot) - faqat birinchi marta `min_stock`dan pastga tushganda past-zaxira
    ogohlantiradi. Har sarf uchun `StockMovement(sale, -)` yoziladi.

    `items` - materializatsiyalangan OrderItem ro'yxati (queryset emas), chunki
    chaqiruvchi (`send_order_to_kitchen`) uni is_printed o'zgargandan keyin
    beradi.
    """
    from .models import Ingredient, ProductIngredient, StockMovement

    crossed_low = []
    with transaction.atomic():
        for item in items:
            recipe = ProductIngredient.objects.filter(product_id=item.product_id)
            for line in recipe:
                consumed = line.quantity * item.quantity
                if consumed <= 0:
                    continue
                ingredient = Ingredient.objects.select_for_update().get(pk=line.ingredient_id)
                was_ok = ingredient.current_stock >= ingredient.min_stock
                ingredient.current_stock = ingredient.current_stock - consumed
                ingredient.save(update_fields=['current_stock', 'updated_at'])
                StockMovement.objects.create(
                    ingredient=ingredient, quantity=-consumed, movement_type='sale',
                    order=order, created_by=created_by,
                )
                if was_ok and ingredient.current_stock < ingredient.min_stock:
                    crossed_low.append(ingredient)

    # Bildirishnoma/WS tranzaksiyadan keyin - commit qilingan holatni aks ettiradi.
    for ingredient in crossed_low:
        _notify_low_stock(ingredient)


def apply_purchase(purchase, *, created_by=None):
    """
    Kirim hujjatini qo'llaydi: har `PurchaseItem` uchun `StockMovement(purchase, +)`
    yaratadi, `Ingredient.current_stock` ni oshiradi va `cost_price` ni yangilaydi
    (oxirgi kirim narxi). BIR MARTA chaqirilishi kerak (create paytida) -
    idempotent emas.
    """
    from .models import Ingredient, StockMovement

    with transaction.atomic():
        for pi in purchase.items.select_related('ingredient'):
            ingredient = Ingredient.objects.select_for_update().get(pk=pi.ingredient_id)
            ingredient.current_stock = ingredient.current_stock + pi.quantity
            if pi.unit_cost and pi.unit_cost > 0:
                ingredient.cost_price = pi.unit_cost
            ingredient.save(update_fields=['current_stock', 'cost_price', 'updated_at'])
            StockMovement.objects.create(
                ingredient=ingredient, quantity=pi.quantity, movement_type='purchase',
                purchase=purchase, created_by=created_by, note=purchase.note,
            )


def adjust_stock(ingredient, *, new_quantity=None, delta=None, note='', created_by=None):
    """
    Inventarizatsiya/qo'lda tuzatish. `new_quantity` berilsa - absolyut yangi
    qoldiqqa keltiradi (delta o'zi hisoblanadi); `delta` berilsa - shuncha
    o'zgartiradi (musbat/manfiy). `StockMovement(adjustment, delta)` yoziladi.
    Bittasi berilishi shart (serializer tekshiradi). Yangilangan ingredientni qaytaradi.
    """
    from .models import Ingredient, StockMovement

    with transaction.atomic():
        ingredient = Ingredient.objects.select_for_update().get(pk=ingredient.pk)
        if new_quantity is not None:
            change = Decimal(new_quantity) - ingredient.current_stock
        else:
            change = Decimal(delta)
        ingredient.current_stock = ingredient.current_stock + change
        ingredient.save(update_fields=['current_stock', 'updated_at'])
        StockMovement.objects.create(
            ingredient=ingredient, quantity=change, movement_type='adjustment',
            note=note, created_by=created_by,
        )
    return ingredient


def get_cashier_printer():
    """Kassadagi printerni qaytaradi (is_cashier=True -> birinchi faol printer -> fallback 'Kassa printeri')."""
    from .models import Printer
    printer = Printer.objects.filter(is_cashier=True, is_active=True).first()
    if not printer:
        printer = Printer.objects.filter(is_active=True).first()
    if not printer:
        printer, _ = Printer.objects.get_or_create(
            name="Kassa printeri",
            defaults={'is_active': True, 'is_cashier': True}
        )
    return printer


def get_restaurant_info():
    """Restoran nomi va logotip fayli yo'lini qaytaradi."""
    from .models import RestaurantConfig
    config = RestaurantConfig.objects.first()
    name = config.name if (config and config.name) else "Restoran"
    logo_path = None
    if config and config.logo:
        try:
            logo_path = config.logo.path
        except Exception:
            logo_path = None
    return name, logo_path


def get_service_charge_rate():
    """
    `RestaurantConfig.service_charge_rate` ni chekda foizini yozish uchun
    qaytaradi (masalan `10.0`). Foiz o'rnatilmagan/0 bo'lsa `0` - bu holda
    `Order.calculated_service_charge` `Order.service_charge`ga (qo'lda,
    foizsiz kiritilgan summa) qaytadi va chekda foiz ko'rsatilmaydi.
    """
    from .models import RestaurantConfig
    config = RestaurantConfig.objects.first()
    if config and config.service_charge_rate > Decimal('0'):
        return float(config.service_charge_rate)
    return 0


def get_restaurant_phone():
    """To'lov chekining pastida ko'rsatiladigan restoran kontakt raqami (`RestaurantConfig.phone`)."""
    from .models import RestaurantConfig
    config = RestaurantConfig.objects.first()
    return config.phone if (config and config.phone) else ''


def send_telegram_notification(text, parse_mode='HTML'):
    """
    RestaurantConfig dagi telegram_bot_token va telegram_chat_id orqali Telegram xabar yuboradi.
    `licensing.LicenseState`dagi Telegram maydonlari ataylab fallback sifatida ISHLATILMAYDI -
    ular Ona tomonidan sozlanadigan tizim xatoligi ("fail-safe") kanali (`log_handler.py`), mijoz
    ismi/telefoni/qarz summasi kabi biznes ma'lumotlarini o'sha kanalga oqizib yuborish xato bo'lardi.
    """
    import requests
    from .models import RestaurantConfig

    config = RestaurantConfig.objects.first()
    bot_token = config.telegram_bot_token if (config and config.telegram_bot_token) else ''
    chat_id = config.telegram_chat_id if (config and config.telegram_chat_id) else ''

    if not bot_token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        'chat_id': chat_id,
        'text': text,
        'parse_mode': parse_mode,
        'disable_web_page_preview': True,
    }
    try:
        res = requests.post(url, json=payload, timeout=5)
        return res.status_code == 200
    except Exception as e:
        logger.error(f"Telegram bildirishnomasi yuborishda xatolik: {e}")
        return False


def generate_table_qr_code(qr_url, logo_path=None, fill_color="#001712", back_color="#e3c282", box_size=10):
    """
    Stol uchun QR kodni o'rtasida restoran logotipi bilan birga PNG formatda yaratadi.
    Logotip mavjud bo'lsa, ERROR_CORRECT_H (30% xatoni tiklash darajasi) orqali markazga joylashtiriladi.
    """
    import io
    import qrcode
    from PIL import Image

    if logo_path is None:
        _, logo_path = get_restaurant_info()

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=4,
    )
    qr.add_data(qr_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color=fill_color, back_color=back_color).convert('RGBA')

    if logo_path:
        try:
            logo = Image.open(logo_path).convert('RGBA')
            qr_w, qr_h = img.size
            logo_max_size = int(qr_w * 0.22)

            resample_flag = getattr(Image, 'Resampling', Image).LANCZOS if hasattr(Image, 'Resampling') else Image.LANCZOS
            logo.thumbnail((logo_max_size, logo_max_size), resample_flag)
            logo_w, logo_h = logo.size

            padding = 6
            bg_w, bg_h = logo_w + padding * 2, logo_h + padding * 2
            logo_bg = Image.new('RGBA', (bg_w, bg_h), back_color)

            logo_bg.paste(logo, (padding, padding), logo)
            pos = ((qr_w - bg_w) // 2, (qr_h - bg_h) // 2)
            img.paste(logo_bg, pos, logo_bg)
        except Exception:
            pass

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf


def send_pre_bill_to_printer(order):
    """
    Buyurtmaning hisob-chekini (Pre-bill / Shot) kassa printeriga yuboradi va PrintJob yaratadi.
    """
    from .models import PrintJob
    from .realtime import broadcast_event

    printer = get_cashier_printer()
    rest_name, logo_path = get_restaurant_info()
    total_amount, final_amount, _ = calculate_order_financials(order)

    items = []
    for item in order.items.filter(is_voided=False).select_related('product'):
        items.append({
            'name': item.product.name,
            'quantity': item.quantity,
            'price': float(item.price),
        })

    snapshot = {
        'restaurant_name': rest_name,
        'logo_path': logo_path,
        'items': items,
        'total_amount': float(total_amount),
        'discount_amount': float(order.discount_amount),
        'tax_amount': float(order.tax_amount),
        'service_charge': float(order.calculated_service_charge),
        'service_charge_rate': get_service_charge_rate(),
        'final_amount': float(final_amount),
        'table_name': str(order.table) if order.table else None,
        'order_type': order.order_type,
        'order_created_at': order.created_at.isoformat(),
        'waiter_name': order.waiter.first_name if (order.waiter and order.waiter.first_name) else (order.waiter.username if order.waiter else "Noma'lum"),
    }

    with transaction.atomic():
        job = PrintJob.objects.create(
            printer=printer,
            order=order,
            job_type='pre_bill',
            items_snapshot=snapshot,
            status='pending',
        )

        broadcast_event('new_print_job', {
            'job_id': job.id,
            'printer_id': printer.id,
            'printer_name': printer.name,
            'order_id': order.id,
            'job_type': 'pre_bill',
            'created_at': job.created_at.isoformat() if job.created_at else timezone.now().isoformat(),
        })

    if printer.is_network:
        from .tasks import print_job_to_printer
        job_id = job.id
        def _dispatch_hardware():
            print_job_to_printer.delay(job_id)
        transaction.on_commit(_dispatch_hardware)

    return job


def send_payment_receipt_to_printer(order, cashier_user=None):
    """
    Buyurtmaning yakuniy to'lov chekini kassa printeriga yuboradi va PrintJob yaratadi.
    """
    from .models import PrintJob
    from .realtime import broadcast_event

    printer = get_cashier_printer()
    rest_name, logo_path = get_restaurant_info()
    total_amount, final_amount, _ = calculate_order_financials(order)

    items = []
    for item in order.items.filter(is_voided=False).select_related('product'):
        items.append({
            'name': item.product.name,
            'quantity': item.quantity,
            'price': float(item.price),
        })

    payments = []
    for p in order.payments.filter(is_voided=False):
        payments.append({
            'method': p.method,
            'method_display': p.get_method_display(),
            'amount': float(p.amount),
        })

    # `close_on_credit` naqd/karta Payment qatori YARATMAYDI - qolgan qarz
    # faqat DebtTransaction(credit_sale)da qayd etiladi (qarang
    # record_credit_sale). Shu summani ham "To'lov usullari"ga "Qarz" nomi
    # bilan qo'shmasak, chekda mijoz nechchi pul to'lagani va nechchisi
    # qarzga yozilganini ajratib bo'lmas edi.
    from django.db.models import Sum
    credit_amount = order.debt_transactions.filter(txn_type='credit_sale').aggregate(
        total=Sum('amount'))['total'] or 0
    if credit_amount:
        payments.append({
            'method': 'debt',
            'method_display': 'Qarz',
            'amount': float(credit_amount),
        })

    cashier = cashier_user or order.cashier
    cashier_name = cashier.first_name if (cashier and cashier.first_name) else (cashier.username if cashier else "Kassir")

    snapshot = {
        'restaurant_name': rest_name,
        'logo_path': logo_path,
        'items': items,
        'total_amount': float(total_amount),
        'discount_amount': float(order.discount_amount),
        'tax_amount': float(order.tax_amount),
        'service_charge': float(order.calculated_service_charge),
        'service_charge_rate': get_service_charge_rate(),
        'final_amount': float(final_amount),
        'payments': payments,
        'table_name': str(order.table) if order.table else None,
        'order_type': order.order_type,
        'order_created_at': order.created_at.isoformat(),
        'waiter_name': order.waiter.first_name if (order.waiter and order.waiter.first_name) else (order.waiter.username if order.waiter else ""),
        'cashier_name': cashier_name,
        'phone': get_restaurant_phone(),
    }

    with transaction.atomic():
        job = PrintJob.objects.create(
            printer=printer,
            order=order,
            job_type='receipt',
            items_snapshot=snapshot,
            status='pending',
        )

        broadcast_event('new_print_job', {
            'job_id': job.id,
            'printer_id': printer.id,
            'printer_name': printer.name,
            'order_id': order.id,
            'job_type': 'receipt',
            'created_at': job.created_at.isoformat() if job.created_at else timezone.now().isoformat(),
        })

    if printer.is_network:
        from .tasks import print_job_to_printer
        job_id = job.id
        def _dispatch_hardware():
            print_job_to_printer.delay(job_id)
        transaction.on_commit(_dispatch_hardware)

    return job

