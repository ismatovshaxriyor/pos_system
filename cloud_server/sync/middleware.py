from django.http import HttpResponseNotFound, HttpResponseForbidden
from tenants.models import Restaurant


SYSTEM_SUBDOMAINS = {'admin', 'api', 'www', 'website', 'app', 'localhost', '127.0.0.1'}


class DomainRoutingMiddleware:
    """
    Subdomenlarni qat'iy ajratish va dinamik tenant subdomenlarini bog'lash uchun middleware:
    - admin.hamrohpos.uz orqali faqat /admin/ (va static/media) kiritiladi, /api/ 404 beradi.
    - api.hamrohpos.uz orqali faqat /api/ (va swagger) kiritiladi, /admin/ 404 beradi.
    - <subdomain>.hamrohpos.uz kelganda bazadan mos restoranni topib request.restaurant'ga biriktiradi.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host().split(':')[0].lower()
        path = request.path
        parts = host.split('.')

        request.restaurant = None

        if host == 'admin.hamrohpos.uz':
            # Block API sync endpoints on admin subdomain
            if path.startswith('/api/sync/'):
                return HttpResponseNotFound("Endpoint API domenida joylashgan: api.hamrohpos.uz")

        elif host == 'api.hamrohpos.uz':
            # Block Admin panel on API subdomain
            if path.startswith('/admin/'):
                return HttpResponseNotFound("Admin panel Admin domenida joylashgan: admin.hamrohpos.uz")

        elif len(parts) >= 3 and parts[-2:] == ['hamrohpos', 'uz']:
            subdomain = parts[0]
            if subdomain not in SYSTEM_SUBDOMAINS:
                try:
                    restaurant = Restaurant.objects.get(subdomain__iexact=subdomain)
                    if not restaurant.is_active:
                        return HttpResponseForbidden("Ushbu restoran tizimi vaqtincha nofaol qilingan.")
                    request.restaurant = restaurant
                except Restaurant.DoesNotExist:
                    return HttpResponseNotFound(f"'{subdomain}.hamrohpos.uz' subdomeni bo'yicha restoran topilmadi.")

        return self.get_response(request)
