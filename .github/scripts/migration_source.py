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
