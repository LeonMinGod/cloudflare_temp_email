import contextlib
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

import yifu_keys as tool


class KeyOperationsTest(unittest.TestCase):
    def test_delayed_rotation_refuses_a_changed_published_key(self):
        state = {'keys': ['new-current'], 'claim': {'apiKey': 'new-current'}, 'modules': {'claim_binding': True}}
        with patch.dict(os.environ, {'YIFU_EXPECT_CURRENT': tool.fingerprint('previous-current')}):
            with self.assertRaises(RuntimeError):
                tool.select_operation(state, 'add')
        with patch.dict(os.environ, {'YIFU_EXPECT_CURRENT': tool.fingerprint('new-current')}):
            self.assertEqual(tool.select_operation(state, 'add')['operation'], 'add')

    def test_yaml_preserves_other_settings(self):
        for content in ['api-keys: [one, two]\nport: 8317\n',
                        'api-keys:\n  - one\n  - two # keep trailing comment\nremote-management: {secret-key: unchanged}\n',
                        'access:\n  api-keys:\n    - one\n    - two\n  ws-auth: true\nserver: {port: 8317}\n',
                        'access: {api-keys: [one, two], ws-auth: true}\n']:
            before = yaml.safe_load(content)
            expected = copy.deepcopy(before)
            (expected.get('access') or expected)['api-keys'] = ['one', 'new']
            self.assertEqual(yaml.safe_load(tool.set_keys(content, ['one', 'new'])), expected)

    def test_authenticated_backup_roundtrip_and_tamper_rejection(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(tool, 'PLAN', Path(directory) / 'plan.enc'), patch.dict(os.environ, {'RENDER_API_KEY': 'test-only-management-secret'}):
            original = {'client_key': 'test-client-only', 'credentials': {'a.json': {'refresh': 'test-only'}}}
            tool.seal(original)
            encrypted = tool.PLAN.read_text()
            self.assertNotIn('test-client-only', encrypted)
            self.assertEqual(tool.unseal(), original)
            envelope = json.loads(encrypted)
            envelope['ciphertext'] = ('A' if envelope['ciphertext'][0] != 'A' else 'B') + envelope['ciphertext'][1:]
            tool.PLAN.write_text(json.dumps(envelope))
            with self.assertRaises(Exception):
                tool.unseal()

    def test_protects_last_key_and_rejects_unknown_fingerprint(self):
        state = {'keys': ['last'], 'claim': {'apiKey': 'last'}, 'modules': {'claim_binding': True}}
        with self.assertRaises(RuntimeError):
            tool.select_operation(state, 'remove')
        with self.assertRaises(RuntimeError):
            tool.select_operation(state, 'remove', target='a' * 16)

    def run_operation(self, operation, publish=True, noncurrent=False, closed=False, concurrent=False,
                      per_user=False, force_open=False):
        active = 'current-test-key'
        original_keys = ['retained-test-key', active, 'other-test-key']
        config = 'api-keys: [retained-test-key, current-test-key, other-test-key]\nport: 8317\n'
        claim = None if closed else {'baseUrl': tool.api.RENDER_ORIGIN + '/v1', 'apiKey': active}
        files = [{'name': 'auth.json', 'disabled': True}]
        bindings = [{'name': 'ASSETS', 'type': 'assets'}] + ([] if closed else [{'name': tool.SECRET, 'type': 'secret_text'}])
        manifest = {'entrypoint': 'module.js', 'files': {'module.js': 'arbitrary-live-hash'}, 'claim_binding': True}
        state = dict(keys=original_keys, claim=copy.deepcopy(claim), modules=manifest,
                     secret={'content': config}, env={'MANAGEMENT_PASSWORD': 'test-admin'}, management='test-admin',
                     files=copy.deepcopy(files), deploy={'id': 'any-current-deploy', 'commit': {'id': 'any-current-commit'}},
                     parent='any-current-parent', entrance='any-current-entrance', settings={'bindings': copy.deepcopy(bindings)})
        target = tool.fingerprint('other-test-key') if noncurrent else 'current'
        op = tool.select_operation(state, operation, publish, target)
        current = dict(config=config, keys=list(original_keys), claim=copy.deepcopy(claim), files=copy.deepcopy(files),
                       bindings=copy.deepcopy(bindings), parent='changed-elsewhere' if concurrent else state['parent'], deploy=copy.deepcopy(state['deploy']))
        mutations = []

        def render(path, method='GET', body=None):
            if path.endswith('/secret-files/config.yaml'):
                if method == 'PUT':
                    mutations.append('render-config')
                    current['config'] = body['content']
                return {'content': current['config']}
            if path.endswith('/deploys') and method == 'POST':
                mutations.append('render-deploy')
                current['keys'] = tool.keys_from(yaml.safe_load(current['config']))
                current['files'] = []
                current['deploy'] = {'id': 'new-deploy', 'status': 'live', 'commit': {'id': 'any-current-commit'}}
                return current['deploy']
            if '/deploys/' in path:
                return current['deploy']
            if '/env-vars?' in path:
                return [{'envVar': {'key': key, 'value': value}} for key, value in state['env'].items()]
            raise AssertionError('Unexpected Render operation')

        def cf(path, method='GET', body=None):
            if path == 'leonmingod-home/secrets/' + tool.SECRET and method == 'DELETE':
                mutations.append('disable-website')
                current['claim'] = None
                current['bindings'] = [b for b in current['bindings'] if b['name'] != tool.SECRET]
                current['parent'] = 'disabled-version'
            elif path == 'leonmingod-home/secrets' and method == 'PUT':
                mutations.append('publish-key')
                current['claim'] = {'baseUrl': tool.api.RENDER_ORIGIN + '/v1', 'apiKey': body['text']}
                current['bindings'] = [b for b in current['bindings'] if b['name'] != tool.SECRET] + [{'name': tool.SECRET, 'type': 'secret_text'}]
                current['parent'] = 'published-version'
            elif path == 'leonmingod-home/settings':
                return {'bindings': current['bindings']}
            else:
                raise AssertionError('Unexpected CF operation; source uploads are forbidden')
            return {}

        def management(key, path, method='GET', body=None):
            if path == 'credentials':
                return json.dumps({'files': current['files']}).encode()
            if path == 'credentials?name=auth.json' and method == 'POST':
                current['files'].append({'name': 'auth.json', 'disabled': False})
            elif path == 'credentials/status' and method == 'PATCH':
                current['files'][0]['disabled'] = body['disabled']
            else:
                raise AssertionError('Unexpected credentials operation')
            return b'{}'

        def models(key):
            if key not in current['keys']:
                raise RuntimeError('GET /v1/models: HTTP 401')
            return 34

        plan = dict(state=state, op=op, backups={'auth.json': '{}'} if op['render_change'] else {}, visuals={'page': 'unchanged'})

        def public_claim():
            tool._per_user_claim = bool(per_user) and current['claim'] is None
            return current['claim']

        def website_open():
            if per_user or force_open:
                return True
            return current['claim'] is not None

        with tempfile.TemporaryDirectory() as directory, patch.object(tool, 'public_claim', public_claim), \
             patch.object(tool, 'modules', lambda: manifest), patch.object(tool, 'snapshot', lambda: plan['visuals']), \
             patch.object(tool, 'Path', lambda name: Path(directory) / name), \
             patch.multiple(tool.api, render=render, cf=cf, management_request=management, models=models,
                            active=lambda worker: current['parent'] if worker == 'leonmingod-home' else state['entrance'],
                            latest_deploy=lambda: current['deploy'], request=lambda url, *a, **kw: (200, {}, json.dumps({'open': website_open()}).encode() if url.endswith('/api/free-token/status') else b'{}')), \
             contextlib.redirect_stdout(io.StringIO()):
            if concurrent:
                with self.assertRaises(AssertionError):
                    tool.apply(plan)
                self.assertEqual(mutations, [])
                return
            tool.apply(plan)
        self.assertEqual(current['files'], files)
        self.assertEqual(yaml.safe_load(current['config'])['port'], 8317)
        self.assertIn('retained-test-key', current['keys'])
        if operation == 'add':
            self.assertEqual(set(current['keys']), set(original_keys + [op['target']]))
            if publish:
                self.assertEqual(current['claim']['apiKey'], op['target'])
            else:
                self.assertEqual(current['claim'], claim)
        elif closed:
            self.assertEqual(current['keys'], original_keys)
            self.assertEqual(mutations, [])
        else:
            self.assertNotIn(op['target'], current['keys'])
            self.assertEqual(current['claim'], state['claim'] if noncurrent else None)

    def test_add_and_publish(self):
        self.run_operation('add')

    def test_add_without_changing_website(self):
        self.run_operation('add', publish=False)

    def test_add_reopens_a_closed_website(self):
        self.run_operation('add', closed=True)

    def test_custom_standalone_key_preserves_closed_website(self):
        with patch.dict(os.environ, {'YIFU_USE_CUSTOM_KEY': 'true', 'YIFU_CUSTOM_PREFIX': 'sk-test', 'YIFU_CUSTOM_DIGITS': '8'}):
            self.run_operation('add', publish=False, closed=True)

    def test_custom_key_cannot_publish_and_retries_do_not_duplicate(self):
        state = {'keys': ['sk-test-12345678'], 'claim': None, 'modules': {'claim_binding': True}}
        with patch.dict(os.environ, {'YIFU_USE_CUSTOM_KEY': 'true', 'YIFU_CUSTOM_PREFIX': 'sk-test', 'YIFU_CUSTOM_DIGITS': '8'}), patch.object(tool.secrets, 'randbelow', return_value=12345678):
            with self.assertRaises(RuntimeError):
                tool.select_operation(state, 'add', publish=True)
            op = tool.select_operation(state, 'add', publish=False)
            self.assertFalse(op['render_change'])
            self.assertEqual(op['after_keys'], state['keys'])

    def test_invalid_custom_key_is_rejected_before_mutation(self):
        state = {'keys': ['test-key'], 'claim': None, 'modules': {'claim_binding': True}}
        with patch.dict(os.environ, {'YIFU_USE_CUSTOM_KEY': 'true', 'YIFU_CUSTOM_PREFIX': 'bad value with spaces', 'YIFU_CUSTOM_DIGITS': '8'}):
            with self.assertRaises(RuntimeError):
                tool.select_operation(state, 'add', publish=False)

    def test_standalone_delivery_is_encrypted_for_the_recipient(self):
        private = tool.rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public = private.public_key().public_bytes(tool.serialization.Encoding.PEM, tool.serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'YIFU_RECIPIENT_PUBLIC_KEY': public}), patch.object(tool, 'Path', lambda name: Path(directory) / name):
            tool.encrypt_custom_key('test-client-placeholder')
            encrypted = (Path(directory) / 'render-client-key.enc').read_bytes()
            self.assertNotIn(b'test-client-placeholder', encrypted)
            plain = private.decrypt(encrypted, tool.padding.OAEP(mgf=tool.padding.MGF1(tool.hashes.SHA256()), algorithm=tool.hashes.SHA256(), label=None))
            self.assertEqual(plain, b'test-client-placeholder')

    def test_remove_published_key_and_stop_issuance(self):
        self.run_operation('remove')

    def test_remove_another_key_preserves_issued_key(self):
        self.run_operation('remove', noncurrent=True)

    def test_closed_website_remove_is_idempotent(self):
        self.run_operation('remove', closed=True)

    def test_per_user_flow_accepts_open_without_a_shared_key(self):
        self.run_operation('add', publish=False, closed=True, per_user=True)

    def test_open_without_per_user_flow_still_fails(self):
        with self.assertRaises(AssertionError) as error:
            self.run_operation('add', publish=False, closed=True, force_open=True)
        self.assertIn('Token click mode did not follow the issued key', str(error.exception))

    def test_concurrent_change_aborts_before_mutation(self):
        self.run_operation('add', concurrent=True)


if __name__ == '__main__':
    unittest.main()
