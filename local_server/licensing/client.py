import requests
from django.conf import settings

DEFAULT_TIMEOUT = 10


class OnaClient:
    """
    Ona (cloud) serverga so'rov yuboruvchi yupqa client. Barcha metodlar
    `requests.RequestException` ni chaqiruvchiga tarqatadi - tarmoq/oflayn
    xatolarini qayta ishlash chaqiruvchi (task) zimmasida.
    """

    def __init__(self, base_url=None, timeout=DEFAULT_TIMEOUT):
        self.base_url = (base_url or settings.ONA_SERVER_URL).rstrip('/')
        self.timeout = timeout

    def _url(self, path):
        return f"{self.base_url}{path}"

    def _auth_headers(self, license_key):
        return {"Authorization": f"Token {license_key}"}

    def activate(self, license_key, hardware_hash, app_version=''):
        response = requests.post(
            self._url('/api/sync/activate/'),
            json={
                "license_key": license_key,
                "hardware_hash": hardware_hash,
                "app_version": app_version,
            },
            timeout=self.timeout,
        )
        return response

    def renew(self, license_key, hardware_hash):
        response = requests.post(
            self._url('/api/sync/renew/'),
            json={"hardware_hash": hardware_hash},
            headers=self._auth_headers(license_key),
            timeout=self.timeout,
        )
        return response

    def heartbeat(self, license_key, metrics):
        response = requests.post(
            self._url('/api/sync/heartbeat/'),
            json=metrics,
            headers=self._auth_headers(license_key),
            timeout=self.timeout,
        )
        return response

    def post_command_result(self, license_key, command_id, status, result=None):
        response = requests.post(
            self._url(f'/api/sync/commands/{command_id}/result/'),
            json={"status": status, "result": result or {}},
            headers=self._auth_headers(license_key),
            timeout=self.timeout,
        )
        return response

    def post_error_logs(self, license_key, events):
        response = requests.post(
            self._url('/api/sync/error-logs/'),
            json={"events": events},
            headers=self._auth_headers(license_key),
            timeout=self.timeout,
        )
        return response

    def post_orders(self, license_key, orders_data):
        response = requests.post(
            self._url('/api/sync/orders/'),
            json={"orders": orders_data},
            headers=self._auth_headers(license_key),
            timeout=self.timeout,
        )
        return response
