from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase
from core.models import User, StaffDevice, Notification
from core import services


class WaiterAuthTestCase(APITestCase):
    def setUp(self):
        # 1. Menejer yaratish
        self.manager = User.objects.create_user(
            username='+998901234567',
            password='password123',
            first_name='Manager',
            role='manager'
        )
        
        # 2. Ofitsiant yaratish
        self.waiter = User.objects.create_user(
            username='+998901112233',
            password='password123',
            first_name='Waiter Asror',
            role='waiter'
        )

    def test_waiter_first_login_approved_automatically(self):
        # Birinchi kirishda qurilma (TOFU) avtomatik tasdiqlanishi kerak
        response = self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233',
            'password': 'password123',
            'device_id': 'device-asror-1',
            'device_label': 'Asror Phone'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        
        # StaffDevice bazada faol va approved holda yaratilganligini tekshirish
        device = StaffDevice.objects.get(device_id='device-asror-1')
        self.assertTrue(device.is_active)
        self.assertTrue(device.is_approved)

    def test_waiter_second_device_login_awaits_approval(self):
        # 1. Birinchi qurilmani bog'lash
        self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233',
            'password': 'password123',
            'device_id': 'device-asror-1',
            'device_label': 'Asror Phone'
        })
        
        # 2. Ikkinchi qurilmadan kirishga urinish
        response = self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233',
            'password': 'password123',
            'device_id': 'device-asror-2',
            'device_label': 'Asror iPad'
        })
        # Menejer tasdig'i kutilayotganligi sababli 403 status qaytadi
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Menejer tasdig'i kutilmoqda", response.data['detail'])

        # StaffDevice bazada pending (is_approved=False) holda yaratilgan bo'lishi kerak
        device = StaffDevice.objects.get(device_id='device-asror-2')
        self.assertTrue(device.is_active)
        self.assertFalse(device.is_approved)

        # Manager uchun bildirishnoma yaratilgan bo'lishi shart
        notif = Notification.objects.filter(notif_type='device_approval_requested').first()
        self.assertIsNotNone(notif)
        self.assertIn('device_pk', notif.payload)

    def test_manager_approves_waiter_device(self):
        # 1. Birinchi qurilmani bog'lash
        self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233',
            'password': 'password123',
            'device_id': 'device-asror-1',
            'device_label': 'Asror Phone'
        })
        
        # 2. Ikkinchi qurilmadan urinish (pending device hosil bo'ladi)
        self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233',
            'password': 'password123',
            'device_id': 'device-asror-2',
            'device_label': 'Asror iPad'
        })
        
        pending_device = StaffDevice.objects.get(device_id='device-asror-2')
        
        # 3. Manager tomonidan tasdiqlash
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(f'/api/devices/{pending_device.pk}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # 4. Holatlarni tekshirish
        # Eski qurilma nofaol qilingan
        old_device = StaffDevice.objects.get(device_id='device-asror-1')
        self.assertFalse(old_device.is_active)
        
        # Yangi qurilma faol va tasdiqlangan
        new_device = StaffDevice.objects.get(device_id='device-asror-2')
        self.assertTrue(new_device.is_active)
        self.assertTrue(new_device.is_approved)

        # 5. Ofitsiant yangi qurilmadan endi muvaffaqiyatli kira oladi
        self.client.force_authenticate(user=None) # Unauthenticate
        response2 = self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233',
            'password': 'password123',
            'device_id': 'device-asror-2',
            'device_label': 'Asror iPad'
        })
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertIn('token', response2.data)

    def test_relogin_from_replaced_old_device_requires_reapproval(self):
        """
        Regressiya: yangi qurilma tasdiqlangach, ofitsiant ESKI (bir paytlar
        approved bo'lgan, endi nofaol) qurilmasidan qayta kirsa, qator
        is_approved=True holicha qayta faollashtirilib, partial unique
        constraint (bitta userda bitta active+approved qurilma) buzilar va
        IntegrityError 500 qaytarar edi. To'g'ri xatti-harakat: eski qurilma
        ham endi menejer tasdig'ini kutadi (403).
        """
        # 1. Birinchi qurilma (TOFU bilan avtomatik approved)
        self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233', 'password': 'password123',
            'device_id': 'device-asror-1', 'device_label': 'Asror Phone',
        })
        # 2. Ikkinchi qurilma pending bo'ladi, menejer uni tasdiqlaydi
        self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233', 'password': 'password123',
            'device_id': 'device-asror-2', 'device_label': 'Asror iPad',
        })
        pending = StaffDevice.objects.get(device_id='device-asror-2')
        self.client.force_authenticate(user=self.manager)
        self.client.post(f'/api/devices/{pending.pk}/approve/')
        self.client.force_authenticate(user=None)

        # 3. Eski qurilmadan qayta kirish - 500 emas, 403 (qayta tasdiqlash)
        response = self.client.post('/api/auth/waiter-login/', {
            'phone': '+998901112233', 'password': 'password123',
            'device_id': 'device-asror-1', 'device_label': 'Asror Phone',
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Menejer tasdig'i kutilmoqda", response.data['detail'])

        old_device = StaffDevice.objects.get(device_id='device-asror-1')
        self.assertTrue(old_device.is_active)
        self.assertFalse(old_device.is_approved)

        # Hozirgi tasdiqlangan qurilma o'z holicha qoladi
        current = StaffDevice.objects.get(device_id='device-asror-2')
        self.assertTrue(current.is_active)
        self.assertTrue(current.is_approved)
