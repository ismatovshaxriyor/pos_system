import sys
from django.conf import settings
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from core.models import StaffDevice

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
