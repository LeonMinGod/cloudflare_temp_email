"""Stage/publish only the recovered current website; retain the live asset set and bindings."""
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import time
import urllib.request
import urllib.error
from email.parser import BytesParser
import email.policy

import yifu_key_api as api

root = Path('sites/leonmingod-star-night')
mode = os.environ.get('WEBSITE_MODE', 'stage')
release = json.loads((root / ('dist/release.json' if mode == 'stage' else 'release.json')).read_text())
(root/'dist').mkdir(exist_ok=True)
worker = 'leonmingod-home'
parent = api.active(worker)
entrance = api.active('leonmingod-free-token')
assert parent == release['baseline_parent'], 'Parent changed since source recovery; reread and review before publishing'
assert entrance == release['baseline_entrance'], 'Entrance changed since source recovery'
settings = api.cf(worker + '/settings')
bindings = settings['bindings']
plain_bindings = release.get('plain_bindings', {})
assert isinstance(plain_bindings, dict) and set(plain_bindings) <= {'VPS_POOL_ENDPOINT'}
assert not plain_bindings or plain_bindings == {'VPS_POOL_ENDPOINT': 'https://yifu.leonmingod.com/_pool/status'}
for name in plain_bindings:
    assert all(b['type'] == 'plain_text' for b in bindings if b['name'] == name), 'Cannot replace a protected binding'
extra_bindings = [{'name': name, 'type': 'plain_text', 'text': value} for name, value in plain_bindings.items()]
expected_bindings = {(b['name'], b['type']) for b in bindings} | {(b['name'], b['type']) for b in extra_bindings}
game = [b for b in bindings if b['name'] == 'GAME_RUNS']
assert len(game) == 1 and game[0]['class_name'] == 'GameRun' and game[0]['namespace_id'] == '2dffacc2783647f0bec81263501de5e1'
has_reward_binding = any(b['name'] == 'FREE_TOKEN_RENDER_KEY' and b['type'] == 'secret_text' for b in bindings)
assert any(b['name'] == 'ASSETS' and b['type'] == 'assets' for b in bindings)
kv = [b for b in bindings if b['name'] == 'KV' and b['type'] == 'kv_namespace']
assert len(kv) == 1 and kv[0].get('namespace_id') == '1b02d139375045f7a7d5ce2d994abd2c', 'Live KV binding is missing'

def current_status():
    return json.loads(api.request(api.ORIGIN + '/api/free-token/status', headers={'Cache-Control':'no-cache'})[2])

# A documented daily-quota incident may already make this read endpoint 503.
# Permit only that pre-existing status, before its explicit UTC reset deadline.
try:
    api.request(api.ORIGIN + '/api/pool-status')
    pool_before_http = 200
except RuntimeError as error:
    if not str(error).endswith('HTTP 503'):
        raise
    pool_before_http = 503
pool_outage_until = release.get('known_pool_outage_until')
pool_outage_allowed = bool(pool_outage_until and pool_before_http == 503 and
    datetime.now(timezone.utc) < datetime.fromisoformat(pool_outage_until.replace('Z', '+00:00')))

status_before = current_status()
assert status_before.get('open') is has_reward_binding, 'Public availability differs from the live reward binding'

def released_claim_has_no_shared_key():
    """The oath endpoint must no longer hand out FREE_TOKEN_RENDER_KEY."""
    try:
        data = api.site_claim()
    except RuntimeError as error:
        text = str(error)
        if text.endswith(('HTTP 400', 'HTTP 403', 'HTTP 503')):
            return
        raise
    assert data.get('ok') is True and data.get('next') == 'email'
    assert not data.get('apiKey'), 'Oath endpoint still returns a shared key'

def released_board_and_hero():
    board = json.loads(api.request(api.ORIGIN + '/api/leaderboard')[2])
    assert isinstance(board.get('entries'), list) and 'email' not in json.dumps(board) and 'apiKey' not in json.dumps(board)
    for name in ('home-hero-desktop-v7.webp', 'home-hero-mobile-v7.webp'):
        assert api.request(api.ORIGIN + '/' + name)[2] == (root/'public'/name).read_bytes(), 'Current artwork differs: ' + name
    for path in ('/image', '/img', '/bg', '/wallpaper.png'):
        try:
            api.request(api.ORIGIN + path)
        except RuntimeError as error:
            assert str(error).endswith('HTTP 404'), path
            continue
        raise AssertionError('Retired illustration still served: ' + path)

def released_pool_read():
    try:
        snapshot=json.loads(api.request(api.ORIGIN+'/api/pool-status')[2])
    except RuntimeError as error:
        if pool_outage_allowed and str(error).endswith('HTTP 503'):
            print('POOL_PREEXISTING_QUOTA_OUTAGE_UNTIL=' + pool_outage_until, flush=True)
            return False
        raise
    assert snapshot.get('schema') == 1 and isinstance(snapshot.get('accounts'),list)
    assert isinstance(snapshot.get('models'),list) and snapshot.get('stats_scope') == 'account'
    forbidden={'email','auth_index','path','status_message','id_token','access_token','refresh_token','apiKey','api_key'}
    def inspect(value):
        if isinstance(value,dict):
            assert not forbidden.intersection(value), 'Private pool field exposed'
            for k,v in value.items():
                if k == 'masked_email' and v is not None: assert '***' in v
                inspect(v)
        elif isinstance(value,list):
            for v in value: inspect(v)
    inspect(snapshot)
    return True
mode = os.environ.get('WEBSITE_MODE', 'stage')

def activate_forwarder():
    """Keep the forwarding source byte-identical; target the explicit Site entrypoint."""
    name='leonmingod-free-token'
    old=api.cf(name+'/settings')
    assert len(old['bindings']) == 1 and old['bindings'][0]['name'] == 'SITE'
    assert old['bindings'][0]['service'] == worker
    if old['bindings'][0].get('entrypoint') == 'Site':
        return api.active(name)
    _, headers, body=api.cf(name,raw=True)
    message=BytesParser(policy=email.policy.default).parsebytes(
        ('Content-Type: '+headers['Content-Type']+'\r\n\r\n').encode()+body)
    parts=[]
    for part in message.iter_parts():
        filename=part.get_filename() or part.get_param('name',header='Content-Disposition')
        if filename != 'metadata':
            parts.append((filename,'application/javascript+module' if filename=='index.js' else 'application/source-map',part.get_payload(decode=True)))
    assert {name for name,_,_ in parts} == {'index.js','index.js.map'}
    metadata={'main_module':'index.js','compatibility_date':old['compatibility_date'],
        'compatibility_flags':old.get('compatibility_flags',[]),
        'bindings':[{**old['bindings'][0],'entrypoint':'Site'}],
        'annotations':{'workers/message':'Forward current site through its Site entrypoint; preserve original assets and router code'}}
    boundary='lmg-forward-'+secrets.token_hex(12);chunks=[]
    for filename,mime,payload in [('metadata','application/json',json.dumps(metadata).encode()),*parts]:
        disposition='form-data; name="'+filename+'"'+('' if filename=='metadata' else '; filename="'+filename+'"')
        chunks.extend([(f'--{boundary}\r\nContent-Disposition: {disposition}\r\nContent-Type: {mime}\r\n\r\n').encode(),payload,b'\r\n'])
    chunks.append(('--'+boundary+'--\r\n').encode())
    request=urllib.request.Request(
        'https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()+'/workers/scripts/'+name,
        data=b''.join(chunks),method='PUT',headers={'User-Agent':'Mozilla/5.0','Content-Type':'multipart/form-data; boundary='+boundary,'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'].strip()})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request,timeout=60) as response: uploaded=json.load(response)
            assert uploaded['success']
            break
        except urllib.error.HTTPError as error:
            if attempt < 2 and error.code == 400:
                time.sleep(2+attempt)
                continue
            details=json.load(error)
            print('FORWARDER_API_ERROR='+json.dumps([{'code':e.get('code'),'message':str(e.get('message',''))[:300]} for e in details.get('errors',[])]))
            raise RuntimeError('Forwarder upload rejected: HTTP '+str(error.code)) from None
    assert api.cf(name+'/settings')['bindings'] == metadata['bindings']
    _, check_headers, check_body=api.cf(name,raw=True)
    checked=BytesParser(policy=email.policy.default).parsebytes(
        ('Content-Type: '+check_headers['Content-Type']+'\r\n\r\n').encode()+check_body)
    actual={p.get_filename() or p.get_param('name',header='Content-Disposition'):hashlib.sha256(p.get_payload(decode=True)).hexdigest() for p in checked.iter_parts() if (p.get_filename() or p.get_param('name',header='Content-Disposition')) != 'metadata'}
    assert actual == {n:hashlib.sha256(b).hexdigest() for n,_,b in parts}, 'Forwarder source changed'
    return api.active(name)

if mode == 'stage':
    metadata = {
        'main_module':'index.js', 'keep_assets':True,
        'compatibility_date':settings['compatibility_date'],
        'compatibility_flags':settings.get('compatibility_flags', []),
        'keep_bindings':['secret_text','plain_text','json'],
        'bindings':[b for b in bindings if b['type'] not in ['secret_text','plain_text','json']] + extra_bindings,
        'annotations':{'workers/message':release['message']},
    }
    boundary = 'lmg-' + secrets.token_hex(16)
    chunks=[]
    for name, mime, payload in [('metadata','application/json',json.dumps(metadata).encode()),('index.js','application/javascript+module',(root/'dist/index.js').read_bytes()),('index.js.map','application/source-map',(root/'dist/index.js.map').read_bytes())]:
        disposition='form-data; name="'+name+'"'+('' if name == 'metadata' else '; filename="'+name+'"')
        chunks += [(f'--{boundary}\r\nContent-Disposition: {disposition}\r\nContent-Type: {mime}\r\n\r\n').encode(),payload,b'\r\n']
    chunks.append(('--'+boundary+'--\r\n').encode())
    version=api.cf(worker+'/versions','POST',b''.join(chunks),{'Content-Type':'multipart/form-data; boundary='+boundary})
    assert api.active(worker) == parent and current_status() == status_before, 'Stage unexpectedly affected production'
    result={'mode':'stage','version_id':version['id'],'production_unchanged':True,'parent_version':parent,'entrance_version':entrance,'module_sha256':hashlib.sha256((root/'dist/index.js').read_bytes()).hexdigest(),'resources_summary':{'bindings':[{'name':b['name'],'type':b['type']} for b in version.get('resources',{}).get('bindings',[])],'assets_config':version.get('resources',{}).get('assets',{}).get('config')}}
elif mode == 'publish':
    version_id=os.environ['WEBSITE_VERSION']
    version=api.cf(worker+'/versions/'+version_id)
    assert version_id == release['staged_version'], 'Publish only the reviewed staged version'
    annotated = (version.get('annotations') or {}).get('workers/message')
    assert annotated in [None, release['message']], 'Unrecognized staged version'
    staged_bindings = version['resources']['bindings']
    assert {(b['name'],b['type']) for b in staged_bindings} == expected_bindings, 'Staged bindings differ'
    for name, value in plain_bindings.items():
        assert next(b for b in staged_bindings if b['name'] == name).get('text') == value, 'Unexpected pool destination'
    assert [b for b in staged_bindings if b['name']=='GAME_RUNS'] == game, 'Staged game namespace differs'
    try:
        api.cf(worker+'/deployments','POST',{'strategy':'percentage','versions':[{'version_id':version_id,'percentage':100}],'annotations':{'workers/message':release['message']}})
        entrance_after=activate_forwarder()
        print('ACTIVATED_SITE='+json.dumps({'parent':api.active(worker),'entrance':entrance_after,'exports':version['resources'].get('script',{}).get('named_handlers')}),flush=True)
        for attempt in range(12):
            try:
                for path, local in [('/','index.html'),('/free-token/','free-token/index.html'),('/free-token/choose/','free-token/choose/index.html'),('/free-token/claim/','free-token/claim/index.html'),('/free-token/verify/','free-token/verify/index.html'),('/free-token/game/','free-token/game/index.html'),('/model-status/','model-status/index.html')]:
                    body=api.request(api.ORIGIN+path)[2].decode()
                    expected=(root/'public'/local).read_text()
                    import re
                    body=re.sub(r'\n?<script[^>]*src=["\']https://static\.cloudflareinsights\.com/[^>]*>\s*</script>','',body)
                    normalize=lambda html: re.sub(r'\s*</body>', '</body>', html.replace('\r\n','\n')).strip()
                    if normalize(body)!=normalize(expected):
                        if attempt in (0, 11):
                            fresh=api.request(api.ORIGIN+path+'?lmg_verify='+version_id,headers={'Cache-Control':'no-cache'})[2].decode()
                            print('PAGE_DIAGNOSTIC='+json.dumps({'path':path,'new_marker':'home-orb-v3.css' in body,'fresh_marker':'home-orb-v3.css' in fresh,'expected_bytes':len(expected),'actual_bytes':len(body),'first_difference':next((i for i,(a,b) in enumerate(zip(body,expected)) if a!=b),None)}),flush=True)
                            difference=next((i for i,(a,b) in enumerate(zip(body,expected)) if a!=b),min(len(body),len(expected)))
                            print('PAGE_PUBLIC_DIFFERENCE='+json.dumps({'path':path,'actual':body[max(0,difference-80):difference+350],'expected':expected[max(0,difference-80):difference+350],'actual_tail':body[-350:]}),flush=True)
                        raise AssertionError('Published page differs: '+path)
                released_claim_has_no_shared_key()
                released_board_and_hero()
                pool_verified = released_pool_read()
                status = json.loads(api.request(api.ORIGIN + '/api/free-token/status')[2])
                assert status['open'] is has_reward_binding, 'Token click availability differs from issuance state'
                after=api.cf(worker+'/settings')['bindings']
                assert {(b['name'],b['type']) for b in after} == expected_bindings
                assert [b for b in after if b['name']=='GAME_RUNS'] == game
                assert api.active('leonmingod-free-token') == entrance_after
                break
            except (AssertionError,RuntimeError):
                if attempt == 11:raise
                time.sleep(5)
        result={'mode':'publish','version_id':version_id,'previous_version':parent,'entrance_version':entrance_after,'previous_entrance_version':entrance,'forwarder_source_unchanged':True,'shared_key_not_exposed':True,'website_open':has_reward_binding,'issuance_state_preserved':True,'game_namespace_preserved':True,'source_pages_verified':7,'pool_api_verified':pool_verified,'pool_preexisting_outage':not pool_verified}
    except Exception:
        if api.active('leonmingod-free-token') != entrance:
            api.cf('leonmingod-free-token/deployments','POST',{'strategy':'percentage','versions':[{'version_id':entrance,'percentage':100}],'annotations':{'workers/message':'Restore original forwarder after failed website publication'}})
        api.cf(worker+'/deployments','POST',{'strategy':'percentage','versions':[{'version_id':parent,'percentage':100}],'annotations':{'workers/message':'Restore website after failed publication checks'}})
        print('WEBSITE_ROLLED_BACK='+parent)
        raise
else:
    raise RuntimeError('Unsupported website mode')
(root/'dist/release-result.json').write_text(json.dumps(result,indent=2))
print('WEBSITE_RELEASE='+json.dumps(result))
