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
