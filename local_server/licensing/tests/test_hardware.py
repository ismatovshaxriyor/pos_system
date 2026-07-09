from unittest.mock import patch

from django.test import TestCase, override_settings

from licensing import hardware


class HardwareFingerprintTests(TestCase):
    def setUp(self):
        hardware._cached_fingerprint = None
        self.addCleanup(self._reset_cache)

    def _reset_cache(self):
        hardware._cached_fingerprint = None

    @override_settings(HARDWARE_ID_OVERRIDE='dev-macbook')
    def test_override_is_used_and_deterministic(self):
        first = hardware.get_hardware_fingerprint()
        second = hardware.get_hardware_fingerprint()
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)  # sha256 hexdigest

    @override_settings(HARDWARE_ID_OVERRIDE='dev-a')
    def test_different_override_gives_different_hash(self):
        first = hardware.get_hardware_fingerprint()
        hardware._cached_fingerprint = None
        with override_settings(HARDWARE_ID_OVERRIDE='dev-b'):
            second = hardware.get_hardware_fingerprint()
        self.assertNotEqual(first, second)

    def test_docker_locally_administered_mac_is_rejected(self):
        # Docker bridge networks hand out 02:42:xx:xx:xx:xx MACs (locally
        # administered) that change on every container recreate - accepting
        # these as a "hardware" fingerprint would silently re-brick the
        # license on every restart/update.
        docker_mac_node = 0x0242AC110002  # 02:42:ac:11:00:02
        with patch('licensing.hardware.uuid.getnode', return_value=docker_mac_node):
            result = hardware._read_mac_address()
        self.assertIsNone(result)

    def test_real_universal_mac_is_accepted(self):
        # A real burned-in NIC MAC has both the multicast and
        # locally-administered bits unset, e.g. 00:1a:2b:3c:4d:5e.
        real_mac_node = 0x001A2B3C4D5E
        with patch('licensing.hardware.uuid.getnode', return_value=real_mac_node):
            result = hardware._read_mac_address()
        self.assertEqual(result, "001a2b3c4d5e")
