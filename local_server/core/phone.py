import re

_PHONE_RE = re.compile(r'^\+?(998)?\d{9}$')


def normalize_phone(value):
    """
    `xxxxxxxxx`, `998xxxxxxxxx`, `+998xxxxxxxxx` (probel/tire/qavs bilan ham) -> `+998xxxxxxxxx`.

    Mobil ilova telefonni har doim shu yagona ko'rinishda yuboradi (`@pos/shared::normalizePhone`),
    shuning uchun bazada username boshqacha saqlangan bo'lsa "parol xato" chiqadi. Telefonga o'xshamagan
    qiymat (masalan `admin`) o'zgarmaydi.
    """
    if not isinstance(value, str):
        return value
    compact = re.sub(r'[\s\-()]', '', value)
    if not _PHONE_RE.match(compact):
        return value
    return '+998' + compact[-9:]
