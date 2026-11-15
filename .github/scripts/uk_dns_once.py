"""Create only the owner's UK VPN A record using the existing Actions secret."""
import json,os,sys,urllib.request,urllib.error
from pathlib import Path
DOMAIN='uk.leonmingod.com'
ADDRESS='85.189.120.140'

def verify(records):
    if len(records)>1 or any(r.get('type')!='A' or r.get('content')!=ADDRESS or r.get('proxied') is not False for r in records):
        raise ValueError('UK hostname already has conflicting DNS records')

def main():
    def api(path,method='GET',body=None):
        req=urllib.request.Request('https://api.cloudflare.com/client/v4/'+path,
            data=None if body is None else json.dumps(body).encode(),method=method,
            headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'].strip(),'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=30) as r:value=json.load(r)
        except urllib.error.HTTPError as error:
            raise RuntimeError('Cloudflare HTTP '+str(error.code)) from None
        if not value.get('success'):raise RuntimeError('Cloudflare API rejected the operation')
        return value['result']
    root=Path('uk-dns-result');root.mkdir(exist_ok=True)
    zones=api('zones?name=leonmingod.com')
    matches=[z for z in zones if z['name']=='leonmingod.com']
    if len(matches)!=1:raise RuntimeError('Owner zone not unique')
    prefix='zones/'+matches[0]['id']+'/dns_records'
    old=api(prefix+'?name='+DOMAIN);verify(old)
    (root/'before.json').write_text(json.dumps({'name':DOMAIN,'records':old},indent=2))
    created=False
    if not old:
        row=api(prefix,'POST',{'type':'A','name':DOMAIN,'content':ADDRESS,'ttl':300,'proxied':False,'comment':'Owner authorized UK London VPN endpoint'})
        created=True
    current=api(prefix+'?name='+DOMAIN);verify(current)
    if len(current)!=1:raise RuntimeError('UK DNS record was not persisted')
    report={'status':'passed','name':DOMAIN,'ipv4':ADDRESS,'proxied':False,'created':created,
        'other_dns_records_changed':False,'record_id':current[0]['id']}
    (root/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

def self_test():
    verify([]);verify([{'type':'A','content':ADDRESS,'proxied':False}])
    for bad in [[{'type':'A','content':'192.0.2.1','proxied':False}],
                [{'type':'CNAME','content':ADDRESS,'proxied':False}],
                [{'type':'A','content':ADDRESS,'proxied':True}]]:
        try:verify(bad)
        except ValueError:continue
        raise AssertionError('Conflicting DNS record accepted')
    print('UK-only DNS scope checks passed')

if __name__=='__main__':
    if '--self-test' in sys.argv:self_test()
    else:
        try:main()
        except Exception as e:print(json.dumps({'status':'failed','error_type':type(e).__name__}));sys.exit(1)
