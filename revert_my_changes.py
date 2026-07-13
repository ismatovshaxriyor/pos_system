import re

# 1. core/models.py
with open('local_server/core/models.py', 'r') as f:
    content = f.read()
original_models = """    @property
    def total_amount(self):
        # Python darajasida filtrlash ataylab - .filter(is_voided=False)
        # prefetch keshini chetlab har order uchun yangi so'rov yuborar edi
        # (ro'yxat endpointida N+1).
        return sum(
            (item.price * item.quantity for item in self.items.all() if not item.is_voided),
            Decimal('0'),
        )

    @property
    def final_amount(self):
        return max(self.total_amount - self.discount_amount + self.tax_amount + self.service_charge, Decimal('0'))

    @property
    def amount_paid(self):
        \"\"\"
        Har doim jonli DB agregatsiyasi - bir nechta kassa terminali bir
        vaqtda shu order'ga to'lov qo'shishi mumkin, keshlangan/prefetch
        qilingan qiymat overpayment tekshiruvini chetlab o'tishiga olib
        kelishi mumkin.
        \"\"\"
        return self.payments.filter(is_voided=False).aggregate(total=models.Sum('amount'))['total'] or Decimal('0')

    @property
    def balance_due(self):
        return max(self.final_amount - self.amount_paid, Decimal('0'))"""
content = re.sub(
    r'    @property\n    def total_amount\(self\):.*?def balance_due\(self\):.*?return balance',
    original_models,
    content,
    flags=re.DOTALL
)
with open('local_server/core/models.py', 'w') as f:
    f.write(content)


# 2. core/views.py
with open('local_server/core/views.py', 'r') as f:
    content = f.read()
content = content.replace(
    '_, _, balance_due = services.calculate_order_financials(order)',
    'balance_due = order.balance_due'
)
content = content.replace(
    'new_amount > services.calculate_order_financials(order)[0]',
    'new_amount > order.total_amount'
)
content = content.replace(
    '{services.calculate_order_financials(order)[0]}',
    '{order.total_amount}'
)
with open('local_server/core/views.py', 'w') as f:
    f.write(content)


# 3. core/services.py
with open('local_server/core/services.py', 'r') as f:
    content = f.read()
# Cut everything from # ============================================================================== to the end
idx = content.find('# ==============================================================================')
if idx != -1:
    content = content[:idx]
with open('local_server/core/services.py', 'w') as f:
    f.write(content.strip() + '\n')


# 4. core/tests/test_orders.py, test_payments.py, test_order_sync.py
test_files = [
    'local_server/core/tests/test_orders.py',
    'local_server/core/tests/test_payments.py',
    'local_server/licensing/tests/test_order_sync.py'
]
for path in test_files:
    with open(path, 'r') as f:
        content = f.read()
    content = re.sub(
        r'\n        import unittest.mock as mock\n        self.multiplier_patcher = mock.patch\("core.services._decode_multiplier", return_value=1.0\)\n        self.multiplier_patcher.start\(\)\n',
        '',
        content
    )
    content = re.sub(
        r'\n        self.multiplier_patcher.stop\(\)\n',
        '',
        content
    )
    with open(path, 'w') as f:
        f.write(content)


# 5. core/tests/test_consumers.py
with open('local_server/core/tests/test_consumers.py', 'r') as f:
    content = f.read()
orig_setup = """    def setUp(self):
        self.user = User.objects.create_user(username='+998900000100', role='waiter')
        self.token = Token.objects.create(user=self.user)"""
content = re.sub(
    r'    def setUp\(self\):.*?self\.token = Token\.objects\.create\(user=self\.user\)',
    orig_setup,
    content,
    flags=re.DOTALL
)
content = re.sub(
    r'    def tearDown\(self\):.*?super\(\)\.tearDown\(\)\n',
    '',
    content,
    flags=re.DOTALL
)
with open('local_server/core/tests/test_consumers.py', 'w') as f:
    f.write(content)


# 6. Dockerfile
with open('local_server/Dockerfile', 'r') as f:
    content = f.read()
content = content.replace(' core/services.py core/views.py ', ' ')
with open('local_server/Dockerfile', 'w') as f:
    f.write(content)


# 7. licensing/setup.py
with open('local_server/licensing/setup.py', 'r') as f:
    content = f.read()
content = content.replace('    "core/services.py",\n', '')
content = content.replace('    "core/views.py",\n', '')
with open('local_server/licensing/setup.py', 'w') as f:
    f.write(content)

