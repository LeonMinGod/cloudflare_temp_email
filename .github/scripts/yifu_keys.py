"""Repeatable add/remove operations. Prepare is read-only; apply checks its live snapshot."""
import base64
import copy
from concurrent.futures import ThreadPoolExecutor
from email.parser import BytesParser
import email.policy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
import yaml

import yifu_key_api as api

PLAN = Path('yifu-operation.enc')
SECRET = 'FREE_TOKEN_RENDER_KEY'
# Set by public_claim() for the latest probe. True only for {ok: true, next: 'email'}.
_per_user_claim = False


def fingerprint(key):
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def per_user_claim(data):
    """Same recognition public_claim() uses for the email per-user flow."""
    return isinstance(data, dict) and data.get('ok') is True and data.get('next') == 'email'


def public_claim():
    global _per_user_claim
    _per_user_claim = False
    try:
        data = api.site_claim()
    except RuntimeError as error:
        if str(error).endswith('HTTP 503'):
            return None
        raise
    if isinstance(data, dict) and data.get('baseUrl') == api.RENDER_ORIGIN + '/v1' and isinstance(data.get('apiKey'), str):
        return data
    # The per-user flow (email verification, one key per email) answers {ok: true, next: 'email'} and
    # never publishes a shared key. Any other shape is reported without values and is not fatal here.
    if per_user_claim(data):
        _per_user_claim = True
        print('CLAIM_FLOW=per-user', flush=True)
    else:
        shape = sorted(data) if isinstance(data, dict) else type(data).__name__
        print('::warning::Unexpected claim response shape: ' + json.dumps(shape), flush=True)
    return None


def modules():
    _, headers, body = api.cf('leonmingod-home', raw=True)
    result = {}
    referenced = False
    if 'multipart/' in headers.get('Content-Type', ''):
        message = BytesParser(policy=email.policy.default).parsebytes(
            ('Content-Type: ' + headers['Content-Type'] + '\r\n\r\n').encode() + body)
        for part in message.iter_parts():
            name = part.get_filename() or part.get_param('name', header='Content-Disposition')
            if name == 'metadata':
                continue
            assert name and name not in result
            payload = part.get_payload(decode=True)
            result[name] = hashlib.sha256(payload).hexdigest()
            referenced |= name.endswith('.js') and SECRET.encode() in payload
    else:
        result['script'] = hashlib.sha256(body).hexdigest()
        referenced = SECRET.encode() in body
    assert result
    return {'entrypoint': headers.get('cf-entrypoint'), 'files': result, 'claim_binding': referenced}


def keys_from(config):
    access = config.get('access') or {}
    keys = access.get('api-keys') if isinstance(access, dict) and 'api-keys' in access else config.get('api-keys')
    assert isinstance(keys, list) and all(isinstance(k, str) and k for k in keys), 'Unknown client-key configuration layout'
    assert len(set(keys)) == len(keys), 'Duplicate client keys require review'
    return keys


def set_keys(content, keys):
    before = yaml.safe_load(content)
    tree = yaml.compose(content)
    def child(node, name):
        return next((v for k, v in node.value if k.value == name), None)
    access = child(tree, 'access')
    node = child(access, 'api-keys') if isinstance(access, yaml.MappingNode) else None
    node = node if node is not None else child(tree, 'api-keys')
    assert isinstance(node, yaml.SequenceNode)
    start = node.start_mark.index
    end = node.end_mark.index if node.flow_style else node.value[-1].end_mark.index
    replacement = yaml.safe_dump(keys, default_flow_style=True, width=100000).strip()
    updated = content[:start] + replacement + content[end:]
    expected = copy.deepcopy(before)
    if isinstance(expected.get('access'), dict) and 'api-keys' in expected['access']:
        expected['access']['api-keys'] = keys
    else:
        expected['api-keys'] = keys
    assert yaml.safe_load(updated) == expected, 'Unrelated configuration changed'
    return updated


def read_state():
    for name in ['RENDER_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']:
        if not os.environ.get(name, '').strip():
            raise RuntimeError('Missing GitHub Actions secret: ' + name)
    service = api.render('/services/' + api.SERVICE)
    assert service['ownerId'] == api.WORKSPACE and api.is_cpa_repo(service['repo'])
    assert service['branch'] == 'main'
    assert service['serviceDetails']['envSpecificDetails']['dockerCommand'] == './CLIProxyAPI --config /etc/secrets/config.yaml'
    secret = api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')
    config = yaml.safe_load(secret['content'])
    env = {v['envVar']['key']: v['envVar']['value'] for v in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
    candidates = [env.get('MANAGEMENT_PASSWORD')]
    candidates += [(config.get(k) or {}).get('secret-key') for k in ['management', 'remote-management'] if isinstance(config.get(k) or {}, dict)]
    management = None
    files = None
    for key in dict.fromkeys(k for k in candidates if isinstance(k, str) and k and not k.startswith('$2')):
        try:
            files = json.loads(api.management_request(key, 'credentials'))['files']
            management = key
            break
        except RuntimeError as error:
            # API helper errors contain only method/path/status, never response bodies.
            print('MANAGEMENT_PREFLIGHT_ERROR=' + str(error), flush=True)
            continue
    assert management is not None and files is not None, 'Cannot preserve login files without management access'
    deploy = api.latest_deploy()
    assert deploy['status'] == 'live', 'Wait for the existing Render deployment to finish'
    return dict(secret=secret, keys=keys_from(config), env=env, management=management, files=files,
                deploy=deploy, parent=api.active('leonmingod-home'), entrance=api.active('leonmingod-free-token'),
                modules=modules(), settings=api.cf('leonmingod-home/settings'), claim=public_claim())


def select_operation(state, operation, publish=True, target='current'):
    assert operation in ['add', 'remove']
    active = state['claim']['apiKey'] if state['claim'] else None
    expected = os.environ.get('YIFU_EXPECT_CURRENT', '')
    if operation == 'add' and expected:
        if not re.fullmatch(r'[0-9a-f]{16}', expected) or not active or fingerprint(active) != expected:
            raise RuntimeError('Published key changed while waiting; reread before rotation')
    if operation == 'add':
        if os.environ.get('YIFU_USE_CUSTOM_KEY') == 'true':
            if publish:
                raise RuntimeError('Standalone custom keys must use publish=false')
            prefix = os.environ.get('YIFU_CUSTOM_PREFIX', '').strip()
            digits = int(os.environ.get('YIFU_CUSTOM_DIGITS', '8'))
            if not re.fullmatch(r'sk-[A-Za-z0-9][A-Za-z0-9-]{1,30}', prefix) or not 6 <= digits <= 12:
                raise RuntimeError('Invalid standalone key prefix or digit count')
            key = prefix + '-' + str(secrets.randbelow(10 ** digits)).zfill(digits)
        else:
            key = 'sk-leon-yifu-' + secrets.token_urlsafe(32)
        after = state['keys'] + ([] if key in state['keys'] else [key])
        disable = False
    else:
        if target in ['', 'current']:
            key = active
        else:
            if not re.fullmatch(r'[0-9a-f]{16}', target):
                raise RuntimeError('Use the 16-character SHA-256 fingerprint, or current')
            candidates = list(dict.fromkeys(state['keys'] + ([active] if active else [])))
            matches = [k for k in candidates if fingerprint(k) == target]
            if len(matches) != 1:
                raise RuntimeError('Fingerprint does not identify exactly one key')
            key = matches[0]
        after = [k for k in state['keys'] if k != key]
        if key in state['keys'] and not after:
            raise RuntimeError('Refusing to remove the final Render client key; add a replacement first')
        disable = key is not None and key == active
    changed = after != state['keys']
    touches_site = (operation == 'add' and publish) or disable
    if touches_site:
        assert state['modules']['claim_binding'], 'The claim handler no longer references the expected Secret'
    return dict(operation=operation, publish=publish, target=key, fingerprint=fingerprint(key) if key else None,
                after_keys=after, render_change=changed, disable=disable, touches_site=touches_site)


def encrypt_custom_key(key):
    try:
        public = serialization.load_pem_public_key(os.environ.get('YIFU_RECIPIENT_PUBLIC_KEY', '').encode())
    except (ValueError, TypeError):
        raise RuntimeError('A valid public delivery key is required') from None
    if not isinstance(public, rsa.RSAPublicKey) or public.key_size < 2048:
        raise RuntimeError('Delivery requires an RSA public key of at least 2048 bits')
    encrypted = public.encrypt(key.encode(), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    path = Path('render-client-key.enc')
    path.write_bytes(encrypted)
    path.chmod(0o600)


def seal(plan):
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    key = hashlib.pbkdf2_hmac('sha256', os.environ['RENDER_API_KEY'].strip().encode(), salt, 600000, 32)
    ciphertext = AESGCM(key).encrypt(nonce, json.dumps(plan).encode(), b'yifu-operation-v1')
    envelope = {'format': 'yifu-operation-v1', **{k: base64.b64encode(v).decode() for k, v in
                [('salt', salt), ('nonce', nonce), ('ciphertext', ciphertext)]}}
    PLAN.write_text(json.dumps(envelope))
    PLAN.chmod(0o600)


def unseal():
    envelope = json.loads(PLAN.read_text())
    assert envelope['format'] == 'yifu-operation-v1'
    salt, nonce, ciphertext = [base64.b64decode(envelope[k]) for k in ['salt', 'nonce', 'ciphertext']]
    key = hashlib.pbkdf2_hmac('sha256', os.environ['RENDER_API_KEY'].strip().encode(), salt, 600000, 32)
    return json.loads(AESGCM(key).decrypt(nonce, ciphertext, b'yifu-operation-v1'))


def snapshot():
    # Source-module and entrance-version guards cover scripts/assets without refetching megabytes.
    paths = ['/', '/free-token/', '/free-token/claim/']
    def read(path):
        body = api.request(api.ORIGIN + path)[2]
        body = re.sub(rb'<script\b[^>]*src="https://static\.cloudflareinsights\.com/[^>]*></script>\s*', b'', body)
        return path, hashlib.sha256(body).hexdigest()
    with ThreadPoolExecutor(max_workers=3) as pool:
        return dict(pool.map(read, paths))


def prepare():
    state = read_state()
    op = select_operation(state, os.environ['YIFU_OPERATION'],
                          os.environ.get('YIFU_PUBLISH', 'true') == 'true', os.environ.get('YIFU_TARGET', 'current'))
    preview = {'operation': op['operation'], 'dry_run': os.environ.get('YIFU_DRY_RUN') == 'true',
               'keys_before': len(state['keys']), 'keys_after': len(op['after_keys']),
               'selected_fingerprint': op['fingerprint'] if op['operation'] == 'remove' else None,
               'credentials_to_preserve': len(state['files']), 'render_redeploy': op['render_change'],
               'publish_new_key': op['operation'] == 'add' and op['publish'], 'stop_website_issuance': op['disable']}
    print('YIFU_PLAN=' + json.dumps(preview), flush=True)
    if preview['dry_run']:
        print('READ_ONLY_PREFLIGHT_PASSED=True', flush=True)
        return
    if os.environ.get('YIFU_USE_CUSTOM_KEY') == 'true':
        encrypt_custom_key(op['target'])
    backups = {}
    if op['render_change']:
        assert not any(f.get('runtime_only') for f in state['files']), 'Cannot back up a runtime-only login file'
        def download(file):
            body = api.management_request(state['management'], 'credentials/download?name=' + urllib.parse.quote(file['name'], safe=''))
            assert isinstance(json.loads(body), dict)
            return file['name'], body.decode()
        with ThreadPoolExecutor(max_workers=4) as pool:
            backups = dict(pool.map(download, state['files']))
    plan = dict(state=state, op=op, backups=backups, visuals=snapshot())
    seal(plan)
    print('ENCRYPTED_PLAN_READY=True', flush=True)


def retry(operation):
    for attempt in range(5):
        try:
            return operation()
        except (RuntimeError, urllib.error.URLError):
            if attempt == 4:
                raise
            time.sleep(min(2 ** attempt, 8))


def restore(plan):
    if plan['backups']:
        state = plan['state']
        retry(lambda: api.restore_credentials(state['management'], plan['backups'], state['files']))


def update_render(plan):
    state, op = plan['state'], plan['op']
    if not op['render_change']:
        return state['deploy']['id']
    updated = set_keys(state['secret']['content'], op['after_keys'])
    api.render('/services/' + api.SERVICE + '/secret-files/config.yaml', 'PUT', {'content': updated})
    assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == updated
    try:
        # Secret updates do not normally deploy; reuse any deployment the provider already started.
        pending = api.latest_deploy()
        if pending['id'] == state['deploy']['id']:
            pending = api.render('/services/' + api.SERVICE + '/deploys', 'POST', {'deployMode': 'deploy_only'})
        deploy_id = pending['id']
        print('RENDER_DEPLOY=' + deploy_id, flush=True)
        deadline = time.monotonic() + 900
        while time.monotonic() < deadline:
            pending = retry(lambda: api.render('/services/' + api.SERVICE + '/deploys/' + deploy_id))
            if pending['status'] == 'live':
                break
            if pending['status'] in ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled']:
                raise RuntimeError('Render deployment failed')
            time.sleep(5)
        else:
            raise RuntimeError('Render deployment timed out')
        assert pending['commit']['id'] == state['deploy']['commit']['id'], 'Render code changed during key operation'
    finally:
        restore(plan)
    return deploy_id


def stop_issuance():
    api.cf('leonmingod-home/secrets/' + SECRET, 'DELETE')
    wait_claim(None)


def wait_claim(key):
    def check():
        result = public_claim()
        if (key is None and result is not None) or (key is not None and (not result or result['apiKey'] != key)):
            raise RuntimeError('Waiting for the website Secret update')
        return result
    return retry(check)


def apply(plan):
    state, op = plan['state'], plan['op']
    if op['target']:
        print('::add-mask::' + op['target'])
    assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == state['secret']['content'], 'Render configuration changed after preparation'
    assert api.latest_deploy()['id'] == state['deploy']['id'], 'Render deployment changed after preparation'
    assert api.active('leonmingod-home') == state['parent'] and api.active('leonmingod-free-token') == state['entrance'], 'CF changed after preparation'
    assert modules() == state['modules']
    assert public_claim() == state['claim'], 'Published key changed after preparation'
    current_files = json.loads(api.management_request(state['management'], 'credentials'))['files']
    assert {f['name']: bool(f.get('disabled')) for f in current_files} == {f['name']: bool(f.get('disabled')) for f in state['files']}, 'Login files changed after preparation'
    if op['disable']:
        stop_issuance()
    deploy_id = update_render(plan)
    model_count = None
    for key in op['after_keys']:
        count = retry(lambda key=key: api.models(key))
        if key == op['target']:
            model_count = count
    if op['operation'] == 'remove' and op['target']:
        try:
            api.models(op['target'])
        except RuntimeError as error:
            assert str(error).endswith('HTTP 401'), 'Revocation could not be verified'
        else:
            raise RuntimeError('Removed key still authorizes requests')
    published_version = None
    try:
        if op['operation'] == 'add' and op['publish']:
            api.cf('leonmingod-home/secrets', 'PUT', {'name': SECRET, 'type': 'secret_text', 'text': op['target']})
            published_version = api.active('leonmingod-home')
            result = wait_claim(op['target'])
            assert result and result['apiKey'] == op['target'], 'Website did not issue the new registered key'
            retry(lambda: api.models(result['apiKey']))
        elif op['disable']:
            assert public_claim() is None
        else:
            assert public_claim() == state['claim'], 'Unrelated website key changed'
        assert modules() == state['modules'] and api.active('leonmingod-free-token') == state['entrance']
        expected_bindings = {(b['name'], b['type']) for b in state['settings']['bindings']}
        if op['disable']:
            expected_bindings.discard((SECRET, 'secret_text'))
        elif op['operation'] == 'add' and op['publish']:
            expected_bindings.add((SECRET, 'secret_text'))
        assert {(b['name'], b['type']) for b in api.cf('leonmingod-home/settings')['bindings']} == expected_bindings
        assert snapshot() == plan['visuals'], 'Website content or effects changed'
        expected_content = set_keys(state['secret']['content'], op['after_keys']) if op['render_change'] else state['secret']['content']
        assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == expected_content
        assert {v['envVar']['key']: v['envVar']['value'] for v in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')} == state['env']
        assert api.request(api.RENDER_ORIGIN + '/healthz')[0] == 200
        availability = json.loads(api.request(api.ORIGIN + '/api/free-token/status')[2])
        claim = public_claim()
        # Per-user issuance stays open and returns no shared key. Every other open/claim pair stays exact.
        per_user_open = availability['open'] is True and claim is None and _per_user_claim
        assert availability['open'] is (claim is not None) or per_user_open, 'Token click mode did not follow the issued key'
    except Exception:
        if published_version and api.active('leonmingod-home') == published_version:
            api.cf('leonmingod-home/deployments', 'POST', {'strategy': 'percentage',
                'versions': [{'version_id': state['parent'], 'percentage': 100}]})
        raise
    result = dict(operation=op['operation'], fingerprint=op['fingerprint'],
                  render_key_count=len(op['after_keys']), credentials_preserved=len(state['files']),
                  website_enabled=public_claim() is not None, model_count=model_count,
                  render_deploy=deploy_id, parent_version=api.active('leonmingod-home'), entrance_version=state['entrance'])
    Path('yifu-result.json').write_text(json.dumps(result, indent=2))
    print('YIFU_COMPLETED=' + json.dumps(result), flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write('### Yifu Token operation complete\n\n```json\n' + json.dumps(result, indent=2) + '\n```\n')


if __name__ == '__main__':
    try:
        command = sys.argv[1]
        if command == 'prepare':
            prepare()
        elif command == 'apply':
            apply(unseal())
        elif command == 'recover':
            if PLAN.exists():
                restore(unseal())
        else:
            raise RuntimeError('Unknown command')
    except yaml.YAMLError:
        raise RuntimeError('Invalid YAML; sensitive details suppressed') from None
