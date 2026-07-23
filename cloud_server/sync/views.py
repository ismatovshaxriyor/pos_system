import logging
import os
import urllib.request
import urllib.parse

from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions, throttling
from django.utils import timezone
from django.db import IntegrityError, transaction
from django.core.cache import cache
from tenants.models import (
    License, Restaurant, RestaurantStatus, RemoteCommand, RestaurantAdminAccount,
    ErrorLog, SyncedOrder, SyncedOrderItem, SyncedPayment, DemoRequest,
)
from .authentication import LicenseAuthentication, HeartbeatAuthentication
from .jwt_utils import issue_license_token_batch, get_public_key_pem
from .serializers import (
    ActivationSerializer, RenewSerializer, HeartbeatSerializer, CommandResultSerializer,
    ErrorLogBatchSerializer, OrderSyncBatchSerializer, PublicLicenseCheckSerializer,
    DemoRequestSerializer,
)

logger = logging.getLogger(__name__)

MAX_COMMANDS_PER_HEARTBEAT = 10


class ActivationView(APIView):
    """
    Bola serverni birinchi marta faollashtirish.
    Auth talab qilinmaydi - litsenziya kaliti so'rov tanasida keladi.

    Qurilma barmoq izi (hardware_hash) birinchi faollashtirishda litsenziyaga
    bog'lanadi. Keyingi so'rovlarda mos kelmasa - rad etiladi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.AnonRateThrottle]

    def post(self, request):
        serializer = ActivationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        license_key = serializer.validated_data['license_key']
        hardware_hash = serializer.validated_data['hardware_hash']

        try:
            # key__iexact - mobil ilovada kalit qo'lda kiritilganda katta-
            # kichik harf farqi faollashtirishni buzmasin (masalan avtomatik
            # katta harf o'chirilgan klaviatura). Keyingi so'rovlar (renew/
            # heartbeat) uchun Bolaga har doim quyida license_obj.key -
            # bazadagi KANONIK registr - qaytariladi, foydalanuvchi teri
            # matn emas, aks holda LicenseAuthentication (case-sensitive
            # aniq mos kelish) keyingi so'rovlarda rad etadi.
            license_obj = License.objects.select_related('restaurant').get(key__iexact=license_key)
        except License.DoesNotExist:
            return Response(
                {"detail": "Litsenziya kaliti noto'g'ri."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not license_obj.is_active:
            return Response(
                {"detail": "Litsenziya faol emas."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if license_obj.expires_at < timezone.now():
            return Response(
                {"detail": "Litsenziya muddati tugagan."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not license_obj.hardware_hash:
            license_obj.hardware_hash = hardware_hash
            license_obj.save(update_fields=['hardware_hash'])
        elif license_obj.hardware_hash != hardware_hash:
            return Response(
                {"detail": "Qurilma mos kelmadi. Administratorga murojaat qiling."},
                status=status.HTTP_403_FORBIDDEN,
            )

        tokens = issue_license_token_batch(license_obj)

        restaurant = license_obj.restaurant
        restaurant.last_seen = timezone.now()
        restaurant.save(update_fields=['last_seen'])

        response_data = {
            "tokens": [
                {"token": token, "expires_at": expires_at.isoformat()}
                for token, expires_at in tokens
            ],
            "restaurant": {"id": str(restaurant.id), "name": restaurant.name},
            # Kanonik (bazadagi) registr - Bola shu qiymatni saqlashi kerak,
            # foydalanuvchi kiritgan matnni emas (yuqoridagi izohga qarang).
            "license_key": license_obj.key,
            # Bola shu yerdan olib LicenseState'ga saqlaydi - keyingi har bir
            # o'rnatishda public key faylini qo'lda nusxalash shart emas
            # (public key sirli emas, https orqali kelayotgani kifoya).
            "public_key": get_public_key_pem(),
            "detail": "Tizim muvaffaqiyatli faollashtirildi.",
        }

        # Ona'da oldindan yaratilgan bosh menejer hisobi bo'lsa, uni Bolaga
        # ko'chirish uchun javobga qo'shamiz. Faqat XESH uzatiladi - ochiq
        # parol hech qachon tarmoq orqali yubormaymiz.
        try:
            admin_account = restaurant.admin_account
        except RestaurantAdminAccount.DoesNotExist:
            admin_account = None

        if admin_account and admin_account.password_hash:
            response_data["admin"] = {
                "phone": admin_account.phone,
                "full_name": admin_account.full_name,
                "password_hash": admin_account.password_hash,
            }

        return Response(response_data, status=status.HTTP_200_OK)


class RenewView(APIView):
    """
    Mavjud faol litsenziya uchun yangi JWT token oladi. Qat'iy auth talab
    qilinadi - litsenziya nofaol yoki muddati o'tgan bo'lsa, LicenseAuthentication
    o'zi rad etadi.
    """
    authentication_classes = [LicenseAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = RenewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hardware_hash = serializer.validated_data['hardware_hash']

        license_obj = request.auth

        if not license_obj.hardware_hash:
            return Response(
                {"detail": "Tizim hali faollashtirilmagan."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if license_obj.hardware_hash != hardware_hash:
            return Response(
                {"detail": "Qurilma mos kelmadi. Administratorga murojaat qiling."},
                status=status.HTTP_403_FORBIDDEN,
            )

        tokens = issue_license_token_batch(license_obj)

        restaurant = license_obj.restaurant
        restaurant.last_seen = timezone.now()
        restaurant.save(update_fields=['last_seen'])

        return Response({
            "tokens": [
                {"token": token, "expires_at": expires_at.isoformat()}
                for token, expires_at in tokens
            ],
            # ActivationView bilan bir xil sabab: agar bu yerda qaytarilmasa,
            # LICENSE_PRIVATE_KEY almashtirilganda (rotatsiya) allaqachon
            # faollashtirilgan Bola'lar eski public_key'ni abadiy keshlab
            # qolar edi - keyingi tokenlar YANGI kalit bilan imzolanadi,
            # lekin ular eski kalit bilan tekshirilib, kill-switch noto'g'ri
            # bloklab qo'yardi. Har muvaffaqiyatli renew shu bilan tokenlar
            # VA public_key'ni birga (mos holda) yangilaydi.
            "public_key": get_public_key_pem(),
            "detail": "Token muvaffaqiyatli yangilandi.",
        }, status=status.HTTP_200_OK)


class HeartbeatView(APIView):
    """
    Bola har 60 soniyada shu yerga metrikalarini yuboradi. Auth "yumshoq"
    (HeartbeatAuthentication) - litsenziya o'chirilgan/muddati tugagan bo'lsa
    ham qabul qilinadi, lekin javobda license_active=False qaytariladi va
    Bola o'zini bloklaydi. Shuningdek navbatdagi masofaviy buyruqlarni ham
    shu javob orqali yetkazadi (Bolalar NAT ortida - faqat pollingga
    ishonish mumkin).
    """
    authentication_classes = [HeartbeatAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        license_obj = request.auth
        restaurant = license_obj.restaurant

        serializer = HeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        metrics = serializer.validated_data

        now = timezone.now()
        cache.set(f"restaurant_metrics_{restaurant.id}", metrics, timeout=180)

        if not restaurant.is_online or not restaurant.last_seen or (now - restaurant.last_seen).total_seconds() > 300:
            RestaurantStatus.objects.update_or_create(
                restaurant=restaurant,
                defaults={
                    'cpu_percent': metrics.get('cpu_percent'),
                    'ram_percent': metrics.get('ram_percent'),
                    'disk_percent': metrics.get('disk_percent'),
                    'app_version': metrics.get('app_version', ''),
                    'unsynced_count': metrics.get('unsynced_count'),
                    'last_order_at': metrics.get('last_order_at'),
                },
            )

            restaurant.last_seen = now
            restaurant.is_online = True
            restaurant.save(update_fields=['last_seen', 'is_online'])

        license_active = license_obj.is_active and license_obj.expires_at > timezone.now()

        pending_commands = list(
            RemoteCommand.objects.filter(restaurant=restaurant, status='pending')
            .order_by('created_at')[:MAX_COMMANDS_PER_HEARTBEAT]
        )
        if pending_commands:
            RemoteCommand.objects.filter(
                id__in=[c.id for c in pending_commands],
            ).update(status='sent', sent_at=timezone.now())

        return Response({
            "status": "ok",
            "restaurant": restaurant.name,
            "license_active": license_active,
            "desired_version": restaurant.desired_version,
            "telegram_bot_token": restaurant.telegram_bot_token,
            "telegram_chat_id": restaurant.telegram_chat_id,
            "commands": [
                {"id": str(c.id), "command_type": c.command_type, "payload": c.payload}
                for c in pending_commands
            ],
            "message": "Heartbeat received successfully.",
        }, status=status.HTTP_200_OK)


class CommandResultView(APIView):
    """
    Bola bajargan (yoki bajara olmagan) masofaviy buyruq natijasini shu
    yerga qaytaradi. Boshqa restoranga tegishli buyruqqa urinish 404 bilan
    rad etiladi (tenant izolyatsiyasi).
    """
    authentication_classes = [HeartbeatAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, command_id):
        license_obj = request.auth
        command = get_object_or_404(
            RemoteCommand, id=command_id, restaurant=license_obj.restaurant,
        )

        serializer = CommandResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        command.status = serializer.validated_data['status']
        command.result = serializer.validated_data.get('result', {})
        command.completed_at = timezone.now()
        command.save(update_fields=['status', 'result', 'completed_at'])

        return Response({"detail": "Natija qabul qilindi."}, status=status.HTTP_200_OK)


class ErrorLogView(APIView):
    """
    Bola'dan xato jurnali partiyasini qabul qiladi. Auth "yumshoq"
    (HeartbeatAuthentication) - o'chirilgan/muddati tugagan litsenziyaga ega
    restoran ham xato hisobot berishda davom etsin (aynan shu restoranlar
    muammoni ko'rish uchun eng muhim bo'lishi mumkin). Heartbeat/buyruq
    oqimidan butunlay mustaqil endpoint - bu yerdagi validatsiya xatosi
    ularga hech qanday ta'sir qilmaydi.
    """
    authentication_classes = [HeartbeatAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        license_obj = request.auth
        restaurant = license_obj.restaurant

        serializer = ErrorLogBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        events = serializer.validated_data['events']

        now = timezone.now()
        rows = [
            ErrorLog(
                id=event['id'],
                restaurant=restaurant,
                level=event['level'],
                logger_name=event.get('logger_name', ''),
                message=event['message'],
                traceback=event.get('traceback', ''),
                module=event.get('module', ''),
                func_name=event.get('func_name', ''),
                line_no=event.get('line_no'),
                occurred_at=event['occurred_at'],
                received_at=now,
            )
            for event in events
        ]
        # bulk_create bypasses save()/pre_save() - received_at is set
        # explicitly above since auto_now_add would otherwise be silently
        # left unset.
        ErrorLog.objects.bulk_create(rows, ignore_conflicts=True)

        return Response({"received": len(rows), "detail": "Xatolar qabul qilindi."}, status=status.HTTP_200_OK)


class OrderSyncView(APIView):
    """
    Bola'dan yopilgan buyurtmalarni qabul qiladi.

    Idempotent: bir xil sync_uuid takror yuborilsa buyurtma yangilanadi
    (update_or_create + child qatorlarni delete-and-recreate). Har buyurtma
    o'z savepoint'ida saqlanadi - bitta buzuq yozuv butun partiyani
    yiqitmaydi. Javobdagi synced_uuids faqat muvaffaqiyatli saqlanganlar -
    Bola qolganlarini keyingi beat'da qayta uradi.
    """
    authentication_classes = [HeartbeatAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        license_obj = request.auth
        restaurant = license_obj.restaurant

        serializer = OrderSyncBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        orders_data = serializer.validated_data['orders']

        synced_uuids = []

        for order_data in orders_data:
            order_id = order_data['sync_uuid']

            # Tenant izolyatsiyasi (CommandResultView bilan bir xil tamoyil):
            # boshqa restoranga tegishli sync_uuid'ni qayta yozib bo'lmaydi -
            # aks holda buzilgan/yovuz Bola o'z litsenziya kaliti bilan boshqa
            # restoranning sotuv nusxalarini o'zgartira olar edi. Ataylab
            # synced_uuids'ga ham qo'shilmaydi: bu holat faqat UUID
            # to'qnashuvida yuz beradi va logda ko'rinib turishi kerak.
            if SyncedOrder.objects.filter(id=order_id).exclude(restaurant=restaurant).exists():
                logger.warning(
                    "Order sync rad etildi: %s boshqa restoranga tegishli (so'rovchi: %s).",
                    order_id, restaurant.name,
                )
                continue

            try:
                with transaction.atomic():
                    order, _created = SyncedOrder.objects.update_or_create(
                        id=order_id,
                        defaults={
                            'restaurant': restaurant,
                            'total_amount': order_data['total_amount'],
                            'discount_amount': order_data['discount_amount'],
                            'tax_amount': order_data['tax_amount'],
                            'service_charge': order_data['service_charge'],
                            'final_amount': order_data['final_amount'],
                            'order_type': order_data['order_type'],
                            'status': order_data['status'],
                            'waiter_name': order_data['waiter_name'],
                            'closed_at': order_data.get('closed_at'),
                        }
                    )

                    order.items.all().delete()
                    order.payments.all().delete()

                    SyncedOrderItem.objects.bulk_create([
                        SyncedOrderItem(
                            id=item_data['sync_uuid'],
                            order=order,
                            product_name=item_data['product_name'],
                            quantity=item_data['quantity'],
                            price=item_data['price']
                        ) for item_data in order_data['items']
                    ])

                    SyncedPayment.objects.bulk_create([
                        SyncedPayment(
                            id=payment_data['sync_uuid'],
                            order=order,
                            amount=payment_data['amount'],
                            method=payment_data['method'],
                            is_voided=payment_data['is_voided'],
                            received_at=payment_data['created_at']
                        ) for payment_data in order_data['payments']
                    ])
            except IntegrityError:
                # Masalan item/payment sync_uuid'i boshqa buyurtmaniki bilan
                # to'qnashdi - savepoint bekor bo'ladi, qolgan buyurtmalar
                # saqlanaveradi.
                logger.warning(
                    "Order sync IntegrityError: %s o'tkazib yuborildi (%s).",
                    order_id, restaurant.name,
                )
                continue

            synced_uuids.append(str(order_id))

        return Response({"synced_uuids": synced_uuids, "detail": "Buyurtmalar sinxronlashtirildi."}, status=status.HTTP_201_CREATED)


def _send_telegram_lead_notification(demo_request):
    """
    Veb-saytdan kelgan demo so'rovi va xabarlarni Telegram admin botiga yuboradi.
    """
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID', '')
    if not bot_token or not chat_id:
        return

    text = (
        f"🚨 <b>YANGI DEMO SO'ROV (hamrohpos.uz)</b>\n\n"
        f"🏢 <b>Restoran:</b> {demo_request.restaurant_name}\n"
        f"👤 <b>Aloqa shaxsi:</b> {demo_request.contact_name}\n"
        f"📞 <b>Telefon:</b> {demo_request.phone}\n"
        f"📊 <b>Kassa soni:</b> {demo_request.branch_count or '1 ta'}\n"
    )
    if demo_request.note:
        text += f"📝 <b>Izoh:</b> {demo_request.note}\n"

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = urllib.parse.urlencode({
        'chat_id': chat_id,
        'text': text,
        'parse_mode': 'HTML',
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning("Telegram lead notification yuborishda xato: %s", e)


class PublicStatsView(APIView):
    """
    Veb-sayt (hamrohpos.uz) uchun ommaviy tizim statistikasi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.AnonRateThrottle]

    def get(self, request):
        active_count = Restaurant.objects.filter(is_active=True).count()
        online_count = Restaurant.objects.filter(is_online=True).count()
        release_version = getattr(settings, 'LATEST_RELEASE_VERSION', '0.3.0')

        return Response({
            "active_restaurants": active_count,
            "online_restaurants": online_count,
            "app_version": release_version,
            "status": "operational",
        }, status=status.HTTP_200_OK)


class PublicLicenseCheckView(APIView):
    """
    Veb-sayt (hamrohpos.uz) orqali litsenziya kalitini tekshirish.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.AnonRateThrottle]

    def post(self, request):
        serializer = PublicLicenseCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = serializer.validated_data['license_key'].strip()

        try:
            license_obj = License.objects.select_related('restaurant').get(key__iexact=key)
        except License.DoesNotExist:
            return Response({
                "status": "not_found",
                "detail": "Kiritilgan litsenziya kaliti topilmadi."
            }, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        is_expired = license_obj.expires_at < now
        is_valid = license_obj.is_active and not is_expired

        # Restoran nomini anonimlashtirish (masalan Rayhon ***)
        name = license_obj.restaurant.name
        name_parts = name.split()
        masked_name = name_parts[0] + " ***" if len(name_parts) > 1 else name[:3] + "***"

        return Response({
            "status": "active" if is_valid else ("expired" if is_expired else "inactive"),
            "restaurant": masked_name,
            "expires_at": license_obj.expires_at.isoformat(),
            "hardware_bound": bool(license_obj.hardware_hash),
            "detail": "Litsenziya to'liq faol." if is_valid else ("Litsenziya muddati tugagan." if is_expired else "Litsenziya nofaol.")
        }, status=status.HTTP_200_OK)


class PublicDemoRequestView(APIView):
    """
    Veb-saytdan (hamrohpos.uz) demoga so'rov qabul qilish va Telegram xabarnomasi yuborish.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.AnonRateThrottle]

    def post(self, request):
        serializer = DemoRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        demo_req = DemoRequest.objects.create(
            restaurant_name=data['restaurant_name'],
            contact_name=data['contact_name'],
            phone=data['phone'],
            branch_count=data.get('branch_count', ''),
            note=data.get('note', ''),
        )

        # Telegram botga admin bildirishnomasi
        _send_telegram_lead_notification(demo_req)

        return Response({
            "id": str(demo_req.id),
            "detail": "So'rovingiz muvaffaqiyatli qabul qilindi. Mutaxassisimiz tez orada siz bilan bog'lanadi."
        }, status=status.HTTP_201_CREATED)

