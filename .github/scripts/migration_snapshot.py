"""Consistent source snapshot, encrypted in memory and authenticated to the target."""
import base64,hashlib,json,os,secrets,shlex,stat,time,urllib.request
from pathlib import Path
import yifu_vps as old
from migration_crypto import checked_id,seal,sign
from migration_archive import pack

NODE_SHA='904a6d3484241d466989f9df9ba3aab822b1496191bdb28230eb491a55c32a52'

def fastread(sftp,path):
    with sftp.open(path,'rb') as stream:
        stream.prefetch(file_size=stream.stat().st_size,max_concurrent_requests=16)
        return stream.read()

def collect(client,sftp,session,final=False):
    files={}
    def walk(relative):
        for item in sftp.listdir_attr(old.ROOT+'/'+relative):
            name=relative+'/'+item.filename
            if stat.S_ISDIR(item.st_mode):
                if item.filename not in ['node_modules','logs','cache','.git']:walk(name)
            elif stat.S_ISREG(item.st_mode):
                if name=='bin/node' or name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm','.log')):continue
                if item.filename.startswith('.') or item.filename.endswith('-signer.pem'):continue
                if name.startswith('plus/') and item.filename!='data.key':continue
                raw=fastread(sftp,old.ROOT+'/'+name)
                if relative=='auths' and item.filename.endswith('.json'):json.loads(raw)
                files[name]=(raw,stat.S_IMODE(item.st_mode))
    for directory in ['private','auths','systemd','bin','monitor','static','plus']:walk(directory)
    for database in ['data/pool.sqlite','plus/usage.sqlite']:
        temporary=old.ROOT+'/private/.migration-'+secrets.token_hex(12)+'.sqlite'
        try:
            source="import {DatabaseSync,backup} from 'node:sqlite';const db=new DatabaseSync("+json.dumps(old.ROOT+'/'+database)+",{readOnly:true});await backup(db,"+json.dumps(temporary)+");db.close();const copy=new DatabaseSync("+json.dumps(temporary)+",{readOnly:true});if(copy.prepare('PRAGMA quick_check').all().some(row=>Object.values(row)[0]!=='ok'))throw Error('SQLite backup corrupt');copy.close();"
            old.run(client,old.ROOT+'/bin/node --input-type=module -e '+shlex.quote(source))
            files[database]=(fastread(sftp,temporary),0o600)
        finally:
            try:sftp.remove(temporary)
            except FileNotFoundError:pass
    if old.run(client,'sha256sum '+old.ROOT+'/bin/node').split()[0]!=NODE_SHA:raise ValueError('Source Node version changed')
    files['migration/backup-secret']=(os.environ['YIFU_BACKUP_SECRET'].encode(),0o600)
    metadata={'session':session,'snapshot_ms':int(time.time()*1000),'final':final,'node_sha256':NODE_SHA,
              'credentials':sum(n.startswith('auths/') for n in files),'disabled':sum(bool(json.loads(raw).get('disabled')) for n,(raw,mode) in files.items() if n.startswith('auths/') and n.endswith('.json'))}
    return pack(files,metadata)

def deliver(raw,kind,req,signer):
    session=checked_id(req['session']);kind=checked_id(kind)
    target=req['receiver_url']
    if target!='https://sj.leonmingod.com/_migration/'+session+'/upload':raise ValueError('Unexpected migration recipient')
    envelope=seal(raw,base64.b64decode(req['recipient_public_key'],validate=True),session,kind)
    headers={'Content-Type':'application/octet-stream',**sign(envelope,signer,session,kind)}
    request=urllib.request.Request(target,data=envelope,headers=headers,method='POST')
    with urllib.request.urlopen(request,timeout=180) as response:receipt=json.loads(response.read(8192))
    if not receipt.get('received') or receipt['sha256']!=hashlib.sha256(envelope).hexdigest():raise ValueError('Recipient receipt mismatch')
    return receipt

def export():
    req=json.loads(Path('.github/migration-request.json').read_text());session=checked_id(req['session']);kind=checked_id(req['object'])
    client=old.connect()
    try:
        with client.open_sftp() as sftp:
            raw,manifest=collect(client,sftp,session,req.get('final',False))
            signer=old.read(sftp,old.ROOT+'/private/'+session+'-signer.pem')
            receipt=deliver(raw,kind,req,signer)
        return {'status':'passed','role':'source','mode':'export','session':session,'object':kind,'files':len(manifest['files']),
                'credentials':manifest['metadata']['credentials'],'disabled':manifest['metadata']['disabled'],
                'ciphertext_bytes':receipt['bytes'],'ciphertext_sha256':receipt['sha256'],'encrypted_transfer_verified':True,'final':manifest['metadata']['final'],'source_services_stopped':False}
    finally:client.close()
