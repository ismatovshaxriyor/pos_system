import uuid
from datetime import datetime, UTC

from django.core.cache import cache
from django.db import models
from django.utils.dateparse import parse_datetime
from simple_history.models import HistoricalRecords

LICENSE_VERIFY_CACHE_KEY = 'license:verify'

BLOCK_REASON_CHOICES = (
    ('remote_command', "Onadan bloklandi"),
    ('license_inactive', "Litsenziya nofaol"),
)


class LicenseState(models.Model):
    """
    Bola serverning litsenziya holatini saqlaydigan singleton jadval (pk har
    doim 1). Postgres volume orqali konteyner qayta yaratilganda saqlanadi va
    web/celery_worker/celery_beat konteynerlari o'rtasida umumiy bo'ladi.
    """
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)

    license_key = models.CharField(max_length=40)
    jwt_token = models.TextField(blank=True, default='')
    # Ona bitta so'rovda bir nechta ketma-ket tokenni oldindan imzolab
    # beradi ([{"token": str, "expires_at": iso str}, ...], eng ilgari
    # boshlanadigani birinchi). `jwt_token` muddati tugaganda, mahalliy
    # ravishda (Onaga so'rov yubormasdan) shu ro'yxatdan navbatdagisi
    # faollashtiriladi - qarang: current_valid_token().
    pending_tokens = models.JSONField(default=list, blank=True)
    hardware_hash = models.CharField(max_length=128)

    # Ona faollashtirish javobida qaytaradi (sync/views.py::ActivationView) -
    # LICENSE_PUBLIC_KEY_FILE'ni har bir Bola'ga qo'lda nusxalash o'rniga.
    # Bo'sh bo'lsa verify_token() settings.LICENSE_PUBLIC_KEY'ga (statik
    # fayl/env) qaytadi - qarang: licensing/jwt_utils.py.
    public_key = models.TextField(blank=True, default='')

    restaurant_id = models.UUIDField(null=True, blank=True)
    restaurant_name = models.CharField(max_length=200, blank=True, default='')

    token_expires_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    last_renewed_at = models.DateTimeField(null=True, blank=True)

    is_blocked = models.BooleanField(default=False)
    blocked_reason = models.CharField(max_length=50, blank=True, default='', choices=BLOCK_REASON_CHOICES)

    updated_at = models.DateTimeField(auto_now=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "Litsenziya holati"
        verbose_name_plural = "Litsenziya holati"

    def __str__(self):
        return self.restaurant_name or "Faollashtirilmagan"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        cache.delete(LICENSE_VERIFY_CACHE_KEY)

    @classmethod
    def load(cls):
        return cls.objects.filter(pk=1).first()

    @property
    def furthest_expiry(self):
        """
        `jwt_token` + navbatdagi `pending_tokens`ning eng uzoq muddatlisi -
        renewal'ni qachon so'rash kerakligini shu asosda hisoblaymiz (faqat
        joriy tokenga qarasak, navbatda hali ishlatilmagan tokenlar bo'lsa
        ham keraksiz erta yangilanish so'rovi yuborilar edi).
        """
        expiries = [self.token_expires_at] if self.token_expires_at else []
        expiries += [parse_datetime(item['expires_at']) for item in self.pending_tokens]
        return max(expiries) if expiries else None

    def current_valid_token(self, hardware_hash):
        """
        `jwt_token` hali yaroqli bo'lsa shuni tekshiradi. Muddati tugagan/
        yaroqsiz bo'lsa, oldindan Onadan olib qo'yilgan `pending_tokens`
        ro'yxatidan navbatdagi yaroqli tokenni butunlay OFLAYN qidirib
        topadi va uni `jwt_token` qilib faollashtiradi (endi kerak bo'lmagan
        avvalgi tokenlarni ro'yxatdan tashlab). Shu bilan Ona haftalar
        davomida qayta ulanmasa ham, oldindan berilgan tokenlar tugamaguncha
        tizim ishlashda davom etadi.

        Qaytaradi: (claims dict, None) muvaffaqiyatli bo'lsa, aks holda
        (None, LicenseTokenError).
        """
        from .jwt_utils import LicenseTokenError, verify_token

        candidates = [self.jwt_token] + [
            item['token'] for item in sorted(self.pending_tokens, key=lambda i: i['expires_at'])
        ]

        last_error = LicenseTokenError("Token mavjud emas.")
        for index, token in enumerate(candidates):
            if not token:
                continue
            try:
                claims = verify_token(token, hardware_hash)
            except LicenseTokenError as exc:
                last_error = exc
                continue

            if index > 0:
                self.jwt_token = token
                self.token_expires_at = datetime.fromtimestamp(claims['exp'], tz=UTC)
                self.pending_tokens = [
                    item for item in self.pending_tokens if item['token'] not in candidates[:index + 1]
                ]
                self.save()

            return claims, None

        return None, last_error


class ErrorLog(models.Model):
    """
    Django logging orqali ushlangan ERROR/CRITICAL darajadagi voqealar
    (DatabaseErrorLogHandler tomonidan yoziladi). send_error_logs Celery
    vazifasi orqali Onaga partiyalab yuboriladi - heartbeat'dan butunlay
    mustaqil, shu yerdagi muammo litsenziya/buyruq oqimiga ta'sir qilmasligi
    kerak. BaseModel'ga ataylab meros qilinmagan - uning sync_uuid/is_synced
    jufti kelajakdagi umumiy biznes-ma'lumot sinxronizatsiyasi uchun
    ajratilgan ma'no, bu yerda qayta ishlatish chalkashtiradi.
    """
    LEVEL_CHOICES = (
        ('ERROR', 'ERROR'),
        ('CRITICAL', 'CRITICAL'),
    )

    event_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, db_index=True)
    logger_name = models.CharField(max_length=200, blank=True, default='')
    message = models.TextField()
    traceback = models.TextField(blank=True, default='')
    module = models.CharField(max_length=200, blank=True, default='')
    func_name = models.CharField(max_length=200, blank=True, default='')
    line_no = models.PositiveIntegerField(null=True, blank=True)
    occurred_at = models.DateTimeField(db_index=True)
    is_reported = models.BooleanField(default=False, db_index=True)
    reported_at = models.DateTimeField(null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "Xato jurnali"
        verbose_name_plural = "Xato jurnali"
        ordering = ['-occurred_at']
        indexes = [models.Index(fields=['is_reported', 'occurred_at'])]

    def __str__(self):
        return f"[{self.level}] {self.occurred_at:%Y-%m-%d %H:%M} - {self.message[:60]}"
