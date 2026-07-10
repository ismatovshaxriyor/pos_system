from datetime import datetime, UTC

import requests
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import User
from .client import OnaClient
from .hardware import get_hardware_fingerprint
from .jwt_utils import verify_token, LicenseTokenError
from .models import LicenseState
from .serializers import ActivateSerializer, ApplyOfflineTokenSerializer


def _provision_admin_user(admin_data):
    """
    Ona'dan aktivatsiya javobi orqali kelgan bosh menejer hisobini lokal
    bazaga yaratadi/yangilaydi. `password_hash` allaqachon Django-mos xesh
    (Ona'da make_password() bilan yaratilgan) - shuning uchun to'g'ridan-to'g'ri
    `password` maydoniga yoziladi, qayta xeshланмайди.
    """
    User.objects.update_or_create(
        username=admin_data['phone'],
        defaults={
            'role': 'manager',
            'is_staff': True,
            'is_superuser': True,
            'first_name': admin_data.get('full_name', ''),
            'password': admin_data['password_hash'],
        },
    )


class ActivateView(APIView):
    """
    Lokal tizimni litsenziya kaliti bilan faollashtiradi. Ona serverga
    qurilma barmoq izini yuboradi, muvaffaqiyatli bo'lsa JWT tokenni
    lokal bazaga (LicenseState) saqlaydi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=ActivateSerializer)
    def post(self, request):
        serializer = ActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Katta-kichik harfni Ona (key__iexact) normallashtiradi - bu yerda
        # emas, aks holda eski (kichik harfli hex) kalitlar ham
        # normallashtirilib, o'sha eski qatorlar bilan mos kelmay qolardi.
        license_key = serializer.validated_data['license_key'].strip()

        try:
            hardware_hash = get_hardware_fingerprint()
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        client = OnaClient()
        try:
            response = client.activate(license_key, hardware_hash)
        except requests.RequestException:
            return Response(
                {"detail": "Ona server bilan bog'lanib bo'lmadi. Internetni tekshiring."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        data = response.json()
        if response.status_code != 200:
            return Response(data, status=response.status_code)

        tokens = data['tokens']
        state = LicenseState.load() or LicenseState()
        # Foydalanuvchi kiritgan matn emas, Ona qaytargan KANONIK registr -
        # keyingi renew/heartbeat so'rovlari shu qiymatni Token sifatida
        # yuboradi, Ona tomonda esa case-sensitive aniq mos kelish talab
        # qilinadi (LicenseAuthentication).
        state.license_key = data.get('license_key', license_key)
        # Ona'dan kelgan bo'lsa saqlanadi - keyingi verify_token() chaqiruvlari
        # shu qiymatni ishlatadi (jwt_utils.py), LICENSE_PUBLIC_KEY_FILE'ni har
        # bir qurilmaga qo'lda nusxalash shart bo'lmasin uchun. `or` bilan -
        # eski Ona versiyasi bu maydonni qaytarmasa, avval saqlangan qiymat
        # (agar bor bo'lsa) bo'sh matn bilan ustidan yozib yuborilmaydi.
        state.public_key = data.get('public_key') or state.public_key
        state.jwt_token = tokens[0]['token']
        state.token_expires_at = parse_datetime(tokens[0]['expires_at'])
        state.pending_tokens = tokens[1:]
        state.hardware_hash = hardware_hash
        state.restaurant_id = data['restaurant']['id']
        state.restaurant_name = data['restaurant']['name']
        state.activated_at = timezone.now()
        state.last_renewed_at = timezone.now()
        state.is_blocked = False
        state.blocked_reason = ''
        state.save()

        admin_data = data.get('admin')
        response_data = {k: v for k, v in data.items() if k != 'admin'}
        if admin_data:
            _provision_admin_user(admin_data)
            # password_hash faqat ichki provisioning uchun - javobda qaytarilmaydi.
            response_data['admin'] = {
                "phone": admin_data['phone'],
                "full_name": admin_data.get('full_name', ''),
            }

        return Response(response_data, status=status.HTTP_200_OK)


class ApplyOfflineTokenView(APIView):
    """
    Internet uzilgan paytda ham litsenziyani yangilash uchun: operator Ona
    admin panelida generatsiya qilgan JWT tokenni (masalan Telegram/SMS
    orqali yuborilgan) shu yerga qo'lda kiritish mumkin. Token butunlay
    OFLAYN tekshiriladi (faqat mahalliy public key bilan) - Ona serverga
    hech qanday so'rov yuborilmaydi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=ApplyOfflineTokenSerializer)
    def post(self, request):
        serializer = ApplyOfflineTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data['token'].strip()

        state = LicenseState.load()
        if not state or not state.activated_at:
            return Response(
                {"detail": "Tizim hali faollashtirilmagan. Avval litsenziya kaliti bilan faollashtiring."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            hardware_hash = get_hardware_fingerprint()
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            payload = verify_token(token, hardware_hash)
        except LicenseTokenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        state.jwt_token = token
        state.token_expires_at = datetime.fromtimestamp(payload['exp'], tz=UTC)
        state.last_renewed_at = timezone.now()
        if state.blocked_reason == 'license_inactive':
            state.is_blocked = False
            state.blocked_reason = ''
        state.save()

        return Response({
            "detail": "Oflayn kod muvaffaqiyatli qabul qilindi. Tizim ishlashda davom etadi.",
            "token_expires_at": state.token_expires_at,
        }, status=status.HTTP_200_OK)


class StatusView(APIView):
    """
    Litsenziya holatini diagnostika uchun qaytaradi. Maxfiy maydonlar
    (kalit, token matni) hech qachon qaytarilmaydi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        state = LicenseState.load()
        if not state:
            return Response({
                "activated": False,
                "detail": "Tizim hali faollashtirilmagan.",
            })

        return Response({
            "activated": bool(state.activated_at),
            "restaurant_name": state.restaurant_name,
            "token_expires_at": state.token_expires_at,
            "furthest_token_expiry": state.furthest_expiry,
            "pending_tokens_count": len(state.pending_tokens),
            "last_renewed_at": state.last_renewed_at,
            "is_blocked": state.is_blocked,
            "blocked_reason": state.blocked_reason,
            "server_time": timezone.now(),
        })
