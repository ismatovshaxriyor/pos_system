from unittest.mock import patch
from django.test import TestCase

from core.escpos import ensure_subnet_alias


class EscposSubnetAliasTests(TestCase):
    @patch('subprocess.run')
    def test_ensure_subnet_alias_valid_ip(self, mock_run):
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "192.168.10.50/24"

        # Should attempt auto-aliasing gracefully
        ensure_subnet_alias("192.168.123.100")
        self.assertTrue(mock_run.called)

    def test_ensure_subnet_alias_loopback_ignored(self):
        with patch('subprocess.run') as mock_run:
            ensure_subnet_alias("127.0.0.1")
            self.assertFalse(mock_run.called)
