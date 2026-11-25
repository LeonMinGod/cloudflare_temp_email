"""Connect the Free Token claim to CPA, preserving configuration and credentials."""
import copy
import email.policy
from email.parser import BytesParser
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

import yaml
from yifu_key_api import is_cpa_repo

SERVICE = 'srv-d9c4kkvavr4c73ab3sfg'
WORKSPACE = 'tea-d779tahr0fns73e1h3lg'
RENDER_ORIGIN = 'https://cpa-dhke.onrender.com'
ORIGIN = 'https://leonmingod.com'
ROOT = Path('sites/free-token-home')
EXPECTED_PARENT = 'b3943206-85ca-4ca0-8617-951317245755'
EXPECTED_ENTRANCE = '4fda0cc3-1bdd-4b31-a5e6-9012b933931b'
EXPECTED_COMMIT = 'f9cee393e5360db6b47dd18d6c2747a2e6c6cbb7'


def request(url, method='GET', body=None, headers=None):
    headers = {'User-Agent': 'Mozilla/5.0', **(headers or {})}
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.headers, res.read()
    except urllib.error.HTTPError as error:
        # Provider error bodies can contain the submitted configuration or secrets.
        raise RuntimeError(f'{method} {urllib.parse.urlsplit(url).path}: HTTP {error.code}') from None


def render(path, method='GET', body=None):
    return json.loads(request('https://api.render.com/v1' + path, method, body,
                             {'Authorization': 'Bearer ' + os.environ['RENDER_API_KEY'].strip()})[2])


def cf(path, method='GET', body=None, headers=None, raw=False):
    result = request('https://api.cloudflare.com/client/v4/accounts/' +
                     os.environ['CLOUDFLARE_ACCOUNT_ID'].strip() + '/workers/scripts/' + path,
                     method, body, {'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'].strip(),
                                    **(headers or {})})
    if raw:
        return result
    data = json.loads(result[2])
    if not data.get('success'):
        raise RuntimeError('Cloudflare rejected the operation')
    return data['result']


def active(worker):
    versions = cf(worker + '/deployments')['deployments'][0]['versions']
    if len(versions) != 1 or versions[0]['percentage'] != 100:
        raise RuntimeError('Only a single fully deployed Worker version is supported')
    return versions[0]['version_id']


def source():
    _, headers, body = cf('leonmingod-home', raw=True)
    if 'multipart/' in headers.get('Content-Type', ''):
        message = BytesParser(policy=email.policy.default).parsebytes(
            ('Content-Type: ' + headers['Content-Type'] + '\r\n\r\n').encode() + body)
        parts = {p.get_filename() or p.get_param('name', header='Content-Disposition'):
                 p.get_payload(decode=True) for p in message.iter_parts()}
        if set(parts) != {'index.js'}:
            raise RuntimeError('Unexpected parent Worker modules; review before editing')
        return parts['index.js'].decode()
    return body.decode()


def inspect():
    for name in ['RENDER_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']:
        if not os.environ.get(name, '').strip():
            raise RuntimeError('Missing GitHub Actions secret: ' + name)
    service = render('/services/' + SERVICE)
    assert service['ownerId'] == WORKSPACE
    assert is_cpa_repo(service['repo'])
    assert service['branch'] == 'main'
    assert service['serviceDetails']['envSpecificDetails']['dockerCommand'] == './CLIProxyAPI --config /etc/secrets/config.yaml'
    secret = render('/services/' + SERVICE + '/secret-files/config.yaml')
    config = yaml.safe_load(secret['content'])
    env = render('/services/' + SERVICE + '/env-vars?limit=100')
    env = {v['envVar']['key']: v['envVar']['value'] for v in env}
    candidates = [env.get('MANAGEMENT_PASSWORD')]
    for field in ['management', 'remote-management']:
        block = config.get(field) or {}
        if isinstance(block, dict):
            candidates.append(block.get('secret-key'))
    candidates = list(dict.fromkeys(x for x in candidates if isinstance(x, str) and x and not x.startswith('$2')))
    management = None
    credentials = None
    for key in candidates:
        try:
            _, _, data = request(RENDER_ORIGIN + '/v8/management/credentials',
                                 headers={'Authorization': 'Bearer ' + key})
            credentials = json.loads(data)
            management = key
            break
        except RuntimeError:
            continue
    parent = active('leonmingod-home')
    entrance = active('leonmingod-free-token')
    live_source = source()
    original = (ROOT / 'src/site-original.js').read_text()
    normalize = lambda s: s.split('//# sourceMappingURL=')[0].strip()
    switched = original.replace('env.FREE_TOKEN_CPA_KEY', 'env.FREE_TOKEN_RENDER_KEY').replace(
        'https://cpa.leonmingod.com/v1', RENDER_ORIGIN + '/v1')
    assert normalize(live_source) in (normalize(original), normalize(switched)), 'Live parent source differs from reviewed source'
    settings = cf('leonmingod-home/settings')
    keys = config.get('access', {}).get('api-keys', config.get('api-keys', []))
    assert isinstance(keys, list), 'Unknown client API key layout'
    files = credentials.get('files', []) if credentials is not None else None
    print('INSPECTED=' + json.dumps({
        'render_service': SERVICE, 'repo': service['repo'],
        'config_root_fields': sorted(config), 'client_key_count': len(keys),
        'management_api_available': management is not None,
        'credential_count': len(files) if files is not None else None,
        'credentials_response_fields': sorted(credentials) if credentials is not None else None,
        'environment_variable_names': sorted(env),
        'disk_present': bool(service.get('disk') or service['serviceDetails'].get('disk')),
        'parent_version': parent, 'entrance_version': entrance,
        'parent_source_sha256': hashlib.sha256(live_source.encode()).hexdigest(),
        'parent_matches_backup': normalize(live_source) == normalize(original),
        'bindings': [{'name': b['name'], 'type': b['type']} for b in settings['bindings']],
    }))
    return service, secret, config, env, management, credentials, parent, entrance, live_source, settings


def management_request(key, path, method='GET', body=None):
    return request(RENDER_ORIGIN + '/v8/management/' + path, method, body,
                   {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})[2]


def models(key):
    status, _, body = request(RENDER_ORIGIN + '/v1/models', headers={'Authorization': 'Bearer ' + key})
    assert status == 200
    data = json.loads(body)
    assert isinstance(data.get('data'), list), 'Invalid models response'
    return len(data['data'])


def append_key(content, client_key):
    """Insert one scalar into the existing YAML sequence; retain all other text."""
    config = yaml.safe_load(content)
    keys = config.get('access', {}).get('api-keys', config.get('api-keys'))
    assert isinstance(keys, list) and all(isinstance(x, str) for x in keys)
    assert client_key not in keys
    tree = yaml.compose(content)

    def child(node, name):
        return next((v for k, v in node.value if k.value == name), None)

    access = child(tree, 'access')
    sequence = child(access, 'api-keys') if access is not None else None
    if sequence is None:
        sequence = child(tree, 'api-keys')
    assert isinstance(sequence, yaml.SequenceNode)
    if sequence.flow_style:
        index = sequence.end_mark.index - 1
        tail = content[sequence.value[-1].end_mark.index:index] if keys else ''
        insertion = (' ' if tail.strip().startswith(',') else ', ' if keys else '') + json.dumps(client_key)
    else:
        index = sequence.end_mark.index
        insertion = ('\n' if index and content[index - 1] != '\n' else '')
        insertion += ' ' * sequence.start_mark.column + '- ' + json.dumps(client_key) + '\n'
    updated = content[:index] + insertion + content[index:]
    expected = copy.deepcopy(config)
    if 'api-keys' in (expected.get('access') or {}):
        expected['access']['api-keys'].append(client_key)
    else:
        expected['api-keys'].append(client_key)
    assert yaml.safe_load(updated) == expected, 'YAML insertion altered unrelated configuration'
    return updated


def claim():
    return json.loads(request(ORIGIN + '/api/free-token/claim', 'POST',
                             {'oath': '义父', 'confirmed': True}, {'Origin': ORIGIN})[2])


def visual_snapshot():
    paths = ['/', '/free-token/', '/free-token/claim/', '/free-token/app.js?v=1', '/home-scene-v4.js']
    for kind in ['mobile', 'desktop']:
        paths += [f'/home-hero-{kind}-v4.webp', f'/free-token/welcome-{kind}-v1.webp']
    bodies = {path: request(ORIGIN + path)[2] for path in paths}
    assert b'jade-pill' in bodies['/'] and b'id="homepage-jade-layout"' in bodies['/']
    assert b'data-layout="fullscreen-token"' in bodies['/free-token/']
    assert b'id="token-entry"' in bodies['/free-token/']
    for path, data in bodies.items():
        if path.endswith('.webp'):
            assert data == (ROOT / 'assets' / path.rsplit('/', 1)[1]).read_bytes()
    return {path: hashlib.sha256(data).hexdigest() for path, data in bodies.items()}


def encrypt_backup(payload):
    subprocess.run(['openssl', 'cms', '-encrypt', '-binary', '-aes256', '-outform', 'DER',
                    '-out', 'render-integration-backup.enc', '.github/scripts/render-backup-public.pem'],
                   input=json.dumps(payload).encode(), check=True, capture_output=True)


def latest_deploy():
    items = render('/services/' + SERVICE + '/deploys?limit=1')
    return items[0]['deploy']


def restore_credentials(management, backups, original_files):
    current = json.loads(management_request(management, 'credentials'))['files']
    names = {f['name'] for f in current}
    restored = 0
    for file in original_files:
        name = file['name']
        if name in names:
            continue
        management_request(management, 'credentials?name=' + urllib.parse.quote(name, safe=''),
                           'POST', backups[name].encode())
        if file.get('disabled'):
            management_request(management, 'credentials/status', 'PATCH', {'name': name, 'disabled': True})
        restored += 1
    current = json.loads(management_request(management, 'credentials'))['files']
    by_name = {f['name']: f for f in current}
    assert {f['name'] for f in original_files} <= set(by_name), 'Credential restoration incomplete'
    assert all(bool(by_name[f['name']].get('disabled')) == bool(f.get('disabled')) for f in original_files)
    print('CREDENTIALS_VERIFIED=' + json.dumps({'retained': len(original_files), 'restored': restored}))


def upload_parent(text, client_key, settings):
    bindings = [b for b in settings['bindings'] if b['type'] != 'secret_text']
    assert bindings == [{'name': 'ASSETS', 'type': 'assets'}], 'Unexpected bindings; review before upload'
    metadata = {
        'main_module': 'index.js', 'keep_assets': True,
        'compatibility_date': settings['compatibility_date'],
        'compatibility_flags': settings.get('compatibility_flags', []),
        'keep_bindings': ['secret_text', 'plain_text', 'json'],
        'bindings': bindings + [{'name': 'FREE_TOKEN_RENDER_KEY', 'type': 'secret_text', 'text': client_key}],
        'annotations': {'workers/message': 'Use verified Render CPA key for Free Token claims'},
    }
    boundary = 'render-' + secrets.token_hex(16)
    chunks = []
    for name, body, mime in [('metadata', json.dumps(metadata), 'application/json'),
                              ('index.js', text, 'application/javascript+module')]:
        disposition = 'form-data; name=' + json.dumps(name)
        if name == 'index.js':
            disposition += '; filename="index.js"'
        chunks.append((f'--{boundary}\r\nContent-Disposition: {disposition}\r\nContent-Type: {mime}\r\n\r\n' +
                       body + '\r\n').encode())
    chunks.append(f'--{boundary}--\r\n'.encode())
    cf('leonmingod-home', 'PUT', b''.join(chunks), {'Content-Type': 'multipart/form-data; boundary=' + boundary})


def connect(state):
    service, secret, config, env, management, credentials, parent, entrance, live_source, settings = state
    assert parent == EXPECTED_PARENT and entrance == EXPECTED_ENTRANCE, 'Worker changed since inspection'
    assert management is not None and credentials is not None, 'Cannot preserve login credentials without management access'
    before_visuals = visual_snapshot()
    before_claim = claim()
    assert before_claim['baseUrl'] == 'https://cpa.leonmingod.com/v1', 'Unexpected claim target'
    assert live_source.count('env.FREE_TOKEN_CPA_KEY') == 2
    assert live_source.count('https://cpa.leonmingod.com/v1') == 1
    deploy = latest_deploy()
    assert deploy['status'] == 'live' and deploy['commit']['id'] == EXPECTED_COMMIT, 'Render changed since inspection'
    original_files = json.loads(management_request(management, 'credentials'))['files']
    backups = {}
    for file in original_files:
        assert not file.get('runtime_only'), 'Runtime-only credential cannot be backed up safely'
        name = file['name']
        raw = management_request(management, 'credentials/download?name=' + urllib.parse.quote(name, safe=''))
        assert isinstance(json.loads(raw), dict), 'Invalid credential backup'
        backups[name] = raw.decode()
    client_key = 'sk-leon-free-render-' + secrets.token_urlsafe(32)
    print('::add-mask::' + client_key)
    original_keys = config.get('access', {}).get('api-keys', config.get('api-keys'))
    original_model_counts = [models(key) for key in original_keys]
    updated = append_key(secret['content'], client_key)
    encrypt_backup({'secret_file': secret, 'credential_files': backups, 'credentials_metadata': original_files,
                    'new_client_key': client_key, 'parent_version': parent, 'entrance_version': entrance})
    print('BACKUP_READY=' + json.dumps({'credential_count': len(backups), 'encrypted': True}))
    assert render('/services/' + SERVICE + '/secret-files/config.yaml')['content'] == secret['content'], 'Render config changed during backup'
    assert active('leonmingod-home') == parent and active('leonmingod-free-token') == entrance
    render('/services/' + SERVICE + '/secret-files/config.yaml', 'PUT', {'content': updated})
    assert render('/services/' + SERVICE + '/secret-files/config.yaml')['content'] == updated
    print('RENDER_CONFIG_UPDATED=' + json.dumps({'old_keys_retained': len(original_keys), 'new_keys_added': 1}))
    time.sleep(5)
    pending = latest_deploy()
    if pending['id'] == deploy['id']:
        pending = render('/services/' + SERVICE + '/deploys', 'POST', {'deployMode': 'deploy_only'})
    deploy_id = pending['id']
    print('RENDER_DEPLOY=' + deploy_id, flush=True)
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        pending = render('/services/' + SERVICE + '/deploys/' + deploy_id)
        print('RENDER_STATUS=' + pending['status'], flush=True)
        if pending['status'] == 'live':
            break
        if pending['status'] in ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled']:
            raise RuntimeError('Render deployment failed; website has not been switched')
        time.sleep(15)
    else:
        raise RuntimeError('Render deployment timed out; website has not been switched')
    assert pending['commit']['id'] == EXPECTED_COMMIT, 'Unexpected Render code version'
    restore_credentials(management, backups, original_files)
    model_count = models(client_key)
    assert request(RENDER_ORIGIN + '/healthz')[0] == 200
    for key in original_keys:
        models(key)
    assert render('/services/' + SERVICE + '/secret-files/config.yaml')['content'] == updated
    assert {v['envVar']['key']: v['envVar']['value'] for v in render('/services/' + SERVICE + '/env-vars?limit=100')} == env
    print('RENDER_VERIFIED=' + json.dumps({'models_http': 200, 'model_count': model_count,
                                         'old_keys_retained': len(original_keys), 'environment_unchanged': True}))
    assert active('leonmingod-home') == parent and active('leonmingod-free-token') == entrance, 'Website changed before switch'
    assert source() == live_source, 'Parent source changed before switch'
    new_source = live_source.replace('env.FREE_TOKEN_CPA_KEY', 'env.FREE_TOKEN_RENDER_KEY').replace(
        'https://cpa.leonmingod.com/v1', RENDER_ORIGIN + '/v1')
    try:
        upload_parent(new_source, client_key, settings)
        for attempt in range(12):
            result = claim()
            if result.get('baseUrl') == RENDER_ORIGIN + '/v1' and result.get('apiKey') == client_key:
                break
            time.sleep(5)
        else:
            raise RuntimeError('Public claim did not switch to the verified Render key')
        assert models(result['apiKey']) >= 0
        assert visual_snapshot() == before_visuals, 'Website artwork, markup, or interaction scripts changed'
        after_bindings = cf('leonmingod-home/settings')['bindings']
        assert {(b['name'], b['type']) for b in after_bindings} == {(b['name'], b['type']) for b in settings['bindings']}
        assert active('leonmingod-free-token') == entrance, 'Entrance Worker changed during switch'
        print('VERIFIED_CONNECTION=' + json.dumps({
            'base_url': result['baseUrl'], 'models_http': 200, 'same_key_confirmed': True,
            'parent_version': active('leonmingod-home'), 'entrance_version': entrance,
            'original_render_keys_retained': len(original_keys), 'credentials_retained': len(original_files),
            'visuals_and_scripts_unchanged': True, 'render_deploy': deploy_id,
        }))
    except Exception:
        cf('leonmingod-home/deployments', 'POST', {'strategy': 'percentage',
            'versions': [{'version_id': parent, 'percentage': 100}],
            'annotations': {'workers/message': 'Restore previous claim after failed Render integration verification'}})
        assert claim() == before_claim, 'Previous claim could not be verified after rollback'
        print('ROLLED_BACK_PARENT=' + parent)
        raise


def revoke_free_key(state):
    service, secret, config, env, management, credentials, parent, entrance, live_source, settings = state
    target_key = 'sk-leon-free-render-LcXTOwfM_nvRRvzENVn5ti4aCIW2ZB_RJj26ixAXGwk'
    content = secret['content']

    backups = {}
    original_files = []
    if management is not None and credentials is not None:
        original_files = json.loads(management_request(management, 'credentials'))['files']
        for file in original_files:
            if file.get('runtime_only'):
                continue
            name = file['name']
            raw = management_request(management, 'credentials/download?name=' + urllib.parse.quote(name, safe=''))
            backups[name] = raw.decode()
        print('CREDENTIALS_BACKED_UP=' + json.dumps({'count': len(backups)}))

    if target_key not in content:
        print('KEY_ALREADY_ABSENT=True; no changes needed in secret file')
    else:
        pattern = r'^\s*-\s*["\']?' + re.escape(target_key) + r'["\']?\s*\r?\n'
        updated_content = re.sub(pattern, '', content, flags=re.MULTILINE)
        updated_config = yaml.safe_load(updated_content)
        updated_keys = updated_config.get('access', {}).get('api-keys', updated_config.get('api-keys', []))
        assert target_key not in updated_keys, 'Failed to remove target key from parsed YAML'
        assert target_key not in updated_content, 'Failed to remove target key from YAML text'

        render('/services/' + SERVICE + '/secret-files/config.yaml', 'PUT', {'content': updated_content})
        assert render('/services/' + SERVICE + '/secret-files/config.yaml')['content'] == updated_content
        print('RENDER_CONFIG_UPDATED=' + json.dumps({'removed_key': target_key, 'remaining_keys_count': len(updated_keys)}))

        time.sleep(3)
        pending = render('/services/' + SERVICE + '/deploys', 'POST', {'deployMode': 'deploy_only'})
        deploy_id = pending['id']
        print('RENDER_DEPLOY_TRIGGERED=' + deploy_id, flush=True)

        deadline = time.monotonic() + 900
        while time.monotonic() < deadline:
            pending = render('/services/' + SERVICE + '/deploys/' + deploy_id)
            print('RENDER_STATUS=' + pending['status'], flush=True)
            if pending['status'] == 'live':
                break
            if pending['status'] in ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled']:
                raise RuntimeError('Render deployment failed: ' + pending['status'])
            time.sleep(15)
        else:
            raise RuntimeError('Render deployment timed out after 900s')

        if management is not None and backups:
            restore_credentials(management, backups, original_files)

    try:
        status, _, body = request(RENDER_ORIGIN + '/v1/models', headers={'Authorization': 'Bearer ' + target_key})
        raise AssertionError('Security breach: Revoked key still returned HTTP ' + str(status))
    except RuntimeError as e:
        assert 'HTTP 401' in str(e), f'Expected HTTP 401, but got: {e}'
        print('VERIFIED_REVOKED_KEY_RETURNS_401=True')

    for k in ['sk-leon', 'sk-czw']:
        try:
            m_count = models(k)
            print(f'VERIFIED_VALID_KEY_{k}_OK=True (models: {m_count})')
        except Exception as e:
            print(f'NOTE_KEY_{k}: {e}')

    assert request(RENDER_ORIGIN + '/healthz')[0] == 200
    print('VERIFIED_HEALTHZ_200=True')
    print('REVOCATION_COMPLETED_SUCCESSFULLY=True')


if __name__ == '__main__':
    try:
        state = inspect()
        mode = os.environ.get('CONNECTION_MODE', 'inspect')
        if mode == 'connect':
            connect(state)
        elif mode == 'revoke_key':
            revoke_free_key(state)
        elif mode != 'inspect':
            raise RuntimeError('Unknown connection mode')
    except yaml.YAMLError:
        raise RuntimeError('Invalid YAML; details suppressed to protect credentials') from None
