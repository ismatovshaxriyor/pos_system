import base64
import io

import qrcode
from django import forms
from django.contrib import admin, messages
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.html import format_html
from .models import Restaurant, License, RestaurantStatus, RemoteCommand, RestaurantAdminAccount, ErrorLog
from sync.jwt_utils import issue_license_token


class RestaurantStatusInline(admin.StackedInline):
    model = RestaurantStatus
    can_delete = False
    readonly_fields = (
        'cpu_percent', 'ram_percent', 'disk_percent',
        'app_version', 'unsynced_count', 'last_order_at', 'updated_at',
    )


class RestaurantAdminAccountForm(forms.ModelForm):
    password = forms.CharField(
        widget=forms.PasswordInput, required=False,
        help_text="Bo'sh qoldirilsa mavjud parol o'zgarmaydi. Faollashtirish "
                   "paytida shu parolning XESHI Bolaga ko'chiriladi - ochiq "
                   "parol hech qachon tarmoq orqali yuborilmaydi.",
    )

    class Meta:
        model = RestaurantAdminAccount
        fields = ('restaurant', 'phone', 'full_name', 'password')

    def clean(self):
        cleaned_data = super().clean()
        if not cleaned_data.get('password') and not self.instance.pk:
            raise forms.ValidationError("Yangi admin uchun parol kiritish shart.")
        return cleaned_data

    def save(self, commit=True):
        instance = super().save(commit=False)
        raw_password = self.cleaned_data.get('password')
        if raw_password:
            instance.set_password(raw_password)
        if commit:
            instance.save()
        return instance


class RestaurantAdminAccountInline(admin.StackedInline):
    """
    Restoran yaratilganda bosh menejer hisobi ham majburiy kiritiladi
    (min_num=1 + validate_min) - adminsiz restoran qoldirilmasin, aks holda
    Bola faollashtirilganda hech kim tizimga kira olmay qoladi.
    """
    model = RestaurantAdminAccount
    form = RestaurantAdminAccountForm
    can_delete = False
    extra = 1
    min_num = 1
    validate_min = True
    max_num = 1
    fields = ('phone', 'full_name', 'password')


def _enqueue_command(modeladmin, request, queryset, command_type, success_message):
    count = 0
    for restaurant in queryset:
        RemoteCommand.objects.create(restaurant=restaurant, command_type=command_type)
        count += 1
    modeladmin.message_user(request, f"{count} ta restoranga '{success_message}' buyrug'i navbatga qo'yildi.")


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'online_badge', 'admin_display', 'contact_info', 'is_active',
        'app_version_display', 'desired_version', 'last_seen', 'created_at',
        'unresolved_errors_badge',
    )
    list_filter = ('is_active', 'is_online')
    search_fields = ('name', 'address', 'contact_info')
    readonly_fields = ('is_online',)
    inlines = [RestaurantAdminAccountInline, RestaurantStatusInline]
    actions = [
        'action_block_system', 'action_unblock_system',
        'action_force_license_renew', 'action_update_app',
    ]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(
            unresolved_error_count=Count('error_logs', filter=Q(error_logs__is_resolved=False)),
        )

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

    @admin.display(description="Admin")
    def admin_display(self, obj):
        try:
            account = obj.admin_account
        except RestaurantAdminAccount.DoesNotExist:
            return "-"
        return account.full_name or account.phone

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

    @admin.display(description="Xatolar", ordering='unresolved_error_count')
    def unresolved_errors_badge(self, obj):
        count = obj.unresolved_error_count
        if not count:
            return format_html('<span style="color:#22883f">0</span>')
        return format_html(
            '<span style="color:#fff;background:#b3261e;padding:2px 8px;'
            'border-radius:8px;font-size:11px">{}</span>', count,
        )

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


@admin.register(RestaurantAdminAccount)
class RestaurantAdminAccountAdmin(admin.ModelAdmin):
    form = RestaurantAdminAccountForm
    list_display = ('restaurant', 'phone', 'full_name', 'created_at')
    search_fields = ('restaurant__name', 'phone', 'full_name')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(License)
class LicenseAdmin(admin.ModelAdmin):
    list_display = ('restaurant', 'key', 'hardware_hash', 'expires_at', 'is_active', 'created_at')
    list_filter = ('is_active', 'expires_at')
    search_fields = ('restaurant__name', 'key')
    readonly_fields = ('key', 'hardware_hash', 'qr_code')
    actions = ['reset_hardware_hash', 'generate_offline_token']

    @admin.display(description="QR kod")
    def qr_code(self, obj):
        """
        Restoranni ro'yxatdan o'tkazayotgan operator shu QR'ni ekranda
        ko'rsatib/chop etib qo'yadi - restoran admini uni mobil ilovadagi
        "QR kodni skanerlash" bilan o'qib, kalitni qo'lda kiritmasdan
        faollashtiradi. Faqat xom kalit matni kodlanadi (server manzili
        emas) - mobil ilova qaysi Bola bilan gaplashishini allaqachon
        boshqa yo'l bilan biladi.

        PNG (SVG emas) - Telegram/WhatsApp kabi messenjerlar rasm
        preview'ini PNG/JPEG uchun ko'rsatadi, SVG'ni ko'pincha
        ko'rsatmaydi yoki fayl sifatida yuklaydi - operator shu linkni
        to'g'ridan-to'g'ri restoran admini bilan ulashishi kerak bo'lgani
        uchun bu farq muhim. data: URI - alohida admin view/URL kerak
        emas, shu bilan birga hech qanday autentifikatsiyasiz endpoint
        ham qo'shilmaydi (list/tafsilot sahifasi baribir faqat admin
        loginidan keyin ko'rinadi).
        """
        if not obj.key:
            return '-'
        img = qrcode.make(obj.key, box_size=8)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        data_uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
        return format_html(
            '<div style="width:220px">'
            '<img src="{0}" alt="QR" style="width:100%">'
            '<div style="margin-top:6px"><a href="{0}" download="litsenziya-{1}.png">QR kodni yuklab olish (ulashish uchun)</a></div>'
            '</div>',
            data_uri, obj.key,
        )

    @admin.action(description="Qurilma bog'lanishini tozalash (kompyuter almashtirilganda)")
    def reset_hardware_hash(self, request, queryset):
        updated = queryset.update(hardware_hash='')
        self.message_user(
            request,
            f"{updated} ta litsenziya uchun qurilma bog'lanishi tozalandi. "
            "Keyingi faollashtirish yangi qurilmani bog'laydi.",
        )

    @admin.action(description="Oflayn yangilash kodi yaratish (internet yo'q paytda qo'lda kiritish uchun)")
    def generate_offline_token(self, request, queryset):
        """
        Restoranda internet uzilgan paytda ham litsenziyani yangilash uchun:
        shu yerda generatsiya qilingan tokenni istalgan tashqi kanal orqali
        (Telegram, SMS, telefon orqali diktovka emas - nusxalab yuborish
        ma'qul, token uzun) restoranga yuboring. Ular buni Bola'dagi
        `/api/license/apply-offline-token/` ga kiritishlari bilan tizim
        internetga hech qanday so'rov yubormasdan yana ishlay boshlaydi -
        chunki token butunlay oflayn (faqat public key bilan) tekshiriladi.
        """
        for license_obj in queryset:
            if not license_obj.hardware_hash:
                self.message_user(
                    request,
                    f"{license_obj.restaurant.name}: qurilma hali bog'lanmagan - "
                    "birinchi faollashtirish oddiy litsenziya kaliti orqali "
                    "amalga oshirilishi kerak (oflayn kod faqat YANGILASH uchun).",
                    level=messages.WARNING,
                )
                continue

            if not license_obj.is_active or license_obj.expires_at < timezone.now():
                self.message_user(
                    request,
                    f"{license_obj.restaurant.name}: litsenziya nofaol yoki muddati "
                    "tugagan - avval uni faollashtiring/muddatini uzaytiring.",
                    level=messages.ERROR,
                )
                continue

            token, expires_at = issue_license_token(license_obj)
            self.message_user(
                request,
                f"{license_obj.restaurant.name} uchun oflayn kod "
                f"({expires_at:%Y-%m-%d %H:%M} gacha amal qiladi):\n{token}",
                level=messages.SUCCESS,
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


@admin.register(ErrorLog)
class ErrorLogAdmin(admin.ModelAdmin):
    list_display = ('restaurant', 'level_badge', 'message_preview', 'occurred_at', 'received_at', 'resolved_badge')
    list_filter = ('level', 'is_resolved', 'restaurant')
    search_fields = ('restaurant__name', 'message', 'logger_name', 'traceback')
    date_hierarchy = 'received_at'
    readonly_fields = (
        'id', 'restaurant', 'level', 'logger_name', 'message', 'traceback',
        'module', 'func_name', 'line_no', 'occurred_at', 'received_at',
    )
    fields = readonly_fields + ('is_resolved', 'resolved_at', 'resolved_by', 'resolution_note')
    actions = ['mark_resolved', 'mark_unresolved']

    LEVEL_COLORS = {'ERROR': '#b3261e', 'CRITICAL': '#7c1d1d'}

    @admin.display(description="Daraja")
    def level_badge(self, obj):
        color = self.LEVEL_COLORS.get(obj.level, '#6b7280')
        return format_html(
            '<span style="color:#fff;background:{};padding:2px 8px;'
            'border-radius:8px;font-size:11px">{}</span>',
            color, obj.level,
        )

    @admin.display(description="Xabar")
    def message_preview(self, obj):
        return (obj.message[:80] + '…') if len(obj.message) > 80 else obj.message

    @admin.display(description="Holat")
    def resolved_badge(self, obj):
        if obj.is_resolved:
            return format_html(
                '<span style="color:#fff;background:#22883f;padding:2px 8px;'
                'border-radius:8px;font-size:11px">Hal qilindi</span>'
            )
        return format_html(
            '<span style="color:#fff;background:#b3261e;padding:2px 8px;'
            'border-radius:8px;font-size:11px">Ochiq</span>'
        )

    @admin.action(description="Hal qilindi deb belgilash")
    def mark_resolved(self, request, queryset):
        updated = queryset.filter(is_resolved=False).update(
            is_resolved=True, resolved_at=timezone.now(), resolved_by=request.user,
        )
        self.message_user(request, f"{updated} ta xato hal qilindi deb belgilandi.")

    @admin.action(description="Qayta ochish")
    def mark_unresolved(self, request, queryset):
        updated = queryset.update(is_resolved=False, resolved_at=None, resolved_by=None)
        self.message_user(request, f"{updated} ta xato qayta ochildi.")

    def has_add_permission(self, request):
        return False
