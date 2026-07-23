from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import (
    AuthTokenResponseSerializer, DeviceRegisterSerializer, ErrorDetailSerializer,
    PinLoginSerializer, UserSerializer, WaiterLoginSerializer,
)


class WaiterLoginView(APIView):
    """
    Ofitsiantning telefon va parol orqali kirishi.
    Qurilma TOFU yoki manager tasdig'i asosida tekshiriladi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        request=WaiterLoginSerializer,
        responses={
            200: AuthTokenResponseSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Telefon yoki parol noto'g'ri."),
            403: OpenApiResponse(ErrorDetailSerializer, description="Yangi qurilmadan kirish taqiqlangan. Menejer tasdig'i kutilmoqda.")
        }
    )
    def post(self, request):
        serializer = WaiterLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user, token = services.login_waiter(
                phone=data['phone'],
                password=data['password'],
                device_id=data['device_id'],
                device_label=data.get('device_label', '')
            )
        except services.ServiceError as exc:
            return Response({"detail": exc.message}, status=exc.status)

        return Response({"token": token.key, "user": UserSerializer(user).data})


class DeviceRegisterView(APIView):
    """
    Xodim menejer bergan 6-xonali bir martalik kodni kiritib o'z
    planshetini birinchi marta tasdiqlaydi va 6-xonali PIN o'rnatadi.
    Muvaffaqiyatli bo'lsa darhol token qaytaradi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Xodim planshetini ro'yxatdan o'tkazish (6-xonali kod bilan)",
        description="Menejer bergan 6-xonali bir martalik ro'yxatdan o'tish kodini planshetda kiritib xodim shaxsiy 6-xonali PIN kodi o'rnatadi.",
        request=DeviceRegisterSerializer,
        responses={
            201: AuthTokenResponseSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Kod noto'g'ri/muddati tugagan yoki PIN formati xato."),
        },
    )
    def post(self, request):
        serializer = DeviceRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user, token = services.redeem_registration_code(
                phone=data['phone'], code=data['code'], device_id=data['device_id'],
                pin=data['pin'], device_label=data.get('device_label', ''),
            )
        except services.ServiceError as exc:
            return Response({"detail": exc.message}, status=exc.status)

        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class PinLoginView(APIView):
    """
    Kassa planshetida PIN orqali login. Bitta kassa planshetida bir nechta
    kassirlar smenani almashtirib ishlashi (Shift Swap) to'liq qo'llab-quvvatlanadi.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Kassa planshetida PIN orqali login (Shift Swap)",
        description="Kassir yoki xodim kassa planshetida o'zining 6-xonali PIN kodini kiritadi. 1-kassir smenani yakunlab 2-kassir kelganda, 2-kassir o'z PIN kodi bilan kassa planshetida uzluksiz login qilib ketaveradi.",
        request=PinLoginSerializer,
        responses={
            200: AuthTokenResponseSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Qurilma yoki PIN noto'g'ri (bir xil umumiy xabar)."),
            429: OpenApiResponse(ErrorDetailSerializer, description="Juda ko'p noto'g'ri urinish - 5 daqiqaga qulflangan."),
        },
    )
    def post(self, request):
        serializer = PinLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user, token = services.verify_pin_login(data['device_id'], data['pin'])
        except services.ServiceError as exc:
            return Response({"detail": exc.message}, status=exc.status)

        return Response({"token": token.key, "user": UserSerializer(user).data})

