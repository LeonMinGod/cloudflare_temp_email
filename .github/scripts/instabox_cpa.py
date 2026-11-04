"""Migrate and operate CPA without printing credentials or changing unrelated projects."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import time
import urllib.error
import urllib.parse
import urllib.request

import yaml
import yifu_key_api as api

MACHINE = 'm_agqzojclrfglcpkfj43t7npojy'
ROOT = '/data/workspace/leonmingod-cpa'
ORIGIN = 'https://cpa.leonmingod.com'


def instabox(path='', method='GET', data=None, query=None):
    url = 'https://api.instabox.sh/v1/machines/' + MACHINE + path
    if query:
        url += '?' + urllib.parse.urlencode(query)
    headers = {'X-API-Key': os.environ['INSTABOX_API_KEY'].strip()}
    if isinstance(data, (dict, list)):
        headers['Content-Type'] = 'application/json'
        data = json.dumps(data).encode()
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError('InstaBox ' + method + ' ' + path + ': HTTP ' + str(error.code)) from None


def render_snapshot():
    service = api.render('/services/' + api.SERVICE)
    assert service['ownerId'] == api.WORKSPACE and api.is_cpa_repo(service['repo'])
    config = api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content']
    env = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
    bootstrap_path = env.get('CPA_OAUTH_BOOTSTRAP_FILE')
    bootstrap = None
    if bootstrap_path:
        bootstrap = json.loads(api.render('/services/' + api.SERVICE + '/secret-files/' + urllib.parse.quote(bootstrap_path.rsplit('/', 1)[-1], safe=''))['content'])
        assert bootstrap['schema'] == 1 and isinstance(bootstrap['files'], list) and bootstrap['files']
    return service, config, env, bootstrap


def inspect():
    service, content, env, bootstrap = render_snapshot()
    config = yaml.safe_load(content)
    machine = instabox()
    report = {
        'machine': {'id': machine['id'], 'name': machine['name'], 'state': machine['state'],
                    'spec': machine['spec'], 'maxRunMinutes': machine.get('maxRunMinutes'),
                    'autoSuspendAfterSeconds': machine.get('autoSuspendAfterSeconds')},
        'render': {'suspended': service.get('suspended'), 'suspenders': service.get('suspenders'),
                   'commit': api.latest_deploy()['commit']['id'], 'auto_deploy': service.get('autoDeploy'),
                   'env_names': sorted(env), 'config_sections': sorted(config)},
        'bootstrap': None if not bootstrap else {
            'files': len(bootstrap['files']),
            'disabled': sum(bool(file.get('disabled')) for file in bootstrap['files']),
            'providers': sorted({str(file['content'].get('type', 'unknown')) for file in bootstrap['files']}),
            'sha256': hashlib.sha256(json.dumps(bootstrap, sort_keys=True).encode()).hexdigest()},
    }
    print('INSTABOX_INSPECT=' + json.dumps(report), flush=True)
    Path('instabox-operation').mkdir(exist_ok=True)
    Path('instabox-operation/inspect.json').write_text(json.dumps(report, indent=2))


def upload(path, content, mode='0600'):
    assert path.startswith(ROOT + '/') and '/..' not in path
    if isinstance(content, str):
        content = content.encode()
    result = instabox('/files', 'PUT', content, {'path': path, 'mode': mode, 'parents': 'true'})
    assert result['sha256'] == hashlib.sha256(content).hexdigest()


def execute(argv, stdin=None, timeout=60):
    body = {'argv': argv, 'cwd': ROOT, 'timeoutSeconds': timeout}
    if stdin is not None:
        body['stdin'] = stdin
    result = instabox('/exec', 'POST', body)
    if result.get('exitCode') != 0 or result.get('timedOut'):
        raise RuntimeError('InstaBox command failed; exit=' + str(result.get('exitCode')))
    return result.get('stdout', '')


def record(name, report):
    Path('instabox-operation').mkdir(exist_ok=True)
    Path('instabox-operation/' + name + '.json').write_text(json.dumps(report, indent=2))
    print('INSTABOX_' + name.upper() + '=' + json.dumps(report), flush=True)


def restore():
    exists = execute(['python3', '-c', 'import pathlib;print(pathlib.Path(' + repr(ROOT + '/private/migration-complete.json') + ').exists())']).strip()
    assert exists == 'False', 'Migration already completed; never overwrite newer OAuth files with the Render snapshot'
    service, content, env, bootstrap = render_snapshot()
    assert bootstrap and len(bootstrap['files']) > 0, 'Missing protected OAuth snapshot'
    config = yaml.safe_load(content)
    original_keys = list(config['api-keys'])
    config.update({'host': '0.0.0.0', 'port': 8317, 'auth-dir': ROOT + '/auths'})
    env.update({'CPA_OAUTH_BOOTSTRAP_FILE': ROOT + '/private/oauth-bootstrap.json',
                'MANAGEMENT_STATIC_PATH': ROOT + '/static', 'TZ': 'Asia/Shanghai'})
    assert env.get('CPA_ABUSE_URL') and env.get('CPA_ABUSE_SECRET') and env.get('CPA_REMOTE_KEY_AUTH') == '1'
    assert original_keys == config['api-keys'] and env.get('MANAGEMENT_PASSWORD')
    assert all('\n' not in value and '\r' not in value and '\x00' not in value for value in env.values())
    upload(ROOT + '/private/config.yaml', yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
    upload(ROOT + '/private/oauth-bootstrap.json', json.dumps(bootstrap, separators=(',', ':')))
    upload(ROOT + '/private/runtime.env', ''.join(name + '=' + json.dumps(value, ensure_ascii=False) + '\n' for name, value in env.items()))
    unit = '[Unit]\nDescription=LeonMinGod CPA\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nUser=user\nGroup=user\nWorkingDirectory=' + ROOT + '\nEnvironmentFile=' + ROOT + '/private/runtime.env\nExecStart=' + ROOT + '/bin/CLIProxyAPI --config ' + ROOT + '/private/config.yaml\nRestart=on-failure\nRestartSec=3\nTimeoutStopSec=90\nUMask=0077\nNoNewPrivileges=true\n\n[Install]\nWantedBy=multi-user.target\n'
    upload(ROOT + '/systemd/leonmingod-cpa.service', unit, '0644')
    ensure = '#!/bin/sh\nset -eu\ntest -x ' + shlex.quote(ROOT + '/bin/CLIProxyAPI') + '\nsudo install -m 0644 ' + shlex.quote(ROOT + '/systemd/leonmingod-cpa.service') + ' /etc/systemd/system/leonmingod-cpa.service\nsudo systemctl daemon-reload\nsudo systemctl enable leonmingod-cpa.service >/dev/null 2>&1\nsudo systemctl start leonmingod-cpa.service\n'
    upload(ROOT + '/bin/ensure-running.sh', ensure, '0700')
    execute(['bash', '-c', 'chmod 700 ' + shlex.quote(ROOT + '/private') + '; mkdir -p ' + shlex.quote(ROOT + '/auths') + ' ' + shlex.quote(ROOT + '/static') + '; chmod 700 ' + shlex.quote(ROOT + '/auths')])
    execute(['bash', ROOT + '/bin/ensure-running.sh'])
    report = None
    for _ in range(36):
        try:
            report = verify(local=True)
            break
        except RuntimeError:
            time.sleep(2)
    assert report and report['credentials'] == len(bootstrap['files']), 'Restored service did not become ready with all credentials'
    report.update({'source': 'Render pre-start OAuth snapshot', 'snapshot_files': len(bootstrap['files']),
                   'render_suspended': service.get('suspended'), 'original_static_keys': len(original_keys),
                   'all_static_keys_preserved': True, 'guard_environment_preserved': True})
    upload(ROOT + '/private/migration-complete.json', json.dumps(report))
    record('restore', report)


def verify(local=False):
    code = '''import json,pathlib,urllib.request
root=pathlib.Path(ROOT)
env={name:json.loads(value) for name,value in (line.split('=',1) for line in (root/'private/runtime.env').read_text().splitlines())}
origin=ORIGIN
def get(path,key=None):
    headers={'User-Agent':'LeonMinGod-Migration/1.0'}
    if key:headers['Authorization']='Bearer '+key
    with urllib.request.urlopen(urllib.request.Request(origin+path,headers=headers),timeout=30) as response:return json.load(response)
assert get('/healthz')['status']=='ok'
files=get('/v8/management/credentials',env['MANAGEMENT_PASSWORD'])['files']
print(json.dumps({'health':200,'credentials':len(files),'disabled':sum(bool(row.get('disabled')) for row in files),'providers':sorted({row.get('provider') or row.get('type') or 'unknown' for row in files}),'origin':origin}))
'''.replace('ROOT', repr(ROOT)).replace('ORIGIN', repr('http://127.0.0.1:8317' if local else ORIGIN))
    report = json.loads(execute(['python3', '-c', code]))
    if not local:
        record('verify', report)
    return report


def backup():
    # Recovery copies stay encrypted at rest, including in GitHub artifacts.
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import base64
    code = '''import json,pathlib
root=pathlib.Path(ROOT)
files={str(path.relative_to(root)):path.read_text() for directory in ['private','auths','systemd'] for path in (root/directory).rglob('*') if path.is_file()}
print(json.dumps({'schema':1,'files':files}))
'''.replace('ROOT', repr(ROOT))
    content = execute(['python3', '-c', code]).encode()
    nonce = os.urandom(12)
    key = hashlib.sha256((os.environ['INSTABOX_API_KEY'].strip() + '\ncpa-instabox-backup-v1').encode()).digest()
    envelope = {'format':'AES-256-GCM','purpose':'cpa-instabox-backup-v1','created':int(time.time()),
                'nonce':base64.b64encode(nonce).decode(),
                'ciphertext':base64.b64encode(AESGCM(key).encrypt(nonce, content, b'cpa-instabox-backup-v1')).decode()}
    Path('instabox-operation').mkdir(exist_ok=True)
    Path('instabox-operation/cpa-backup.enc.json').write_text(json.dumps(envelope))
    record('backup', {'encrypted':True,'files':len(json.loads(content)['files'])})


if __name__ == '__main__':
    mode = os.environ.get('INSTABOX_MODE', 'inspect')
    if mode == 'inspect':
        inspect()
    elif mode == 'restore':
        restore()
    elif mode in {'status', 'verify'}:
        verify()
    elif mode == 'backup':
        backup()
    else:
        raise RuntimeError('Operation is not implemented: ' + mode)
