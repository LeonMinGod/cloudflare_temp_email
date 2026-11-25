"""Restore OAuth before readiness, preserving live key traffic and all guard policy."""
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import threading
import time
import urllib.parse
import urllib.request
import urllib.error

import cpa_abuse_guard as guard
import yifu_key_api as api
import yifu_keys


def main():
    expected = os.environ['CPA_EXPECTED_COMMIT'].strip()
    assert len(expected) == 40 and all(c in '0123456789abcdef' for c in expected)
    assert guard.service()['autoDeploy'] == 'no', 'Hold auto-deploy before pushing CPA main'
    state = yifu_keys.read_state()
    credentials = guard.download_credentials(state)
    guard.seal_backup(state, credentials)
    snapshot = {'schema': 1, 'files': [{'name': file['name'], 'content': json.loads(credentials[file['name']]),
        'disabled': bool(file.get('disabled'))} for file in state['files']]}
    assert len(snapshot['files']) == len(credentials) and credentials
    # One KV backup per protected deploy preserves the old process high-water
    # counters until the monitoring DO can resume. No per-request KV writes.
    usage = json.loads(api.management_request(state['management'], 'observability/usage/models'))
    assert usage.get('schema') == 1 and usage.get('scope') == 'upstream_executions'
    allowed = ['id', 'provider', 'success', 'failed']
    fields = ['at', 'success', 'failed', 'ttft_ms', 'ttft_samples', 'output_tokens', 'output_ms']
    safe_usage = {key: usage[key] for key in ['schema', 'scope', 'instance_id', 'started_at', 'enabled']}
    safe_usage['models'] = [{**{key: row[key] for key in allowed},
        'recent': [{key: bucket[key] for key in fields} for bucket in row.get('recent', [])]}
        for row in usage['models']]
    # The existing GitHub token can deploy Workers but lacks this KV operation.
    # Keep a public-safe artifact so the connected CF API can complete the copy.
    Path('cpa-abuse-rollout/model-usage-before-deploy.json').write_text(json.dumps({
        'captured_at': datetime.now(timezone.utc).isoformat(), 'body': safe_usage}))
    print('CPA_MODEL_COUNTER_BACKUP=artifact-awaiting-connected-CF-copy', flush=True)
    name = 'cpa-oauth-bootstrap.json'
    content = json.dumps(snapshot, separators=(',', ':'))
    api.render('/services/' + api.SERVICE + '/secret-files/' + name, 'PUT', {'content': content})
    assert api.render('/services/' + api.SERVICE + '/secret-files/' + name)['content'] == content
    path = '/etc/secrets/' + name
    api.render('/services/' + api.SERVICE + '/env-vars/CPA_OAUTH_BOOTSTRAP_FILE', 'PUT', {'value': path})
    assert api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'] == state['secret']['content']

    samples = []
    stopped = threading.Event()

    def monitor():
        while not stopped.is_set():
            index = len(samples) % len(state['keys'])
            for key in [state['keys'][index]]:
                if stopped.is_set():
                    break
                try:
                    count = api.models(key)
                    samples.append({'key_index': index, 'http': 200, 'models': count, 'at': datetime.now(timezone.utc).isoformat()})
                except Exception as error:
                    # API helper errors contain only path/status, never keys or bodies.
                    samples.append({'key_index': index, 'http': 'failed', 'at': datetime.now(timezone.utc).isoformat(),
                        'error_type': type(error).__name__, 'reason': str(error)[:180] if isinstance(error, RuntimeError) else type(error).__name__})
            stopped.wait(10)

    thread = threading.Thread(target=monitor, daemon=True)
    thread.start()
    try:
        deploy = api.render('/services/' + api.SERVICE + '/deploys', 'POST', {'commitId': expected})
        guard.wait_deploy(deploy['id'], expected)
        files = json.loads(api.management_request(state['management'], 'credentials'))['files']
        current = {file['name']: file for file in files}
        assert {file['name'] for file in state['files']} <= set(current), 'Pool was incomplete at cutover'
        assert all(bool(current[file['name']].get('disabled')) == bool(file.get('disabled')) for file in state['files'])
        guard.verify_client_keys(state)
        assert api.request(api.RENDER_ORIGIN + '/healthz')[0] == 200
        target = os.environ.get('CPA_GUARD_IP', '').strip()
        if target:
            response = json.loads(api.management_request(state['management'], 'security/login-attempts', 'DELETE', {'ip': target}))
            assert response.get('cleared') is True
        current_env = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
        assert all(current_env.get(key) == value for key, value in state['env'].items())
        assert current_env['CPA_OAUTH_BOOTSTRAP_FILE'] == path
        assert api.active('leonmingod-home') == state['parent']
        result = {'deploy': deploy['id'], 'commit': expected, 'credentials_retained': len(state['files']),
            'static_keys_retained': len(state['keys']), 'bootstrap_before_readiness': True,
            'guard_policy_unchanged': True, 'website_unchanged': True, 'auto_deploy': 'no',
            'management_ip_cleared': bool(target)}
    finally:
        stopped.set()
        thread.join(timeout=60)
        report = {'samples': len(samples), 'failures': sum(row['http'] != 200 for row in samples),
            'keys_checked': len({row['key_index'] for row in samples})}
        Path('cpa-abuse-rollout').mkdir(exist_ok=True)
        Path('cpa-abuse-rollout/model-traffic-verification.json').write_text(json.dumps(report, indent=2))
        Path('cpa-abuse-rollout/model-traffic-samples.json').write_text(json.dumps(samples, indent=2))
        print('CPA_LIVE_TRAFFIC_MONITOR=' + json.dumps(report), flush=True)
    assert not report['failures'], 'Live key requests failed during monitored cutover'
    print('CPA_SAFE_MANAGEMENT_DEPLOY=' + json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
