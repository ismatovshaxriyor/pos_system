from whitenoise.storage import CompressedManifestStaticFilesStorage


class LenientManifestStaticFilesStorage(CompressedManifestStaticFilesStorage):
    """
    `manifest_strict = False`: manifestda yo'q yo'l uchun ValueError (500)
    o'rniga oddiy (hashsiz) URL qaytaradi.

    Sabab: django-jazzmin `admin/base.html` da `{% static 'vendor/bootswatch' %}`
    chaqiradi - bu FAYL emas, PAPKA, shuning uchun `collectstatic` uni
    manifestga hech qachon yozmaydi va qat'iy rejimda har bir admin sahifa
    (login'dan tashqari) "Missing staticfiles manifest entry" bilan 500 beradi.
    Haqiqiy fayllar (CSS/JS) baribir hashlanadi va keshlanadi.
    """

    manifest_strict = False
