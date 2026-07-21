"""
Ombor (inventory) API: ta'minotchi, ingredient (zaxira), retsept, kirim (xarid),
ombor harakati ledger. Yozish amallari menejer-gated (IsManagerOrAdmin) - o'qish
har autentifikatsiyalangan xodimga ochiq.

Sotuvda zaxira kamayishi bu yerda EMAS - u `services.send_order_to_kitchen`
ichida avtomatik bo'ladi (taom oshxonaga yuborilganda). Bu yerda faqat qo'lda
boshqaruv: kirim, inventarizatsiya (adjust), retsept.
"""
from django.db import transaction
from django.db.models import F
from drf_spectacular.utils import extend_schema, OpenApiParameter
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .models import Supplier, Ingredient, ProductIngredient, Purchase, StockMovement
from .permissions import IsManagerOrAdmin
from .serializers import (
    SupplierSerializer, IngredientSerializer, RecipeItemSerializer,
    PurchaseSerializer, StockMovementSerializer, StockAdjustSerializer,
)


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]


class IngredientViewSet(viewsets.ModelViewSet):
    queryset = Ingredient.objects.all()
    serializer_class = IngredientSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    @extend_schema(parameters=[
        OpenApiParameter('low_stock', bool, description="true - faqat past-zaxira (current_stock < min_stock)"),
    ])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = Ingredient.objects.select_related('supplier').all()
        if self.request.query_params.get('low_stock') == 'true':
            qs = qs.filter(current_stock__lt=F('min_stock'))
        return qs.order_by('name')

    @extend_schema(request=StockAdjustSerializer, responses={200: IngredientSerializer})
    @action(detail=True, methods=['post'])
    def adjust(self, request, pk=None):
        """
        Inventarizatsiya/qo'lda tuzatish: `new_quantity` (absolyut) yoki `delta`
        (nisbiy) bilan zaxirani o'zgartiradi, `StockMovement(adjustment)` yozadi.
        Menejer-gated (zaxira o'zgarishi nozik amal).
        """
        ingredient = self.get_object()
        serializer = StockAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ingredient = services.adjust_stock(
            ingredient,
            new_quantity=serializer.validated_data.get('new_quantity'),
            delta=serializer.validated_data.get('delta'),
            note=serializer.validated_data.get('note', ''),
            created_by=request.user,
        )
        return Response(IngredientSerializer(ingredient).data)


class RecipeItemViewSet(viewsets.ModelViewSet):
    """
    Retsept qatorlari (ProductIngredient). `?product=<id>` bilan bitta mahsulot
    retseptini olish/tahrirlash. Har qator alohida create/update/delete qilinadi.
    """
    queryset = ProductIngredient.objects.all()
    serializer_class = RecipeItemSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    @extend_schema(parameters=[
        OpenApiParameter('product', int, description="Mahsulot id'si bo'yicha filter"),
    ])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = ProductIngredient.objects.select_related('ingredient', 'product').all()
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs.order_by('id')


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.all()
    serializer_class = PurchaseSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    def get_queryset(self):
        return Purchase.objects.select_related('supplier').prefetch_related('items__ingredient').order_by('-created_at')

    def perform_create(self, serializer):
        # Hujjat + zaxira qo'llanishi atomik: purchase yaratiladi va darhol
        # StockMovement(kirim) + current_stock/cost_price yangilanadi.
        with transaction.atomic():
            purchase = serializer.save(created_by=self.request.user)
            services.apply_purchase(purchase, created_by=self.request.user)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """Ombor harakati ledger (faqat o'qish). `?ingredient=<id>` / `?movement_type=`."""
    queryset = StockMovement.objects.all()
    serializer_class = StockMovementSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    @extend_schema(parameters=[
        OpenApiParameter('ingredient', int, description="Ingredient id'si bo'yicha filter"),
        OpenApiParameter('movement_type', str, description="purchase/sale/adjustment/waste"),
    ])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = StockMovement.objects.select_related('ingredient', 'created_by').all()
        ingredient_id = self.request.query_params.get('ingredient')
        if ingredient_id:
            qs = qs.filter(ingredient_id=ingredient_id)
        mtype = self.request.query_params.get('movement_type')
        if mtype:
            qs = qs.filter(movement_type=mtype)
        return qs.order_by('-created_at')
