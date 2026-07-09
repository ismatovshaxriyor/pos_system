from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """
    Litsenziya JWT tokenlarini imzolash uchun RSA-2048 kalit juftligini generatsiya qiladi.

    Natija faylga yozilmaydi - faqat stdout'ga chiqariladi. Private keyni
    Ona serverning LICENSE_PRIVATE_KEY_FILE (yoki LICENSE_PRIVATE_KEY env)
    ga, public keyni esa Bola serverning LICENSE_PUBLIC_KEY_FILE (yoki
    LICENSE_PUBLIC_KEY env) ga qo'lda joylashtiring.

    Ekvivalent openssl buyruqlari:
        openssl genrsa -out license_private.pem 2048
        openssl rsa -in license_private.pem -pubout -out license_public.pem
    """

    help = "Litsenziya JWT tokenlari uchun RSA-2048 private/public kalit juftligini generatsiya qiladi"

    def handle(self, *args, **options):
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()

        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

        self.stdout.write(self.style.WARNING(
            "\n=== PRIVATE KEY (faqat Ona serverda saqlanadi, hech qachon Bolaga bermang) ===\n"
        ))
        self.stdout.write(private_pem)

        self.stdout.write(self.style.SUCCESS(
            "\n=== PUBLIC KEY (Bola serverga LICENSE_PUBLIC_KEY sifatida beriladi) ===\n"
        ))
        self.stdout.write(public_pem)
