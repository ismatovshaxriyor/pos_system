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
SIZE_TALL = GS + b'!\x01'  # 2x bo'yi, eni o'zgarmaydi - ustun kengligi buzilmaydi, faqat balandroq
SIZE_DOUBLE = GS + b'!\x11'  # 2x eni + 2x bo'yi (oshxona uchun yirik)
FEED_AND_CUT = ESC + b'd\x04' + GS + b'V\x42\x00'  # 4 qator surish + partial cut

DEFAULT_WIDTH = 48  # 80mm qog'oz, Font A. 58mm printer bo'lsa - 32.

BRAND_FOOTER = "Powered by hamrohpos.uz"  # mijozga chiqadigan har ikkala chekning oxirida (kitchen ticket/test chekda emas)

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


def _service_charge_label(rate):
    """
    'Xizmat foizi:' yoki, foiz ma'lum bo'lsa (RestaurantConfig.service_charge_rate
    dan hisoblangan), 'Xizmat foizi (10%):'. `Order.service_charge` qo'lda,
    foizsiz kiritilgan bo'lsa `rate` 0 keladi - shu holda foizsiz yoziladi.
    """
    if rate and float(rate) > 0:
        rate = float(rate)
        rate_str = f"{rate:g}"
        return f"Xizmat foizi ({rate_str}%):"
    return "Xizmat foizi:"


def _table_label(table_name, order_type='dine_in'):
    """
    'Stol: 6' - stol biriktirilgan bo'lsa. Stolsiz buyurtmalar (olib
    ketish/yetkazib berish) uchun "Stol: Takeaway" kabi noqulay yozuv
    o'rniga `Order.order_type`ga qarab tabiiy yorliq qaytaradi.
    """
    if table_name:
        return f"Stol: {table_name}"
    if order_type == 'delivery':
        return 'Yetkazib berish'
    return 'Olib ketish'


def _order_type_label(order_type='dine_in'):
    """
    Hisob-chek/to'lov chekidagi "Buyurtma turi:" qatori uchun - stol
    biriktirilgan-biriktirilmaganidan qat'i nazar mustaqil qator sifatida
    (stol raqami alohida qatorda ko'rsatiladi, qarang `_items_table_lines`
    yaqinidagi chek qurish kodi).
    """
    if order_type == 'delivery':
        return 'Yetkazib berish'
    if order_type == 'takeaway':
        return 'Olib ketish'
    return 'Stolga'


def _item_columns(width):
    """Taomlar jadvali uchun 4 ustun kengligi: Nomi/Soni/Narxi/Jami. 48 belgida 24/6/9/9."""
    qty_w = max(4, width // 8)
    price_w = max(7, (width * 9) // 48)
    total_w = price_w
    name_w = max(8, width - qty_w - price_w - total_w)
    return name_w, qty_w, price_w, total_w


def _money(amount):
    return f"{int(round(amount)):,}".replace(',', ' ')


def _items_table_lines(items, width):
    """
    Hisob-chek/to'lov cheki uchun ustunli taomlar jadvali: sarlavha qatori
    + har bir taom uchun bitta qator (uzun nom bo'lsa, raqamlar birinchi
    qatorda, qolgani faqat nom davomi bo'lib pastga tushadi).
    """
    name_w, qty_w, price_w, total_w = _item_columns(width)
    lines = [
        'Nomi'.ljust(name_w) + 'Soni'.rjust(qty_w) + 'Narxi'.rjust(price_w) + 'Jami'.rjust(total_w),
        '-' * width,
    ]
    for item in items:
        qty = item.get('quantity', 1)
        name = item.get('name', '')
        price = float(item.get('price', 0))
        total = price * qty
        qty_str = f"{qty:g}" if isinstance(qty, float) else str(qty)
        wrapped = _wrap(name, name_w)
        lines.append(
            wrapped[0].ljust(name_w) + qty_str.rjust(qty_w) +
            _money(price).rjust(price_w) + _money(total).rjust(total_w)
        )
        lines.extend(line.ljust(name_w) for line in wrapped[1:])
    return lines


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
                          items, order_type='dine_in', created_at=None, width=DEFAULT_WIDTH):
    """
    Oshxona chekini ESC/POS baytlariga yig'adi.

    `items` - `PrintJob.items_snapshot` formati:
    [{"name": str, "quantity": int, "note": str, "modifiers": dict|list}, ...]
    Taom qatorlari 2x o'lchamda (oshpaz uzoqdan o'qiydi), izoh/modifikatorlar
    oddiy o'lchamda chiqadi. Sarlavha qatorlari (buyurtma #/vaqt, stol/ofitsiant)
    SIZE_TALL bilan - oshxonada uzoqroqdan o'qish osonroq bo'lishi uchun.
    """
    created = created_at or datetime.now(tz=RESTAURANT_TZ)
    created = created.astimezone(RESTAURANT_TZ)

    out = [INIT, SELECT_CP866, ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(station_name, width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_TALL, ALIGN_LEFT]
    out.append(encode(_two_cols(f"Buyurtma #{order_id}", created.strftime('%d.%m %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols(_table_label(table_name, order_type), f"Ofitsiant: {waiter_name}", width)) + b'\n')
    out += [SIZE_NORMAL]
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


def render_logo_raster(image_path, max_width=384):
    """
    Logo rasmini (PNG/JPG) ESC/POS 'GS v 0' (Raster bit image) baytlariga o'tkazadi.
    Pillow kutubxonasi mavjud bo'lmasa yoki rasm fayli yo'q bo'lsa b'' qaytaradi.
    """
    if not image_path:
        return b''
    try:
        from PIL import Image
        img = Image.open(image_path)
    except Exception:
        return b''

    try:
        img = img.convert('L')
        w, h = img.size
        if w > max_width:
            ratio = max_width / float(w)
            h = int(float(h) * ratio)
            w = max_width
            resample_flag = getattr(Image, 'Resampling', Image).LANCZOS if hasattr(Image, 'Resampling') else Image.LANCZOS
            img = img.resize((w, h), resample_flag)

        bytes_per_line = (w + 7) // 8
        threshold = 128
        raster_data = bytearray()

        for y in range(h):
            for x_byte in range(bytes_per_line):
                byte_val = 0
                for bit in range(8):
                    x = x_byte * 8 + bit
                    if x < w:
                        pixel = img.getpixel((x, y))
                        if pixel < threshold:  # Qora piksel
                            byte_val |= (1 << (7 - bit))
                raster_data.append(byte_val)

        xL = bytes_per_line % 256
        xH = bytes_per_line // 256
        yL = h % 256
        yH = h // 256

        header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
        return ALIGN_CENTER + header + bytes(raster_data) + b'\n'
    except Exception:
        return b''


def render_qr_code(data, size=6, ec_level='M'):
    """
    QR kodni printerning o'ziga chizdiradi (Epson-mos 'GS ( k' funksiyasi
    165/167/169/080/081 - model/o'lcham/xato-tuzatish/ma'lumot/chop).
    Hech qanday tashqi kutubxona (qrcode/Pillow) kerak emas - printer
    matnni o'zi kodlaydi. Ko'pchilik ESC/POS termoprinterlar (Xprinter
    klonlari ham) buni qo'llab-quvvatlaydi. `data` bo'sh bo'lsa b'' qaytadi.
    """
    if not data:
        return b''
    payload = str(data).encode('utf-8')
    ec = {'L': 48, 'M': 49, 'Q': 50, 'H': 51}.get(ec_level, 49)

    model_cmd = GS + b'(k' + bytes([4, 0, 0x31, 0x41, 50, 0])
    size_cmd = GS + b'(k' + bytes([3, 0, 0x31, 0x43, size])
    ec_cmd = GS + b'(k' + bytes([3, 0, 0x31, 0x45, ec])
    store_len = len(payload) + 3
    store_cmd = GS + b'(k' + bytes([store_len % 256, store_len // 256, 0x31, 0x50, 0x30]) + payload
    print_cmd = GS + b'(k' + bytes([3, 0, 0x31, 0x51, 0x30])

    return ALIGN_CENTER + model_cmd + size_cmd + ec_cmd + store_cmd + print_cmd


def _parse_dt(value):
    """
    `created_at`/`order_created_at` ISO-string yoki datetime bo'lishi mumkin
    (`PrintJob.items_snapshot` JSON orqali keladi) - RESTAURANT_TZ'ga
    normallashtiradi, xato/bo'sh bo'lsa hozirgi vaqtga tushadi.
    """
    dt = value or datetime.now(tz=RESTAURANT_TZ)
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt)
        except ValueError:
            dt = datetime.now(tz=RESTAURANT_TZ)
    return dt.astimezone(RESTAURANT_TZ)


def render_pre_bill_receipt(*, restaurant_name="Restoran", logo_path=None, order_id, table_name, waiter_name,
                            items, total_amount, discount_amount=0, tax_amount=0,
                            service_charge=0, service_charge_rate=0, final_amount, order_type='dine_in',
                            order_created_at=None, created_at=None, width=DEFAULT_WIDTH):
    """
    Hisob-chek (Shot) generatori.
    Mehmon to'lov qilishidan oldin buyurtma hisobini tekshirishi uchun chiqariladi.
    """
    printed = _parse_dt(created_at)

    out = [INIT, SELECT_CP866]
    logo_bytes = render_logo_raster(logo_path)
    if logo_bytes:
        out.append(logo_bytes)

    out += [ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(restaurant_name, width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_NORMAL]
    out.append(encode("=== HISOB-CHEK ===") + b'\n')
    out += [ALIGN_LEFT]
    out.append(encode(f"Buyurtma #{order_id}") + b'\n')
    if order_created_at:
        out.append(encode(_two_cols("Ochilgan:", _parse_dt(order_created_at).strftime('%d.%m.%Y %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols("Chek vaqti:", printed.strftime('%d.%m.%Y %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols("Buyurtma turi:", _order_type_label(order_type), width)) + b'\n')
    if table_name:
        out.append(encode(_two_cols("Stol raqami:", table_name, width)) + b'\n')
    out.append(encode(_two_cols("Ofitsiant:", waiter_name, width)) + b'\n')
    out.append(encode('-' * width) + b'\n')

    for line in _items_table_lines(items, width):
        out.append(encode(line) + b'\n')

    out.append(encode('-' * width) + b'\n')
    out.append(encode(_two_cols("Jami taomlar:", f"{_money(total_amount)} so'm", width)) + b'\n')
    if discount_amount > 0:
        out.append(encode(_two_cols("Chegirma:", f"-{_money(discount_amount)} so'm", width)) + b'\n')
    if service_charge > 0:
        out.append(encode(_two_cols(_service_charge_label(service_charge_rate), f"+{_money(service_charge)} so'm", width)) + b'\n')
    if tax_amount > 0:
        out.append(encode(_two_cols("Soliq:", f"+{_money(tax_amount)} so'm", width)) + b'\n')

    out.append(encode('=' * width) + b'\n')
    out += [SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(_two_cols("TO'LANISHI KERAK:", f"{_money(final_amount)} so'm", width // 2), width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_NORMAL, ALIGN_CENTER]
    out.append(encode('=' * width) + b'\n')
    out.append(encode(BRAND_FOOTER) + b'\n')
    out.append(FEED_AND_CUT)
    return b''.join(out)


def render_payment_receipt(*, restaurant_name="Restoran", logo_path=None, order_id, table_name, waiter_name, cashier_name,
                           items, total_amount, discount_amount=0, tax_amount=0,
                           service_charge=0, service_charge_rate=0, final_amount, payments=None,
                           order_type='dine_in', order_created_at=None, created_at=None,
                           phone='', website_url=None, width=DEFAULT_WIDTH):
    """
    To'lov cheki (Final Receipt) generatori.
    Mijoz to'lov qilgandan so'ng kassa printeridan chiqariladi.
    """
    closed = _parse_dt(created_at)

    out = [INIT, SELECT_CP866]
    logo_bytes = render_logo_raster(logo_path)
    if logo_bytes:
        out.append(logo_bytes)

    out += [ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON]
    for line in _wrap(restaurant_name, width // 2):
        out.append(encode(line) + b'\n')
    out += [BOLD_OFF, SIZE_NORMAL]
    out.append(encode("*** TO'LOV CHEKI ***") + b'\n')
    out += [ALIGN_LEFT]
    out.append(encode(f"Buyurtma #{order_id}") + b'\n')
    if order_created_at:
        out.append(encode(_two_cols("Ochilgan:", _parse_dt(order_created_at).strftime('%d.%m.%Y %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols("Yopilgan:", closed.strftime('%d.%m.%Y %H:%M'), width)) + b'\n')
    out.append(encode(_two_cols("Buyurtma turi:", _order_type_label(order_type), width)) + b'\n')
    if table_name:
        out.append(encode(_two_cols("Stol raqami:", table_name, width)) + b'\n')
    if waiter_name:
        out.append(encode(_two_cols("Ofitsiant:", waiter_name, width)) + b'\n')
    out.append(encode(_two_cols("Kassir:", cashier_name, width)) + b'\n')
    out.append(encode('-' * width) + b'\n')

    for line in _items_table_lines(items, width):
        out.append(encode(line) + b'\n')

    out.append(encode('-' * width) + b'\n')
    out.append(encode(_two_cols("Jami taomlar:", f"{_money(total_amount)} so'm", width)) + b'\n')
    if discount_amount > 0:
        out.append(encode(_two_cols("Chegirma:", f"-{_money(discount_amount)} so'm", width)) + b'\n')
    if service_charge > 0:
        out.append(encode(_two_cols(_service_charge_label(service_charge_rate), f"+{_money(service_charge)} so'm", width)) + b'\n')
    if tax_amount > 0:
        out.append(encode(_two_cols("Soliq:", f"+{_money(tax_amount)} so'm", width)) + b'\n')

    out.append(encode('=' * width) + b'\n')
    out += [BOLD_ON]
    out.append(encode(_two_cols("JAMI TO'LANDI:", f"{_money(final_amount)} so'm", width)) + b'\n')
    out += [BOLD_OFF]

    if payments:
        out.append(encode('-' * width) + b'\n')
        out.append(encode("To'lov usullari:") + b'\n')
        for p in payments:
            method_label = p.get('method_display') or p.get('method') or "To'lov"
            amt = float(p.get('amount', 0))
            out.append(encode(_two_cols(f"  - {method_label}", f"{_money(amt)} so'm", width)) + b'\n')

    out += [ALIGN_CENTER]
    out.append(encode('=' * width) + b'\n')
    if phone:
        out.append(encode(f"Tel: {phone}") + b'\n')
    out.append(encode("Xaridingiz uchun rahmat!") + b'\n')
    if website_url:
        out.append(render_qr_code(website_url))
    out.append(encode(BRAND_FOOTER) + b'\n')
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

