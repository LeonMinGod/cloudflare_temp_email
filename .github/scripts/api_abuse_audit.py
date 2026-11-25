"""Read-only capability/topology audit. Full configuration backup is encrypted."""
import base64, hashlib, json, os, secrets, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import yifu_key_api as api

account = os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()
zone = '4f078f06b815a404337c3b5387c45275'
headers = {'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'].strip()}
paths = {
    'zone': f'zones/{zone}', 'dns': f'zones/{zone}/dns_records?per_page=100',
    'routes': f'zones/{zone}/workers/routes', 'rulesets': f'zones/{zone}/rulesets',
    'rate_limits': f'zones/{zone}/rate_limits', 'firewall': f'zones/{zone}/firewall/rules',
    'access_rules': f'zones/{zone}/firewall/access_rules/rules',
    'api_gateway': f'zones/{zone}/api_gateway/operations?per_page=100',
    'logpush': f'zones/{zone}/logpush/jobs', 'logpush_account': f'accounts/{account}/logpush/jobs',
    'workers': f'accounts/{account}/workers/scripts', 'domains': f'accounts/{account}/workers/domains',
    'subscriptions': f'accounts/{account}/subscriptions', 'pseudo_ipv4': f'zones/{zone}/settings/pseudo_ipv4',
}
def get(item):
    name,path=item
    try:
        result=json.loads(api.request('https://api.cloudflare.com/client/v4/'+path,headers=headers)[2])
        return name, {'ok':bool(result.get('success')), 'result':result.get('result'), 'error_codes':[e.get('code') for e in (result.get('errors') or [])]}
    except RuntimeError as error:
        return name, {'ok':False,'error':str(error)}
with ThreadPoolExecutor(max_workers=5) as pool: raw=dict(pool.map(get,paths.items()))
detail={}
for item in raw.get('rulesets',{}).get('result') or []:
    name,data=get(('ruleset:'+item['id'],f'zones/{zone}/rulesets/{item["id"]}'));detail[name]=data
for item in raw.get('workers',{}).get('result') or []:
    name=item['id']
    key,data=get(('worker:'+name,f'accounts/{account}/workers/scripts/{name}/settings'));detail[key]=data
raw.update(detail)
output=Path('api-abuse-audit');output.mkdir(exist_ok=True)
key=hashlib.sha256((os.environ['RENDER_API_KEY'].strip()+'\napi-abuse-backup-v1').encode()).digest()
nonce=secrets.token_bytes(12)
encrypted=AESGCM(key).encrypt(nonce,json.dumps(raw).encode(),b'api-abuse-backup-v1')
(output/'config-backup.enc.json').write_text(json.dumps({'format':'AES-256-GCM','purpose':'api-abuse-backup-v1','created':int(time.time()),'nonce':base64.b64encode(nonce).decode(),'ciphertext':base64.b64encode(encrypted).decode()}))
summary={'capabilities':{k:{'readable':v['ok'],**({'error':v.get('error'),'error_codes':v.get('error_codes')} if not v['ok'] else {})} for k,v in raw.items()}}
z=raw['zone'].get('result') or {};summary['zone']={'name':z.get('name'),'status':z.get('status'),'plan':z.get('plan')}
summary['dns']=[{k:v.get(k) for k in ['name','type','content','proxied']} for v in raw['dns'].get('result') or [] if v.get('type') in ['A','AAAA','CNAME']]
summary['routes']=raw['routes'].get('result')
summary['domains']=raw['domains'].get('result')
summary['subscriptions']=[{'plan':v.get('rate_plan'),'state':v.get('state')} for v in raw['subscriptions'].get('result') or []]
summary['pseudo_ipv4']=raw['pseudo_ipv4'].get('result')
summary['rulesets']=[{'name':v['result'].get('name'),'phase':v['result'].get('phase'),'rules':[{'id':r.get('id'),'action':r.get('action'),'enabled':r.get('enabled'),'description':r.get('description')} for r in v['result'].get('rules',[])]} for k,v in detail.items() if k.startswith('ruleset:') and v['ok']]
summary['workers']=[{'name':k[7:],'bindings':[{'name':b.get('name'),'type':b.get('type'),'service':b.get('service')} for b in v['result'].get('bindings',[])],'observability':v['result'].get('observability')} for k,v in detail.items() if k.startswith('worker:') and v['ok']]
summary['counts']={k:len(raw[k].get('result') or []) for k in ['rate_limits','firewall','access_rules','api_gateway','logpush','logpush_account'] if raw[k]['ok']}
(output/'summary.json').write_text(json.dumps(summary,indent=2))
print('API_ABUSE_AUDIT='+json.dumps(summary))
