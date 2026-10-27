import os
import unittest
from unittest.mock import patch, Mock
from backend import asaas
class TestAsaas(unittest.TestCase):
    def setUp(self): asaas._probe.cache_clear()
    @patch.dict(os.environ, {'VERCEL_ENV':'production','ASAAS_SANDBOX_API_KEY':'test'})
    @patch.object(asaas.requests, 'get')
    def test_production_disabled(self, get):
        self.assertEqual(asaas.check_sandbox_connection()['status'], 'disabled');get.assert_not_called()
    @patch.dict(os.environ, {'VERCEL_ENV':'preview','ASAAS_SANDBOX_API_KEY':''})
    @patch.object(asaas.requests, 'get')
    def test_missing_key(self, get):
        self.assertEqual(asaas.check_sandbox_connection()['status'], 'not_configured');get.assert_not_called()
    @patch.dict(os.environ, {'VERCEL_ENV':'preview','ASAAS_SANDBOX_API_KEY':'test'})
    @patch.object(asaas.requests, 'get')
    def test_connected_without_exposing_financial_data(self, get):
        get.return_value=Mock(status_code=200,json=Mock(return_value={'balance':12345}))
        self.assertEqual(asaas.check_sandbox_connection(),{'environment':'sandbox','status':'connected','payments_enabled':False})
        self.assertEqual(get.call_args.args[0],'https://api-sandbox.asaas.com/v3/finance/balance')
        self.assertFalse(get.call_args.kwargs['allow_redirects'])
    @patch.dict(os.environ, {'VERCEL_ENV':'preview','ASAAS_SANDBOX_API_KEY':'test'})
    @patch.object(asaas.requests, 'get')
    def test_rejected_key(self, get):
        get.return_value=Mock(status_code=401)
        self.assertEqual(asaas.check_sandbox_connection()['status'],'credentials_rejected')
    @patch.dict(os.environ, {'VERCEL_ENV':'preview','ASAAS_SANDBOX_API_KEY':'test'})
    @patch.object(asaas.requests, 'get',side_effect=asaas.requests.Timeout('sensitive'))
    def test_failure_no_leak(self, get):
        self.assertEqual(asaas.check_sandbox_connection()['status'],'unavailable')
if __name__=='__main__': unittest.main()
