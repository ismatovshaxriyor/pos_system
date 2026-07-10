from rest_framework import permissions


class IsAdminStaff(permissions.BasePermission):
    """Faqat is_staff=True (restoran admini)."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsManagerOrAdmin(permissions.BasePermission):
    """O'qish - har qanday autentifikatsiyalangan xodim; yozish - menejer yoki admin."""
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.is_staff or user.role == 'manager'
