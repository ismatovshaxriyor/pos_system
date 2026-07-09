import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator

class BaseModel(models.Model):
    sync_uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True, unique=True)
    is_synced = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class User(AbstractUser, BaseModel):
    ROLE_CHOICES = (
        ('manager', 'Manager'),
        ('cashier', 'Cashier'),
        ('waiter', 'Waiter'),
    )
    
    phone_regex = RegexValidator(
        regex=r'^\+?(998)?\d{9}$',
        message="Telefon raqami +998xxxxxxxxx, 998xxxxxxxxx yoki xxxxxxxxx formatida bo'lishi kerak."
    )
    username = models.CharField(
        max_length=15,
        unique=True,
        validators=[phone_regex],
        verbose_name='Telefon raqam'
    )
    
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='waiter')

    def __str__(self):
        return f"{self.username} ({self.role})"

class Table(BaseModel):
    name = models.CharField(max_length=50)
    capacity = models.PositiveIntegerField(default=4)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

class Category(BaseModel):
    name = models.CharField(max_length=100)
    image = models.ImageField(upload_to='categories/', null=True, blank=True)

    def __str__(self):
        return self.name

class Product(BaseModel):
    category = models.ForeignKey(Category, related_name='products', on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    barcode = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    image = models.ImageField(upload_to='products/', null=True, blank=True)
    is_available = models.BooleanField(default=True)

    def __str__(self):
        return self.name

class Order(BaseModel):
    STATUS_CHOICES = (
        ('new', 'New'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    table = models.ForeignKey(Table, related_name='orders', on_delete=models.SET_NULL, null=True, blank=True)
    waiter = models.ForeignKey(User, related_name='orders_taken', on_delete=models.SET_NULL, null=True)
    cashier = models.ForeignKey(User, related_name='orders_cashed', on_delete=models.SET_NULL, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')

    def __str__(self):
        return f"Order #{self.id} - {self.status}"

class OrderItem(BaseModel):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name='order_items', on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)  # Price at the time of order

    def __str__(self):
        return f"{self.quantity}x {self.product.name} (Order #{self.order.id})"

