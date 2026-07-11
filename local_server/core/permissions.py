from rest_framework import permissions


class IsAdminStaff(permissions.BasePermission):
    """
    Faqat menejer (`role == 'manager'`) - is_staff'ga emas, rolega bog'liq.
    Alohida "admin" roli yo'q: restoran birinchi faollashtirilganda Ona'dan
    kelgan bosh hisob ham, keyinchalik PIN bilan qo'shilgan boshqa
    menejerlar ham to'liq bir xil huquqqa ega.
    """
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == 'manager')


class IsManagerOrAdmin(permissions.BasePermission):
    """O'qish - har qanday autentifikatsiyalangan xodim; yozish - menejer yoki admin."""
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.is_staff or user.role == 'manager'
