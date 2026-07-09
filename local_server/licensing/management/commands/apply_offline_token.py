from django.core.management.base import BaseCommand, CommandError

from licensing.views import ApplyOfflineTokenView


class Command(BaseCommand):
    help = (
        "Internet yo'q paytda Ona admin panelida generatsiya qilingan oflayn "
        "yangilash tokenini qo'lda qo'llaydi (litsenziyani tarmoqsiz yangilaydi)."
    )

    def add_arguments(self, parser):
        parser.add_argument('token', type=str, help="Ona admin panelidan olingan JWT token")

    def handle(self, *args, **options):
        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post('/api/license/apply-offline-token/', data={'token': options['token']})

        view = ApplyOfflineTokenView.as_view()
        response = view(request)

        if response.status_code == 200:
            self.stdout.write(self.style.SUCCESS(response.data.get('detail', 'Qabul qilindi.')))
        else:
            raise CommandError(response.data.get('detail', 'Token qabul qilinmadi.'))
