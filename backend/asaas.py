"""Read-only Sandbox connection probe; never moves money."""
import os
import requests
from functools import lru_cache
import time

@lru_cache(maxsize=2)
def _probe(key, minute):
    try:
        response = requests.get('https://api-sandbox.asaas.com/v3/finance/balance', headers={'access_token': key, 'User-Agent': 'ServicoJa-Sandbox/1.0'}, timeout=(3, 8), allow_redirects=False)
        if response.status_code in (401, 403):
            return 'credentials_rejected'
        if response.status_code == 200:
            payload = response.json()
            if isinstance(payload, dict) and isinstance(payload.get('balance'), (int, float)):
                return 'connected'
    except (requests.RequestException, ValueError):
        pass
    return 'unavailable'

def check_sandbox_connection():
    status = 'disabled'
    if os.environ.get('VERCEL_ENV') == 'preview':
        key = os.environ.get('ASAAS_SANDBOX_API_KEY', '').strip()
        status = _probe(key, int(time.monotonic() // 60)) if key else 'not_configured'
    return {'environment': 'sandbox', 'status': status, 'payments_enabled': False}
