"""Inspect CPA probe logs without exposing request credentials or payloads."""
import base64,hashlib,hmac,ipaddress,json,os,re,secrets,time,urllib.parse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import yaml
import yifu_key_api as api
import yifu_keys

state=yifu_keys.read_state()
config=yaml.safe_load(state['secret']['content'])
files=json.loads(api.management_request(state['management'],'observability/logs/errors'))['files']
selected=[f for f in files if f['name'].startswith('error-api-show-2026-10-27')][:60]
salt=secrets.token_bytes(16)
def safe_log(file):
    text=api.management_request(state['management'],'observability/logs/errors/'+urllib.parse.quote(file['name'],safe='')).decode(errors='replace')
    def field(name):
        match=re.search(r'^'+re.escape(name)+r':\s*([^\r\n]*)',text,re.M|re.I)
        return match[1] if match else None
    addresses={}
    for name in ['CF-Connecting-IP','CF-Connecting-IPv6','True-Client-IP','X-Forwarded-For','X-Real-IP']:
        value=field(name)
        if value:
            values=[]
            for part in value.split(','):
                try:
                    ip=ipaddress.ip_address(part.strip());values.append({'fingerprint':hmac.new(salt,str(ip).encode(),hashlib.sha256).hexdigest()[:12],'public':ip.is_global,'version':ip.version})
                except ValueError:values.append({'invalid':True})
            addresses[name]=values
    route=urllib.parse.urlsplit(field('URL') or '').path
    status=field('Status')
    return {'name':file['name'],'method':field('Method'),'path':route,'status':int(status) if status and status.isdigit() else None,'timestamp':field('Timestamp'),'address_headers':addresses,'cf_ray_present':bool(field('Cf-Ray'))}, text
with ThreadPoolExecutor(max_workers=3) as pool:logs=list(pool.map(safe_log,selected))
assert not any(f.get('runtime_only') for f in state['files'])
def credential(f):
    return f['name'],api.management_request(state['management'],'credentials/download?name='+urllib.parse.quote(f['name'],safe='')).decode()
with ThreadPoolExecutor(max_workers=3) as pool:backups=dict(pool.map(credential,state['files']))
raw={'state':state,'credentials':backups,'logs':dict((v[0]['name'],v[1]) for v in logs)}
out=Path('api-abuse-audit');out.mkdir(exist_ok=True)
nonce=secrets.token_bytes(12);key=hashlib.sha256((os.environ['RENDER_API_KEY'].strip()+'\napi-abuse-backup-v1').encode()).digest()
(out/'cpa-backup.enc.json').write_text(json.dumps({'format':'AES-256-GCM','purpose':'api-abuse-backup-v1','created':int(time.time()),'nonce':base64.b64encode(nonce).decode(),'ciphertext':base64.b64encode(AESGCM(key).encrypt(nonce,json.dumps(raw).encode(),b'api-abuse-backup-v1')).decode()}))
summary={'service':api.SERVICE,'deploy':state['deploy']['id'],'commit':state['deploy']['commit']['id'],'key_count':len(state['keys']),'credentials_backed_up':len(backups),'trusted_proxies':config.get('trusted-proxies',(config.get('server') or {}).get('trusted-proxies')),'total_error_logs':len(files),'selected_logs':[v[0] for v in logs]}
(out/'cpa-summary.json').write_text(json.dumps(summary,indent=2))
print('CPA_ABUSE_INSPECT='+json.dumps(summary))
