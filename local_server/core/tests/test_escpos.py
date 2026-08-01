from datetime import datetime, timezone as dt_timezone

from django.test import SimpleTestCase

from core import escpos


class EscposEncodingTests(SimpleTestCase):
    def test_uzbek_latin_apostrophes_become_ascii(self):
        self.assertEqual(escpos.encode("Lagʻmon"), b"Lag'mon")  # o'zbekcha okina (ʻ)
        self.assertEqual(escpos.encode("Lag’mon"), b"Lag'mon")  # tipografik apostrof (')
        self.assertEqual(escpos.encode("Sho`rva"), b"Sho'rva")

    def test_cyrillic_encodes_to_cp866(self):
        self.assertEqual(escpos.encode('Шашлык'), 'Шашлык'.encode('cp866'))

    def test_uzbek_cyrillic_letters_fall_back_to_close_cp866_ones(self):
        self.assertEqual(escpos.encode('қғҳў'), 'кгху'.encode('cp866'))

    def test_unknown_char_replaced_not_crash(self):
        self.assertEqual(escpos.encode('中'), b'?')

    def test_two_cols_right_aligns_within_width(self):
        line = escpos._two_cols('chap', 'ong', 20)
        self.assertEqual(len(line), 20)
        self.assertTrue(line.startswith('chap'))
        self.assertTrue(line.endswith('ong'))

    def test_wrap_breaks_long_word(self):
        self.assertEqual(escpos._wrap('AAAABBBB', 4), ['AAAA', 'BBBB'])

    def test_wrap_empty_returns_single_blank_line(self):
        self.assertEqual(escpos._wrap('', 10), [''])


class EscposTicketTests(SimpleTestCase):
    def test_kitchen_ticket_structure(self):
        payload = escpos.render_kitchen_ticket(
            station_name='OSHXONA',
            order_id=7,
            table_name='Zal-4',
            waiter_name='Alisher',
            items=[{'name': "Lag'mon", 'quantity': 2, 'note': 'piyozsiz', 'modifiers': {'Achchiq': 'oz'}}],
            created_at=datetime(2026, 7, 21, 9, 30, tzinfo=dt_timezone.utc),
        )
        self.assertTrue(payload.startswith(escpos.INIT + escpos.SELECT_CP866))
        self.assertTrue(payload.endswith(escpos.FEED_AND_CUT))
        self.assertIn(b"2 x Lag'mon", payload)
        self.assertIn(b'** piyozsiz', payload)
        self.assertIn(b'+ Achchiq: oz', payload)
        self.assertIn(b'Buyurtma #7', payload)
        # created_at UTC 09:30 -> chekda Toshkent vaqti 14:30
        self.assertIn(b'14:30', payload)

    def test_kitchen_ticket_modifiers_list_form(self):
        payload = escpos.render_kitchen_ticket(
            station_name='BAR', order_id=1, table_name='T1', waiter_name='A',
            items=[{'name': 'Choy', 'quantity': 1, 'note': '', 'modifiers': ['limon', 'asal']}],
        )
        self.assertIn(b'+ limon', payload)
        self.assertIn(b'+ asal', payload)

    def test_kitchen_ticket_header_uses_tall_size(self):
        payload = escpos.render_kitchen_ticket(
            station_name='BAR', order_id=1, table_name='T1', waiter_name='A',
            items=[{'name': 'Choy', 'quantity': 1, 'note': '', 'modifiers': {}}],
        )
        header_pos = payload.index(b'Buyurtma #1')
        separator_pos = payload.index(b'=' * 10)
        # SIZE_TALL sarlavha qatoridan OLDIN, SIZE_NORMAL sarlavhadan keyin -
        # "====" ajratuvchidan oldin kelishi kerak (item qatorlari o'ziga
        # xos SIZE_DOUBLE/SIZE_NORMAL bilan ishlaydi, bunga aralashmasligi kerak).
        self.assertIn(escpos.SIZE_TALL, payload[:header_pos])
        self.assertIn(escpos.SIZE_NORMAL, payload[header_pos:separator_pos])

    def test_kitchen_ticket_takeaway_label(self):
        payload = escpos.render_kitchen_ticket(
            station_name='BAR', order_id=1, table_name=None, waiter_name='A',
            items=[{'name': 'Choy', 'quantity': 1, 'note': '', 'modifiers': {}}],
            order_type='takeaway',
        )
        self.assertIn(b'Olib ketish', payload)
        self.assertNotIn(b'Stol:', payload)

    def test_kitchen_ticket_delivery_label(self):
        payload = escpos.render_kitchen_ticket(
            station_name='BAR', order_id=1, table_name=None, waiter_name='A',
            items=[{'name': 'Choy', 'quantity': 1, 'note': '', 'modifiers': {}}],
            order_type='delivery',
        )
        self.assertIn(b'Yetkazib berish', payload)
        self.assertNotIn(b'Stol:', payload)

    def test_table_label_with_table(self):
        self.assertEqual(escpos._table_label('Stol 5'), 'Stol: Stol 5')

    def test_table_label_takeaway_without_table(self):
        self.assertEqual(escpos._table_label(None, 'takeaway'), 'Olib ketish')
        self.assertEqual(escpos._table_label(None, 'dine_in'), 'Olib ketish')  # stol biriktirilmagan bo'lsa ham

    def test_table_label_delivery_without_table(self):
        self.assertEqual(escpos._table_label(None, 'delivery'), 'Yetkazib berish')

    def test_test_ticket_contains_probe_lines(self):
        payload = escpos.render_test_ticket(printer_name='XP-Q80A', endpoint='192.168.1.50:9100')
        self.assertIn(b'TEST CHEK', payload)
        self.assertIn(b'192.168.1.50:9100', payload)
        self.assertTrue(payload.endswith(escpos.FEED_AND_CUT))

    def test_service_charge_label_with_rate(self):
        self.assertEqual(escpos._service_charge_label(10), "Xizmat foizi (10%):")
        self.assertEqual(escpos._service_charge_label(12.5), "Xizmat foizi (12.5%):")

    def test_service_charge_label_without_rate(self):
        self.assertEqual(escpos._service_charge_label(0), "Xizmat foizi:")
        self.assertEqual(escpos._service_charge_label(None), "Xizmat foizi:")

    def _receipt_kwargs(self, **overrides):
        kwargs = dict(
            order_id=1, table_name='T1', waiter_name='A',
            items=[{'name': 'Osh', 'quantity': 1, 'price': 30000}],
            total_amount=30000, service_charge=3000, final_amount=33000,
        )
        kwargs.update(overrides)
        return kwargs

    def test_pre_bill_receipt_shows_service_charge_percentage(self):
        payload = escpos.render_pre_bill_receipt(**self._receipt_kwargs(service_charge_rate=10))
        self.assertIn(b'Xizmat foizi (10%):', payload)

    def test_pre_bill_receipt_service_charge_without_rate(self):
        payload = escpos.render_pre_bill_receipt(**self._receipt_kwargs())
        self.assertIn(b'Xizmat foizi:', payload)
        self.assertNotIn(b'Xizmat foizi (', payload)

    def test_payment_receipt_shows_service_charge_percentage(self):
        payload = escpos.render_payment_receipt(**self._receipt_kwargs(cashier_name='Kamila', service_charge_rate=10))
        self.assertIn(b'Xizmat foizi (10%):', payload)

    def test_pre_bill_receipt_ends_with_brand_footer(self):
        payload = escpos.render_pre_bill_receipt(**self._receipt_kwargs())
        self.assertIn(b'Powered by hamrohpos.uz', payload)
        self.assertTrue(payload.endswith(escpos.FEED_AND_CUT))

    def test_payment_receipt_ends_with_brand_footer(self):
        payload = escpos.render_payment_receipt(**self._receipt_kwargs(cashier_name='Kamila'))
        self.assertIn(b'Powered by hamrohpos.uz', payload)
        self.assertIn(b'Xaridingiz uchun rahmat!', payload)
        # Footer "rahmat" xabaridan KEYIN kelishi kerak (kesishdan oldingi oxirgi qator).
        self.assertLess(payload.index(b'Xaridingiz'), payload.index(b'Powered by'))

    def test_pre_bill_receipt_takeaway_label(self):
        payload = escpos.render_pre_bill_receipt(
            **self._receipt_kwargs(table_name=None, order_type='takeaway'))
        self.assertIn(b'Olib ketish', payload)
        self.assertNotIn(b'Stol:', payload)

    def test_payment_receipt_delivery_label(self):
        payload = escpos.render_payment_receipt(
            **self._receipt_kwargs(cashier_name='Kamila', table_name=None, order_type='delivery'))
        self.assertIn(b'Yetkazib berish', payload)
        self.assertNotIn(b'Stol:', payload)

    def test_kitchen_ticket_has_no_brand_footer(self):
        # Oshxona cheki xodimlar uchun - mijozga ko'rinmaydi, brend kerak emas.
        payload = escpos.render_kitchen_ticket(
            station_name='OSHXONA', order_id=1, table_name='T1', waiter_name='A',
            items=[{'name': 'Osh', 'quantity': 1, 'note': '', 'modifiers': {}}],
        )
        self.assertNotIn(b'hamrohpos.uz', payload)

    def test_order_type_label(self):
        self.assertEqual(escpos._order_type_label('dine_in'), 'Stolga')
        self.assertEqual(escpos._order_type_label('takeaway'), 'Olib ketish')
        self.assertEqual(escpos._order_type_label('delivery'), 'Yetkazib berish')

    def test_items_table_header_and_columns(self):
        lines = escpos._items_table_lines(
            [{'name': 'Osh', 'quantity': 2, 'price': 30000}], width=48)
        self.assertEqual(lines[0][:4], 'Nomi')
        self.assertTrue(lines[0].rstrip().endswith('Jami'))
        self.assertEqual(len(lines[0]), 48)
        self.assertIn('Osh', lines[2])
        self.assertIn('60 000', lines[2])  # 2 x 30000

    def test_items_table_wraps_long_name_without_numbers_on_continuation(self):
        long_name = "Aksiya farsh o'rdak barbekuola supasi bilan"
        lines = escpos._items_table_lines(
            [{'name': long_name, 'quantity': 1, 'price': 150000}], width=48)
        # Birinchi qatorda raqamlar bor, davomida yo'q.
        self.assertIn('150 000', lines[2])
        self.assertNotIn('150 000', lines[3])

    def test_items_table_half_quantity_shown_without_trailing_zero(self):
        lines = escpos._items_table_lines(
            [{'name': 'Jiz', 'quantity': 0.5, 'price': 240000}], width=48)
        self.assertIn('0.5', lines[2])

    def test_render_qr_code_empty_data_returns_empty(self):
        self.assertEqual(escpos.render_qr_code(''), b'')
        self.assertEqual(escpos.render_qr_code(None), b'')

    def test_render_qr_code_contains_store_and_print_commands(self):
        payload = escpos.render_qr_code('https://example.uz/')
        self.assertTrue(payload.startswith(escpos.ALIGN_CENTER))
        self.assertIn(b'https://example.uz/', payload)
        # Chop etish buyrug'i (fn=81='Q', m=48='0') oxirida bo'lishi kerak.
        self.assertTrue(payload.endswith(escpos.GS + b'(k' + bytes([3, 0, 0x31, 0x51, 0x30])))

    def test_pre_bill_receipt_shows_open_and_print_time_rows(self):
        payload = escpos.render_pre_bill_receipt(**self._receipt_kwargs(
            order_created_at=datetime(2026, 7, 31, 16, 51, tzinfo=dt_timezone.utc),
            created_at=datetime(2026, 7, 31, 17, 25, tzinfo=dt_timezone.utc),
        ))
        self.assertIn(b'Ochilgan:', payload)
        self.assertIn(b'Chek vaqti:', payload)
        self.assertIn(b'21:51', payload)  # UTC 16:51 -> Toshkent 21:51
        self.assertIn(b'22:25', payload)

    def test_pre_bill_receipt_omits_open_row_without_order_created_at(self):
        payload = escpos.render_pre_bill_receipt(**self._receipt_kwargs())
        self.assertNotIn(b'Ochilgan:', payload)

    def test_payment_receipt_shows_table_name_with_zone(self):
        payload = escpos.render_payment_receipt(
            **self._receipt_kwargs(cashier_name='Kamila', table_name="2 (Ko'cha)"))
        self.assertIn(b'Stol raqami:', payload)
        self.assertIn(b"2 (Ko'cha)", payload)

    def test_payment_receipt_phone_shown_only_when_provided(self):
        with_phone = escpos.render_payment_receipt(**self._receipt_kwargs(
            cashier_name='Kamila', phone='+998901234567'))
        self.assertIn(b'Tel: +998901234567', with_phone)

        without_phone = escpos.render_payment_receipt(**self._receipt_kwargs(cashier_name='Kamila'))
        self.assertNotIn(b'Tel:', without_phone)

    def test_payment_receipt_qr_always_points_to_hamrohpos(self):
        # Restoranning o'z public_domain'i emas - QR doim hamrohpos.uz'ga
        # o'tadi (BRAND_FOOTER bilan bir xil qattiq belgilangan brend havolasi).
        payload = escpos.render_payment_receipt(**self._receipt_kwargs(cashier_name='Kamila'))
        self.assertIn(escpos.BRAND_WEBSITE_URL.encode(), payload)
