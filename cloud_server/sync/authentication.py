from rest_framework import authentication
from rest_framework import exceptions
from tenants.models import License
from django.utils import timezone

class LicenseAuthentication(authentication.BaseAuthentication):
    """
    Custom authentication class that uses the License key.
    Format: Authorization: License <license_key>
    (Or 'Token' if we prefer keeping it standard)
    """
    keyword = 'Token'

    def authenticate(self, request):
        auth = authentication.get_authorization_header(request).split()

        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None

        if len(auth) == 1:
            msg = 'Invalid token header. No credentials provided.'
            raise exceptions.AuthenticationFailed(msg)
        elif len(auth) > 2:
            msg = 'Invalid token header. Token string should not contain spaces.'
            raise exceptions.AuthenticationFailed(msg)

        try:
            token = auth[1].decode()
        except UnicodeError:
            msg = 'Invalid token header. Token string should not contain invalid characters.'
            raise exceptions.AuthenticationFailed(msg)

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, key):
        try:
            license_obj = License.objects.get(key=key)
        except License.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid license key.')

        if not license_obj.is_active:
            raise exceptions.AuthenticationFailed('License is inactive.')
            
        if license_obj.expires_at < timezone.now():
            raise exceptions.AuthenticationFailed('License has expired.')

        # For DRF authentication to succeed, we typically return (user, auth)
        # Since local systems don't correspond to a specific User model in the cloud,
        # we can return an AnonymousUser or a dummy user object, but store the restaurant.
        # We will return None for user, and the license as auth, but DRF expects a user.
        # Let's attach the restaurant to the request and return a dummy object or None.
        # Returning (None, license_obj) actually tells DRF it's authenticated but without a user.
        # Wait, returning (None, token) might cause issues if permissions require IsAuthenticated.
        # We can create a simple dummy object.
        
        class DummyUser:
            is_authenticated = True

        return (DummyUser(), license_obj)


class HeartbeatAuthentication(LicenseAuthentication):
    """
    Heartbeat va buyruq natijasi endpointlari uchun "yumshoq" auth: litsenziya
    kaliti mavjud bo'lishi kifoya - is_active/expires_at tekshirilmaydi. Shu
    orqali o'chirilgan/muddati o'tgan litsenziyaga ega restoran ham aloqada
    qoladi va "sen bloklandingiz" signalini (license_active=False) qabul
    qila oladi. Faollashtirish/yangilash esa qat'iy LicenseAuthentication'da
    qoladi - o'lik litsenziyaga hech qachon yangi token berilmaydi.
    """

    def authenticate_credentials(self, key):
        try:
            license_obj = License.objects.get(key=key)
        except License.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid license key.')

        class DummyUser:
            is_authenticated = True

        return (DummyUser(), license_obj)
