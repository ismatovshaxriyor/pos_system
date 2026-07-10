from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, permissions, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from . import services
from .models import User, Table, Category, Product, Order, OrderItem, StaffDevice, Notification
from .permissions import IsAdminStaff, IsManagerOrAdmin
from .realtime import broadcast_event
from .serializers import (
    UserSerializer, TableSerializer, CategorySerializer,
    ProductSerializer, OrderSerializer, OrderItemSerializer,
    StaffDeviceSerializer, NotificationSerializer,
)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        return [IsAdminStaff()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='generate-registration-code')
    def generate_registration_code(self, request, pk=None):
        user = self.get_object()
        try:
            registration = services.generate_registration_code(user, created_by=request.user)
        except services.ServiceError as exc:
            return Response({'detail': exc.message}, status=exc.status)
        return Response({
            'code': registration.code,
            'expires_at': registration.expires_at,
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)

class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    serializer_class = TableSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    def perform_update(self, serializer):
        old_price = serializer.instance.price
        product = serializer.save()
        if product.price != old_price and not self.request.user.is_staff:
            message = (
                f"Narx o'zgartirildi: {product.name} {old_price} -> {product.price} "
                f"({self.request.user.username})"
            )
            Notification.objects.create(
                recipient=None, notif_type='price_changed', message=message,
                payload={
                    'product_id': product.id, 'old_price': str(old_price),
                    'new_price': str(product.price), 'changed_by': self.request.user.id,
                },
            )
            broadcast_event('price_changed', {'product_id': product.id, 'message': message})

class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Order.objects.select_related('table', 'waiter', 'cashier').prefetch_related('items__product')
        user = self.request.user
        if user.role == 'waiter' and not user.is_staff:
            qs = qs.filter(waiter=user)
        return qs

    def perform_create(self, serializer):
        order = serializer.save(waiter=self.request.user)
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        order = self.get_object()
        if order.status == 'completed':
            return Response({'detail': 'Order already completed'}, status=status.HTTP_400_BAD_REQUEST)

        order.status = 'completed'
        order.cashier = request.user
        order.save()

        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

        return Response({'status': 'Order closed successfully'})

    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        order = self.get_object()
        serializer = OrderItemSerializer(data=request.data)
        if serializer.is_valid():
            product = serializer.validated_data['product']
            quantity = serializer.validated_data.get('quantity', 1)
            price = product.price

            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                price=price
            )

            # Update total amount
            order.total_amount += price * quantity
            order.save()

            return Response({'status': 'Item added'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class OrderItemViewSet(viewsets.ModelViewSet):
    queryset = OrderItem.objects.all()
    serializer_class = OrderItemSerializer
    permission_classes = [permissions.IsAuthenticated]

class StaffDeviceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StaffDevice.objects.select_related('user').all()
    serializer_class = StaffDeviceSerializer
    permission_classes = [IsAdminStaff]

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        device = self.get_object()
        services.revoke_device(device, kicked_by=request.user)
        return Response({'detail': "Qurilma chetlashtirildi."})

class NotificationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Q(recipient=user)
        if user.is_staff:
            qs |= Q(recipient__isnull=True)
        return Notification.objects.filter(qs).order_by('-created_at')

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=['is_read', 'read_at'])
        return Response({'status': 'ok'})
