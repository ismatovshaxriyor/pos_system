from django.db.models import Prefetch
from rest_framework import permissions, viewsets

from .models import OrderTemplate, OrderTemplateItem
from .permissions import IsManagerOrAdmin
from .serializers import OrderTemplateSerializer


def templates_queryset(active_only=False):
    """Shablonlar + taomlari; menyudan o'chirilgan (soft-delete) mahsulotlar qatori chiqarilmaydi."""
    items = OrderTemplateItem.objects.filter(product__is_deleted=False).select_related('product')
    qs = OrderTemplate.objects.prefetch_related(Prefetch('items', queryset=items))
    return qs.filter(is_active=True) if active_only else qs


class OrderTemplateViewSet(viewsets.ModelViewSet):
    """
    Buyurtma shablonlari. O'qish - har qanday xodim (afitsiant ham: ilova bootstrap'dan oladi), yozish -
    menejer. Shablon buyurtma yaratmaydi: faqat ilovadagi (tasdiqlanmagan) savatni to'ldiradi.
    """
    queryset = OrderTemplate.objects.all()
    serializer_class = OrderTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    def get_queryset(self):
        return templates_queryset()
