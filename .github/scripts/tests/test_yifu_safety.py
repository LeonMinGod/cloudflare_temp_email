import base64
import copy
import importlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yifu_backup import encrypt_files, decrypt_files, validate_files
import yifu_safety as safety


class SafetyTests(unittest.TestCase):
    def test_backup_roundtrip_and_tampering(self):
        files = {'auths/test.json': base64.b64encode(b'{"disabled":true,"token":"test"}').decode(),
                 'private/config.yaml': base64.b64encode(b'api-keys: [test]').decode()}
        envelope = encrypt_files(files, 'test-backup-secret')
        self.assertEqual(decrypt_files(envelope, 'test-backup-secret'), files)
        for secret, value in [('wrong', envelope), ('test-backup-secret', {**envelope, 'purpose': 'different'})]:
            with self.assertRaises(Exception): decrypt_files(value, secret)
        broken = copy.deepcopy(envelope)
        raw = bytearray(base64.b64decode(broken['ciphertext']));raw[0] ^= 1
        broken['ciphertext'] = base64.b64encode(raw).decode()
        with self.assertRaises(Exception): decrypt_files(broken, 'test-backup-secret')

    def test_backup_rejects_unsafe_paths_and_partial_credentials(self):
        for name in ['/auths/test.json', 'auths/../private/file', 'auths//test.json', 'bin/CLIProxyAPI', 'private/sub/key']:
            with self.assertRaises(ValueError):validate_files({name: 'e30='})
        with self.assertRaises(ValueError):validate_files({'auths/test.json': 'ew=='})

    def test_only_logging_changes_for_all_config_shapes(self):
        for config in [
            {'api-keys': ['preserve'], 'remote-key-auth': {'enabled': True}},
            {'access': {'api-keys': ['preserve']}, 'observability': {'logs': {'request-log': True, 'other': 3}}},
            {'logs-max-total-size-mb': 0, 'observability': {'logs': {'logs-max-total-size-mb': 3}}},
        ]:
            original = copy.deepcopy(config)
            result = safety.patch_logs(config)
            self.assertEqual(config, original)
            self.assertEqual(safety.logging_values(result), safety.LOGS)
            self.assertEqual(safety.config_without_limits(result), safety.config_without_limits(original))

    def test_tunnel_changes_only_public_api_origin(self):
        config = {'ingress': [
            {'hostname': 'yifu.leonmingod.com', 'path': '^/_pool/.*$', 'service': 'http://127.0.0.1:8318'},
            {'hostname': 'yifu.leonmingod.com', 'service': 'http://127.0.0.1:8317'},
            {'hostname': 'yifu-origin.leonmingod.com', 'service': 'http://127.0.0.1:8317'},
            {'hostname': 'cpa.leonmingod.com', 'service': 'http://other'}, {'service': 'http_status:404'}], 'originRequest': {'connectTimeout': 30}}
        original = copy.deepcopy(config)
        routed = safety.route_gateway(config)
        self.assertEqual(config, original)
        self.assertEqual(routed['ingress'][0], config['ingress'][0])
        self.assertEqual(routed['ingress'][3:], config['ingress'][3:])
        self.assertEqual(routed['originRequest'], config['originRequest'])
        self.assertEqual(safety.route_gateway(routed), routed)
        with self.assertRaises(ValueError):safety.route_gateway({'ingress': []})

    @unittest.skipUnless(shutil.which('node'), 'Node required')
    def test_resource_probe_uses_existing_node_and_returns_only_safe_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'data').mkdir();Path(directory, 'logs').mkdir();Path(directory, 'logs/test.log').write_text('hello')
            fake = types.ModuleType('yifu_vps')
            fake.read = lambda *args: b'api-keys: [test]\nlogs-max-total-size-mb: 50\n'
            fake.private_env = lambda *args: {'MANAGEMENT_PASSWORD': 'never-print'}
            def node(client, source):
                output = subprocess.check_output(['node', '--input-type=module', '-e', source.replace('/opt/yifu-cpa', directory)], text=True)
                return json.loads(output)
            with patch.dict(sys.modules, {'yifu_vps': fake}), patch.object(safety, 'node_remote', node):
                result = safety.inspect_resources(None, None)
            self.assertGreater(result['memory_bytes']['MemTotal'], 0)
            self.assertEqual(result['application_log_bytes'], 5)
            self.assertNotIn('never-print', json.dumps(result))


if __name__ == '__main__': unittest.main()
