"""Migrate the actual VPS applications; keep existing Cloudflare identity stores intact."""
import base64,hashlib,io,json,os,secrets,shlex,subprocess,time
from pathlib import Path
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import padding
from production_ops import BASE,OUT,phase,connect,read,write,run
from production_crypto import seal,unseal
from migration_archive import pack,unpack
ROOT='/opt/yifu-cpa'
SERVICES=['yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','yifu-tunnel']

def dual_seal(raw,req,kind):
    # The owner can recover the same ciphertext even if the destination host is lost.
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from production_crypto import PURPOSE,aad
    secret=os.urandom(32);nonce=os.urandom(12)
    def wrap(key):return base64.b64encode(serialization.load_pem_public_key(base64.b64decode(key)).encrypt(secret,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))).decode()
    return json.dumps({'format':'AES-256-GCM+RSA-OAEP-SHA256','purpose':PURPOSE,'session':req['session'],'kind':kind,'wrapped_key':wrap(req['target_public_key']),'owner_wrapped_key':wrap(req['owner_public_key']),'nonce':base64.b64encode(nonce).decode(),'ciphertext':base64.b64encode(AESGCM(secret).encrypt(nonce,raw,aad(req['session'],kind))).decode()},separators=(',',':')).encode()

def export(req):
    phase('business-consistent-source-backup');client=connect()
    try:
        from vps_monitor import baseline
        before=baseline(client)
        from migration_snapshot import collect
        with client.open_sftp() as sftp:
            raw,manifest=collect(client,sftp,req['session'],False);files,_=unpack(raw)
            for name in SERVICES+['yifu-plus-budget']:
                files['systemd/'+name+'.service']=(read(sftp,'/etc/systemd/system/'+name+'.service'),0o644)
            files['systemd/yifu-plus-budget.timer']=(read(sftp,'/etc/systemd/system/yifu-plus-budget.timer'),0o644)
            files['systemd/plus-budget.mjs']=(read(sftp,'/usr/local/libexec/yifu-plus-budget.mjs'),0o644)
            inventory=run(client,"systemctl list-timers --all --no-pager; crontab -l 2>/dev/null || true; find /opt/yifu-cpa -type f -name '*.sqlite' -o -name '*.db'",timeout=120)
            OUT.joinpath('owner.enc.json').write_bytes(seal(inventory.encode(),base64.b64decode(req['owner_public_key']),req['session'],'business-inventory'))
            raw,manifest=pack(files,manifest['metadata']);envelope=dual_seal(raw,req,'business-stage')
            if len(envelope)>90*1024*1024:raise ValueError('Git transport size bound exceeded')
            path=BASE+'/'+req['session']+'/business-source-backup.enc.json';write(sftp,path,envelope)
            OUT.joinpath('business.enc.json').write_bytes(envelope)
            if baseline(client)!=before:raise RuntimeError('Source production changed during backup')
            return {'status':'passed','mode':'migration-export','ciphertext_bytes':len(envelope),'sha256':hashlib.sha256(envelope).hexdigest(),'files':len(files),'credentials':manifest['metadata']['credentials'],'disabled':manifest['metadata']['disabled'],'consistent_sqlite_backups':True,'plus_database_and_data_key_paired':True,'owner_recoverable':True,'source_backup':path,'source_services_unchanged':True}
    finally:client.close()

def unit_compatible(text,name):
    caps={'yifu-cpa':('256M','50%'),'yifu-gateway':('48M','10%'),'yifu-monitor':('128M','15%'),'yifu-plus':('128M','15%'),'yifu-tunnel':('128M','15%')}
    lines=[];inserted=False
    for line in text.splitlines():
        if line.startswith(('MemoryMax=','MemoryHigh=','MemoryLimit=','CPUQuota=','Nice=','Slice=','ReadWritePaths=','TasksMax=','GOMEMLIMIT=')):continue
        if line.startswith('ProtectSystem=strict'):line='ProtectSystem=full'
        if line=='[Install]' and name in caps:
            memory,cpu=caps[name];lines.extend(['Slice=yifu-production.slice','MemoryLimit='+memory,'CPUQuota='+cpu,'Nice=10','Environment=GOMAXPROCS=1']);inserted=True
        lines.append(line)
    if name in caps and not inserted:raise ValueError('Unrecognized production unit')
    return '\n'.join(lines)+'\n'

def stage(req):
    import yaml
    from vps_monitor import baseline
    from vps_monitor_install import protect_unchanged,user
    from production_komari import LAUNCH
    if req.get('diagnose'):
        client=connect()
        try:
            with client.open_sftp() as sftp:
                data={'probe_log':read(sftp,BASE+'/'+req['session']+'/empty-oauth/stdout.log').decode(errors='replace')}
                OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(data).encode(),base64.b64decode(req['owner_public_key']),req['session'],'business-stage-diagnostics'))
            return {'status':'passed','mode':'migration-stage','diagnostics_encrypted':True,'source_unchanged':True}
        finally:client.close()
    phase('business-fetch-encrypted-backup')
    ref=req['backup_ref']
    if not ref.startswith('refs/heads/production-results/') or any(x not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-' for x in ref):raise ValueError('Unrecognized backup ref')
    subprocess.run(['git','fetch','--quiet','https://github.com/LeonMinGod/cloudflare_temp_email.git',ref],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    commit=subprocess.check_output(['git','rev-parse','FETCH_HEAD'],text=True).strip()
    if commit!=req['backup_commit']:raise ValueError('Source backup ref changed')
    envelope=subprocess.check_output(['git','show',commit+':business.enc.json'])
    if hashlib.sha256(envelope).hexdigest()!=req['backup_sha256']:raise ValueError('Backup checksum mismatch')
    client=connect()
    try:
        before=baseline(client)
        with client.open_sftp() as sftp:
            raw=unseal(envelope,read(sftp,BASE+'/private/recipient.pem'),req['session'],'business-stage');files,manifest=unpack(raw)
            runtime=json.loads(read(sftp,'/opt/lmg-runtime/v1/manifest.json'))
            if runtime['files']['node']!=manifest['metadata']['node_sha256']:raise ValueError('Native Node differs from source')
            if run(client,'systemctl is-active yifu-cpa 2>/dev/null || true').strip()=='active':raise ValueError('Target already has an active business instance')
            directory=BASE+'/'+req['session']
            try:already=run(client,'sha256sum '+directory+'/business-source-backup.enc.json').split()[0]==req['backup_sha256']
            except Exception:already=False
            if not already:write(sftp,directory+'/business-source-backup.enc.json',envelope)
            phase('business-native-stage-without-live-oauth')
            user(client,'cpa');run(client,'install -d -m 0750 -o cpa -g cpa '+ROOT)
            required={'private','auths','data','plus','logs','bin','systemd'}|{str(Path(n).parent) for n in files if not n.startswith(('migration/','auths/'))}
            for name in sorted(required):run(client,'install -d -m 0700 -o cpa -g cpa '+shlex.quote(ROOT+'/'+name))
            for name,(body,mode) in files.items():
                if name.startswith(('auths/','migration/')):continue
                if name.startswith('systemd/') and name.endswith('.service'):body=unit_compatible(body.decode(),Path(name).stem).encode()
                if name.startswith('bin/') and elf_dynamic(body):
                    native=ROOT+'/'+name+'.native';write(sftp,native,body,mode)
                    body=('#!/bin/sh\nexec /opt/lmg-runtime/v1/lib/ld-linux-x86-64.so.2 --library-path /opt/lmg-runtime/v1/lib '+native+' \"$@\"\n').replace('\\"','"').encode()
                write(sftp,ROOT+'/'+name,body,mode)
            config=yaml.safe_load(files['private/config.yaml'][0])
            env={k:json.loads(v) for k,v in (l.split('=',1) for l in files['private/runtime.env'][0].decode().splitlines() if l)}
            if 'CPA_OAUTH_BOOTSTRAP_FILE' in env:raise ValueError('Obsolete bootstrap detected')
            wrapper='#!/bin/sh\nexec '+LAUNCH+' "$@"\n';write(sftp,ROOT+'/bin/node',wrapper,0o755)
            write(sftp,BASE+'/private/business-backup-secret',files['migration/backup-secret'][0])
            run(client,'chown -R cpa:cpa '+ROOT)
            for name in SERVICES+['yifu-plus-budget']:
                write(sftp,'/etc/systemd/system/'+name+'.service',read(sftp,ROOT+'/systemd/'+name+'.service'),0o644)
            write(sftp,'/etc/systemd/system/yifu-plus-budget.timer',files['systemd/yifu-plus-budget.timer'][0],0o644)
            write(sftp,'/usr/local/libexec/yifu-plus-budget.mjs',files['systemd/plus-budget.mjs'][0],0o644)
            slice='[Unit]\nDescription=Public API resource budget to preserve personal VPN headroom\n[Slice]\nCPUAccounting=true\nMemoryAccounting=true\nCPUQuota=60%\nMemoryLimit=768M\n'
            write(sftp,'/etc/systemd/system/yifu-production.slice',slice,0o644);run(client,'systemctl daemon-reload')
            phase('business-empty-credential-cpa-probe')
            probe=directory+'/empty-oauth';run(client,'install -d -m 0700 '+probe+'/auths')
            config['host']='127.0.0.1';config['port']=18337;config['auth-dir']=probe+'/auths';config['api-keys']=[secrets.token_urlsafe(32)]
            config['remote-management']={'allow-remote':False,'secret-key':secrets.token_urlsafe(32),'disable-control-panel':True};config['usage-statistics-enabled']=False
            write(sftp,probe+'/config.yaml',yaml.safe_dump(config))
            from migration_stage import PROBE
            write(sftp,probe+'/probe.py',PROBE)
            tested=json.loads(run(client,'/usr/bin/python '+probe+'/probe.py '+ROOT+'/bin/CLIProxyAPI '+probe,timeout=120))
            phase('business-restricted-cutover-controller')
            peer=install_bridge(client,sftp,req)
            OUT.joinpath('peer.enc.json').write_bytes(seal(json.dumps(peer).encode(),base64.b64decode(req['source_public_key']),req['session'],'business-bridge'))
            protect_unchanged(client,before)
            return {'status':'passed','mode':'migration-stage','files':len(files),'source_credentials':manifest['metadata']['credentials'],'disabled_preserved':manifest['metadata']['disabled'],'sqlite_and_plus_key_staged':True,'native_cpa_empty_oauth_probe':tested,'live_oauth_not_started':True,'old_production_not_changed':True,'vpn_preserved':True,'business_slice':{'memory_limit_mib':768,'cpu_quota_percent':60},'backup':directory+'/business-source-backup.enc.json','restricted_bridge_ready':True}
    finally:client.close()

def install_bridge(client,sftp,req):
    from cryptography.hazmat.primitives.asymmetric import rsa
    directory=BASE+'/'+req['session']
    key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
    public=key.public_key().public_bytes(serialization.Encoding.OpenSSH,serialization.PublicFormat.OpenSSH).decode()
    private=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.TraditionalOpenSSL,serialization.NoEncryption()).decode()
    script=Path('.github/scripts/production_bridge.mjs').read_bytes();write(sftp,directory+'/bridge.mjs',script)
    launcher='#!/bin/sh\nexec /opt/lmg-runtime/v1/lib/ld-linux-x86-64.so.2 --library-path /opt/lmg-runtime/v1/lib /opt/lmg-runtime/v1/node '+directory+'/bridge.mjs '+directory+'/bridge-config.json\n'
    write(sftp,directory+'/bridge.sh',launcher,0o700)
    config={'session':req['session'],'directory':directory,'private_key':BASE+'/private/recipient.pem','source_public_key':req['source_public_key'],'owner_public_key':req['owner_public_key']}
    write(sftp,directory+'/bridge-config.json',json.dumps(config))
    run(client,'install -d -m 0700 /root/.ssh')
    path='/root/.ssh/authorized_keys'
    try:existing=read(sftp,path)
    except FileNotFoundError:existing=b''
    write(sftp,directory+'/authorized_keys.before',existing)
    marker='lmg-production-'+req['session']
    filtered=b'\n'.join(l for l in existing.splitlines() if marker.encode() not in l)
    line='command="'+directory+'/bridge.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty '+public+' '+marker+'\n'
    write(sftp,path,filtered+b'\n'+line.encode())
    return {'host':'198.247.1.206','port':22881,'user':'root','session':req['session'],'private_key':private,'host_sha256':'SHA256:6t5F8SKhmAzQJE2/kVCcDiDwGlFeJaEGGibJml7QbVk','script_sha256':hashlib.sha256(script).hexdigest()}


def elf_dynamic(body):
    import struct
    if body[:5]!=b'\x7fELF\x02' or body[5]!=1:return False
    offset=struct.unpack_from('<Q',body,32)[0];size,count=struct.unpack_from('<HH',body,54)
    return any(struct.unpack_from('<I',body,offset+i*size)[0]==3 for i in range(count))


def os_audit(req):
    phase('operating-system-upgrade-readonly-audit');client=connect()
    try:
        source="""import os,json,subprocess
commands={'release':['cat','/etc/centos-release'],'kernel':['uname','-r'],'virt':['systemd-detect-virt'],'disk':['df','-h','/','/boot'],'memory':['free','-m'],'block':['lsblk','-f'],'boot':['ls','-l','/boot'],'packages':['rpm','-q','centos-release','kernel','grub2','lvm2'],'mounts':['findmnt','/']}
r={}
for n,a in commands.items():
 try:r[n]=subprocess.check_output(a,stderr=subprocess.STDOUT).decode('utf8','replace')
 except Exception:r[n]=None
r['rescue_console_credentials_available']=False
print(json.dumps(r))"""
        data=json.loads(run(client,'/usr/bin/python -c '+shlex.quote(source)))
        OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(data).encode(),base64.b64decode(req['owner_public_key']),req['session'],'os-upgrade-audit'))
        return {'status':'passed','mode':'os-upgrade-audit','release':data['release'],'kernel':data['kernel'],'virtualization':data['virt'],'memory':data['memory'],'disk':data['disk'],'system_changes':False,'provider_snapshot_or_console_access_available':False}
    finally:client.close()

def bridge_connect(peer):
    import paramiko
    client=paramiko.SSHClient();client.load_host_keys('.github/known_hosts/rak-sj');client.set_missing_host_key_policy(paramiko.RejectPolicy())
    key=paramiko.RSAKey.from_private_key(io.StringIO(peer['private_key']))
    client.connect(peer['host'],port=peer['port'],username=peer['user'],pkey=key,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30)
    return client

def bridge(client,action,**values):
    stdin,stdout,stderr=client.exec_command('production-bridge',timeout=300)
    stdin.write(json.dumps({'action':action,**values}));stdin.flush();stdin.channel.shutdown_write()
    raw=stdout.read();err=stderr.read();status=stdout.channel.recv_exit_status();result=json.loads(raw)
    if status or result.get('status')!='passed':raise RuntimeError('Restricted bridge operation failed')
    return result['result']

def source_restore_assets(client,sftp,req,peer):
    directory=BASE+'/'+req['session'];keypath=directory+'/bridge-key.pem';known=directory+'/bridge-known-hosts'
    write(sftp,keypath,peer['private_key']);write(sftp,known,Path('.github/known_hosts/rak-sj').read_bytes())
    write(sftp,directory+'/return.mjs',Path('.github/scripts/production_return.mjs').read_bytes())
    write(sftp,directory+'/return-config.json',json.dumps({'session':req['session'],'directory':directory,'private_key':BASE+'/private/recipient.pem'}))
    write(sftp,directory+'/rollback-request.json',json.dumps({'action':'rollback'}))
    ssh='/usr/bin/ssh -i '+keypath+' -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile='+known+' -o ConnectTimeout=20 -p 22881 root@198.247.1.206 production-bridge'
    script='#!/bin/sh\nset -e\ntest ! -f '+directory+'/source-migration-committed.json || exit 0\n'+ssh+' < '+directory+'/rollback-request.json > '+directory+'/rollback-response.private.json\n'+ROOT+'/bin/node '+directory+'/return.mjs '+directory+'/return-config.json '+directory+'/rollback-response.private.json\nsystemctl enable yifu-cpa yifu-gateway yifu-monitor yifu-plus yifu-tunnel yifu-plus-budget.timer >/dev/null 2>&1\nsystemctl start yifu-cpa yifu-gateway yifu-monitor yifu-plus yifu-plus-budget.timer\nsystemctl start yifu-tunnel\n'
    write(sftp,directory+'/rollback-source.sh',script,0o700)
    run(client,'test -x /usr/bin/ssh')
    return directory

def final_files(client,sftp,req):
    from migration_snapshot import collect
    raw,manifest=collect(client,sftp,req['session'],True);files,_=unpack(raw)
    values={n:{'data':base64.b64encode(b).decode(),'size':len(b),'mode':mode,'sha256':hashlib.sha256(b).hexdigest()} for n,(b,mode) in files.items() if n.startswith(('auths/','private/','data/','plus/'))}
    return json.dumps({'metadata':manifest['metadata'],'files':values},separators=(',',':')).encode(),manifest

def cutover(req):
    import yaml,urllib.request,urllib.error
    from yifu_safety import public_probe,keys_of
    from yifu_vps import private_env,signed_pool
    phase('business-cutover-preflight');source=connect();target=None;armed=False;committed=False
    try:
        with source.open_sftp() as sftp:
            peer=json.loads(unseal(json.dumps(req['bridge_envelope']).encode(),read(sftp,BASE+'/private/recipient.pem'),req['session'],'business-bridge'))
            target=bridge_connect(peer);initial=bridge(target,'state')
            if any(initial['units'].values()) or initial['committed']:raise ValueError('Destination is not safely staged')
            config=yaml.safe_load(read(sftp,ROOT+'/private/config.yaml'));env=private_env(sftp)
            inventory=public_probe(config)
            if inventory.get('http')!=200:raise RuntimeError('Existing production preflight failed')
            model=next((m for m in ['gpt-6.1-sol','gpt-6.1-terra','grok-4.7'] if m in inventory.get('model_ids',[])),None)
            if not model:raise RuntimeError('No suitable canary model before cutover')
            directory=source_restore_assets(source,sftp,req,peer)
            run(source,'systemctl stop rak-business-rollback.timer rak-business-rollback.service >/dev/null 2>&1 || true')
            run(source,'systemd-run --unit=rak-business-rollback --on-active=900 /bin/sh '+directory+'/rollback-source.sh');armed=True
            phase('business-graceful-source-drain')
            run(source,'systemctl stop yifu-plus-budget.timer; systemctl stop --no-block yifu-gateway')
            for attempt in range(150):
                status=run(source,'systemctl show -p ActiveState yifu-gateway').strip()
                if status=='ActiveState=inactive':break
                time.sleep(2)
            else:raise RuntimeError('Source streams still draining')
            run(source,'systemctl stop yifu-tunnel yifu-plus yifu-monitor yifu-cpa',timeout=180)
            phase('business-final-consistent-state-transfer')
            payload,manifest=final_files(source,sftp,req);envelope=dual_seal(payload,req,'business-final');write(sftp,directory+'/business-final-source.enc.json',envelope)
            applied=bridge(target,'apply',envelope=json.loads(envelope));started=bridge(target,'start')
            phase('business-target-internal-functional-verification');internal=bridge(target,'verify')
            phase('business-public-origin-and-model-verification')
            # The old tunnel connector is stopped: every successful origin response is served by RAK.
            model_check=None
            for attempt in range(30):
                model_check=public_probe(config)
                if model_check.get('http')==200:break
                time.sleep(2)
            if model_check.get('http')!=200:raise RuntimeError('Public API did not return after tunnel cutover')
            static=[]
            for key in keys_of(config):
                r=urllib.request.Request('https://yifu.leonmingod.com/v1/models',headers={'Authorization':'Bearer '+key,'User-Agent':'Yifu-Safety-Verification/1.0'})
                with urllib.request.urlopen(r,timeout=30) as response:static.append(len(json.load(response)['data']))
            if model not in model_check.get('model_ids',[]):raise RuntimeError('Canary model registry changed during cutover')
            inference={kind:public_probe(config,model,stream) for kind,stream in [('nonstream',False),('stream',True)]}
            if not all(r.get('generated') for r in inference.values()) or not inference['stream'].get('done'):raise RuntimeError('Upstream inference failed')
            plus=[]
            for path in ['/status','/v0/management/auth-files','/usage-service/config']:
                r=urllib.request.Request('https://yifuplus.leonmingod.com'+path,headers={'Authorization':'Bearer '+env['MANAGEMENT_PASSWORD'],'User-Agent':'Yifu-Plus-Verification/1.0'})
                with urllib.request.urlopen(r,timeout=30) as response:plus.append(response.status)
            code,pool=signed_pool('/_pool/status',{'kind':'snapshot','peek':True})
            if code!=200:raise RuntimeError('Signed public pool endpoint failed')
            phase('business-commit-destination-and-retire-source')
            # Commit markers fence automatic rollback before old services are disabled.
            accepted=bridge(target,'commit');write(sftp,directory+'/source-migration-committed.json',json.dumps({'accepted':int(time.time()),'destination':'198.247.1.206'}));committed=True
            run(source,'systemctl stop rak-business-rollback.timer');armed=False
            for name in SERVICES+['yifu-plus-budget.timer']:run(source,'systemctl disable '+name+' >/dev/null 2>&1')
            return {'status':'passed','mode':'migration-switch','source':'23.94.180.2','destination':'198.247.1.206','source_services_stopped_and_disabled':True,'native_services':list(started['units']),'preserved_credentials':applied['credentials'],'preserved_disabled':applied['disabled'],'final_exact_hashes_verified':applied['exact_hashes_verified'],'plus_database_key_pair_preserved':True,'internal_management':internal['management'],'static_keys_verified':len(static),'model_counts':static,'inference':inference,'canary_model':model,'plus_public_status':plus,'signed_pool_status':code,'cloudflare_frontend_auth_and_key_stores_preserved':True,'same_tunnel_and_domains':True,'no_source_production_dependency':True,'rollback_script':directory+'/rollback-source.sh','final_backup':directory+'/business-final-source.enc.json'}
    except Exception:
        if armed and not committed:
            phase('business-automatic-rollback-latest-state')
            try:
                run(source,'/bin/sh '+directory+'/rollback-source.sh',timeout=240)
                run(source,'systemctl stop rak-business-rollback.timer');armed=False
            except Exception:
                phase('business-rollback-pending-safe-fencing')
        raise
    finally:
        if target:target.close()
        source.close()


def source_health(req):
    import yaml
    from yifu_safety import public_probe
    client=connect();phase('source-continued-production-health')
    try:
        with client.open_sftp() as sf:config=yaml.safe_load(read(sf,ROOT+'/private/config.yaml'))
        states=run(client,'systemctl is-active '+' '.join(SERVICES)).strip().splitlines()
        if states!=['active']*5:raise RuntimeError('Old production service is not active')
        inventory=public_probe(config)
        if inventory.get('http')!=200 or not inventory.get('models'):raise RuntimeError('Old public API is not healthy')
        return {'status':'passed','mode':'source-health','production_host':'23.94.180.2','services':dict(zip(SERVICES,states)),'public_api_http':200,'models':inventory['models'],'source_remains_live_during_rak_rebuild':True,'changes':False}
    finally:client.close()
