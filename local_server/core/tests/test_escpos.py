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

    def test_test_ticket_contains_probe_lines(self):
        payload = escpos.render_test_ticket(printer_name='XP-Q80A', endpoint='192.168.1.50:9100')
        self.assertIn(b'TEST CHEK', payload)
        self.assertIn(b'192.168.1.50:9100', payload)
        self.assertTrue(payload.endswith(escpos.FEED_AND_CUT))
