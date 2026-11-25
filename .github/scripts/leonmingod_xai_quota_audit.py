"""Read the native xAI quota contract; emit only allowlisted quota/plan fields."""
import json
import re
import yaml
import yifu_key_api as api

before = api.latest_deploy()['id']
values = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
key = values.get('MANAGEMENT_PASSWORD')
if not key:
    config = yaml.safe_load(api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content'])
    key = next((config.get(name, {}).get('secret-key') for name in ['management', 'remote-management'] if isinstance(config.get(name), dict) and config[name].get('secret-key')), None)
assert key and not key.startswith('$2')
print('::add-mask::' + key)
files = json.loads(api.management_request(key, 'credentials'))['files']
file = next(file for file in files if file.get('provider', file.get('type')) == 'xai' and not file.get('disabled'))
headers = {'Authorization': 'Bearer $TOKEN$', 'x-xai-token-auth': 'xai-grok-cli', 'x-grok-client-version': '1.0.46',
    'Accept': '*/*', 'User-Agent': 'grok-pager/1.0.46 grok-shell/1.0.46 (macos; aarch64)'}
for name in ['sub', 'subject', 'user_id', 'userId']:
    if file.get(name):
        headers['x-userid'] = file[name]
        break
result = {}
for name, path in [('credits', 'billing?format=credits'), ('billing', 'billing'), ('user', 'user?include=subscription'), ('settings', 'settings')]:
    response = json.loads(api.management_request(key, 'requests/api-call', 'POST', {'auth_index': file['auth_index'], 'method': 'GET',
        'url': 'https://cli-chat-proxy.grok.com/v1/' + path, 'header': headers}))
    item = {'http': response.get('status_code')}
    if item['http'] == 200:
        body = json.loads(response['body']) if isinstance(response['body'], str) else response['body']
        item['fields'] = sorted(body)
        config = body.get('config')
        if isinstance(config, dict):
            safe = {}
            for field in ['creditUsagePercent', 'credit_usage_percent', 'monthlyLimit', 'monthly_limit', 'used', 'onDemandCap', 'on_demand_cap', 'onDemandUsed', 'on_demand_used', 'prepaidBalance']:
                value = config.get(field)
                if isinstance(value, dict): value = value.get('val')
                if isinstance(value, (int, float)) or isinstance(value, str) and re.fullmatch(r'\d+(?:\.\d+)?', value): safe[field] = value
            period = config.get('currentPeriod', config.get('current_period'))
            if isinstance(period, dict):safe['currentPeriod'] = {k: period.get(k) for k in ['type', 'start', 'end']}
            products = config.get('productUsage', config.get('product_usage', []))
            safe['productUsage'] = [{k: product.get(k) for k in ['product', 'usagePercent', 'usage_percent']} for product in products if isinstance(product, dict) and re.fullmatch(r'[A-Za-z0-9 _-]{1,50}', str(product.get('product', '')))]
            item['config'] = safe
        for field in ['subscriptionTier', 'subscription_tier', 'subscription_tier_display', 'subscriptionTierDisplay']:
            value = body.get(field)
            if isinstance(value, str) and re.fullmatch(r'[A-Za-z _-]{1,50}', value):item[field] = value
    result[name] = item
assert before == api.latest_deploy()['id']
print('XAI_QUOTA_AUDIT=' + json.dumps(result, ensure_ascii=False))
