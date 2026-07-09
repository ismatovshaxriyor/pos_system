from django.contrib import admin
from .models import User, Table, Category, Product, Order, OrderItem

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'role', 'is_synced')
    list_filter = ('role', 'is_synced')

@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ('name', 'capacity', 'is_active', 'is_synced')
    list_filter = ('is_active', 'is_synced')

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_synced')

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'is_available', 'is_synced')
    list_filter = ('category', 'is_available', 'is_synced')
    search_fields = ('name', 'barcode')

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'table', 'waiter', 'total_amount', 'status', 'created_at', 'is_synced')
    list_filter = ('status', 'is_synced', 'created_at')
    inlines = [OrderItemInline]

