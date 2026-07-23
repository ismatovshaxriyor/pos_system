from django.http import HttpResponse, HttpResponseNotFound, HttpResponseForbidden
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
                    if path == '/' or path == '':
                        return self.render_tenant_home(restaurant)
                except Restaurant.DoesNotExist:
                    return HttpResponseNotFound(f"'{subdomain}.hamrohpos.uz' subdomeni bo'yicha restoran topilmadi.")

        return self.get_response(request)

    def render_tenant_home(self, restaurant):
        html = f"""<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{restaurant.name} — Hamroh POS</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body {{ font-family: 'Inter', system-ui, sans-serif; background: #001712; color: #c7eade; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }}
        .card {{ background: #002b22; border: 1px solid #144e3f; padding: 2.5rem; border-radius: 20px; text-align: center; max-width: 480px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }}
        .icon {{ width: 64px; height: 64px; background: rgba(16, 185, 129, 0.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; color: #10b981; font-size: 28px; }}
        h1 {{ color: #ffffff; margin: 0 0 8px 0; font-size: 1.875rem; font-weight: 700; }}
        .subdomain {{ color: #e3c282; font-family: monospace; font-size: 1rem; background: rgba(227, 194, 130, 0.1); padding: 4px 12px; border-radius: 8px; display: inline-block; margin-bottom: 1.5rem; }}
        .badge {{ display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 20px; background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 600; font-size: 0.875rem; border: 1px solid rgba(16, 185, 129, 0.3); }}
        p {{ color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-top: 1.5rem; margin-bottom: 0; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🏪</div>
        <h1>{restaurant.name}</h1>
        <div class="subdomain">{restaurant.subdomain}.hamrohpos.uz</div>
        <br>
        <div class="badge">● Onlayn (Hamroh POS Bulutli Tizimi)</div>
        <p>Ushbu restoran Hamroh POS bulutli boshqaruv serveriga muvaffaqiyatli ulangan.</p>
    </div>
</body>
</html>"""
        return HttpResponse(html)
