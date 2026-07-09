from django.urls import path

from .views import ActivateView, ApplyOfflineTokenView, StatusView

urlpatterns = [
    path('activate/', ActivateView.as_view(), name='license-activate'),
    path('apply-offline-token/', ApplyOfflineTokenView.as_view(), name='license-apply-offline-token'),
    path('status/', StatusView.as_view(), name='license-status'),
]
