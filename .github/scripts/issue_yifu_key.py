"""Inspect or issue a Render client key and publish it through the Yifu Token site."""
from email.parser import BytesParser
import email.policy
import hashlib
import json
import os
import secrets
import subprocess
import time
import urllib.error
import urllib.parse

import yaml

import free_token_render as api

EXPECTED_PARENT = 'b07eefe0-cb25-49d3-afc2-d5a67454db2e'
EXPECTED_ENTRANCE = '69575cec-ac2c-416f-81b9-b64030e87651'
EXPECTED_RENDER_DEPLOY = 'dep-dbebhkrncjis73dnc2a0'
EXPECTED_RENDER_COMMIT = 'f9cee393e5360db6b47dd18d6c2747a2e6c6cbb7'
EXPECTED_MODULES = {
    'index.js': '5e4f310b76c76f7d578568c27b95e7704b6a84e093e65c5ae9f501ae05b963ea',
    'index.js.map': '18746d01e932e18c697fa8cfa398610b76f6a465b4108da27d9e71dd9432eb4f',
}


def module_manifest():
    _, headers, body = api.cf('leonmingod-home', raw=True)
    content_type = headers.get('Content-Type', '')
    modules = {}
    claim_binding_referenced = False
    if 'multipart/' in content_type:
        message = BytesParser(policy=email.policy.default).parsebytes(
            ('Content-Type: ' + content_type + '\r\n\r\n').encode() + body)
        for part in message.iter_parts():
            name = part.get_filename() or part.get_param('name', header='Content-Disposition')
            if name == 'metadata':
                continue
            assert name and name not in modules, 'Unexpected Worker module names'
            payload = part.get_payload(decode=True)
            modules[name] = hashlib.sha256(payload).hexdigest()
            if name.endswith('.js') and b'FREE_TOKEN_RENDER_KEY' in payload:
                claim_binding_referenced = True
    else:
        modules['script'] = hashlib.sha256(body).hexdigest()
        claim_binding_referenced = b'FREE_TOKEN_RENDER_KEY' in body
    assert modules, 'No Worker modules returned'
    return {'entrypoint': headers.get('cf-entrypoint'), 'modules': modules,
            'claim_binding_referenced': claim_binding_referenced}


def inspect():
    for name in ['RENDER_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']:
        if not os.environ.get(name, '').strip():
            raise RuntimeError('Missing GitHub Actions secret: ' + name)
    service = api.render('/services/' + api.SERVICE)
    assert service['ownerId'] == api.WORKSPACE
    assert api.is_cpa_repo(service['repo']) and service['branch'] == 'main'
    assert service['serviceDetails']['envSpecificDetails']['dockerCommand'] == './CLIProxyAPI --config /etc/secrets/config.yaml'
    secret = api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')
    config = yaml.safe_load(secret['content'])
    keys = config.get('access', {}).get('api-keys', config.get('api-keys'))
    assert isinstance(keys, list) and all(isinstance(key, str) for key in keys)
    env = {v['envVar']['key']: v['envVar']['value'] for v in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
    candidates = [env.get('MANAGEMENT_PASSWORD')]
    for field in ['management', 'remote-management']:
        block = config.get(field) or {}
        if isinstance(block, dict):
            candidates.append(block.get('secret-key'))
    candidates = list(dict.fromkeys(key for key in candidates if isinstance(key, str) and key and not key.startswith('$2')))
    management = None
    credentials = None
    for key in candidates:
        try:
            credentials = json.loads(api.management_request(key, 'credentials'))
            management = key
            break
        except RuntimeError:
            continue
    state = dict(service=service, secret=secret, config=config, keys=keys, env=env,
                 management=management, credentials=credentials,
                 parent=api.active('leonmingod-home'), entrance=api.active('leonmingod-free-token'),
                 modules=module_manifest(), settings=api.cf('leonmingod-home/settings'),
                 deploy=api.latest_deploy(), claim=api.claim())
    print('YIFU_INSPECTED=' + json.dumps({
        'render_service': api.SERVICE, 'render_deploy': state['deploy']['id'],
        'render_status': state['deploy']['status'], 'render_commit': state['deploy'].get('commit', {}).get('id'),
        'client_key_count': len(keys), 'credential_count': len(credentials['files']) if credentials else None,
        'management_available': management is not None,
        'parent_version': state['parent'], 'entrance_version': state['entrance'],
        'module_manifest': state['modules'],
        'bindings': [{'name': b['name'], 'type': b['type']} for b in state['settings']['bindings']],
        'claim_base_url': state['claim'].get('baseUrl'), 'claim_key_present': bool(state['claim'].get('apiKey')),
    }), flush=True)
    return state


def retry(operation):
    for attempt in range(5):
        try:
            return operation()
        except (RuntimeError, urllib.error.URLError):
            if attempt == 4:
                raise
            time.sleep(min(2 ** attempt, 8))


def snapshot():
    result = api.visual_snapshot()
    for path in ['/free-token/effects-v2.js', '/free-token/fluid-v2.js', '/assets/logo.svg']:
        result[path] = hashlib.sha256(api.request(api.ORIGIN + path)[2]).hexdigest()
    return result


def backup_credentials(management):
    files = json.loads(api.management_request(management, 'credentials'))['files']
    backups = {}
    for file in files:
        assert not file.get('runtime_only'), 'Cannot safely back up a runtime-only credential'
        name = file['name']
        body = api.management_request(management, 'credentials/download?name=' + urllib.parse.quote(name, safe=''))
        assert isinstance(json.loads(body), dict), 'Invalid credential backup'
        backups[name] = body.decode()
    return files, backups


def issue(state):
    assert state['parent'] == EXPECTED_PARENT and state['entrance'] == EXPECTED_ENTRANCE, 'CF version changed since review'
    assert state['modules']['entrypoint'] == 'index.js' and state['modules']['modules'] == EXPECTED_MODULES
    assert state['modules']['claim_binding_referenced'], 'Claim does not reference the expected Secret'
    assert state['deploy']['id'] == EXPECTED_RENDER_DEPLOY and state['deploy']['status'] == 'live'
    assert state['deploy']['commit']['id'] == EXPECTED_RENDER_COMMIT
    assert state['management'] and state['credentials'] is not None, 'Management access is needed to preserve login files'
    claim_base = api.RENDER_ORIGIN + '/v1' if state['claim'] is None else state['claim']['baseUrl']
    assert claim_base == api.RENDER_ORIGIN + '/v1'
    assert any(b['name'] == 'FREE_TOKEN_RENDER_KEY' and b['type'] == 'secret_text' for b in state['settings']['bindings'])
    before_visuals = snapshot()
    for key in state['keys']:
        api.models(key)
    files, backups = backup_credentials(state['management'])
    client_key = 'sk-leon-yifu-' + secrets.token_urlsafe(32)
    print('::add-mask::' + client_key)
    fingerprint = hashlib.sha256(client_key.encode()).hexdigest()[:16]
    updated = api.append_key(state['secret']['content'], client_key)
    payload = dict(secret_file=state['secret'], credential_files=backups,
                   credential_metadata=files, new_client_key=client_key,
                   old_claim=state['claim'], parent_version=state['parent'], entrance_version=state['entrance'])
    subprocess.run(['openssl', 'cms', '-encrypt', '-binary', '-aes256', '-outform', 'DER',
                    '-out', 'yifu-issuance-backup.enc', '.github/scripts/yifu-issue-backup-public.pem'],
                   input=json.dumps(payload).encode(), check=True, capture_output=True)
    print('YIFU_BACKUP_READY=' + json.dumps({'credential_count': len(files), 'encrypted': True}), flush=True)
    assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == state['secret']['content']
    assert api.latest_deploy()['id'] == state['deploy']['id'], 'Render deployment changed during backup'
    assert api.active('leonmingod-home') == state['parent'] and api.active('leonmingod-free-token') == state['entrance']
    api.render('/services/' + api.SERVICE + '/secret-files/config.yaml', 'PUT', {'content': updated})
    assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == updated
    print('YIFU_KEY_ADDED=' + json.dumps({'original_keys_retained': len(state['keys']),
                                       'new_keys_added': 1, 'fingerprint': fingerprint}), flush=True)
    time.sleep(5)
    pending = api.latest_deploy()
    if pending['id'] == state['deploy']['id']:
        pending = api.render('/services/' + api.SERVICE + '/deploys', 'POST', {'deployMode': 'deploy_only'})
    deploy_id = pending['id']
    print('YIFU_RENDER_DEPLOY=' + deploy_id, flush=True)
    deadline = time.monotonic() + 900
    last_status = None
    while time.monotonic() < deadline:
        pending = retry(lambda: api.render('/services/' + api.SERVICE + '/deploys/' + deploy_id))
        if pending['status'] != last_status:
            print('YIFU_RENDER_STATUS=' + pending['status'], flush=True)
            last_status = pending['status']
        if pending['status'] == 'live':
            break
        if pending['status'] in ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled']:
            raise RuntimeError('Render deployment failed; website issuance was not changed')
        time.sleep(10)
    else:
        raise RuntimeError('Render deployment timed out; website issuance was not changed')
    assert pending['commit']['id'] == EXPECTED_RENDER_COMMIT
    retry(lambda: api.restore_credentials(state['management'], backups, files))
    model_count = retry(lambda: api.models(client_key))
    for key in state['keys']:
        api.models(key)
    assert api.request(api.RENDER_ORIGIN + '/healthz')[0] == 200
    assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == updated
    assert {v['envVar']['key']: v['envVar']['value'] for v in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')} == state['env']
    print('YIFU_RENDER_VERIFIED=' + json.dumps({'models_http': 200, 'model_count': model_count,
        'original_keys_retained': len(state['keys']), 'credentials_retained': len(files)}), flush=True)
    assert api.active('leonmingod-home') == state['parent'] and api.active('leonmingod-free-token') == state['entrance']
    assert module_manifest() == state['modules'], 'Worker modules changed before publishing the new key'
    published_version = None
    try:
        # Update only the Secret, preserving every currently deployed source module and asset.
        api.cf('leonmingod-home/secrets', 'PUT',
               {'name': 'FREE_TOKEN_RENDER_KEY', 'type': 'secret_text', 'text': client_key})
        published_version = api.active('leonmingod-home')
        for attempt in range(12):
            result = retry(api.claim)
            if result.get('baseUrl') == api.RENDER_ORIGIN + '/v1' and result.get('apiKey') == client_key:
                break
            time.sleep(5)
        else:
            raise RuntimeError('Website did not publish the registered client key')
        assert api.models(result['apiKey']) == model_count
        assert module_manifest() == state['modules'], 'Parent Worker source changed during Secret update'
        assert api.active('leonmingod-free-token') == state['entrance']
        assert snapshot() == before_visuals, 'Page content, assets, or interaction scripts changed'
        after_settings = api.cf('leonmingod-home/settings')
        assert {(b['name'], b['type']) for b in after_settings['bindings']} == {(b['name'], b['type']) for b in state['settings']['bindings']}
        assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == updated
        print('YIFU_PUBLISHED=' + json.dumps({
            'base_url': result['baseUrl'], 'models_http': 200, 'model_count': model_count,
            'same_key_confirmed': True, 'fingerprint': fingerprint,
            'render_key_count': len(state['keys']) + 1, 'original_keys_retained': len(state['keys']),
            'credentials_retained': len(files), 'render_deploy': deploy_id,
            'parent_version': api.active('leonmingod-home'), 'entrance_version': state['entrance'],
            'source_modules_unchanged': True, 'visuals_and_scripts_unchanged': True,
        }), flush=True)
    except Exception:
        if published_version and api.active('leonmingod-home') == published_version:
            api.cf('leonmingod-home/deployments', 'POST', {'strategy': 'percentage',
                'versions': [{'version_id': state['parent'], 'percentage': 100}],
                'annotations': {'workers/message': 'Restore prior issuance after failed new key verification'}})
            restored = retry(api.claim)
            assert restored.get('baseUrl') == state['claim'].get('baseUrl') and restored.get('apiKey') == state['claim'].get('apiKey')
            print('YIFU_ROLLED_BACK_PARENT=' + state['parent'], flush=True)
        raise


if __name__ == '__main__':
    try:
        state = inspect()
        mode = os.environ.get('YIFU_MODE', 'inspect')
        if mode == 'issue':
            issue(state)
        elif mode != 'inspect':
            raise RuntimeError('Unknown Yifu Token operation')
    except yaml.YAMLError:
        raise RuntimeError('Invalid YAML; configuration details suppressed') from None
