from django.core.cache import cache
from django.db import models

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
    hardware_hash = models.CharField(max_length=128)

    restaurant_id = models.UUIDField(null=True, blank=True)
    restaurant_name = models.CharField(max_length=200, blank=True, default='')

    token_expires_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    last_renewed_at = models.DateTimeField(null=True, blank=True)

    is_blocked = models.BooleanField(default=False)
    blocked_reason = models.CharField(max_length=50, blank=True, default='', choices=BLOCK_REASON_CHOICES)

    updated_at = models.DateTimeField(auto_now=True)

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
