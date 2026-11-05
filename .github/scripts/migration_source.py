"""Source migration preparation; private state stays encrypted in artifact/transport."""
import base64,hashlib,json,os,secrets,shutil,time
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import yifu_vps as old


def request():return json.loads(Path('.github/migration-request.json').read_text())


def prepare():
    req=request();session=req['session']
    if not session.startswith('rak-') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in session):
        raise ValueError('Invalid migration session')
    client=old.connect()
    try:
        with client.open_sftp() as sftp:
            # Known-good existing backup implementation: AEAD roundtrip and SQLite quick_check.
            old.backup(client,sftp,'backup-before')
            root=Path('migration-operation');root.mkdir(exist_ok=True)
            shutil.copyfile('yifu-operation/backup-before.enc.json',root/'backup-before.enc.json')
            (root/'backup-before.enc.json').chmod(0o600)
            path=old.ROOT+'/private/'+session+'-signer.pem'
            try:
                private=old.read(sftp,path)
                key=serialization.load_pem_private_key(private,password=None)
            except FileNotFoundError:
                key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
                private=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
                old.write(sftp,path,private)
            public=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
            metadata={'status':'passed','role':'source','mode':'prepare','session':session,
                'source_signing_public_key':base64.b64encode(public).decode(),
                'source_host_fingerprint':'SHA256:8l68r+SGZt/kjBcHESsbnkpkGk2AsFaBwgJqXiAeF98',
                'backup':json.loads(Path('yifu-operation/backup-before.json').read_text()),
                'production_services':old.run(client,'systemctl is-active yifu-cpa yifu-tunnel yifu-monitor yifu-gateway yifu-plus').splitlines(),
                'source_not_stopped':True,'backup_artifact_filename':'backup-before.enc.json'}
            return metadata
    finally:client.close()


def state_permissions():
    import urllib.parse
    import yifu_key_api as api
    account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()
    base='https://api.cloudflare.com/client/v4/accounts/'+account
    def get(path):
        data=json.loads(api.request(base+path,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'].strip()})[2])
        if not data.get('success'):raise RuntimeError('CF metadata lookup rejected')
        return data
    result={'status':'passed','role':'source','mode':'verify','state_permissions':{}}
    for worker,binding in [('leonmingod-home','GAME_RUNS'),('cpa-abuse-guard','STATE')]:
        settings=api.cf(worker+'/settings')
        namespace=next(b.get('namespace_id') for b in settings['bindings'] if b['name']==binding)
        key=worker+'-objects'
        try:
            cursor='';count=0;seen=set()
            while True:
                data=get('/workers/durable_objects/namespaces/'+namespace+'/objects?limit=1000'+('&cursor='+urllib.parse.quote(cursor,safe='') if cursor else ''))
                rows=data.get('result') or [];count+=len(rows)
                more=(data.get('result_info') or {}).get('cursor')
                if not rows or not more or more in seen or len(rows)<1000:break
                seen.add(more);cursor=more
            result['state_permissions'][key]={'readable':True,'objects':count,'namespace_id':namespace}
        except Exception as exc:result['state_permissions'][key]={'readable':False,'error_type':type(exc).__name__,'error':str(exc)[:150],'namespace_id':namespace}
    namespace='1b02d139375045f7a7d5ce2d994abd2c'
    try:
        cursor='';count=0;prefixes={};seen=set()
        while True:
            data=get('/storage/kv/namespaces/'+namespace+'/keys?limit=1000'+('&cursor='+urllib.parse.quote(cursor,safe='') if cursor else ''))
            rows=data.get('result') or [];count+=len(rows)
            for row in rows:
                prefix=row['name'].split(':',1)[0]
                if prefix not in ['email','key','code','stats','leaderboard','ops','rate','grant']:prefix='other'
                prefixes[prefix]=prefixes.get(prefix,0)+1
            more=(data.get('result_info') or {}).get('cursor')
            if not rows or not more or more in seen or len(rows)<1000:break
            seen.add(more);cursor=more
        result['state_permissions']['kv']={'readable':True,'records':count,'prefix_counts':prefixes}
    except Exception as exc:result['state_permissions']['kv']={'readable':False,'error_type':type(exc).__name__,'error':str(exc)[:150]}
    return result
