from django.core.management.base import BaseCommand, CommandError

from licensing.tasks import renew_license_token  # noqa: F401 (import sanity)
from licensing.views import ActivateView


class Command(BaseCommand):
    help = "Lokal tizimni litsenziya kaliti bilan faollashtiradi (birinchi o'rnatish uchun)."

    def add_arguments(self, parser):
        parser.add_argument('license_key', type=str, help="Ona serverdan olingan litsenziya kaliti")

    def handle(self, *args, **options):
        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post('/api/license/activate/', data={'license_key': options['license_key']})

        view = ActivateView.as_view()
        response = view(request)

        if response.status_code == 200:
            self.stdout.write(self.style.SUCCESS(response.data.get('detail', 'Faollashtirildi.')))
        else:
            raise CommandError(response.data.get('detail', 'Faollashtirish muvaffaqiyatsiz.'))
