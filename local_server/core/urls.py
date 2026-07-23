from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, TableViewSet, CategoryViewSet,
    ProductViewSet, OrderViewSet,
    StaffDeviceViewSet, NotificationViewSet, BootstrapView,
    RestaurantConfigViewSet, AttendanceViewSet, TableZoneViewSet,
    PrinterViewSet, PrintJobViewSet, PublicMenuView, PublicTableLiveView, PublicCallWaiterView,
)
from .reports import (
    MySalesSummaryView, DashboardView, SalesReportView,
    StaffReportView, InventoryReportView, DebtsReportView,
)
from .customers import CustomerViewSet
from .inventory import (
    SupplierViewSet, IngredientViewSet, RecipeItemViewSet,
    PurchaseViewSet, StockMovementViewSet,
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'tables', TableViewSet)
router.register(r'table-zones', TableZoneViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'products', ProductViewSet)
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'devices', StaffDeviceViewSet, basename='staffdevice')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'restaurant-config', RestaurantConfigViewSet, basename='restaurantconfig')
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'printers', PrinterViewSet, basename='printer')
router.register(r'print-jobs', PrintJobViewSet, basename='printjob')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'ingredients', IngredientViewSet, basename='ingredient')
router.register(r'recipe-items', RecipeItemViewSet, basename='recipeitem')
router.register(r'purchases', PurchaseViewSet, basename='purchase')
router.register(r'stock-movements', StockMovementViewSet, basename='stockmovement')

urlpatterns = [
    path('public/menu/', PublicMenuView.as_view(), name='public-menu'),
    path('public/table/<str:qr_code>/', PublicTableLiveView.as_view(), name='public-table-live'),
    path('public/table/<str:qr_code>/call-waiter/', PublicCallWaiterView.as_view(), name='public-call-waiter'),
    path('bootstrap/', BootstrapView.as_view(), name='bootstrap'),
    path('reports/my-summary/', MySalesSummaryView.as_view(), name='reports-my-summary'),
    path('reports/dashboard/', DashboardView.as_view(), name='reports-dashboard'),
    path('reports/sales/', SalesReportView.as_view(), name='reports-sales'),
    path('reports/staff/', StaffReportView.as_view(), name='reports-staff'),
    path('reports/inventory/', InventoryReportView.as_view(), name='reports-inventory'),
    path('reports/debts/', DebtsReportView.as_view(), name='reports-debts'),
    path('', include(router.urls)),
]
