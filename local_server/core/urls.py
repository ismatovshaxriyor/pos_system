from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, TableViewSet, CategoryViewSet,
    ProductViewSet, OrderViewSet, OrderItemViewSet,
    StaffDeviceViewSet, NotificationViewSet,
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'tables', TableViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'products', ProductViewSet)
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'order-items', OrderItemViewSet)
router.register(r'devices', StaffDeviceViewSet, basename='staffdevice')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
]
