from django.http import HttpResponseNotFound


class DomainRoutingMiddleware:
    """
    Subdomenlarni qat'iy ajratish uchun middleware:
    - admin.hamrohpos.uz orqali faqat /admin/ (va static/media) kiritiladi, /api/ 404 beradi.
    - api.hamrohpos.uz orqali faqat /api/ (va swagger) kiritiladi, /admin/ 404 beradi.
    - Boshqa domenlar / dev holatida barchasiga ruxsat beriladi.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host().split(':')[0].lower()
        path = request.path

        if host == 'admin.hamrohpos.uz':
            # Block API sync endpoints on admin subdomain
            if path.startswith('/api/sync/'):
                return HttpResponseNotFound("Endpoint API domenida joylashgan: api.hamrohpos.uz")

        elif host == 'api.hamrohpos.uz':
            # Block Admin panel on API subdomain
            if path.startswith('/admin/'):
                return HttpResponseNotFound("Admin panel Admin domenida joylashgan: admin.hamrohpos.uz")

        return self.get_response(request)
