from django.contrib import admin
from django.utils.html import format_html
from .models import Restaurant, License, RestaurantStatus, RemoteCommand


class RestaurantStatusInline(admin.StackedInline):
    model = RestaurantStatus
    can_delete = False
    readonly_fields = (
        'cpu_percent', 'ram_percent', 'disk_percent',
        'app_version', 'unsynced_count', 'last_order_at', 'updated_at',
    )


def _enqueue_command(modeladmin, request, queryset, command_type, success_message):
    count = 0
    for restaurant in queryset:
        RemoteCommand.objects.create(restaurant=restaurant, command_type=command_type)
        count += 1
    modeladmin.message_user(request, f"{count} ta restoranga '{success_message}' buyrug'i navbatga qo'yildi.")


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'online_badge', 'contact_info', 'is_active',
        'app_version_display', 'desired_version', 'last_seen', 'created_at',
    )
    list_filter = ('is_active', 'is_online')
    search_fields = ('name', 'address', 'contact_info')
    readonly_fields = ('is_online',)
    inlines = [RestaurantStatusInline]
    actions = [
        'action_block_system', 'action_unblock_system',
        'action_force_license_renew', 'action_update_app',
    ]

    @admin.display(description="Holat", ordering='is_online')
    def online_badge(self, obj):
        if obj.is_online:
            return format_html(
                '<span style="color:#fff;background:#22883f;padding:2px 8px;'
                'border-radius:8px;font-size:11px">Onlayn</span>'
            )
        return format_html(
            '<span style="color:#fff;background:#b3261e;padding:2px 8px;'
            'border-radius:8px;font-size:11px">Oflayn</span>'
        )

    @admin.display(description="Versiya")
    def app_version_display(self, obj):
        try:
            status_row = obj.status
        except RestaurantStatus.DoesNotExist:
            return "-"
        version = status_row.app_version or "-"
        if obj.desired_version and status_row.app_version == obj.desired_version:
            return format_html('<span style="color:#22883f">{} ✓</span>', version)
        return version

    @admin.action(description="Tizimni bloklash")
    def action_block_system(self, request, queryset):
        _enqueue_command(self, request, queryset, 'block_system', "Tizimni bloklash")

    @admin.action(description="Blokdan chiqarish")
    def action_unblock_system(self, request, queryset):
        _enqueue_command(self, request, queryset, 'unblock_system', "Blokdan chiqarish")

    @admin.action(description="Litsenziyani yangilashga majburlash")
    def action_force_license_renew(self, request, queryset):
        _enqueue_command(self, request, queryset, 'force_license_renew', "Litsenziyani yangilash")

    @admin.action(description="Yangilanishni yuborish (desired_version bo'yicha)")
    def action_update_app(self, request, queryset):
        count = 0
        for restaurant in queryset:
            if not restaurant.desired_version:
                continue
            RemoteCommand.objects.create(
                restaurant=restaurant,
                command_type='update_app',
                payload={"version": restaurant.desired_version},
            )
            count += 1
        self.message_user(
            request,
            f"{count} ta restoranga yangilanish yuborildi "
            "(desired_version maydoni bo'sh bo'lganlar o'tkazib yuborildi).",
        )


@admin.register(License)
class LicenseAdmin(admin.ModelAdmin):
    list_display = ('restaurant', 'key', 'hardware_hash', 'expires_at', 'is_active', 'created_at')
    list_filter = ('is_active', 'expires_at')
    search_fields = ('restaurant__name', 'key')
    readonly_fields = ('key', 'hardware_hash')
    actions = ['reset_hardware_hash']

    @admin.action(description="Qurilma bog'lanishini tozalash (kompyuter almashtirilganda)")
    def reset_hardware_hash(self, request, queryset):
        updated = queryset.update(hardware_hash='')
        self.message_user(
            request,
            f"{updated} ta litsenziya uchun qurilma bog'lanishi tozalandi. "
            "Keyingi faollashtirish yangi qurilmani bog'laydi.",
        )


@admin.register(RemoteCommand)
class RemoteCommandAdmin(admin.ModelAdmin):
    list_display = ('restaurant', 'command_type', 'status_badge', 'created_at', 'completed_at')
    list_filter = ('command_type', 'status')
    search_fields = ('restaurant__name',)
    readonly_fields = ('id', 'restaurant', 'command_type', 'payload', 'result', 'created_at', 'sent_at', 'completed_at')
    actions = ['requeue_commands']

    STATUS_COLORS = {
        'pending': '#6b7280',
        'sent': '#2563eb',
        'acknowledged': '#7c3aed',
        'completed': '#22883f',
        'failed': '#b3261e',
    }

    @admin.display(description="Holat")
    def status_badge(self, obj):
        color = self.STATUS_COLORS.get(obj.status, '#6b7280')
        return format_html(
            '<span style="color:#fff;background:{};padding:2px 8px;'
            'border-radius:8px;font-size:11px">{}</span>',
            color, obj.get_status_display(),
        )

    @admin.action(description="Qayta navbatga qo'yish (stuck 'sent' buyruqlar uchun)")
    def requeue_commands(self, request, queryset):
        updated = queryset.exclude(status='completed').update(status='pending', sent_at=None)
        self.message_user(request, f"{updated} ta buyruq qayta navbatga qo'yildi.")

    def has_add_permission(self, request):
        return False
