from django.http.request import validate_host
from django.test import SimpleTestCase

from config.hosts import PrivateLANHost, is_private_lan_ip


class PrivateLANHostTests(SimpleTestCase):
    """Restoran tarmog'idagi ilovalar Bola'ga IP orqali ulana olishi (Host sarlavhasi rad etilmasligi)."""

    patterns = [PrivateLANHost()]

    def test_private_ipv4_literals_allowed(self):
        for host in ('192.168.1.50', '192.168.0.1', '10.0.0.7', '10.255.255.254', '172.16.0.4', '172.31.255.1'):
            with self.subTest(host=host):
                self.assertTrue(validate_host(host, self.patterns))

    def test_public_and_lookalike_hosts_rejected(self):
        for host in (
            '8.8.8.8',
            '172.32.0.1',
            '172.15.255.255',
            '192.169.1.1',
            '192.168.1.50.evil.com',
            'evil.com',
            'private-lan',
            '192.168.1.999',
            '',
            '::1',
        ):
            with self.subTest(host=host):
                self.assertFalse(validate_host(host, self.patterns))

    def test_star_literal_not_matched(self):
        # Django `pattern == "*"` ni ham tekshiradi - bizning naqsh '*' ga mos kelmasligi kerak.
        self.assertFalse(PrivateLANHost() == '*')

    def test_helper(self):
        self.assertTrue(is_private_lan_ip('192.168.1.1'))
        self.assertFalse(is_private_lan_ip('example.com'))

    def test_wired_into_settings(self):
        from django.conf import settings

        if '*' in settings.ALLOWED_HOSTS:
            self.skipTest("ALLOWED_HOSTS='*' - tekshiruv ma'nosiz")
        self.assertTrue(validate_host('192.168.1.50', settings.ALLOWED_HOSTS))
        self.assertTrue(validate_host('pos-bola.local', settings.ALLOWED_HOSTS))
        self.assertFalse(validate_host('8.8.8.8', settings.ALLOWED_HOSTS))
        self.assertFalse(validate_host('evil.com', settings.ALLOWED_HOSTS))
