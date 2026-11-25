import contextlib
import io
import os
import unittest
from unittest.mock import patch

import cpa_abuse_guard as guard
import yifu_keys as tool

BASE = tool.api.RENDER_ORIGIN + '/v1'


class PublicClaimTest(unittest.TestCase):
    def claim(self, value):
        out = io.StringIO()
        with patch.object(tool.api, 'site_claim', value), contextlib.redirect_stdout(out):
            return tool.public_claim(), out.getvalue()

    def test_legacy_shared_key_still_returned(self):
        data = {'baseUrl': BASE, 'apiKey': 'sk-legacy-secret'}
        self.assertEqual(self.claim(lambda: data)[0], data)
        self.assertFalse(tool._per_user_claim)

    def test_per_user_flow_is_not_a_shared_key(self):
        result, output = self.claim(lambda: {'ok': True, 'next': 'email'})
        self.assertIsNone(result)
        self.assertTrue(tool._per_user_claim)
        self.assertIn('CLAIM_FLOW=per-user', output)

    def test_unexpected_shape_is_not_fatal_and_hides_values(self):
        result, output = self.claim(lambda: {'apiKey': 'sk-should-not-print', 'baseUrl': 'https://x'})
        self.assertIsNone(result)
        self.assertFalse(tool._per_user_claim)
        self.assertIn('Unexpected claim response shape', output)
        self.assertNotIn('sk-should-not-print', output)

    def test_closed_issuance(self):
        def closed():
            raise RuntimeError('POST /api/free-token/claim: HTTP 503')
        self.assertIsNone(self.claim(closed)[0])
        self.assertFalse(tool._per_user_claim)


class DeployVerificationTest(unittest.TestCase):
    def test_all_client_keys_checked_without_printing(self):
        seen = []
        out = io.StringIO()
        with patch.object(guard.api, 'models', lambda key: seen.append(key) or 7), contextlib.redirect_stdout(out):
            self.assertEqual(guard.verify_client_keys({'keys': ['sk-a-secret', 'sk-b-secret'], 'claim': None}), 7)
        self.assertEqual(seen, ['sk-a-secret', 'sk-b-secret'])
        self.assertIn('CPA_CLIENT_KEYS_VERIFIED=2', out.getvalue())
        self.assertNotIn('secret', out.getvalue())

    def test_fails_closed(self):
        def bad(key):
            raise RuntimeError('GET /v1/models: HTTP 401')
        with patch.object(guard.api, 'models', bad):
            with self.assertRaises(RuntimeError) as error:
                guard.verify_client_keys({'keys': ['sk-a-secret']})
        self.assertNotIn('sk-a-secret', str(error.exception))
        with self.assertRaises(RuntimeError):
            guard.verify_client_keys({'keys': []})

    def run_deploy(self, models, test_key=None):
        calls = []
        state = {'keys': ['sk-a-secret'], 'claim': None, 'management': 'm', 'files': []}
        stubs = dict(
            service=lambda: {'autoDeploy': 'no'},
            download_credentials=lambda s: {'a.json': '{}'},
            seal_backup=lambda s, c: calls.append('seal'),
            rpc=lambda p, admin=True: calls.append('rpc:' + p['action']) or {'config': {'enabled': True}},
            update_guard_environment=lambda url: calls.append('env'),
            worker_url=lambda: 'https://guard',
            wait_deploy=lambda i, c: calls.append('deployed'),
            restore_credentials=lambda s, c: calls.append('restore'),
            verify_observe_mode=lambda: None, verify_health_exemption=lambda: None, verify_enforcement=lambda: None,
            status_request=lambda *a, **k: (200, b''),
            set_auto_deploy=lambda v: calls.append('autoDeploy:' + v),
            print_status=lambda r: None,
        )
        out = io.StringIO()
        env = {'CPA_EXPECTED_COMMIT': 'a' * 40}
        if test_key is not None:
            env['CPA_TEST_CLIENT_KEY'] = test_key
        with contextlib.ExitStack() as stack:
            for name, value in stubs.items():
                stack.enter_context(patch.object(guard, name, value))
            stack.enter_context(patch.object(guard.yifu_keys, 'read_state', lambda: state))
            stack.enter_context(patch.object(guard.api, 'render', lambda *a, **k: {'id': 'dep-1'}))
            stack.enter_context(patch.object(guard.api, 'models', models))
            stack.enter_context(patch.dict(os.environ, env))
            if test_key is None:
                os.environ.pop('CPA_TEST_CLIENT_KEY', None)
            stack.enter_context(contextlib.redirect_stdout(out))
            try:
                guard.deploy()
                return calls, None, out.getvalue()
            except RuntimeError as error:
                return calls, error, out.getvalue()

    def test_deploy_succeeds_without_shared_claim_key(self):
        calls, error, output = self.run_deploy(lambda key: 5)
        self.assertIsNone(error)
        self.assertEqual(calls[-2:], ['restore', 'autoDeploy:yes'])
        self.assertNotIn('rpc:disable', calls[calls.index('rpc:enable'):])
        self.assertNotIn('CPA_TEST_CLIENT_VERIFIED', output)

    def test_optional_test_client_is_checked_without_printing(self):
        seen = []
        calls, error, output = self.run_deploy(lambda key: seen.append(key) or 3, test_key='sk-test-client-secret')
        self.assertIsNone(error)
        self.assertEqual(seen, ['sk-a-secret', 'sk-test-client-secret'])
        self.assertIn('CPA_TEST_CLIENT_VERIFIED=1', output)
        self.assertNotIn('sk-test-client-secret', output)
        self.assertEqual(calls[-2:], ['restore', 'autoDeploy:yes'])

    def test_blank_test_client_is_skipped(self):
        seen = []
        calls, error, output = self.run_deploy(lambda key: seen.append(key) or 3, test_key='   ')
        self.assertIsNone(error)
        self.assertEqual(seen, ['sk-a-secret'])
        self.assertNotIn('CPA_TEST_CLIENT_VERIFIED', output)

    def test_optional_test_client_failure_still_restores(self):
        def models(key):
            if key == 'sk-test-client-secret':
                raise RuntimeError('GET /v1/models: HTTP 401')
            return 3
        calls, error, output = self.run_deploy(models, test_key='sk-test-client-secret')
        self.assertIsNotNone(error)
        self.assertNotIn('sk-test-client-secret', str(error))
        self.assertNotIn('sk-test-client-secret', output)
        self.assertEqual(calls[-3:], ['restore', 'rpc:disable', 'autoDeploy:yes'])

    def test_failed_models_check_still_restores_and_disables(self):
        def bad(key):
            raise RuntimeError('GET /v1/models: HTTP 502')
        calls, error, _output = self.run_deploy(bad)
        self.assertIsNotNone(error)
        self.assertEqual(calls[-3:], ['restore', 'rpc:disable', 'autoDeploy:yes'])

    def test_expected_commit_still_required(self):
        with patch.dict(os.environ, {'CPA_EXPECTED_COMMIT': 'short'}), self.assertRaises(RuntimeError):
            guard.deploy()


class GuardEnvironmentTest(unittest.TestCase):
    URL = 'https://guard.example.workers.dev'

    def render(self, stored, puts):
        def render(path, method='GET', body=None):
            if method == 'PUT' and '/env-vars/' in path:
                key = path.rsplit('/', 1)[-1]
                puts.append(key)
                stored[key] = body['value']
                return {}
            if path.endswith('/env-vars?limit=100'):
                return [{'envVar': {'key': key, 'value': value}} for key, value in stored.items()]
            raise AssertionError('Unexpected Render operation')
        return render

    def test_remote_key_auth_is_put_and_verified(self):
        stored = {'MANAGEMENT_PASSWORD': 'keep-me-secret'}
        puts = []
        out = io.StringIO()
        with patch.object(guard.api, 'render', self.render(stored, puts)), \
             patch.object(guard, 'derive', lambda label: 'derived-secret-value'), \
             patch.dict(os.environ, {'RENDER_API_KEY': 'management-secret-value'}), \
             contextlib.redirect_stdout(out):
            guard.update_guard_environment(self.URL)
        self.assertEqual(puts, ['CPA_ABUSE_URL', 'CPA_ABUSE_SECRET', 'CPA_REMOTE_KEY_AUTH'])
        self.assertEqual(stored['CPA_REMOTE_KEY_AUTH'], '1')
        self.assertEqual(stored['CPA_ABUSE_URL'], self.URL)
        self.assertEqual(stored['CPA_ABUSE_SECRET'], 'derived-secret-value')
        self.assertEqual(stored['MANAGEMENT_PASSWORD'], 'keep-me-secret')
        text = out.getvalue()
        self.assertNotIn('derived-secret-value', text)
        self.assertNotIn('keep-me-secret', text)
        self.assertNotIn('management-secret-value', text)
        self.assertIn('"preserved_env_vars": 1', text)

    def test_remote_key_auth_must_persist(self):
        stored = {}
        puts = []

        def render(path, method='GET', body=None):
            if method == 'PUT' and '/env-vars/' in path:
                key = path.rsplit('/', 1)[-1]
                puts.append(key)
                if key != 'CPA_REMOTE_KEY_AUTH':
                    stored[key] = body['value']
                return {}
            if path.endswith('/env-vars?limit=100'):
                return [{'envVar': {'key': key, 'value': value}} for key, value in stored.items()]
            raise AssertionError('Unexpected Render operation')

        with patch.object(guard.api, 'render', render), \
             patch.object(guard, 'derive', lambda label: 'derived-secret-value'), \
             patch.dict(os.environ, {'RENDER_API_KEY': 'management-secret-value'}):
            with self.assertRaises(RuntimeError) as error:
                guard.update_guard_environment(self.URL)
        self.assertIn('CPA_REMOTE_KEY_AUTH', puts)
        self.assertNotIn('derived-secret-value', str(error.exception))
        self.assertNotIn('1', str(error.exception))


if __name__ == '__main__':
    unittest.main()
