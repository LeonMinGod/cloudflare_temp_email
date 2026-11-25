"""Install a server-only status credential; never change Render config or OAuth files."""
import json
import os
import yaml
import yifu_key_api as api


def main():
    service = api.render('/services/' + api.SERVICE)
    assert service['ownerId'] == api.WORKSPACE
    assert api.is_cpa_repo(service['repo']) and service['branch'] == 'main'
    before = api.latest_deploy()['id']
    config = yaml.safe_load(api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'])
    values = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
    candidates = [values.get('MANAGEMENT_PASSWORD')]
    candidates += [(config.get(name) or {}).get('secret-key') for name in ['management', 'remote-management'] if isinstance(config.get(name), dict)]
    management = None
    files = None
    for candidate in dict.fromkeys(value for value in candidates if isinstance(value, str) and value and not value.startswith('$2')):
        try:
            files = json.loads(api.management_request(candidate, 'credentials'))['files']
            management = candidate
            break
        except RuntimeError:
            continue
    assert management and isinstance(files, list), 'CPA management status is not available'
    settings = api.cf('leonmingod-home/settings')
    preserved = {(item['name'], item['type']) for item in settings['bindings']}
    api.cf('leonmingod-home/secrets', 'PUT', {'name': 'CPA_STATUS_MANAGEMENT_KEY', 'text': management, 'type': 'secret_text'})
    current = api.cf('leonmingod-home/settings')['bindings']
    assert preserved <= {(item['name'], item['type']) for item in current}
    assert any(item['name'] == 'CPA_STATUS_MANAGEMENT_KEY' and item['type'] == 'secret_text' for item in current)
    assert before == api.latest_deploy()['id'], 'Render deployment changed during status setup'
    print('POOL_SETUP=' + json.dumps({'configured': True, 'credential_count': len(files), 'credential_fields': sorted(set().union(*(set(item) for item in files))), 'parent_version': api.active('leonmingod-home'), 'entrance_version': api.active('leonmingod-free-token'), 'render_unchanged': True}))


if __name__ == '__main__':
    main()
