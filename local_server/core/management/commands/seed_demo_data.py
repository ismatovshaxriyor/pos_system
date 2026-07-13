import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import (
    Attendance,
    Category,
    Notification,
    Order,
    OrderItem,
    Payment,
    Printer,
    Product,
    RestaurantConfig,
    StaffDevice,
    Table,
    TableZone,
    User,
)
from core.services import send_order_to_kitchen

DEMO_PASSWORD = 'Parol12345!'


class Command(BaseCommand):
    help = "Bola (local_server) bazasini demo uchun real ko'rinishdagi ma'lumotlar bilan to'ldiradi."

    def add_arguments(self, parser):
        parser.add_argument(
            '--days', type=int, default=7,
            help="Nechta kunlik buyurtma tarixi generatsiya qilinsin (standart: 7).",
        )

    def handle(self, *args, **options):
        with transaction.atomic():
            zones, tables = self._create_zones_and_tables()
            printers = self._create_printers()
            categories = self._create_categories(printers)
            products = self._create_products(categories)
            managers, cashiers, waiters = self._create_staff()
            self._create_restaurant_config()
            self._create_attendance(waiters + cashiers, options['days'])
            orders = self._create_orders(
                tables, waiters, cashiers, products, options['days'],
            )
            self._create_notifications(managers, orders)

        self.stdout.write(self.style.SUCCESS(
            f"Tayyor: {TableZone.objects.count()} hudud, {Table.objects.count()} stol, "
            f"{Printer.objects.count()} printer, {Category.objects.count()} kategoriya, "
            f"{Product.objects.count()} mahsulot, {User.objects.count()} xodim, "
            f"{StaffDevice.objects.count()} qurilma, {Order.objects.count()} buyurtma, "
            f"{OrderItem.objects.count()} buyurtma qatori, {Payment.objects.count()} to'lov, "
            f"{Attendance.objects.count()} davomat yozuvi, "
            f"{Notification.objects.count()} bildirishnoma."
        ))
        self.stdout.write(self.style.WARNING(
            f"Barcha xodimlarning paroli: {DEMO_PASSWORD} (faqat is_staff/manager telefon+parol kirishi uchun). "
            "Kassir/afitsiantlar PIN orqali kiradi - pastdagi ro'yxatga qarang."
        ))

    # ------------------------------------------------------------------
    # Stollar
    # ------------------------------------------------------------------
    def _create_zones_and_tables(self):
        zone_defs = [
            ("Zal", 8, 4),
            ("Ko'cha", 6, 4),
            ("VIP xona", 4, 8),
        ]
        zones = {}
        tables = []
        for name, count, capacity in zone_defs:
            zone, _ = TableZone.objects.update_or_create(name=name)
            zones[name] = zone
            prefix = {"Zal": "Z", "Ko'cha": "K", "VIP xona": "V"}[name]
            for i in range(1, count + 1):
                table, _ = Table.objects.update_or_create(
                    zone=zone, name=f"{prefix}{i}",
                    defaults={'capacity': capacity, 'is_active': True},
                )
                tables.append(table)
        return zones, tables

    # ------------------------------------------------------------------
    # Printerlar va kategoriyalar
    # ------------------------------------------------------------------
    def _create_printers(self):
        names = ["Oshxona printeri", "Shashlik sexi printeri", "Bar printeri"]
        return {name: Printer.objects.update_or_create(name=name, defaults={'is_active': True})[0] for name in names}

    def _create_categories(self, printers):
        defs = [
            ("Milliy taomlar", printers["Oshxona printeri"]),
            ("Birinchi taomlar", printers["Oshxona printeri"]),
            ("Shashliklar", printers["Shashlik sexi printeri"]),
            ("Salatlar", printers["Oshxona printeri"]),
            ("Fast-food", printers["Oshxona printeri"]),
            ("Ichimliklar", printers["Bar printeri"]),
            ("Alkogolli ichimliklar", printers["Bar printeri"]),
            ("Shirinliklar", None),
        ]
        categories = {}
        for name, printer in defs:
            cat, _ = Category.objects.update_or_create(name=name, defaults={'printer': printer})
            categories[name] = cat
        return categories

    # ------------------------------------------------------------------
    # Mahsulotlar
    # ------------------------------------------------------------------
    def _create_products(self, categories):
        catalog = {
            "Milliy taomlar": [
                ("Osh (Palov)", 35000), ("Lag'mon", 28000), ("Manti (5 dona)", 30000),
                ("Norin", 32000), ("Chuchvara", 25000), ("Dimlama", 40000),
                ("Qozon kabob", 45000), ("Tandir go'sht", 42000),
            ],
            "Birinchi taomlar": [
                ("Mastava", 18000), ("Sho'rva", 22000), ("Moshxo'rda", 20000), ("Xonim", 22000),
            ],
            "Shashliklar": [
                ("Qo'y go'sht shashlik", 25000), ("Mol go'sht shashlik", 22000),
                ("Tovuq shashlik", 18000), ("Jigar shashlik", 15000), ("Lyulya kabob", 20000),
            ],
            "Salatlar": [
                ("Achichuk salat", 12000), ("Fresh salat", 15000),
                ("Sezar salat", 25000), ("Vinegret", 14000),
            ],
            "Fast-food": [
                ("Somsa (go'shtli)", 8000), ("Hot-dog", 15000), ("Burger", 25000),
                ("Lavash", 20000), ("Pitsa Margarita", 45000),
            ],
            "Ichimliklar": [
                ("Coca-Cola 0.5L", 8000), ("Fanta 0.5L", 8000), ("Sprite 0.5L", 8000),
                ("Mineral suv", 5000), ("Choy (choynak)", 5000), ("Qora qahva", 12000),
                ("Kapuchino", 18000), ("Fresh apelsin sharbati", 20000), ("Kompot", 8000),
            ],
            "Alkogolli ichimliklar": [
                ("Piva 0.5L", 15000), ("Vino (bokal)", 30000),
            ],
            "Shirinliklar": [
                ("Napoleon tort", 18000), ("Muzqaymoq", 12000),
                ("Chak-chak", 10000), ("Baklava", 15000),
            ],
        }
        products = []
        barcode_seq = 100000000
        for cat_name, items in catalog.items():
            category = categories[cat_name]
            for name, price in items:
                barcode_seq += 1
                product, _ = Product.objects.update_or_create(
                    category=category, name=name,
                    defaults={
                        'price': Decimal(price),
                        'cost_price': Decimal(price) * Decimal('0.55'),
                        'tax_rate': Decimal('12.00'),
                        'barcode': str(barcode_seq),
                        'is_available': True,
                    },
                )
                products.append(product)
        return products

    # ------------------------------------------------------------------
    # Xodimlar
    # ------------------------------------------------------------------
    def _create_staff(self):
        manager_defs = [
            ("+998901234567", "Aziz", "Karimov"),
            ("+998901234568", "Malika", "Yusupova"),
        ]
        cashier_defs = [
            ("+998901234569", "Dilnoza", "Rashidova", "111111"),
            ("+998901234570", "Sardor", "Toshpulatov", "222222"),
        ]
        waiter_defs = [
            ("+998901234571", "Jasur", "Abdullayev", "333333"),
            ("+998901234572", "Nodira", "Xolmatova", "444444"),
            ("+998901234573", "Bekzod", "Yusupov", "555555"),
            ("+998901234574", "Farangiz", "Nazarova", "666666"),
            ("+998901234575", "Otabek", "Rahimov", "777777"),
            ("+998901234576", "Madina", "Saidova", "888888"),
        ]

        managers = []
        for phone, first, last in manager_defs:
            user, _ = User.objects.update_or_create(
                username=phone,
                defaults={
                    'first_name': first, 'last_name': last, 'role': 'manager',
                    'password': make_password(DEMO_PASSWORD), 'is_active': True,
                },
            )
            managers.append(user)

        cashiers = self._create_pin_staff(cashier_defs, role='cashier')
        waiters = self._create_pin_staff(waiter_defs, role='waiter')
        return managers, cashiers, waiters

    def _create_pin_staff(self, defs, role):
        users = []
        for phone, first, last, pin in defs:
            user, _ = User.objects.update_or_create(
                username=phone,
                defaults={
                    'first_name': first, 'last_name': last, 'role': role,
                    'password': make_password(DEMO_PASSWORD),
                    'pin_hash': make_password(pin), 'is_active': True,
                },
            )
            StaffDevice.objects.update_or_create(
                user=user, device_id=f"demo-device-{phone[-4:]}",
                defaults={
                    'device_label': f"{first}ning telefoni",
                    'is_active': True, 'is_approved': True,
                    'last_login_at': timezone.now() - timedelta(hours=random.randint(1, 20)),
                },
            )
            users.append(user)
        return users

    # ------------------------------------------------------------------
    # Restoran sozlamasi (Toshkent markazi)
    # ------------------------------------------------------------------
    def _create_restaurant_config(self):
        RestaurantConfig.objects.update_or_create(
            pk=1,
            defaults={
                'latitude': Decimal('41.311081'), 'longitude': Decimal('69.240562'),
                'attendance_radius': 150,
            },
        )

    # ------------------------------------------------------------------
    # Davomat
    # ------------------------------------------------------------------
    def _create_attendance(self, staff_users, days):
        now = timezone.now()
        lat, lon = Decimal('41.311081'), Decimal('69.240562')
        for user in staff_users:
            for day_offset in range(1, days + 1):
                day = now - timedelta(days=day_offset)
                check_in_at = day.replace(hour=9, minute=random.randint(0, 30))
                check_out_at = day.replace(hour=21, minute=random.randint(0, 45))
                attendance = Attendance.objects.create(
                    user=user,
                    check_in_latitude=lat, check_in_longitude=lon,
                    check_out_latitude=lat, check_out_longitude=lon,
                    check_out=check_out_at,
                )
                Attendance.objects.filter(pk=attendance.pk).update(check_in=check_in_at)
            # Bugungi kun uchun hali check-out qilmagan ochiq smena
            if random.random() < 0.5:
                open_attendance = Attendance.objects.create(
                    user=user, check_in_latitude=lat, check_in_longitude=lon,
                )
                Attendance.objects.filter(pk=open_attendance.pk).update(
                    check_in=now.replace(hour=9, minute=15),
                )

    # ------------------------------------------------------------------
    # Buyurtmalar
    # ------------------------------------------------------------------
    def _create_orders(self, tables, waiters, cashiers, products, days):
        now = timezone.now()
        orders = []
        order_type_weights = [('dine_in', 0.75), ('takeaway', 0.15), ('delivery', 0.10)]

        for day_offset in range(days):
            day_orders = random.randint(4, 7)
            for _ in range(day_orders):
                waiter = random.choice(waiters)
                order_type = random.choices(
                    [t for t, _ in order_type_weights],
                    weights=[w for _, w in order_type_weights],
                )[0]
                table = random.choice(tables) if order_type == 'dine_in' else None
                created_at = now - timedelta(
                    days=day_offset, hours=random.randint(1, 12), minutes=random.randint(0, 59),
                )

                # Eski kunlar asosan yakunlangan, bugungi kun aralash holatda
                if day_offset == 0:
                    status = random.choices(
                        ['completed', 'in_progress', 'new', 'cancelled'],
                        weights=[0.45, 0.30, 0.15, 0.10],
                    )[0]
                else:
                    status = random.choices(['completed', 'cancelled'], weights=[0.9, 0.1])[0]

                order = Order.objects.create(
                    table=table, waiter=waiter, order_type=order_type,
                    guest_count=random.randint(1, 6),
                )
                Order.objects.filter(pk=order.pk).update(created_at=created_at, updated_at=created_at)

                if status == 'new':
                    orders.append(order)
                    continue

                # Buyurtma qatorlarini qo'shamiz
                chosen_products = random.sample(products, k=random.randint(2, 5))
                for product in chosen_products:
                    OrderItem.objects.create(
                        order=order, product=product,
                        quantity=random.randint(1, 3), price=product.price,
                        is_voided=(status != 'cancelled' and random.random() < 0.05),
                    )

                if status == 'cancelled':
                    order.status = 'cancelled'
                    order.save(update_fields=['status'])
                    orders.append(order)
                    continue

                # in_progress/completed - oshxonaga yuboramiz (mavjud xizmatdan foydalanamiz)
                order.status = 'in_progress'
                order.save(update_fields=['status'])
                send_order_to_kitchen(order)

                if table and table.zone and table.zone.name == "VIP xona":
                    order.service_charge = (order.total_amount * Decimal('0.10')).quantize(Decimal('1'))
                    order.save(update_fields=['service_charge'])

                if random.random() < 0.15:
                    order.discount_amount = (order.total_amount * Decimal('0.10')).quantize(Decimal('1'))
                    order.discount_reason = 'Doimiy mijoz chegirmasi'
                    order.save(update_fields=['discount_amount', 'discount_reason'])

                if status == 'completed':
                    cashier = random.choice(cashiers)
                    final = order.final_amount
                    if random.random() < 0.25 and final > 0:
                        # Split to'lov: naqd + karta
                        first_half = (final / 2).quantize(Decimal('1'))
                        Payment.objects.create(
                            order=order, amount=first_half, method='cash', received_by=cashier,
                        )
                        Payment.objects.create(
                            order=order, amount=final - first_half, method='card',
                            received_by=cashier, reference=f"TXN-{random.randint(100000, 999999)}",
                        )
                    elif final > 0:
                        method = random.choice(['cash', 'card'])
                        Payment.objects.create(
                            order=order, amount=final, method=method, received_by=cashier,
                            reference=f"TXN-{random.randint(100000, 999999)}" if method == 'card' else '',
                        )
                    order.status = 'completed'
                    order.cashier = cashier
                    order.save(update_fields=['status', 'cashier'])
                else:
                    # in_progress qoldiriladi - ba'zilariga qisman to'lov
                    if random.random() < 0.3:
                        cashier = random.choice(cashiers)
                        partial = (order.final_amount * Decimal('0.5')).quantize(Decimal('1'))
                        if partial > 0:
                            Payment.objects.create(
                                order=order, amount=partial, method='cash', received_by=cashier,
                            )

                orders.append(order)

        return orders

    # ------------------------------------------------------------------
    # Bildirishnomalar
    # ------------------------------------------------------------------
    def _create_notifications(self, managers, orders):
        discounted_orders = [o for o in orders if o.discount_amount > 0][:5]
        for order in discounted_orders:
            Notification.objects.create(
                recipient=None, notif_type='discount_applied',
                message=f"Buyurtma #{order.id} uchun {order.discount_amount} so'm chegirma qo'llandi.",
                payload={'order_id': order.id, 'discount_amount': str(order.discount_amount)},
            )

        if managers:
            Notification.objects.create(
                recipient=None, notif_type='device_approval_requested',
                message="Yangi qurilmadan kirish so'rovi kutilmoqda.",
                payload={'device_label': "Noma'lum qurilma"},
                is_read=False,
            )
