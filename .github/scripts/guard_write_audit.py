"""Bounded guard-only verification; no live ban tests, key rotation or deploys."""
import hashlib
import hmac
import json
import time
import urllib.parse
import yaml
import cpa_abuse_guard as guard
import yifu_key_api as api

before = api.latest_deploy()['id']
state = guard.rpc({'action': 'status'})
result = {'guard_enabled': state['config']['enabled'], 'active_bans': sum(bool(p.get('active')) for p in state.get('peers', []))}
config = yaml.safe_load(api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'])
keys = (config.get('access') or {}).get('api-keys', config.get('api-keys'))
assert keys and isinstance(keys[0], str)
result['static_models'] = api.models(keys[0])
assert result['static_models'] > 0

namespace = 'storage/kv/namespaces/1b02d139375045f7a7d5ce2d994abd2c'
entries = guard.cf_account(namespace + '/keys?prefix=key%3A&limit=1000')
active = None
for entry in entries:
    name = entry['name']
    if not name.startswith('key:') or len(name) != 68:
        continue
    raw = api.request('https://api.cloudflare.com/client/v4/accounts/' + guard.required('CLOUDFLARE_ACCOUNT_ID') + '/' + namespace + '/values/' + urllib.parse.quote(name, safe=''),
        headers={'Authorization': 'Bearer ' + guard.required('CLOUDFLARE_API_TOKEN')})[2]
    if json.loads(raw).get('status') == 'active':
        active = name[4:]
        break
assert active, 'No active personal registry record available'
path = '/v1/authorize'
body = json.dumps({'key_sha256': active, 'path': '/v1/models'}, separators=(',', ':')).encode()
header = guard.signature(path, body, False)
status, headers, raw = api.request(guard.worker_url() + path, 'POST', body, {
    'Content-Type': 'application/json', 'X-CPA-Guard': header,
})
signed = headers['X-CPA-Guard'].split(':')
assert len(signed) == 3 and signed[1] == header.split(':')[1]
expected = hmac.new(guard.derive('service').encode(),
    (signed[0] + '\n' + signed[1] + '\n200\n' + path + '\n').encode() + raw, hashlib.sha256).hexdigest()
assert hmac.compare_digest(signed[2], expected)
assert abs(int(signed[0]) - int(time.time() * 1000)) < 60000
decision = json.loads(raw)
assert decision['reason'] in ('ok', 'rate_limited'), 'Active registry key rejected'
result['personal_key_authorization'] = {'http': status, 'signed': True, 'allow': decision['allow'], 'reason': decision['reason']}
result['health'] = api.request(api.RENDER_ORIGIN + '/healthz')[0]
result['render_deploy_unchanged'] = api.latest_deploy()['id'] == before
assert result['health'] == 200 and result['render_deploy_unchanged']
print('GUARD_WRITE_AUDIT=' + json.dumps(result))
