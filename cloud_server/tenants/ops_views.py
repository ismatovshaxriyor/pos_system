"""
Jonli monitor sahifasi va uning JSON endpointlari (`/admin/ops/...`).

Kirish: FAQAT faol superuser. Tizimga kirmagan -> admin login'ga yo'naltiriladi;
kirgan, lekin superuser bo'lmagan xodim -> 404 (sahifa borligi ham oshkor qilinmaydi).
Hamma javob `no-store`: monitor ma'lumoti hech qachon keshlanmasin.
"""
import json
import uuid
from functools import wraps

from django.contrib.auth.views import redirect_to_login
from django.http import Http404, JsonResponse
from django.urls import reverse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from . import ops
from .models import Restaurant


def superuser_only(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        user = request.user
        if not user.is_authenticated:
            if request.path.startswith('/admin/ops/api/'):
                return JsonResponse({'detail': 'Sessiya tugagan. Sahifani yangilang.'}, status=401)
            return redirect_to_login(request.get_full_path(), login_url=reverse('admin:login'))
        if not (user.is_active and user.is_superuser):
            raise Http404()
        return view(request, *args, **kwargs)
    return wrapper


@never_cache
@superuser_only
@ensure_csrf_cookie
@require_GET
def dashboard(request):
    return render(request, 'ops/dashboard.html', {'actions_json': json.dumps(ops.ACTIONS)})


@never_cache
@superuser_only
@require_GET
def api_snapshot(request):
    """Bitta so'rovda hammasi: server + flot + voqealar (sahifa har ~3 soniyada chaqiradi)."""
    data = {
        'server': ops.server_snapshot(request),
        'fleet': ops.fleet_snapshot(),
        'events': ops.recent_events(),
    }
    return JsonResponse(data)


@never_cache
@superuser_only
@require_GET
def api_history(request):
    """Sahifa ochilganda grafiklarni to'ldirish uchun server tarixi (oxirgi ~3 soat)."""
    return JsonResponse({'samples': ops.server_history()})


@never_cache
@superuser_only
@require_GET
def api_restaurant(request, restaurant_id):
    try:
        return JsonResponse(ops.restaurant_detail(restaurant_id))
    except (Restaurant.DoesNotExist, ValueError):
        raise Http404()


@never_cache
@superuser_only
@require_POST
def api_action(request):
    try:
        body = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'ok': False, 'message': "Noto'g'ri so'rov."}, status=400)
    ids = body.get('restaurant_ids') or []
    if not isinstance(ids, list) or len(ids) > 500:
        return JsonResponse({'ok': False, 'message': "Noto'g'ri restoranlar ro'yxati."}, status=400)
    try:
        ids = [str(uuid.UUID(str(i))) for i in ids]
        params = body.get('params') or {}
        if not isinstance(params, dict):
            raise ValueError('params')
        result = ops.perform_action(request.user, str(body.get('action', '')), ids, params)
    except (ValueError, TypeError, AttributeError):
        return JsonResponse({'ok': False, 'message': "Noto'g'ri qiymat."}, status=400)
    return JsonResponse(result, status=200 if result.get('ok') else 400)
