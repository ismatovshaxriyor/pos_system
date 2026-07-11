from django.urls import path
from .views import HeartbeatView, ActivationView, RenewView, CommandResultView, ErrorLogView, OrderSyncView

urlpatterns = [
    path('activate/', ActivationView.as_view(), name='sync-activate'),
    path('renew/', RenewView.as_view(), name='sync-renew'),
    path('heartbeat/', HeartbeatView.as_view(), name='sync-heartbeat'),
    path('commands/<uuid:command_id>/result/', CommandResultView.as_view(), name='sync-command-result'),
    path('error-logs/', ErrorLogView.as_view(), name='sync-error-logs'),
    path('orders/', OrderSyncView.as_view(), name='sync-orders'),
]
