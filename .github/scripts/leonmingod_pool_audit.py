"""Read-only quota contract audit; output only aggregate/public-safe fields."""
import json
import os
import time
import urllib.error
import urllib.request
import yaml
import yifu_key_api as api

before = api.latest_deploy()['id']
values = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
key = values.get('MANAGEMENT_PASSWORD')
if not key:
    config = yaml.safe_load(api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'])
    key = next((config.get(name, {}).get('secret-key') for name in ['management', 'remote-management'] if isinstance(config.get(name), dict) and config[name].get('secret-key')), None)
assert isinstance(key, str) and key and not key.startswith('$2'), 'No available management credential'
print('::add-mask::' + key)
files = json.loads(api.management_request(key, 'credentials'))['files']
result = {'accounts': len(files), 'fields': sorted(set().union(*(set(f) for f in files))), 'providers': sorted({f.get('provider', f.get('type', 'unknown')) for f in files})}
account = next((f for f in files if f.get('provider', f.get('type')) == 'codex' and not f.get('disabled') and f.get('status') == 'active'), None)
if account:
    result['observed_signal_keys'] = sorted((account.get('quota') or {}).get('signals', {}))
    headers = {'Authorization': 'Bearer $TOKEN$', 'Accept': 'application/json'}
    account_id = (account.get('id_token') or {}).get('chatgpt_account_id')
    if account_id:
        headers['Chatgpt-Account-Id'] = account_id
    response = json.loads(api.management_request(key, 'requests/api-call', 'POST', {'auth_index': account['auth_index'], 'method': 'GET', 'url': 'https://chatgpt.com/backend-api/wham/usage', 'header': headers}))
    result['quota_http'] = response.get('status_code')
    if result['quota_http'] == 200:
        body = json.loads(response['body'])
        result['quota_fields'] = sorted(body)
        result['plan_type'] = body.get('plan_type')
        rate = body.get('rate_limit') or {}
        result['windows'] = {k: {field: v.get(field) for field in ['used_percent', 'limit_window_seconds', 'reset_at', 'reset_after_seconds']} for k, v in rate.items() if k in ['primary_window', 'secondary_window'] and isinstance(v, dict)}
        credits = body.get('credits') or {}
        result['credits'] = {k: credits.get(k) for k in ['balance', 'unlimited', 'has_credits']}
if os.environ.get('POOL_VERIFY_MODEL_USAGE') == 'true':
    stats = json.loads(api.management_request(key, 'observability/usage/models'))
    assert stats.get('schema') == 1 and stats.get('enabled') is True
    requested = 'gpt-6.1-sol'
    count = lambda data: sum(row['success'] + row['failed'] for row in data['models'] if row['id'] == requested)
    original = count(stats)
    config = yaml.safe_load(api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'])
    clients = (config.get('access') or {}).get('api-keys', config.get('api-keys'))
    assert isinstance(clients, list) and clients and isinstance(clients[0], str)
    print('::add-mask::' + clients[0])
    payload = json.dumps({'model': requested, 'messages': [{'role': 'user', 'content': 'Reply only OK.'}], 'max_tokens': 4, 'stream': True}).encode()
    request = urllib.request.Request(api.RENDER_ORIGIN + '/v1/chat/completions', data=payload, headers={
        'Authorization': 'Bearer ' + clients[0], 'Content-Type': 'application/json', 'User-Agent': 'LeonMinGod-model-statistics-verification/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            http_status = response.status
            while response.read(16384):
                pass
    except urllib.error.HTTPError as error:
        http_status = error.code
        error.close()
    for _ in range(20):
        current = json.loads(api.management_request(key, 'observability/usage/models'))
        assert current['instance_id'] == stats['instance_id'], 'CPA restarted during verification'
        if count(current) > original:
            break
        time.sleep(.5)
    assert count(current) > original, 'Completed model execution was not counted'
    repeated = json.loads(api.management_request(key, 'observability/usage/models'))
    assert count(repeated) >= count(current), 'Reading statistics consumed records'
    assert api.request(api.RENDER_ORIGIN + '/healthz')[0] == 200
    result['model_usage_verification'] = {'model': requested, 'http_status': http_status,
        'before': original, 'after': count(current), 'non_destructive': True,
        'rows': len(current['models']), 'fields': sorted(current['models'][0]) if current['models'] else []}
assert before == api.latest_deploy()['id'], 'Deployment changed during read-only audit'
print('POOL_AUDIT=' + json.dumps(result, ensure_ascii=False))
