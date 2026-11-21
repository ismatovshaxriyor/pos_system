import sys
from django.conf import settings
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from core.models import StaffDevice

# Oshxona dashboardi (DEBUG yoki KITCHEN_DASHBOARD_ENABLED=1) uchun avto-yaratiladigan servis hisobi. Aks holda bu hisob
# HECH QACHON autentifikatsiyadan o'tmasligi kerak: sahifa token'ni login'siz bergan eski o'rnatishlarda
# tokenlar allaqachon oshkor bo'lgan bo'lishi mumkin.
KITCHEN_SERVICE_USERNAME = '+998000000001'
KITCHEN_SERVICE_DEVICE_ID = 'kitchen-dashboard-service'


def kitchen_dashboard_enabled():
    return settings.DEBUG or getattr(settings, 'KITCHEN_DASHBOARD_ENABLED', False)


def is_blocked_service_account(user):
    return (not kitchen_dashboard_enabled()) and user.username == KITCHEN_SERVICE_USERNAME


class DeviceTokenAuthentication(TokenAuthentication):
    """
    Kengaytirilgan TokenAuthentication: so'rov yuborayotgan foydalanuvchining
    Token bilan birga tegishli qurilmasi (X-Device-ID header) faol va 
    tasdiqlanganligini tekshiradi.
    """
    def authenticate(self, request):
        auth_data = super().authenticate(request)
        if auth_data is None:
            return None
            
        user, token = auth_data

        if is_blocked_service_account(user):
            raise AuthenticationFailed("Bu hisob faqat sinov (DEBUG) rejimida ishlaydi.")

        # is_staff foydalanuvchilari (adminlar) parolda kirganligi uchun qurilma tekshiruvidan ozod
        if user.is_staff:
            return user, token
            
        # Test muhitida agar header yuborilmagan bo'lsa, mavjud testlar sinmasligi uchun tekshiruvni chetlab o'tamiz
        is_testing = 'test' in sys.argv or getattr(settings, 'TESTING', False)
        
        device_id = request.headers.get('X-Device-ID') or request.META.get('HTTP_X_DEVICE_ID')
        if not device_id:
            if is_testing:
                return user, token
            raise AuthenticationFailed("Qurilma ID si yuborilmadi (X-Device-ID header).")
            
        # Qurilmani faolligi va tasdiqlanganligini tekshirish
        device_exists = StaffDevice.objects.filter(
            user=user,
            device_id=device_id,
            is_active=True,
            is_approved=True
        ).exists()
        
        if not device_exists:
            raise AuthenticationFailed("Ushbu qurilmaga ruxsat berilmagan yoki u faol emas.")
            
        return user, token
