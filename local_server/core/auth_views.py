from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import DeviceRegisterSerializer, PinLoginSerializer, UserSerializer


class DeviceRegisterView(APIView):
    """
    Xodim admin bergan bir martalik kodni telefonida kiritib, o'z
    qurilmasini birinchi marta tasdiqlaydi va PIN o'rnatadi. Muvaffaqiyatli
    bo'lsa darhol token qaytaradi - qayta login qilish shart emas.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

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
    """Xodimning kunlik kirishi - faqat device_id + PIN, telefon raqami shart emas."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PinLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user, token = services.verify_pin_login(data['device_id'], data['pin'])
        except services.ServiceError as exc:
            return Response({"detail": exc.message}, status=exc.status)

        return Response({"token": token.key, "user": UserSerializer(user).data})
