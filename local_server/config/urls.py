"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve as serve_static
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.authtoken.views import obtain_auth_token

from core.auth_views import DeviceRegisterView, PinLoginView, WaiterLoginView

urlpatterns = [
    path('admin/', admin.site.urls),

    # API endpoints
    path('api/', include('core.urls')),
    path('api/auth/login/', obtain_auth_token, name='api_token_auth'),
    # Admin (is_staff) - yuqoridagi telefon+parol bilan kiradi. Boshqa xodim
    # (manager/cashier/waiter) - qurilmaga bog'langan PIN bilan, shu ikkitasi:
    path('api/auth/device/register/', DeviceRegisterView.as_view(), name='auth-device-register'),
    path('api/auth/pin-login/', PinLoginView.as_view(), name='auth-pin-login'),
    path('api/auth/waiter-login/', WaiterLoginView.as_view(), name='auth-waiter-login'),
    path('api/license/', include('licensing.urls')),

    # Swagger API Docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # Product/Category rasmlari. django.views.static.serve DEBUG'ga qarab
    # o'chib qolmaydi (django.contrib.staticfiles'dan farqli) - shart,
    # chunki bu yerda nginx yo'q, daphne hammasini o'zi xizmat qiladi
    # (bitta restoran ko'lamida yetarli - docs/3'dagi Nginx rejasi hali
    # amalga oshirilmagan).
    re_path(r'^media/(?P<path>.*)$', serve_static, {'document_root': settings.MEDIA_ROOT}),
]
