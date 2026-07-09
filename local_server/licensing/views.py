import requests
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .client import OnaClient
from .hardware import get_hardware_fingerprint
from .models import LicenseState


class ActivateView(APIView):
    """
    Lokal tizimni litsenziya kaliti bilan faollashtiradi. Ona serverga
    qurilma barmoq izini yuboradi, muvaffaqiyatli bo'lsa JWT tokenni
    lokal bazaga (LicenseState) saqlaydi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        license_key = request.data.get('license_key', '').strip()
        if not license_key:
            return Response(
                {"detail": "Litsenziya kaliti kiritilmadi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        state = LicenseState.load() or LicenseState()
        state.license_key = license_key
        state.jwt_token = data['token']
        state.hardware_hash = hardware_hash
        state.restaurant_id = data['restaurant']['id']
        state.restaurant_name = data['restaurant']['name']
        state.token_expires_at = parse_datetime(data['expires_at'])
        state.activated_at = timezone.now()
        state.last_renewed_at = timezone.now()
        state.is_blocked = False
        state.blocked_reason = ''
        state.save()

        return Response(data, status=status.HTTP_200_OK)


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
            "last_renewed_at": state.last_renewed_at,
            "is_blocked": state.is_blocked,
            "blocked_reason": state.blocked_reason,
            "server_time": timezone.now(),
        })
