from django.urls import path

from .views import ActivateView, StatusView

urlpatterns = [
    path('activate/', ActivateView.as_view(), name='license-activate'),
    path('status/', StatusView.as_view(), name='license-status'),
]
