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
    qs = StaffDevice.objects.filter(is_active=True)
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
            is_active=True, last_login_at=timezone.now(),
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

    device = StaffDevice.objects.filter(device_id=device_id, is_active=True).select_related('user').first()
    if not device or not check_password(pin, device.user.pin_hash):
        _register_failure(device_id)
        raise ServiceError("Qurilma yoki PIN noto'g'ri.")

    _clear_failures(device_id)
    device.last_login_at = timezone.now()
    device.save(update_fields=['last_login_at'])
    token, _ = Token.objects.get_or_create(user=device.user)
    return device.user, token
