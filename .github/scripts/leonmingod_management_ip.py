"""Inspect or clear one management-login ban without exposing management credentials."""
import ipaddress
import json
import os
import re
import urllib.error
import urllib.request
import yaml

import cpa_abuse_guard as guard
import yifu_key_api as api


def main():
    target = str(ipaddress.ip_address(os.environ['CPA_GUARD_IP'].strip()))
    config = yaml.safe_load(api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'])
    env = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
    key = env.get('MANAGEMENT_PASSWORD')
    if not key:
        key = next((config.get(name, {}).get('secret-key') for name in ['management', 'remote-management'] if isinstance(config.get(name), dict) and config[name].get('secret-key')), None)
    assert key and not key.startswith('$2'), 'No available management credential'
    print('::add-mask::' + key)
    result = {'target_ip': target, 'trusted_proxies': config.get('trusted-proxies', (config.get('server') or {}).get('trusted-proxies', []))}
    outer = guard.rpc({'action': 'status'})
    peer = next((p for p in outer.get('peers', []) if p['ip'] == target), None)
    result['outer_guard_active'] = peer.get('active') if peer else None
    result['outer_guard_counters'] = peer.get('counters') if peer else {}

    def call(path, method='GET', body=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(api.RENDER_ORIGIN + '/v8/management/' + path, data=data, method=method,
            headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'LeonMinGod-management-diagnostics/1.0'})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            try:
                value = json.loads(error.read(4096))
            except ValueError:
                value = {}
            return error.code, value

    status, credentials = call('credentials')
    result['management_http'] = status
    if status != 200:
        message = str(credentials.get('error', ''))
        result['management_banned'] = message.startswith('IP banned due to too many failed attempts.')
        result['management_reason'] = message if result['management_banned'] else 'management access denied'
    else:
        result['credential_count'] = len(credentials.get('files', []))
        status, logs = call('observability/logs?limit=3000')
        result['application_logs_http'] = status
        lines = logs.get('lines', []) if isinstance(logs, dict) else []
        matched = []
        for line in lines:
            if target not in line:
                continue
            parsed = re.search(r'\[GIN\].*?\|\s*(\d{3})\s*\|.*?\|.*?\|\s*(GET|POST|PUT|PATCH|DELETE|HEAD)\s+"([^"?]*)', line)
            if parsed:
                matched.append({'status': int(parsed[1]), 'method': parsed[2], 'path': parsed[3], 'time': line[:25]})
        result['target_requests'] = matched[-30:]
        status, native = call('security/login-attempts?ip=' + target)
        result['native_status_http'] = status
        if status == 200:
            result['native_login_record'] = native
            result['management_client_ip_is_public'] = ipaddress.ip_address(native['client_ip']).is_global
        if os.environ['SECURITY_MODE'] == 'management-verify-current':
            assert status == 200 and result.get('management_client_ip_is_public'), 'Management client IP is still a proxy'
            keys = (config.get('access') or {}).get('api-keys', config.get('api-keys'))
            assert keys
            counts = []
            for _ in range(5):
                for client_key in keys:
                    counts.append(api.models(client_key))
            assert all(count > 0 for count in counts)
            result['current_model_api_checks'] = {'successful': len(counts), 'failed': 0, 'keys': len(keys)}
        if os.environ['SECURITY_MODE'] == 'management-unban':
            assert status == 200, 'Deploy the management recovery endpoint before clearing a native ban'
            status, reset = call('security/login-attempts', 'DELETE', {'ip': target})
            assert status == 200 and reset.get('cleared') is True
            result['native_cleared'] = True
    print('MANAGEMENT_IP=' + json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
