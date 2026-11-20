"""`update_app` buyrug'i yuklamasi: qachon o'rnatilishi (oyna yoki majburiy)."""

UPDATE_MODE_WINDOW = 'window'
UPDATE_MODE_FORCE = 'force'
UPDATE_MODES = (UPDATE_MODE_WINDOW, UPDATE_MODE_FORCE)


def update_payload(restaurant, version, mode=UPDATE_MODE_WINDOW):
    """
    `window` - Bola faqat restoranning yangilanish oynasida va ochiq buyurtma bo'lmaganda o'rnatadi.
    `force` - oynani va xavfsiz-holat tekshiruvini chetlab o'tib, darhol o'rnatadi.
    Oyna buyruq yaratilgan paytdagi qiymat bilan yuboriladi (Bola Ona'ga qayta so'ramaydi).
    """
    if mode not in UPDATE_MODES:
        mode = UPDATE_MODE_WINDOW
    payload = {"version": version, "mode": mode}
    if mode == UPDATE_MODE_WINDOW:
        payload["window"] = {
            "start": restaurant.update_window_start.strftime('%H:%M'),
            "end": restaurant.update_window_end.strftime('%H:%M'),
        }
    return payload
