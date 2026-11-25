"""Enable the existing CPA statistics switch with encrypted backup and OAuth-safe rollout."""
import copy
import json
import os
import shutil
import yaml

import cpa_abuse_guard as guard
import yifu_key_api as api
import yifu_keys


def enable_statistics(content):
    original = yaml.safe_load(content)
    updated = copy.deepcopy(original)
    path = ['observability', 'usage', 'usage-statistics-enabled'] if 'observability' in original else ['usage-statistics-enabled']
    parent = updated
    for name in path[:-1]:
        parent = parent.setdefault(name, {})
    parent[path[-1]] = True
    # Replace only the scalar when present; preserve every other byte.
    node = yaml.compose(content)
    for name in path:
        node = next((value for key, value in node.value if key.value == name), None) if isinstance(node, yaml.MappingNode) else None
    if isinstance(node, yaml.ScalarNode):
        result = content[:node.start_mark.index] + 'true' + content[node.end_mark.index:]
    else:
        result = yaml.safe_dump(updated, allow_unicode=True, sort_keys=False)
    assert yaml.safe_load(result) == updated, 'Unrelated configuration changed'
    return result, '.'.join(path)


def main():
    state = yifu_keys.read_state()
    expected = os.environ.get('CPA_EXPECTED_COMMIT')
    assert state['deploy']['commit']['id'] == expected, 'CPA commit changed before configuration rollout'
    updated, path = enable_statistics(state['secret']['content'])
    if updated == state['secret']['content']:
        print('POOL_STATISTICS_CONFIG=already-enabled')
        return
    credentials = guard.download_credentials(state)
    guard.seal_backup(state, credentials)
    shutil.copyfile(guard.BACKUP, guard.BACKUP.with_name('cpa-before-model-statistics.enc.json'))
    guard.hold()
    success = False
    try:
        api.render('/services/' + api.SERVICE + '/secret-files/config.yaml', 'PUT', {'content': updated})
        assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == updated
        guard.deploy()
        usage = json.loads(api.management_request(state['management'], 'observability/usage/models'))
        assert usage.get('enabled') is True, 'Model statistics are still disabled'
        guard.restore_credentials(state, credentials)
        current = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
        assert current == state['env'], 'Unrelated environment variables changed'
        assert api.active('leonmingod-home') == state['parent'], 'Website changed during CPA rollout'
        success = True
        print('POOL_STATISTICS_CONFIG=' + json.dumps({'enabled': True, 'only_config_path_changed': path,
            'credentials_retained': len(credentials), 'client_keys_retained': len(state['keys'])}))
    finally:
        if not success:
            api.render('/services/' + api.SERVICE + '/secret-files/config.yaml', 'PUT', {'content': state['secret']['content']})
        guard.set_auto_deploy('yes')


if __name__ == '__main__':
    main()
