from django.contrib import admin

from .models import LicenseState


@admin.register(LicenseState)
class LicenseStateAdmin(admin.ModelAdmin):
    list_display = (
        'restaurant_name', 'is_blocked', 'blocked_reason',
        'token_expires_at', 'last_renewed_at', 'activated_at',
    )
    readonly_fields = [f.name for f in LicenseState._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
