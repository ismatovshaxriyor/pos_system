import base64
import io
import qrcode
from django import forms
from django.contrib import admin, messages
from django.utils.html import format_html
from simple_history.admin import SimpleHistoryAdmin

from . import services
from .models import (
    User, Table, Category, Product, Order, OrderItem, Payment,
    StaffDevice, DeviceRegistrationCode, Notification,
    RestaurantConfig, Attendance, TableZone, Printer, PrintJob,
    Customer, DebtTransaction,
    Supplier, Ingredient, ProductIngredient, Purchase, PurchaseItem, StockMovement,
)


class UserAdminForm(forms.ModelForm):
    """
    Plain ModelAdmin (no fieldsets/form) was rendering every raw model
    field, including `password` as an ordinary AdminTextInputWidget text
    box - typing into it saved the value UNHASHED (ModelAdmin.save_model()
    just calls instance.save(), it doesn't know to call set_password()
    the way django.contrib.auth.admin.UserAdmin does). Mirrors
    cloud_server's RestaurantAdminAccountForm pattern: optional field,
    blank = leave unchanged, non-blank = hash it properly.
    """
    password = forms.CharField(
        widget=forms.PasswordInput, required=False,
        help_text="Bo'sh qoldirilsa mavjud parol o'zgarmaydi. Faqat is_staff=True "
                   "(admin) hisoblar uchun kerak - boshqa xodimlar PIN bilan kiradi.",
    )

    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'role', 'is_staff', 'is_active', 'password')

    def save(self, commit=True):
        instance = super().save(commit=False)
        raw_password = self.cleaned_data.get('password')
        if raw_password:
            instance.set_password(raw_password)
        if commit:
            instance.save()
        return instance


@admin.register(User)
class UserAdmin(SimpleHistoryAdmin):
    form = UserAdminForm
    list_display = ('username', 'first_name', 'last_name', 'role', 'is_staff', 'is_active')
    list_filter = ('role', 'is_staff', 'is_active')
    search_fields = ('username', 'first_name', 'last_name')
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

@admin.register(TableZone)
class TableZoneAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'created_at', 'updated_at')

@admin.register(Table)
class TableAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'zone', 'capacity', 'is_active', 'qr_code', 'qr_code_display')
    list_filter = ('zone', 'is_active', 'is_synced')
    readonly_fields = ('qr_code', 'qr_code_display', 'qr_url_display')

    @admin.display(description="QR Kod Havolasi")
    def qr_url_display(self, obj):
        if not obj.qr_code:
            return '-'
        url = f"/qr/?qr={obj.qr_code}"
        return format_html('<a href="{0}" target="_blank">{0}</a>', url)

    @admin.display(description="Stol uchun QR Kod (Stiker)")
    def qr_code_display(self, obj):
        if not obj.qr_code:
            return '-'
        qr_url = f"/qr/?qr={obj.qr_code}"
        img = qrcode.make(qr_url, box_size=5)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        data_uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
        return format_html(
            '<div style="width:140px;text-align:center">'
            '<img src="{0}" alt="QR" style="width:100%;border-radius:8px;border:1px solid #ddd">'
            '<div style="margin-top:6px"><a href="{0}" download="stol-qr-{1}.png" style="display:inline-block;padding:3px 8px;background:#22883f;color:#fff;border-radius:4px;font-size:11px;text-decoration:none">QR Yuklab Olish</a></div>'
            '</div>',
            data_uri, obj.name.replace(' ', '_'),
        )

@admin.register(Category)
class CategoryAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'printer', 'is_synced')

class ProductIngredientInline(admin.TabularInline):
    model = ProductIngredient
    extra = 1
    autocomplete_fields = ('ingredient',)


@admin.register(Product)
class ProductAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'category', 'price', 'is_available', 'is_synced')
    list_filter = ('category', 'is_available', 'is_synced')
    search_fields = ('name', 'barcode')
    inlines = [ProductIngredientInline]

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


class DebtTransactionInline(admin.TabularInline):
    model = DebtTransaction
    extra = 0
    fields = ('created_at', 'txn_type', 'amount', 'method', 'order', 'note', 'created_by')
    readonly_fields = ('created_at', 'created_by')


@admin.register(Customer)
class CustomerAdmin(SimpleHistoryAdmin):
    list_display = ('first_name', 'last_name', 'phone', 'balance', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('first_name', 'last_name', 'phone')
    readonly_fields = ('balance',)
    inlines = [DebtTransactionInline]


@admin.register(DebtTransaction)
class DebtTransactionAdmin(SimpleHistoryAdmin):
    list_display = ('id', 'customer', 'txn_type', 'amount', 'method', 'order', 'created_by', 'created_at')
    list_filter = ('txn_type', 'method', 'created_at')
    search_fields = ('customer__first_name', 'customer__last_name', 'customer__phone')


@admin.register(Supplier)
class SupplierAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'phone', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'phone')


@admin.register(Ingredient)
class IngredientAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'unit', 'current_stock', 'min_stock', 'cost_price', 'supplier', 'is_active')
    list_filter = ('unit', 'is_active', 'supplier')
    search_fields = ('name',)
    readonly_fields = ('current_stock',)


@admin.register(ProductIngredient)
class ProductIngredientAdmin(SimpleHistoryAdmin):
    list_display = ('product', 'ingredient', 'quantity')
    search_fields = ('product__name', 'ingredient__name')
    autocomplete_fields = ('product', 'ingredient')


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 1
    autocomplete_fields = ('ingredient',)


@admin.register(Purchase)
class PurchaseAdmin(SimpleHistoryAdmin):
    list_display = ('id', 'supplier', 'total_cost', 'created_by', 'created_at')
    list_filter = ('supplier', 'created_at')
    inlines = [PurchaseItemInline]


@admin.register(StockMovement)
class StockMovementAdmin(SimpleHistoryAdmin):
    list_display = ('id', 'ingredient', 'movement_type', 'quantity', 'order', 'purchase', 'created_by', 'created_at')
    list_filter = ('movement_type', 'created_at')
    search_fields = ('ingredient__name',)


@admin.register(RestaurantConfig)
class RestaurantConfigAdmin(SimpleHistoryAdmin):
    list_display = ('id', 'latitude', 'longitude', 'attendance_radius', 'updated_at')


@admin.register(Attendance)
class AttendanceAdmin(SimpleHistoryAdmin):
    list_display = ('user', 'check_in', 'check_out', 'check_in_latitude', 'check_in_longitude', 'created_at')
    list_filter = ('check_in', 'user')
    search_fields = ('user__username', 'user__first_name', 'user__last_name')


@admin.register(Printer)
class PrinterAdmin(SimpleHistoryAdmin):
    list_display = ('name', 'ip_address', 'port', 'chars_per_line', 'is_active')
    list_filter = ('is_active',)


@admin.register(PrintJob)
class PrintJobAdmin(SimpleHistoryAdmin):
    list_display = ('id', 'printer', 'order', 'status', 'created_at')
    list_filter = ('status', 'printer', 'created_at')


