from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import ErrorLog, LicenseState


@admin.register(LicenseState)
class LicenseStateAdmin(SimpleHistoryAdmin):
    list_display = (
        'restaurant_name', 'is_blocked', 'blocked_reason',
        'token_expires_at', 'last_renewed_at', 'activated_at',
    )
    readonly_fields = [f.name for f in LicenseState._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ErrorLog)
class ErrorLogAdmin(SimpleHistoryAdmin):
    list_display = ('level', 'occurred_at', 'logger_name', 'is_reported', 'reported_at')
    list_filter = ('level', 'is_reported')
    search_fields = ('message', 'logger_name', 'traceback')
    readonly_fields = [f.name for f in ErrorLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
