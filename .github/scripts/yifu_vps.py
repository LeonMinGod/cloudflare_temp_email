"""Operate only the Yifu VPS; never mix its credentials with local CPA."""
import base64
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import shlex
import tempfile
import time
import urllib.request

import paramiko
import yaml
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import yifu_key_api as api

ROOT='/opt/yifu-cpa'
ORIGIN='https://yifu.leonmingod.com'


def ops_secret():
    if os.environ.get('YIFU_OPS_SECRET'):
        return os.environ['YIFU_OPS_SECRET'].strip()
    return hmac.new(os.environ['RENDER_API_KEY'].strip().encode(),b'leonmingod-ops-probe-v1',hashlib.sha256).hexdigest()


def connect():
    assert os.environ['YIFU_SSH_HOST']=='23.94.180.2' and os.environ['YIFU_SSH_PORT']=='55014'
    client=paramiko.SSHClient()
    with tempfile.NamedTemporaryFile('w') as known:
        known.write(os.environ['YIFU_SSH_KNOWN_HOSTS']);known.flush();client.load_host_keys(known.name)
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    key=paramiko.Ed25519Key.from_private_key(io.StringIO(os.environ['YIFU_SSH_PRIVATE_KEY']))
    client.connect(os.environ['YIFU_SSH_HOST'],port=int(os.environ['YIFU_SSH_PORT']),username=os.environ['YIFU_SSH_USER'],pkey=key,look_for_keys=False,allow_agent=False,timeout=20,auth_timeout=20,banner_timeout=20)
    return client


def run(client,command):
    _,out,err=client.exec_command(command,timeout=60)
    data=out.read();error=err.read();status=out.channel.recv_exit_status()
    if status:raise RuntimeError('VPS operation failed; exit='+str(status))
    return data.decode()


def report(name,value):
    Path('yifu-operation').mkdir(exist_ok=True)
    Path('yifu-operation/'+name+'.json').write_text(json.dumps(value,indent=2))
    print('YIFU_'+name.upper()+'='+json.dumps(value),flush=True)


def read(sftp,path):
    assert path.startswith(ROOT+'/') and '/..' not in path
    with sftp.open(path,'rb') as file:return file.read()


def write(sftp,path,data,mode=0o600):
    assert path.startswith(ROOT+'/') and '/..' not in path
    with sftp.open(path,'wb') as file:file.write(data.encode() if isinstance(data,str) else data)
    sftp.chmod(path,mode)


def private_env(sftp):
    return {key:json.loads(value) for key,value in (line.split('=',1) for line in read(sftp,ROOT+'/private/runtime.env').decode().splitlines() if line)}


def signed_pool(path,payload):
    body=json.dumps(payload,separators=(',',':')).encode();stamp=str(int(time.time()*1000))
    message='lmg-vps-pool-v1\n'+stamp+'\nPOST\n'+path+'\n'+body.decode()
    signature=hmac.new(ops_secret().encode(),message.encode(),hashlib.sha256).hexdigest()
    status,_,raw=api.request(ORIGIN+path,'POST',body,{'Content-Type':'application/json','X-Yifu-Pool':stamp+':'+signature})
    return status,json.loads(raw)


def verify(client,sftp,staging=False):
    origin='https://yifu-origin.leonmingod.com' if staging else ORIGIN
    env=private_env(sftp);config=yaml.safe_load(read(sftp,ROOT+'/private/config.yaml'))
    health,headers,_=api.request(origin+'/healthz')
    assert health==200 and headers.get('X-LeonMinGod-Backend')!='instabox'
    files=json.loads(api.request(origin+'/v8/management/credentials',headers={'Authorization':'Bearer '+env['MANAGEMENT_PASSWORD']})[2])['files']
    model_counts=[]
    for key in config['api-keys']:
        response=json.loads(api.request(origin+'/v1/models',headers={'Authorization':'Bearer '+key})[2])
        assert isinstance(response.get('data'),list) and response['data'];model_counts.append(len(response['data']))
    value={'origin':origin,'health':health,'credentials':len(files),'disabled':sum(bool(f.get('disabled')) for f in files),
           'static_keys_verified':len(model_counts),'model_counts':model_counts,
           'services':run(client,'systemctl is-active yifu-cpa yifu-tunnel').strip().splitlines(),
           'disk':run(client,'df -B1 / | tail -1').strip()}
    report('verify-stage' if staging else 'verify',value)


def deploy_monitor(client,sftp):
    files=['sites/yifu-vps-monitor/src/server.mjs','sites/yifu-vps-monitor/src/service.mjs','sites/yifu-vps-monitor/src/storage.mjs',
           'sites/leonmingod-star-night/src/pool-status.js','sites/leonmingod-star-night/src/pool-quota.js',
           'sites/leonmingod-star-night/src/pool-metrics.js','sites/leonmingod-star-night/src/pool-storage.js',
           'sites/leonmingod-star-night/src/pool-vps.js','sites/leonmingod-star-night/public/model-status/order-v1.mjs']
    directories=sorted({ROOT+'/monitor/'+str(Path(file).parent) for file in files})
    run(client,'install -d -o cpa -g cpa -m 0700 '+ ' '.join(shlex.quote(path) for path in directories+[ROOT+'/data']))
    for file in files:write(sftp,ROOT+'/monitor/'+file,Path(file).read_bytes(),0o644)
    write(sftp,ROOT+'/monitor/package.json','{"type":"module"}',0o644)
    write(sftp,ROOT+'/private/pool-runtime.json',json.dumps({'ops_secret':ops_secret()}))
    unit='[Unit]\nDescription=Yifu local pool monitor\nAfter=network-online.target yifu-cpa.service\n\n[Service]\nType=simple\nUser=cpa\nGroup=cpa\nWorkingDirectory='+ROOT+'\nExecStart='+ROOT+'/bin/node --max-old-space-size=64 '+ROOT+'/monitor/sites/yifu-vps-monitor/src/server.mjs\nRestart=on-failure\nRestartSec=5\nUMask=0077\nNoNewPrivileges=true\n\n[Install]\nWantedBy=multi-user.target\n'
    write(sftp,ROOT+'/systemd/yifu-monitor.service',unit,0o644)
    run(client,'chown -R cpa:cpa /opt/yifu-cpa/monitor /opt/yifu-cpa/data; chown cpa:cpa /opt/yifu-cpa/private/pool-runtime.json; install -m 0644 /opt/yifu-cpa/systemd/yifu-monitor.service /etc/systemd/system/yifu-monitor.service; systemctl daemon-reload; systemctl enable yifu-monitor >/dev/null 2>&1; systemctl restart yifu-monitor')
    report('monitor',{'active':run(client,'systemctl is-active yifu-monitor').strip(),'storage':'sqlite','interval_seconds':300,'cf_monitor_writes_required':False})


def configure_pool():
    bindings=api.cf('leonmingod-home/settings')['bindings']
    current=next((b for b in bindings if b['name']=='VPS_POOL_ENDPOINT'),None)
    report('pool-routing',{'parent_version':api.active('leonmingod-home'),'bindings':len(bindings),'origin':ORIGIN,
                           'configured':bool(current and current.get('text')==ORIGIN+'/_pool/status'),
                           'configuration_method':'release.json plain_bindings with reviewed stage/publish'})


def seed_pool():
    path='/api/ops/pool-export';body=b'{}';stamp=str(int(time.time()*1000))
    signature=hmac.new(ops_secret().encode(),(stamp+'\nPOST\n'+path+'\n{}').encode(),hashlib.sha256).hexdigest()
    payload=json.loads(api.request(api.ORIGIN+path,'POST',body,{'Content-Type':'application/json','X-LMG-Operation':stamp+':'+signature})[2])
    status,result=signed_pool('/_pool/seed',payload)
    assert status==200 and result.get('imported') is True
    report('cache-import',{'imported':True,'snapshot_models':len((payload.get('cache',{}).get('snapshot') or {}).get('models',[])),
                           'model_usage_preserved':bool(payload.get('cache',{}).get('modelUsage'))})


def backup(client,sftp):
    files={}
    for directory in ['private','auths','systemd']:
        for item in sftp.listdir_attr(ROOT+'/'+directory):
            if item.st_mode & 0o170000 != 0o100000 or item.filename.endswith('.sqlite'):continue
            path=directory+'/'+item.filename;files[path]=base64.b64encode(read(sftp,ROOT+'/'+path)).decode()
    try:
        sftp.stat(ROOT+'/data/pool.sqlite')
        command=ROOT+'/bin/node --input-type=module -e '+shlex.quote("import {DatabaseSync,backup} from 'node:sqlite';const db=new DatabaseSync('/opt/yifu-cpa/data/pool.sqlite',{readOnly:true});await backup(db,'/opt/yifu-cpa/private/pool-backup.sqlite');db.close();")
        run(client,command);files['data/pool.sqlite']=base64.b64encode(read(sftp,ROOT+'/private/pool-backup.sqlite')).decode()
    except FileNotFoundError:pass
    raw=json.dumps({'schema':1,'files':files},separators=(',',':')).encode();nonce=os.urandom(12)
    key=hashlib.sha256((os.environ['YIFU_BACKUP_SECRET'].strip()+'\nyifu-vps-backup-v1').encode()).digest()
    envelope={'format':'AES-256-GCM','purpose':'yifu-vps-backup-v1','created':int(time.time()),'nonce':base64.b64encode(nonce).decode(),
              'ciphertext':base64.b64encode(AESGCM(key).encrypt(nonce,raw,b'yifu-vps-backup-v1')).decode()}
    Path('yifu-operation').mkdir(exist_ok=True)
    Path('yifu-operation/backup.enc.json').write_text(json.dumps(envelope))
    report('backup',{'encrypted':True,'files':len(files),'database_included':'data/pool.sqlite' in files})


def main():
    mode=os.environ.get('YIFU_MODE','verify')
    if mode=='publish-guard':
        from instabox_cpa import deploy_guard_origin
        deploy_guard_origin()
        api.cf('cpa-abuse-guard/schedules','PUT',[])
        report('guard-schedule',{'crons':[],'authentication_and_ip_policy_preserved':True})
        return
    if mode=='configure-pool':configure_pool();return
    if mode=='seed-pool':seed_pool();return
    client=connect()
    try:
        with client.open_sftp() as sftp:
            if mode in ['verify','verify-stage']:verify(client,sftp,mode=='verify-stage')
            elif mode=='deploy-monitor':deploy_monitor(client,sftp)
            elif mode=='backup':backup(client,sftp)
            elif mode=='status':report('status',{'services':run(client,'systemctl is-active yifu-cpa yifu-tunnel yifu-monitor').splitlines(),'memory':run(client,'free -m'),'disk':run(client,'df -h /')})
            else:raise RuntimeError('Unknown VPS operation')
    finally:client.close()


if __name__=='__main__':main()
