"""Install only the owner's Beszel monitoring components; no business migration."""
import base64,hashlib,io,json,os,secrets,shlex,sys,tarfile,time,traceback,urllib.error,urllib.request
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from vps_monitor_crypto import seal,unseal,checked_id

BASE='/opt/beszel-monitor'
DOMAIN='vps.leonmingod.com'
CF_ZONE='4f078f06b815a404337c3b5387c45275'
WORKER='leonmingod-private-vps'
PURPOSE='lmg-vps-monitor-v1'

def checkpoint(phase):
    Path('monitor-operation').mkdir(exist_ok=True);Path('monitor-operation/diagnostics.json').write_text(json.dumps({'phase':phase}))

def read(sftp,path):
    with sftp.open(path,'rb') as stream:return stream.read()

def write(sftp,path,raw,mode=0o600):
    with sftp.open(path+'.next','wb') as stream:
        stream.set_pipelined(True);stream.write(raw.encode() if isinstance(raw,str) else raw)
    sftp.chmod(path+'.next',mode);sftp.posix_rename(path+'.next',path)

def run(client,source,timeout=90,public_probe=False):
    _,out,err=client.exec_command('set -e\n'+source,timeout=timeout);raw=out.read();error=err.read();status=out.channel.recv_exit_status()
    if status:
        if public_probe:Path('monitor-operation/diagnostics.json').write_text(json.dumps({'phase':'native-binary-probe','exit':status,'stderr':error.decode(errors='replace')[-1500:],'stdout':raw.decode(errors='replace')[-1000:]}))
        raise RuntimeError('Remote monitor operation exit '+str(status))
    return raw.decode()

def binaries(names):
    release=json.loads(Path('.github/vps-monitor-release.json').read_text());result={}
    for name in names:
        row=release['archives'][name]
        with urllib.request.urlopen(row['url'],timeout=90) as response:raw=response.read(60*1024*1024)
        if hashlib.sha256(raw).hexdigest()!=row['sha256']:raise ValueError('Official release checksum differs')
        with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
            member=archive.getmember(name)
            if not member.isfile() or member.size>80*1024*1024:raise ValueError('Invalid release binary')
            body=archive.extractfile(member).read()
        if hashlib.sha256(body).hexdigest()!=row['binary_sha256']:raise ValueError('Official binary checksum differs')
        result[name]=body
    return result

def connect():
    if os.environ['MONITOR_ROLE']=='source':
        import yifu_vps
        return yifu_vps.connect()
    import rak_vpn
    return rak_vpn.connect()

def baseline(client):
    role=os.environ['MONITOR_ROLE']
    names=['yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','yifu-tunnel'] if role=='source' else ['hysteria-server','rak-vpn-subscription','rak-vpn-tcp','rak-vpn-firewall','rak-vpn-traffic.timer']
    protected=['/opt/yifu-cpa/private/config.yaml','/opt/yifu-cpa/private/runtime.env'] if role=='source' else ['/etc/ssh/sshd_config','/etc/shadow','/etc/hysteria/config.yaml','/etc/hysteria/rak-tcp.json','/etc/hysteria/rak-subscription.json']
    state={name:run(client,'systemctl show '+name+' -p MainPID -p ActiveState').strip() for name in names}
    if any('ActiveState=active' not in value for value in state.values()):raise RuntimeError('Existing production service unhealthy')
    state['protected']=run(client,'sha256sum '+' '.join(protected));return state

def cf(path,method='GET',body=None):
    import yifu_key_api as api
    url='https://api.cloudflare.com/client/v4/'+path
    raw=api.request(url,method,body,{'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'].strip()})[2]
    result=json.loads(raw)
    if not result.get('success'):raise RuntimeError('Cloudflare operation rejected')
    return result.get('result')

def source_prepare(req):
    checkpoint('source-connect');client=connect();session=checked_id(req['session'])
    try:
        before=baseline(client)
        with client.open_sftp() as sftp:
            run(client,'install -d -m 0755 '+BASE+' '+BASE+'/bin; install -d -m 0700 '+BASE+'/private')
            path=BASE+'/private/recipient-'+session+'.pem'
            try:key=serialization.load_pem_private_key(read(sftp,path),password=None)
            except FileNotFoundError:
                key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
                write(sftp,path,key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
            public=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
            checkpoint('source-native-agent')
            raw=binaries(['beszel-agent'])['beszel-agent'];write(sftp,BASE+'/bin/beszel-agent',raw,0o755)
            if run(client,'sha256sum '+BASE+'/bin/beszel-agent').split()[0]!=hashlib.sha256(raw).hexdigest():raise ValueError('Uploaded agent differs')
            version=run(client,BASE+'/bin/beszel-agent --version',public_probe=True).strip()
            checkpoint('monitor-domain-readonly')
            account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip();domains=cf('accounts/'+account+'/workers/domains')
            existing=[r for r in domains if r['hostname']==DOMAIN]
            if existing and any(r['service']!=WORKER for r in existing):raise ValueError('Private monitor hostname already belongs to another service')
            known_zone=any(r.get('zone_id')==CF_ZONE for r in domains)
            if baseline(client)!=before:raise ValueError('Existing production process or configuration changed')
            return {'status':'passed','role':'source','mode':'prepare','project':'henrygd/beszel','version':version,'session':session,'domain':DOMAIN,
                    'recipient_public_key':base64.b64encode(public).decode(),'worker_domain_api_readable':True,'existing_zone_confirmed':known_zone,
                    'monitor_domain_already_present':bool(existing),'existing_production_unchanged':True,'agent_not_started':True,'business_migration_remains_cancelled':True}
    finally:client.close()

def main():
    Path('monitor-operation').mkdir(exist_ok=True)
    try:
        req=json.loads(Path('.github/vps-monitor-request.json').read_text())
        if req['domain']!=DOMAIN:raise ValueError('Unexpected private monitor domain')
        role=os.environ['MONITOR_ROLE']
        if role=='source' and req['mode']=='prepare':result=source_prepare(req)
        else:raise ValueError('Unsupported monitor phase')
    except Exception as error:
        result={'status':'failed','role':os.environ.get('MONITOR_ROLE'),'error_type':type(error).__name__,'location':[{'file':Path(f.filename).name,'function':f.name,'line':f.lineno} for f in traceback.extract_tb(error.__traceback__)]}
    Path('monitor-operation/report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    if result['status']!='passed':sys.exit(1)

if __name__=='__main__':main()
