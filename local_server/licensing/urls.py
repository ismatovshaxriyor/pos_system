from django.urls import path

from .views import (
    ActivateView, ApplyOfflineTokenView, AppUpdateCheckView, AppUpdateDownloadView, StatusView, DiscoveryView,
)

urlpatterns = [
    path('activate/', ActivateView.as_view(), name='license-activate'),
    path('apply-offline-token/', ApplyOfflineTokenView.as_view(), name='license-apply-offline-token'),
    path('status/', StatusView.as_view(), name='license-status'),
    path('discovery/', DiscoveryView.as_view(), name='license-discovery'),
    path('app-updates/', AppUpdateCheckView.as_view(), name='app-update-check'),
    path('app-updates/<int:pk>/download/', AppUpdateDownloadView.as_view(), name='app-update-download'),
]

