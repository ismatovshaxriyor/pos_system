from django.core.management.base import BaseCommand
from licensing.tasks import send_heartbeat


class Command(BaseCommand):
    help = "Ona serverga darhol heartbeat va metrikalarni yuboradi (versiya va statusni yangilash uchun)."

    def handle(self, *args, **options):
        self.stdout.write("Ona serverga heartbeat yuborilmoqda...")
        send_heartbeat()
        self.stdout.write(self.style.SUCCESS("Heartbeat muvaffaqiyatli yuborildi."))
