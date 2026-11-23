"""
Xodim ilovasining yangi versiyasini (APK yoki Windows EXE) e'lon qiladi: faylni saqlaydi va `MobileApp`
qator(lar)ini yangilaydi. Bolalar uni keyingi heartbeat'da ko'radi (`sync.views._app_releases`).

Asosan `.github/workflows/release-staff-apps.yml` ishlatadi: fayl SSH orqali stdin'dan keladi, chunki
Cloudflare 100 MB dan katta yuklashni admin paneliga o'tkazmaydi (kassa EXE ~100 MB).

    docker compose -f docker-compose.prod.yml exec -T web python manage.py publish_mobile_app \
        --slug ofitsiant --slug manager --platform android --app-version 1.2.4 \
        --filename HamrohPOS-Xodim-1.2.4.apk --sha256 <hex> [--required] [--note "..."] < fayl.apk

Himoyalar:
- `--sha256` majburiy: yo'lda uzilgan yoki buzilgan fayl e'lon qilinmaydi.
- Xuddi shu versiya va xuddi shu sha256 allaqachon turgan bo'lsa, hech narsa qilinmaydi. Shuning uchun
  workflow'ni qayta ishga tushirish xavfsiz, fayl o'qilmaydi ham.
- Pastroq versiya, yoki shu versiya boshqa fayl bilan, `--force` siz rad etiladi: ilovalar versiya raqamiga
  qarab yangilanadi, raqami o'zgarmagan yangi fayl ularga hech qachon yetib bormaydi.
"""
import hashlib
import os
import re
import sys
import uuid
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import get_valid_filename

from tenants.models import MobileApp

EXTENSIONS = {'android': ('.apk',), 'windows': ('.exe', '.msi')}
# Qator hali yo'q bo'lsa (yangi Ona) shu nomlar bilan yaratiladi; keyin admin panelda o'zgartirish mumkin.
DEFAULT_NAMES = {
    'kassir': ('Kassir', "Kassa va to'lovlar"),
    'ofitsiant': ('Ofitsiant', 'Buyurtmalar va stollar'),
    'manager': ('Menejer', 'Boshqaruv va hisobotlar'),
}
MAX_BYTES = 1024 * 1024 * 1024  # Bola ham 1 GB dan kattasini yuklamaydi (licensing/appupdates.py)
CHUNK = 1024 * 1024


def version_key(version):
    parts = tuple(int(n) for n in re.findall(r'\d+', version or ''))
    return parts + (0,) * (4 - len(parts))


class Command(BaseCommand):
    help = "Xodim ilovasining yangi versiyasini (stdin yoki --file dan) e'lon qiladi."

    def add_arguments(self, parser):
        parser.add_argument('--slug', action='append', required=True,
                            help="MobileApp.slug, bir necha marta berish mumkin (masalan ofitsiant va manager)")
        parser.add_argument('--platform', required=True, choices=sorted(EXTENSIONS))
        parser.add_argument('--app-version', dest='app_version', required=True, help="masalan 1.2.4 (--version Django'ning o'zida band)")
        parser.add_argument('--filename', required=True, help="Saqlanadigan fayl nomi, masalan HamrohPOS-Xodim-1.2.4.apk")
        parser.add_argument('--sha256', required=True, help="Faylning kutilgan sha256 yig'indisi (hex)")
        parser.add_argument('--file', default='-', help="Fayl yo'li; '-' yoki berilmasa stdin")
        parser.add_argument('--required', action='store_true', help="Majburiy yangilanish")
        parser.add_argument('--note', action='append', default=[], help="O'zgarishlar ro'yxatining bir qatori")
        parser.add_argument('--min-os', default=None)
        parser.add_argument('--force', action='store_true',
                            help="Pastroq versiyani yoki shu versiyani boshqa fayl bilan ham e'lon qilish")

    def handle(self, *args, **opts):
        platform = opts['platform']
        version = opts['app_version'].strip()
        expected = opts['sha256'].strip().lower()
        slugs = list(dict.fromkeys(s.strip() for s in opts['slug'] if s.strip()))
        filename = get_valid_filename(os.path.basename(opts['filename']))
        if not re.fullmatch(r'\d+(\.\d+){1,3}', version):
            raise CommandError(f"Versiya X.Y.Z ko'rinishida bo'lishi kerak: {version!r}")
        if not re.fullmatch(r'[0-9a-f]{64}', expected):
            raise CommandError("--sha256 64 belgili hex bo'lishi kerak.")
        if not filename.lower().endswith(EXTENSIONS[platform]):
            raise CommandError(f"{platform} uchun fayl kengaytmasi {', '.join(EXTENSIONS[platform])} bo'lishi kerak: {filename}")
        if not slugs:
            raise CommandError("Kamida bitta --slug kerak.")

        existing = {a.slug: a for a in MobileApp.objects.filter(platform=platform, slug__in=slugs)}
        if len(existing) == len(slugs) and all(a.version == version and a.sha256 == expected and a.is_active
                                               for a in existing.values()):
            self.stdout.write(f"{version} ({platform}) allaqachon e'lon qilingan, o'zgarish yo'q.")
            return
        if not opts['force']:
            for app in existing.values():
                if version_key(version) < version_key(app.version):
                    raise CommandError(f"{app.slug}: Ona'da yangiroq versiya bor ({app.version} > {version}). "
                                       "Versiyani oshiring yoki --force bering.")
                if app.version == version and app.sha256 and app.sha256 != expected:
                    raise CommandError(f"{app.slug}: {version} versiyasi boshqa fayl bilan e'lon qilingan. "
                                       "Versiyani oshiring (aks holda ilovalar yangilanmaydi) yoki --force bering.")

        storage = MobileApp._meta.get_field('apk_file').storage
        upload_to = MobileApp._meta.get_field('apk_file').upload_to.rstrip('/')
        directory = storage.path(upload_to)
        os.makedirs(directory, exist_ok=True)
        tmp_path = os.path.join(directory, f'.{uuid.uuid4().hex}.part')
        size = self._receive(opts['file'], tmp_path, expected)

        name = storage.get_available_name(f'{upload_to}/{filename}')
        os.replace(tmp_path, storage.path(name))
        size_mb = max((Decimal(size) / (1024 * 1024)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP), Decimal('0.1'))
        old_files = set()
        try:
            with transaction.atomic():
                for slug in slugs:
                    app = existing.get(slug)
                    if app is None:
                        title, role = DEFAULT_NAMES.get(slug, (slug.title(), ''))
                        app = MobileApp(slug=slug, platform=platform, name=title, role=role)
                    elif app.apk_file:
                        old_files.add(app.apk_file.name)
                    app.version = version
                    app.apk_file = name  # fayl allaqachon joyida: save() uni qayta yozmaydi, sha256 ni qayta hisoblamaydi
                    app.sha256 = expected
                    app.size_mb = size_mb
                    app.is_required = opts['required']
                    app.notes = [n.strip() for n in opts['note'] if n.strip()]
                    app.is_active = True
                    app.released_at = timezone.now()
                    if opts['min_os'] is not None:
                        app.min_os = opts['min_os']
                    app.save()
        except Exception:
            storage.delete(name)
            raise

        # Endi hech bir qator ishlatmayotgan eski fayllar (disk to'lib ketmasin).
        for old in old_files - {name}:
            if not MobileApp.objects.filter(apk_file=old).exists():
                storage.delete(old)

        required = ', majburiy' if opts['required'] else ''
        self.stdout.write(self.style.SUCCESS(
            f"E'lon qilindi: {', '.join(slugs)} ({platform}) {version}, {size_mb} MB{required} -> {name}"))

    def _receive(self, source, tmp_path, expected):
        digest = hashlib.sha256()
        size = 0
        stream = sys.stdin.buffer if source == '-' else open(source, 'rb')
        try:
            with open(tmp_path, 'wb') as out:
                while True:
                    chunk = stream.read(CHUNK)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise CommandError("Fayl 1 GB dan katta.")
                    digest.update(chunk)
                    out.write(chunk)
            if size == 0:
                raise CommandError("Fayl bo'sh keldi.")
            if digest.hexdigest() != expected:
                raise CommandError(f"sha256 mos kelmadi (kelgan {digest.hexdigest()}, kutilgan {expected}): "
                                   "fayl yo'lda buzilgan yoki uzilgan.")
        except BaseException:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise
        finally:
            if stream is not sys.stdin.buffer:
                stream.close()
        return size
