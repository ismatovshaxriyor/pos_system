from django.contrib import admin, messages
from simple_history.admin import SimpleHistoryAdmin

from . import services
from .models import (
    User, Table, Category, Product, Order, OrderItem, Payment,
    StaffDevice, DeviceRegistrationCode, Notification,
)

@admin.register(User)
class UserAdmin(SimpleHistoryAdmin):
    list_display = ('username', 'role', 'is_staff', 'is_synced')
    list_filter = ('role', 'is_staff', 'is_synced')
    actions = ['generate_registration_code']

    @admin.action(description="Qurilma ro'yxatga olish kodi yaratish (PIN bilan kiruvchi xodim uchun)")
    def generate_registration_code(self, request, queryset):
        for user in queryset:
            try:
                registration = services.generate_registration_code(user, created_by=request.user)
            except services.ServiceError as exc:
                self.message_user(request, f"{user.username}: {exc.message}", level=messages.WARNING)
                continue
            self.message_user(
                request,
                f"{user.username} uchun kod ({registration.expires_at:%Y-%m-%d %H:%M} gacha amal qiladi): "
                f"{registration.code}",
                level=messages.SUCCESS,
            )

@admin.register(StaffDevice)
class StaffDeviceAdmin(SimpleHistoryAdmin):
    list_display = ('user', 'device_label', 'device_id', 'is_active', 'last_login_at')
    list_filter = ('is_active',)
    search_fields = ('user__username', 'device_id', 'device_label')
    actions = ['revoke_devices']

    @admin.action(description="Tanlangan qurilmalarni chetlashtirish (revoke)")
    def revoke_devices(self, request, queryset):
        count = 0
        for device in queryset.filter(is_active=True):
            services.revoke_device(device, kicked_by=request.user)
            count += 1
        self.message_user(request, f"{count} ta qurilma chetlashtirildi.", level=messages.SUCCESS)

@admin.register(DeviceRegistrationCode)
class DeviceRegistrationCodeAdmin(SimpleHistoryAdmin):
    list_display = ('user', 'code', 'expires_at', 'used_at', 'created_by')
    readonly_fields = ('code',)
    search_fields = ('user__username', 'code')

@admin.register(Notification)
class NotificationAdmin(SimpleHistoryAdmin):
    list_display = ('notif_type', 'recipient', 'message', 'is_read', 'created_at')
    list_filter = ('notif_type', 'is_read')

@admin.register(Table)
class TableAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'capacity', 'is_active', 'is_synced')
    list_filter = ('is_active', 'is_synced')

@admin.register(Category)
class CategoryAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'is_synced')

@admin.register(Product)
class ProductAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'category', 'price', 'is_available', 'is_synced')
    list_filter = ('category', 'is_available', 'is_synced')
    search_fields = ('name', 'barcode')

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1

class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 1
    readonly_fields = ('received_by', 'created_at')

@admin.register(Payment)
class PaymentAdmin(SimpleHistoryAdmin):
    list_display = ('id', 'order', 'amount', 'method', 'received_by', 'created_at', 'is_synced')
    list_filter = ('method', 'is_synced', 'created_at')

@admin.register(Order)
class OrderAdmin(SimpleHistoryAdmin):
    list_display = (
        'id', 'table', 'waiter', 'total_amount', 'discount_amount',
        'final_amount_display', 'amount_paid_display', 'balance_due_display',
        'status', 'created_at', 'is_synced',
    )
    list_filter = ('status', 'is_synced', 'created_at')
    inlines = [OrderItemInline, PaymentInline]

    @admin.display(description="Yakuniy summa")
    def final_amount_display(self, obj):
        return obj.final_amount

    @admin.display(description="To'langan")
    def amount_paid_display(self, obj):
        return obj.amount_paid

    @admin.display(description="Qarzdorlik")
    def balance_due_display(self, obj):
        return obj.balance_due

