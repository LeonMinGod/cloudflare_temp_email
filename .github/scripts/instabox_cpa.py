"""Migrate and operate CPA without printing credentials or changing unrelated projects."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import time
import urllib.error
import urllib.parse
import urllib.request

import yaml
import yifu_key_api as api

MACHINE = 'm_agqzojclrfglcpkfj43t7npojy'
ROOT = '/data/workspace/leonmingod-cpa'
ORIGIN = 'https://yifu.leonmingod.com'


def instabox(path='', method='GET', data=None, query=None):
    url = 'https://api.instabox.sh/v1/machines/' + MACHINE + path
    if query:
        url += '?' + urllib.parse.urlencode(query)
    headers = {'X-API-Key': os.environ['INSTABOX_API_KEY'].strip()}
    if isinstance(data, (dict, list)):
        headers['Content-Type'] = 'application/json'
        data = json.dumps(data).encode()
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError('InstaBox ' + method + ' ' + path + ': HTTP ' + str(error.code)) from None


def render_snapshot():
    service = api.render('/services/' + api.SERVICE)
    assert service['ownerId'] == api.WORKSPACE and api.is_cpa_repo(service['repo'])
    config = api.render('/services/' + api.SERVICE + '/secret-files/config.yaml')['content']
    env = {row['envVar']['key']: row['envVar']['value'] for row in api.render('/services/' + api.SERVICE + '/env-vars?limit=100')}
    bootstrap_path = env.get('CPA_OAUTH_BOOTSTRAP_FILE')
    bootstrap = None
    if bootstrap_path:
        bootstrap = json.loads(api.render('/services/' + api.SERVICE + '/secret-files/' + urllib.parse.quote(bootstrap_path.rsplit('/', 1)[-1], safe=''))['content'])
        assert bootstrap['schema'] == 1 and isinstance(bootstrap['files'], list) and bootstrap['files']
    return service, config, env, bootstrap


def inspect():
    service, content, env, bootstrap = render_snapshot()
    config = yaml.safe_load(content)
    machine = instabox()
    report = {
        'machine': {'id': machine['id'], 'name': machine['name'], 'state': machine['state'],
                    'spec': machine['spec'], 'maxRunMinutes': machine.get('maxRunMinutes'),
                    'autoSuspendAfterSeconds': machine.get('autoSuspendAfterSeconds')},
        'render': {'suspended': service.get('suspended'), 'suspenders': service.get('suspenders'),
                   'commit': api.latest_deploy()['commit']['id'], 'auto_deploy': service.get('autoDeploy'),
                   'env_names': sorted(env), 'config_sections': sorted(config)},
        'bootstrap': None if not bootstrap else {
            'files': len(bootstrap['files']),
            'disabled': sum(bool(file.get('disabled')) for file in bootstrap['files']),
            'providers': sorted({str(file['content'].get('type', 'unknown')) for file in bootstrap['files']}),
            'sha256': hashlib.sha256(json.dumps(bootstrap, sort_keys=True).encode()).hexdigest()},
    }
    print('INSTABOX_INSPECT=' + json.dumps(report), flush=True)
    Path('instabox-operation').mkdir(exist_ok=True)
    Path('instabox-operation/inspect.json').write_text(json.dumps(report, indent=2))


def upload(path, content, mode='0600'):
    assert path.startswith(ROOT + '/') and '/..' not in path
    if isinstance(content, str):
        content = content.encode()
    result = instabox('/files', 'PUT', content, {'path': path, 'mode': mode, 'parents': 'true'})
    assert result['sha256'] == hashlib.sha256(content).hexdigest()


def execute(argv, stdin=None, timeout=60):
    body = {'argv': argv, 'cwd': ROOT, 'timeoutSeconds': timeout}
    if stdin is not None:
        body['stdin'] = stdin
    result = instabox('/exec', 'POST', body)
    if result.get('exitCode') != 0 or result.get('timedOut'):
        raise RuntimeError('InstaBox command failed; exit=' + str(result.get('exitCode')))
    return result.get('stdout', '')


def record(name, report):
    Path('instabox-operation').mkdir(exist_ok=True)
    Path('instabox-operation/' + name + '.json').write_text(json.dumps(report, indent=2))
    print('INSTABOX_' + name.upper() + '=' + json.dumps(report), flush=True)


def restore():
    exists = execute(['python3', '-c', 'import pathlib;print(pathlib.Path(' + repr(ROOT + '/private/migration-complete.json') + ').exists())']).strip()
    assert exists == 'False', 'Migration already completed; never overwrite newer OAuth files with the Render snapshot'
    service, content, env, bootstrap = render_snapshot()
    assert bootstrap and len(bootstrap['files']) > 0, 'Missing protected OAuth snapshot'
    config = yaml.safe_load(content)
    original_keys = list(config['api-keys'])
    config.update({'host': '0.0.0.0', 'port': 8317, 'auth-dir': ROOT + '/auths'})
    env.update({'CPA_OAUTH_BOOTSTRAP_FILE': ROOT + '/private/oauth-bootstrap.json',
                'MANAGEMENT_STATIC_PATH': ROOT + '/static', 'TZ': 'Asia/Shanghai'})
    assert env.get('CPA_ABUSE_URL') and env.get('CPA_ABUSE_SECRET') and env.get('CPA_REMOTE_KEY_AUTH') == '1'
    assert original_keys == config['api-keys'] and env.get('MANAGEMENT_PASSWORD')
    assert all('\n' not in value and '\r' not in value and '\x00' not in value for value in env.values())
    upload(ROOT + '/private/config.yaml', yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
    upload(ROOT + '/private/oauth-bootstrap.json', json.dumps(bootstrap, separators=(',', ':')))
    upload(ROOT + '/private/runtime.env', ''.join(name + '=' + json.dumps(value, ensure_ascii=False) + '\n' for name, value in env.items()))
    unit = '[Unit]\nDescription=LeonMinGod CPA\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nUser=user\nGroup=user\nWorkingDirectory=' + ROOT + '\nEnvironmentFile=' + ROOT + '/private/runtime.env\nExecStart=' + ROOT + '/bin/CLIProxyAPI --config ' + ROOT + '/private/config.yaml\nRestart=on-failure\nRestartSec=3\nTimeoutStopSec=90\nUMask=0077\nNoNewPrivileges=true\n\n[Install]\nWantedBy=multi-user.target\n'
    upload(ROOT + '/systemd/leonmingod-cpa.service', unit, '0644')
    ensure = '#!/bin/sh\nset -eu\ntest -x ' + shlex.quote(ROOT + '/bin/CLIProxyAPI') + '\nsudo install -m 0644 ' + shlex.quote(ROOT + '/systemd/leonmingod-cpa.service') + ' /etc/systemd/system/leonmingod-cpa.service\nsudo systemctl daemon-reload\nsudo systemctl enable leonmingod-cpa.service >/dev/null 2>&1\nsudo systemctl start leonmingod-cpa.service\n'
    upload(ROOT + '/bin/ensure-running.sh', ensure, '0700')
    execute(['bash', '-c', 'chmod 700 ' + shlex.quote(ROOT + '/private') + '; mkdir -p ' + shlex.quote(ROOT + '/auths') + ' ' + shlex.quote(ROOT + '/static') + '; chmod 700 ' + shlex.quote(ROOT + '/auths')])
    execute(['bash', ROOT + '/bin/ensure-running.sh'])
    report = None
    for _ in range(36):
        try:
            report = verify(local=True)
            break
        except RuntimeError:
            time.sleep(2)
    assert report and report['credentials'] == len(bootstrap['files']), 'Restored service did not become ready with all credentials'
    report.update({'source': 'Render pre-start OAuth snapshot', 'snapshot_files': len(bootstrap['files']),
                   'render_suspended': service.get('suspended'), 'original_static_keys': len(original_keys),
                   'all_static_keys_preserved': True, 'guard_environment_preserved': True})
    upload(ROOT + '/private/migration-complete.json', json.dumps(report))
    record('restore', report)


def verify(local=False):
    code = '''import json,pathlib,urllib.request
root=pathlib.Path(ROOT)
env={name:json.loads(value) for name,value in (line.split('=',1) for line in (root/'private/runtime.env').read_text().splitlines())}
origin=ORIGIN
def get(path,key=None):
    headers={'User-Agent':'LeonMinGod-Migration/1.0'}
    if key:headers['Authorization']='Bearer '+key
    with urllib.request.urlopen(urllib.request.Request(origin+path,headers=headers),timeout=30) as response:return json.load(response)
assert get('/healthz')['status']=='ok'
files=get('/v8/management/credentials',env['MANAGEMENT_PASSWORD'])['files']
print(json.dumps({'health':200,'credentials':len(files),'disabled':sum(bool(row.get('disabled')) for row in files),'providers':sorted({row.get('provider') or row.get('type') or 'unknown' for row in files}),'origin':origin}))
'''.replace('ROOT', repr(ROOT)).replace('ORIGIN', repr('http://127.0.0.1:8317' if local else ORIGIN))
    report = json.loads(execute(['python3', '-c', code]))
    if not local:
        request=urllib.request.Request('https://api.instabox.sh/v1/machines/'+MACHINE+'/files/content?'+urllib.parse.urlencode({'path':ROOT+'/private/config.yaml'}),
                                      headers={'X-API-Key':os.environ['INSTABOX_API_KEY'].strip()})
        with urllib.request.urlopen(request,timeout=30) as response:
            config=yaml.safe_load(response.read())
        model_counts=[]
        for key in config['api-keys']:
            status,_,body=api.request(ORIGIN+'/v1/models',headers={'Authorization':'Bearer '+key})
            data=json.loads(body)
            assert status==200 and isinstance(data.get('data'),list) and data['data']
            model_counts.append(len(data['data']))
        report.update({'static_keys_verified':len(model_counts),'model_counts':model_counts})
        record('verify', report)
    return report


def backup():
    # Recovery copies stay encrypted at rest, including in GitHub artifacts.
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import base64
    code = '''import json,pathlib
root=pathlib.Path(ROOT)
files={str(path.relative_to(root)):path.read_text() for directory in ['private','auths','systemd'] for path in (root/directory).rglob('*') if path.is_file()}
print(json.dumps({'schema':1,'files':files}))
'''.replace('ROOT', repr(ROOT))
    content = execute(['python3', '-c', code]).encode()
    nonce = os.urandom(12)
    key = hashlib.sha256((os.environ['INSTABOX_API_KEY'].strip() + '\ncpa-instabox-backup-v1').encode()).digest()
    envelope = {'format':'AES-256-GCM','purpose':'cpa-instabox-backup-v1','created':int(time.time()),
                'nonce':base64.b64encode(nonce).decode(),
                'ciphertext':base64.b64encode(AESGCM(key).encrypt(nonce, content, b'cpa-instabox-backup-v1')).decode()}
    Path('instabox-operation').mkdir(exist_ok=True)
    Path('instabox-operation/cpa-backup.enc.json').write_text(json.dumps(envelope))
    record('backup', {'encrypted':True,'files':len(json.loads(content)['files'])})


def deploy_gateway():
    name = 'cpa-instabox-gateway'
    origin = 'https://8317-agqzojclrfglcpkfj43t7npojy.instabox.tech'
    source = Path('sites/cpa-instabox-gateway/src/index.mjs').read_bytes()
    metadata = {'main_module':'index.mjs','compatibility_date':'2026-11-04',
                'observability':{'enabled':True,'head_sampling_rate':1,'traces':{'enabled':True}},
                'bindings':[{'name':'CPA_ORIGIN','type':'plain_text','text':origin},
                            {'name':'INSTABOX_MACHINE_ID','type':'plain_text','text':MACHINE},
                            {'name':'AUTO_RESUME','type':'plain_text','text':'1'},
                            {'name':'INSTABOX_API_KEY','type':'secret_text','text':os.environ['INSTABOX_API_KEY'].strip()}]}
    boundary = 'cpa-instabox-' + os.urandom(12).hex()
    chunks=[]
    for part, mime, body in [('metadata','application/json',json.dumps(metadata).encode()),('index.mjs','application/javascript+module',source)]:
        disposition='form-data; name="'+part+'"'+('' if part=='metadata' else '; filename="'+part+'"')
        chunks.extend([('--'+boundary+'\r\nContent-Disposition: '+disposition+'\r\nContent-Type: '+mime+'\r\n\r\n').encode(),body,b'\r\n'])
    chunks.append(('--'+boundary+'--\r\n').encode())
    api.cf(name,'PUT',b''.join(chunks),{'Content-Type':'multipart/form-data; boundary='+boundary})
    api.cf(name+'/schedules','PUT',[{'cron':'*/5 * * * *'}])
    url='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()+'/workers/domains'
    registered=False
    try:
        _,_,raw=api.request(url,'PUT',{'hostname':'yifu.leonmingod.com','service':name,'zone_id':'4f078f06b815a404337c3b5387c45275','environment':'production'},
                            {'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'].strip()})
        registered=bool(json.loads(raw).get('success'))
    except RuntimeError:
        pass
    record('gateway',{'worker':name,'version':api.active(name),'origin':origin,'hostname':'yifu.leonmingod.com','domain_registered':registered,'cron':'*/5 * * * *','platform_key_server_only':True})


def deploy_guard_origin(message='Preserve CPA authentication, quotas, IP policy and namespaces'):
    worker='cpa-abuse-guard'
    before=api.active(worker)
    settings=api.cf(worker+'/settings')
    bindings=settings['bindings']
    state=[item for item in bindings if item['name']=='STATE']
    assert len(state)==1 and state[0]['class_name']=='AbuseState'
    metadata={'main_module':'index.js','compatibility_date':settings['compatibility_date'],
              'compatibility_flags':settings.get('compatibility_flags',[]),
              'keep_bindings':['secret_text','plain_text','json'],
              'bindings':[item for item in bindings if item['type'] not in ['secret_text','plain_text','json']],
              'annotations':{'workers/message':message}}
    record('guard-before',{'version':before,'compatibility_date':settings['compatibility_date'],
        'bindings':[{'name':item['name'],'type':item['type']} for item in bindings],
        'state_binding':state,'rollback_uses_previous_version':True})
    boundary='cpa-guard-'+os.urandom(12).hex()
    chunks=[]
    for part,mime,body in [('metadata','application/json',json.dumps(metadata).encode()),
                           ('index.js','application/javascript+module',Path('sites/api-abuse-guard/dist/index.js').read_bytes()),
                           ('index.js.map','application/source-map',Path('sites/api-abuse-guard/dist/index.js.map').read_bytes())]:
        disposition='form-data; name="'+part+'"'+('' if part=='metadata' else '; filename="'+part+'"')
        chunks.extend([('--'+boundary+'\r\nContent-Disposition: '+disposition+'\r\nContent-Type: '+mime+'\r\n\r\n').encode(),body,b'\r\n'])
    chunks.append(('--'+boundary+'--\r\n').encode())
    version=api.cf(worker+'/versions','POST',b''.join(chunks),{'Content-Type':'multipart/form-data; boundary='+boundary})
    assert api.active(worker)==before
    staged=version['resources']['bindings']
    assert {(b['name'],b['type']) for b in bindings}=={(b['name'],b['type']) for b in staged}
    assert [item for item in staged if item['name']=='STATE']==state
    api.cf(worker+'/deployments','POST',{'strategy':'percentage','versions':[{'version_id':version['id'],'percentage':100}]})
    result={'version':api.active(worker),'previous':before,'bindings_preserved':True,'state_namespace_preserved':True,'origin':ORIGIN}
    record('guard',result)
    return result


def stream_probe():
    request=urllib.request.Request('https://api.instabox.sh/v1/machines/'+MACHINE+'/files/content?'+urllib.parse.urlencode({'path':ROOT+'/private/config.yaml'}),
                                  headers={'X-API-Key':os.environ['INSTABOX_API_KEY'].strip()})
    with urllib.request.urlopen(request,timeout=30) as response:config=yaml.safe_load(response.read())
    key=config['api-keys'][0]
    ids=[row['id'] for row in json.loads(api.request(ORIGIN+'/v1/models',headers={'Authorization':'Bearer '+key})[2])['data']]
    selected=[]
    for family in ['gpt','grok']:
        options=[model for model in ids if family in model.lower()]
        if options:selected.append(next((model for model in options if ('codex' in model.lower() if family=='gpt' else '4.7' in model)),options[0]))
    results=[]
    for model in selected:
        started=time.time()
        try:
            status,headers,body=api.request(ORIGIN+'/v1/chat/completions','POST',{'model':model,'messages':[{'role':'user','content':'Reply exactly OK.'}],'max_tokens':32,'stream':True},
                                            {'Authorization':'Bearer '+key,'Content-Type':'application/json'})
            text=body.decode()
            content=''
            for line in text.splitlines():
                if not line.startswith('data: ') or line=='data: [DONE]':continue
                try:
                    for choice in json.loads(line[6:]).get('choices',[]):
                        part=choice.get('delta',{}).get('content','')
                        if isinstance(part,str):content+=part
                except ValueError:pass
            results.append({'model':model,'http':status,'done':'data: [DONE]' in text,'content_chars':len(content),'seconds':round(time.time()-started,2),'stream_complete':status==200 and 'data: [DONE]' in text and bool(content)})
        except RuntimeError as error:
            results.append({'model':model,'stream_complete':False,'error':str(error),'seconds':round(time.time()-started,2)})
    record('stream',{'origin':ORIGIN,'results':results})


def diagnose():
    import io
    import zipfile
    import base64
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    request=urllib.request.Request('https://api.github.com/repos/LeonMinGod/cloudflare_temp_email/actions/artifacts/13044371854/zip',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'User-Agent':'CPA-InstaBox-Migration'})
    class ArtifactRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, message, headers, newurl):
            redirected=super().redirect_request(request,fp,code,message,headers,newurl)
            if urllib.parse.urlsplit(request.full_url).hostname!=urllib.parse.urlsplit(newurl).hostname:
                redirected.remove_header('Authorization')
            return redirected
    with urllib.request.build_opener(ArtifactRedirect()).open(request,timeout=60) as response:archive=zipfile.ZipFile(io.BytesIO(response.read()))
    name=next(name for name in archive.namelist() if name.endswith('cpa-before-rollout.enc.json'))
    envelope=json.loads(archive.read(name))
    key=hashlib.sha256((os.environ['RENDER_API_KEY'].strip()+'\ncpa-abuse-rollout-v1').encode()).digest()
    restored=json.loads(AESGCM(key).decrypt(base64.b64decode(envelope['nonce']),base64.b64decode(envelope['ciphertext']),b'cpa-abuse-rollout-v1'))
    _,_,_,bootstrap=render_snapshot()
    initial={file['name']:file['content'] for file in bootstrap['files']}
    comparisons=[]
    for name,raw in restored['credentials'].items():
        value=json.loads(raw);old=initial.get(name,{})
        comparisons.append({'provider':value.get('type'),'different':value!=old,'refresh_changed':value.get('refresh_token')!=old.get('refresh_token'),
                            'backup_refresh':value.get('last_refresh'),'bootstrap_refresh':old.get('last_refresh'),
                            'backup_expiry':value.get('expired'),'bootstrap_expiry':old.get('expired')})
    code='''import json,pathlib,urllib.request,urllib.error
root=pathlib.Path(ROOT)
env={k:json.loads(v) for k,v in (line.split('=',1) for line in (root/'private/runtime.env').read_text().splitlines())}
req=urllib.request.Request('http://127.0.0.1:8317/v8/management/credentials',headers={'Authorization':'Bearer '+env['MANAGEMENT_PASSWORD']})
with urllib.request.urlopen(req) as response:files=json.load(response)['files']
rows=[]
for file in files:
    message=str(file.get('status_message','')).lower()
    rows.append({'provider':file.get('provider'),'status':file.get('status'),'disabled':file.get('disabled'),'unavailable':file.get('unavailable'),'tags':[word for word in ['expired','revoked','refresh','invalid_grant','invalid','quota','unavailable','auth','token','account','401','403','429','503'] if word in message]})
print(json.dumps({'states':rows}))
'''.replace('ROOT',repr(ROOT))
    current=json.loads(execute(['python3','-c',code]))
    record('diagnose',{'encrypted_backup_created':envelope.get('created'),'comparisons':comparisons,**current})


def refresh_active():
    code='''import json,pathlib,urllib.request,urllib.error
root=pathlib.Path(ROOT)
env={k:json.loads(v) for k,v in (line.split('=',1) for line in (root/'private/runtime.env').read_text().splitlines())}
base='http://127.0.0.1:8317/v8/management/'
headers={'Authorization':'Bearer '+env['MANAGEMENT_PASSWORD'],'Content-Type':'application/json'}
with urllib.request.urlopen(urllib.request.Request(base+'credentials',headers=headers)) as response:files=json.load(response)['files']
rows=[]
for file in files:
    if file.get('disabled'):continue
    payload=json.dumps({'name':file['name']}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(base+'credentials/refresh',data=payload,headers=headers,method='POST'),timeout=40) as response:result=json.load(response)
        rows.append({'provider':file.get('provider'),'ok':result.get('ok') is True})
    except urllib.error.HTTPError as error:
        message=error.read(16384).decode(errors='replace').lower()
        rows.append({'provider':file.get('provider'),'ok':False,'http':error.code,'tags':[word for word in ['invalid_grant','refresh_token_reused','invalid_refresh_token','unauthorized','forbidden','expired','revoked','already been used','invalid'] if word in message]})
    except Exception as error:rows.append({'provider':file.get('provider'),'ok':False,'error_type':type(error).__name__})
print(json.dumps({'results':rows,'disabled_credentials_untouched':sum(bool(file.get('disabled')) for file in files)}))
'''.replace('ROOT',repr(ROOT))
    record('refresh',json.loads(execute(['python3','-c',code],timeout=140)))


def sync_pool_secret():
    request=urllib.request.Request('https://api.instabox.sh/v1/machines/'+MACHINE+'/files/content?'+urllib.parse.urlencode({'path':ROOT+'/private/runtime.env'}),
                                  headers={'X-API-Key':os.environ['INSTABOX_API_KEY'].strip()})
    with urllib.request.urlopen(request,timeout=30) as response:text=response.read().decode()
    values={key:json.loads(value) for key,value in (line.split('=',1) for line in text.splitlines())}
    settings=api.cf('leonmingod-home/settings')
    preserved={(item['name'],item['type']) for item in settings['bindings']}
    api.cf('leonmingod-home/secrets','PUT',{'name':'CPA_STATUS_MANAGEMENT_KEY','type':'secret_text','text':values['MANAGEMENT_PASSWORD']})
    after=api.cf('leonmingod-home/settings')['bindings']
    assert preserved=={(item['name'],item['type']) for item in after}
    record('pool-secret',{'parent_version':api.active('leonmingod-home'),'bindings_preserved':True,'key_values_logged':False})


if __name__ == '__main__':
    mode = os.environ.get('INSTABOX_MODE', 'inspect')
    if mode == 'inspect':
        inspect()
    elif mode == 'restore':
        restore()
    elif mode in {'status', 'verify'}:
        verify()
    elif mode == 'backup':
        backup()
    elif mode == 'deploy-gateway':
        deploy_gateway()
    elif mode == 'deploy-guard-origin':
        deploy_guard_origin()
    elif mode == 'stream-probe':
        stream_probe()
    elif mode == 'diagnose':
        diagnose()
    elif mode == 'refresh-active':
        refresh_active()
    elif mode == 'sync-pool-secret':
        sync_pool_secret()
    else:
        raise RuntimeError('Operation is not implemented: ' + mode)
