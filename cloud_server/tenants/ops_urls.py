from django.urls import path

from . import ops_views

urlpatterns = [
    path('', ops_views.dashboard, name='ops-dashboard'),
    path('api/snapshot/', ops_views.api_snapshot, name='ops-snapshot'),
    path('api/history/', ops_views.api_history, name='ops-history'),
    path('api/restaurant/<uuid:restaurant_id>/', ops_views.api_restaurant, name='ops-restaurant'),
    path('api/action/', ops_views.api_action, name='ops-action'),
]
