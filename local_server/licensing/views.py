import logging
from datetime import datetime, UTC

import requests
from django.conf import settings
from django.http import FileResponse, Http404
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
from .models import AppRelease, LicenseState
from . import appupdates
from .serializers import ActivateSerializer, ApplyOfflineTokenSerializer

logger = logging.getLogger(__name__)


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

        try:
            data = response.json()
        except ValueError:
            # Ona o'rnidagi proxy/tunnel (masalan cloudflared) HTML xato
            # sahifasi qaytargan bo'lishi mumkin - foydalanuvchiga 500
            # o'rniga tushunarli xabar beramiz hamda batafsil log yozamiz.
            logger.error(
                "Ona serverdan kutilmagan javob keldi (status=%s): %s",
                response.status_code,
                response.text[:200] if response.text else '',
            )
            return Response(
                {"detail": "Ona serverdan kutilmagan javob keldi. Birozdan so'ng qayta urining."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
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

        public_domain = data.get('restaurant', {}).get('public_domain')
        if public_domain:
            try:
                from core.models import RestaurantConfig
                config, _ = RestaurantConfig.objects.get_or_create(pk=1)
                if not config.public_domain:
                    config.public_domain = public_domain
                    config.save()
            except Exception as exc:
                logger.warning("RestaurantConfig.public_domain o'rnatishda xatolik: %s", exc)

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
    Litsenziya holati. Autentifikatsiyasiz (ilovalar blok/faollashtirishni login'dan oldin ko'rishi kerak)
    faqat minimal ma'lumot beriladi; token muddatlari/zaxira tokenlar soni kabi tafsilotlar faqat
    menejer/admin uchun - ular tizimning qachon "o'chishini" oldindan bilishga yordam beradi, begonaga
    esa kerak emas. Maxfiy maydonlar (kalit, token matni) hech qachon qaytarilmaydi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @staticmethod
    def _is_manager(request):
        from rest_framework.exceptions import AuthenticationFailed
        from core.authentication import DeviceTokenAuthentication
        try:
            res = DeviceTokenAuthentication().authenticate(request)
        except AuthenticationFailed:
            return False
        if not res:
            return False
        user = res[0]
        return bool(user.is_staff or getattr(user, 'role', '') == 'manager')

    def get(self, request):
        state = LicenseState.load()
        if not state:
            return Response({
                "activated": False,
                "detail": "Tizim hali faollashtirilmagan.",
            })

        data = {
            "activated": bool(state.activated_at),
            "restaurant_name": state.restaurant_name,
            "is_blocked": state.is_blocked,
            "server_time": timezone.now(),
        }
        if self._is_manager(request):
            data.update({
                "token_expires_at": state.token_expires_at,
                "furthest_token_expiry": state.furthest_expiry,
                "pending_tokens_count": len(state.pending_tokens),
                "last_renewed_at": state.last_renewed_at,
                "blocked_reason": state.blocked_reason,
            })
        return Response(data)


class DiscoveryView(APIView):
    """
    Mobil/Flutter mijozlar tarmoqda mDNS orqali topgan IP manzilining
    aynan haqiqiy Bola server ekanini va uning metama'lumotlarini tekshirishi
    uchun ochiq ping endpointi (`GET /api/discovery/`).
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        state = LicenseState.load()
        return Response({
            "service": "pos-bola",
            "activated": bool(state and state.activated_at),
            "restaurant_id": str(state.restaurant_id) if state and state.restaurant_id else None,
            "restaurant_name": state.restaurant_name if state else "Faollashtirilmagan Server",
            "is_blocked": state.is_blocked if state else False,
            "server_time": timezone.now(),
        })




class AppUpdateCheckView(APIView):
    """
    Ilova ishga tushganda/vaqti-vaqti bilan so'raydi: "mening versiyamdan yangisi bormi?". Avtorizatsiyasiz
    (login'dan oldin ham tekshirilishi kerak) va litsenziya blokidan tashqarida (`/api/license/*`) -
    majburiy yangilanish bloklangan tizimda ham yetib borishi uchun.
    Faqat Bola'ga to'liq yuklab olingan (`ready`) versiyalar e'lon qilinadi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request):
        slugs = [s for s in (request.query_params.get('slugs') or '').split(',') if s]
        platform = request.query_params.get('platform') or ''
        current = request.query_params.get('current') or ''
        qs = AppRelease.objects.filter(status='ready', platform=platform).exclude(file='')
        if slugs:
            qs = qs.filter(slug__in=slugs)
        best = None
        for release in qs:
            if best is None or appupdates.is_newer(release.version, best.version):
                best = release
        if best is None or not appupdates.is_newer(best.version, current):
            return Response({"available": False, "required": False, "latest": None})
        return Response({
            "available": True,
            "required": best.is_required,
            "latest": {
                "slug": best.slug, "version": best.version, "size_mb": str(best.size_mb),
                "sha256": best.sha256, "notes": best.notes,
                "download_url": f"/api/license/app-updates/{best.pk}/download/",
            },
        })


class AppUpdateDownloadView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses={200: bytes})
    def get(self, request, pk):
        release = AppRelease.objects.filter(pk=pk, status='ready').exclude(file='').first()
        if release is None:
            raise Http404
        try:
            handle = release.file.open('rb')
        except OSError:
            raise Http404
        name = f"{release.slug}-{release.version}{release.file.name[release.file.name.rfind('.'):]}"
        return FileResponse(handle, as_attachment=True, filename=name)
