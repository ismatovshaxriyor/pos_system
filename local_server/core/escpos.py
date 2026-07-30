"""
ESC/POS chek generatori - Xprinter XP-Q80A (80mm, 203dpi, avtokesish) va umuman
ESC/POS-mos termoprinterlar uchun.

Bu modul ataylab FAQAT stdlib'ga tayanadi (Django import qilmaydi):
- `core.tasks` / `core.views` undan model obyektlaridan yig'ilgan oddiy
  qiymatlar bilan foydalanadi;
- host mashinada (Docker'dan tashqarida, masalan USB/CUPS orqali sinovda)
  to'g'ridan-to'g'ri import qilib ishlatsa ham bo'ladi.

Matn kodlash strategiyasi: printerga CP866 (kirill) kod sahifasi tanlatiladi -
Epson va xitoy klonlarida (Xprinter ham) `ESC t 17` deyarli har doim CP866.
O'zbek lotin matni apostrof-transliteratsiyadan keyin sof ASCII bo'lib qoladi,
ruscha/kirill nomlar CP866'da chiqadi; CP866'da yo'q o'zbek kirill harflari
(қ, ғ, ҳ, ў) vizual yaqin muqobiliga almashtiriladi - chek uchun yetarli.
"""
import socket
from datetime import datetime
from zoneinfo import ZoneInfo

# core/views.py::RESTAURANT_TZ bilan bir xil qiymat - u yerdan import qilinmaydi,
# chunki bu modul Django'siz ham yuklanishi kerak.
RESTAURANT_TZ = ZoneInfo('Asia/Tashkent')


ESC = b'\x1b'
GS = b'\x1d'

INIT = ESC + b'@'
SELECT_CP866 = ESC + b't\x11'  # kod sahifasi 17 = CP866
ALIGN_LEFT = ESC + b'a\x00'
ALIGN_CENTER = ESC + b'a\x01'
BOLD_ON = ESC + b'E\x01'
BOLD_OFF = ESC + b'E\x00'
SIZE_NORMAL = GS + b'!\x00'
SIZE_DOUBLE = GS + b'!\x11'  # 2x eni + 2x bo'yi (oshxona uchun yirik)
FEED_AND_CUT = ESC + b'd\x04' + GS + b'V\x42\x00'  # 4 qator surish + partial cut

DEFAULT_WIDTH = 48  # 80mm qog'oz, Font A. 58mm printer bo'lsa - 32.

_CHAR_FIXUPS = {
    # O'zbek lotin apostroflari va tipografik belgilar -> ASCII
    'ʻ': "'",  # ʻ (o'zbekcha okina)
    'ʼ': "'",  # ʼ
    '‘': "'", '’': "'", '‛': "'", '`': "'", '´': "'",
    '“': '"', '”': '"', '«': '"', '»': '"',
    '–': '-', '—': '-',
    '…': '...',
    ' ': ' ',
    # CP866'da yo'q o'zbek kirill harflari -> vizual yaqin kirill muqobili
    'Ў': 'У', 'ў': 'у',  # Ў ў -> У у
    'Қ': 'К', 'қ': 'к',  # Қ қ -> К к
    'Ғ': 'Г', 'ғ': 'г',  # Ғ ғ -> Г г
    'Ҳ': 'Х', 'ҳ': 'х',  # Ҳ ҳ -> Х х
}
_TRANSLATE = str.maketrans(_CHAR_FIXUPS)


def encode(text):
    """Matnni printer tushunadigan CP866 baytlariga aylantiradi (yo'q belgi -> '?')."""
    return str(text).translate(_TRANSLATE).encode('cp866', errors='replace')


def _wrap(text, width):
    """So'z chegarasida qatorlarga bo'lish; bitta uzun so'z majburan kesiladi."""
    lines, current = [], ''
    for word in str(text).split():
        candidate = f"{current} {word}".strip()
        if len(candidate) <= width:
            current = candidate
            continue
        if current:
            lines.append(current)
        while len(word) > width:
            lines.append(word[:width])
            word = word[width:]
        current = word
    if current:
        lines.append(current)
    return lines or ['']


def _two_cols(left, right, width):
    """Chapga va o'ngga taqalgan ikki ustunli qator; sig'masa oddiy probel bilan."""
    left, right = str(left), str(right)
    gap = width - len(left) - len(right)
    if gap < 1:
        return f"{left} {right}"
    return left + ' ' * gap + right


def _format_modifiers(modifiers):
    """`OrderItem.modifiers` JSON (dict/list/str) -> chekka chiqadigan qatorlar."""
    if not modifiers:
        return []
    if isinstance(modifiers, dict):
        return [f"{key}: {value}" for key, value in modifiers.items()]
    if isinstance(modifiers, (list, tuple)):
        return [str(entry) for entry in modifiers if str(entry).strip()]
    return [str(modifiers)]


def render_kitchen_ticket(*, station_name, order_id, table_name, waiter_name,
                          items, created_at=None, width=DEFAULT_WIDTH):
    """
    Oshxona chekini ESC/POS baytlariga yig'adi.

    `items` - `PrintJob.items_snapshot` formati:
    [{"name": str, "quantity": int, "note": str, "modifiers": dict|list}, ...]
    Taom qatorlari 2x o'lchamda (oshpaz uzoqdan o'qiydi), izoh/modifikatorlar
    oddiy o'lchamda chiqadi.
    """
    created = created_at or datetime.now(tz=RESTAURANT_TZ)
    created = created.astimezone(RESTAURANT_TZ)

    out = [INIT, SELECT_CP866, ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(station_name, width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_NORMAL, ALIGN_LEFT]
    out.append(encode(_two_cols(f"Buyurtma #{order_id}", created.strftime('%d.%m %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols(f"Stol: {table_name}", f"Ofitsiant: {waiter_name}", width)) + b'\n')
    out.append(encode('=' * width) + b'\n')

    for item in items:
        quantity = item.get('quantity', 1)
        name = item.get('name', '')
        out.append(SIZE_DOUBLE)
        for line in _wrap(f"{quantity} x {name}", width // 2):
            out.append(encode(line) + b'\n')
        out.append(SIZE_NORMAL)
        note = (item.get('note') or '').strip()
        if note:
            for line in _wrap(f"** {note}", width - 2):
                out.append(encode('  ' + line) + b'\n')
        for modifier in _format_modifiers(item.get('modifiers')):
            for line in _wrap(f"+ {modifier}", width - 2):
                out.append(encode('  ' + line) + b'\n')

    out.append(encode('=' * width) + b'\n')
    out.append(FEED_AND_CUT)
    return b''.join(out)


def render_pre_bill_receipt(*, restaurant_name="POS RESTORAN", order_id, table_name, waiter_name,
                            items, total_amount, discount_amount=0, tax_amount=0,
                            service_charge=0, final_amount, created_at=None,
                            width=DEFAULT_WIDTH):
    """
    Hisob-chek (Shot / Pre-bill) generatori.
    Mehmon to'lov qilishidan oldin buyurtma hisobini tekshirishi uchun chiqariladi.
    """
    created = created_at or datetime.now(tz=RESTAURANT_TZ)
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created)
        except ValueError:
            created = datetime.now(tz=RESTAURANT_TZ)
    created = created.astimezone(RESTAURANT_TZ)

    out = [INIT, SELECT_CP866, ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(restaurant_name, width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_NORMAL]
    out.append(encode("=== HISOB-CHEK (PRE-BILL) ===") + b'\n')
    out += [ALIGN_LEFT]
    out.append(encode(_two_cols(f"Buyurtma #{order_id}", created.strftime('%d.%m.%Y %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols(f"Stol: {table_name}", f"Ofitsiant: {waiter_name}", width)) + b'\n')
    out.append(encode('-' * width) + b'\n')

    for item in items:
        qty = item.get('quantity', 1)
        name = item.get('name', '')
        price = float(item.get('price', 0))
        total = price * qty
        out.append(encode(f"{qty} x {name}") + b'\n')
        out.append(encode(_two_cols(f"   @{int(price):,} so'm".replace(',', ' '), f"{int(total):,} so'm".replace(',', ' '), width)) + b'\n')

    out.append(encode('-' * width) + b'\n')
    out.append(encode(_two_cols("Jami taomlar:", f"{int(total_amount):,} so'm".replace(',', ' '), width)) + b'\n')
    if discount_amount > 0:
        out.append(encode(_two_cols("Chegirma:", f"-{int(discount_amount):,} so'm".replace(',', ' '), width)) + b'\n')
    if service_charge > 0:
        out.append(encode(_two_cols("Xizmat haqi:", f"+{int(service_charge):,} so'm".replace(',', ' '), width)) + b'\n')
    if tax_amount > 0:
        out.append(encode(_two_cols("Soliq:", f"+{int(tax_amount):,} so'm".replace(',', ' '), width)) + b'\n')

    out.append(encode('=' * width) + b'\n')
    out += [SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(_two_cols("TO'LANISHI KERAK:", f"{int(final_amount):,} so'm".replace(',', ' '), width // 2), width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_NORMAL, ALIGN_CENTER]
    out.append(encode('-' * width) + b'\n')
    out.append(encode("Bu hisob-chek! To'lov cheki emas.") + b'\n')
    out.append(encode("Rahmat! Yana kutib qolamiz.") + b'\n')
    out.append(FEED_AND_CUT)
    return b''.join(out)


def render_payment_receipt(*, restaurant_name="POS RESTORAN", order_id, table_name, waiter_name, cashier_name,
                           items, total_amount, discount_amount=0, tax_amount=0,
                           service_charge=0, final_amount, payments=None,
                           created_at=None, width=DEFAULT_WIDTH):
    """
    To'lov cheki (Final Receipt) generatori.
    Mijoz to'lov qilgandan so'ng kassa printeridan chiqariladi.
    """
    created = created_at or datetime.now(tz=RESTAURANT_TZ)
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created)
        except ValueError:
            created = datetime.now(tz=RESTAURANT_TZ)
    created = created.astimezone(RESTAURANT_TZ)

    out = [INIT, SELECT_CP866, ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(restaurant_name, width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_NORMAL]
    out.append(encode("*** TO'LOV CHEKI ***") + b'\n')
    out += [ALIGN_LEFT]
    out.append(encode(_two_cols(f"Buyurtma #{order_id}", created.strftime('%d.%m.%Y %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols(f"Stol: {table_name}", f"Kassir: {cashier_name}", width)) + b'\n')
    if waiter_name:
        out.append(encode(f"Ofitsiant: {waiter_name}") + b'\n')
    out.append(encode('-' * width) + b'\n')

    for item in items:
        qty = item.get('quantity', 1)
        name = item.get('name', '')
        price = float(item.get('price', 0))
        total = price * qty
        out.append(encode(f"{qty} x {name}") + b'\n')
        out.append(encode(_two_cols(f"   @{int(price):,} so'm".replace(',', ' '), f"{int(total):,} so'm".replace(',', ' '), width)) + b'\n')

    out.append(encode('-' * width) + b'\n')
    out.append(encode(_two_cols("Jami taomlar:", f"{int(total_amount):,} so'm".replace(',', ' '), width)) + b'\n')
    if discount_amount > 0:
        out.append(encode(_two_cols("Chegirma:", f"-{int(discount_amount):,} so'm".replace(',', ' '), width)) + b'\n')
    if service_charge > 0:
        out.append(encode(_two_cols("Xizmat haqi:", f"+{int(service_charge):,} so'm".replace(',', ' '), width)) + b'\n')
    if tax_amount > 0:
        out.append(encode(_two_cols("Soliq:", f"+{int(tax_amount):,} so'm".replace(',', ' '), width)) + b'\n')

    out.append(encode('=' * width) + b'\n')
    out += [BOLD_ON]
    out.append(encode(_two_cols("JAMI TO'LANDI:", f"{int(final_amount):,} so'm".replace(',', ' '), width)) + b'\n')
    out += [BOLD_OFF]

    if payments:
        out.append(encode('-' * width) + b'\n')
        out.append(encode("To'lov usullari:") + b'\n')
        for p in payments:
            method_label = p.get('method_display') or p.get('method') or "To'lov"
            amt = float(p.get('amount', 0))
            out.append(encode(_two_cols(f"  - {method_label}", f"{int(amt):,} so'm".replace(',', ' '), width)) + b'\n')

    out += [ALIGN_CENTER]
    out.append(encode('=' * width) + b'\n')
    out.append(encode("Xaridingiz uchun rahmat!") + b'\n')
    out.append(encode("Yoqimli ishtaha!") + b'\n')
    out.append(FEED_AND_CUT)
    return b''.join(out)



def render_test_ticket(*, printer_name, endpoint='', width=DEFAULT_WIDTH):
    """Sozlashni tekshirish uchun test chek: kodlash namunalari + kesish testi."""
    now = datetime.now(tz=RESTAURANT_TZ)
    out = [INIT, SELECT_CP866, ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON,
           encode('TEST CHEK') + b'\n', BOLD_OFF, SIZE_NORMAL]
    out.append(encode(printer_name) + b'\n')
    if endpoint:
        out.append(encode(endpoint) + b'\n')
    out += [ALIGN_LEFT, encode('-' * width) + b'\n']
    out.append(encode(now.strftime('%d.%m.%Y %H:%M:%S')) + b'\n')
    out.append(encode("Lotin:  O'zbekcha - Sho'rva, Lag'mon, g'isht") + b'\n')
    out.append(encode('Kirill: Шашлык, Лагман, Норин № 42') + b'\n')
    out.append(encode('Raqam:  0123456789 +-*/=% 48 ustun') + b'\n')
    out.append(encode('W' * width) + b'\n')  # eni to'g'ri sozlanganini ko'rsatadi
    out += [encode('-' * width) + b'\n', ALIGN_CENTER,
            encode('ESC/POS OK - pastda avtokesish') + b'\n', FEED_AND_CUT]
    return b''.join(out)


def send_tcp(host, port, payload, timeout=5.0):
    """
    ESC/POS baytlarini printerning raw TCP portiga (odatda 9100) yuboradi.
    Muvaffaqiyatsizlikda OSError (socket.timeout ham OSError avlodi) ko'taradi -
    chaqiruvchi (Celery task / view) retry/xabar siyosatini o'zi hal qiladi.

    Eslatma: printer server bilan boshqa IP subnetda bo'lsa (masalan printer
    zavod holida 192.168.123.x, server esa 192.168.1.x'da), bu funksiya buni
    o'zi "tuzatmaydi" - avval shu modul ichida shunday urinish bor edi
    (`ensure_subnet_alias`, `sudo ip addr add` orqali), lekin u web/
    celery_worker KONTEYNERI ichidan chaqirilardi: konteynerda na `sudo`, na
    `ip` buyrug'i, na NET_ADMIN huquqi yo'q (tekshirib ko'rilgan - har doim
    jimgina hech narsa qilmay o'tib ketardi) - ustiga, konteyner o'z Docker
    bridge tarmog'ida bo'lgani uchun hostning haqiqiy tarmoq kartasiga alias
    qo'sholmaydi ham edi. Haqiqiy yechim - `scripts/setup_printer_subnets.sh`
    (yoki `.ps1`) ni HOST darajasida, o'rnatish paytida bir marta ishga
    tushirish (qarang DEPLOY.md, 6-bo'lim).
    """
    with socket.create_connection((str(host), int(port)), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(payload)

