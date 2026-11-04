"""Migrate and operate CPA without printing credentials or changing unrelated projects."""
import hashlib
import json
import os
from pathlib import Path
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


if __name__ == '__main__':
    mode = os.environ.get('INSTABOX_MODE', 'inspect')
    if mode == 'inspect':
        inspect()
    else:
        raise RuntimeError('Operation is not implemented: ' + mode)
