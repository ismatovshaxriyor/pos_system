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
    device.save(update_fields=['last_login_at', 'updated_at'])
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

    # 3. Yakuniy summani hisoblash
    final_amount = max(total_amount - order.discount_amount + order.tax_amount + order.service_charge, Decimal('0'))
    
    # 4. To'langan qismini hisoblash
    amount_paid = order.payments.filter(is_voided=False).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    
    # 5. Qolgan qarz
    balance_due = max(final_amount - amount_paid, Decimal('0'))

    return total_amount, final_amount, balance_due


# ==============================================================================
# QARZ DAFTAR (Customer debt ledger)
# ==============================================================================

def record_credit_sale(*, order, customer, amount, created_by):
    """
    Buyurtma kreditga yopilganda: `DebtTransaction(credit_sale, +amount)` yaratadi
    va `Customer.balance` ni F() bilan atomik oshiradi. Chaqiruvchi (view) buyurtma
    qatorini `select_for_update` bilan qulflagan bo'lishi kutiladi.
    """
    from django.db.models import F
    from .models import Customer, DebtTransaction

    DebtTransaction.objects.create(
        customer=customer, amount=amount, txn_type='credit_sale',
        order=order, created_by=created_by,
    )
    Customer.objects.filter(pk=customer.pk).update(balance=F('balance') + amount)


def record_repayment(*, customer, amount, method, created_by, note=''):
    """
    Mijoz qarzni to'laganda: `DebtTransaction(repayment, -amount)` yaratadi va
    `Customer.balance` ni F() bilan atomik kamaytiradi. Chaqiruvchi (view)
    mijoz qatorini qulflab, `amount <= balance` ekanini tekshirgan bo'lishi kutiladi.
    """
    from django.db.models import F
    from .models import Customer, DebtTransaction

    DebtTransaction.objects.create(
        customer=customer, amount=-amount, txn_type='repayment',
        method=method, created_by=created_by, note=note,
    )
    Customer.objects.filter(pk=customer.pk).update(balance=F('balance') - amount)


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
