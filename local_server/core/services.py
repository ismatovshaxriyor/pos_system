import re
from datetime import timedelta

from django.contrib.auth.hashers import make_password, check_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.authtoken.models import Token

from .models import DeviceRegistrationCode, StaffDevice, User

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


def generate_registration_code(user, created_by):
    """
    Admin generatsiya qiladi, xodim telefonida bir marta kiritadi. PIN
    bilan kiruvchi (is_staff=False) xodim uchun - admin hisobi parol bilan
    kiradi, unga registratsiya kodi kerak emas.
    """
    if user.is_staff:
        raise ServiceError("Admin foydalanuvchi uchun PIN kirish kerak emas.")

    DeviceRegistrationCode.objects.filter(user=user, used_at__isnull=True).delete()
    code = get_random_string(8, allowed_chars=CODE_ALPHABET)
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
    if not registration or not registration.is_valid():
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
    if not device or not check_password(pin, device.user.pin_hash):
        _register_failure(device_id)
        raise ServiceError("Qurilma yoki PIN noto'g'ri.")

    _clear_failures(device_id)
    device.last_login_at = timezone.now()
    token, _ = Token.objects.get_or_create(user=device.user)
    return device.user, token


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
    # Agar bu qurilma uchun oldin pending so'rov ochilmagan bo'lsa, yaratamiz
    pending_device, created = StaffDevice.objects.get_or_create(
        user=user,
        device_id=device_id,
        defaults={
            'device_label': device_label,
            'is_active': True,
            'is_approved': False
        }
    )
    if not created:
        pending_device.is_active = True
        pending_device.device_label = device_label
        pending_device.save(update_fields=['is_active', 'device_label'])

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


