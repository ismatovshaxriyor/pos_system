from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.utils import timezone
from tenants.models import License, RestaurantStatus, RemoteCommand, RestaurantAdminAccount, ErrorLog
from .authentication import LicenseAuthentication, HeartbeatAuthentication
from .jwt_utils import issue_license_token_batch
from .serializers import (
    ActivationSerializer, RenewSerializer, HeartbeatSerializer, CommandResultSerializer,
    ErrorLogBatchSerializer,
)

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

    def post(self, request):
        serializer = ActivationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        license_key = serializer.validated_data['license_key']
        hardware_hash = serializer.validated_data['hardware_hash']

        try:
            license_obj = License.objects.select_related('restaurant').get(key=license_key)
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

    def post(self, request):
        license_obj = request.auth
        restaurant = license_obj.restaurant

        serializer = HeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        metrics = serializer.validated_data

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

        restaurant.last_seen = timezone.now()
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
