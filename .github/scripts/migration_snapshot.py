"""Consistent source snapshot, encrypted in memory and authenticated to the target."""
import base64,hashlib,io,json,os,secrets,shlex,stat,tarfile,time,urllib.request
from pathlib import Path
import yifu_vps as old
from migration_crypto import checked_id,seal,sign
from migration_archive import pack,pathcheck,MAX_TOTAL

NODE_SHA='904a6d3484241d466989f9df9ba3aab822b1496191bdb28230eb491a55c32a52'

def fastread(sftp,path):
    with sftp.open(path,'rb') as stream:
        stream.prefetch(file_size=stream.stat().st_size,max_concurrent_requests=16)
        return stream.read()

def collect(client,sftp,session,final=False):
    files={};stamp=secrets.token_hex(12);archive=old.ROOT+'/private/.migration-archive-'+stamp+'.tar.gz'
    listing=old.ROOT+'/private/.migration-list-'+stamp
    script="""import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const root='/opt/yifu-cpa',archive=process.argv[1],listing=process.argv[2],final=process.argv[3]==='1';
const selected=[];
const names=new Set(['config.yaml','runtime.env','cloudflared.token','cloudflared.yaml','cloudflared.yml','pool-runtime.json','plus-config.json','plus-admin.key']);
function walk(relative){for(const item of fs.readdirSync(root+'/'+relative,{withFileTypes:true})){
 const name=relative+'/'+item.name;if(item.isSymbolicLink())continue;
 if(item.isDirectory()){if(!['logs','cache','node_modules','.git'].includes(item.name))walk(name);continue;}
 if(!item.isFile()||item.name.startsWith('.')||name==='bin/node'||/\\.(sqlite|sqlite-wal|sqlite-shm|log)$/.test(name))continue;
 if(relative==='private'&&!names.has(item.name))continue;
 if(name.startsWith('plus/')&&name!=='plus/data.key')continue;
 selected.push(name);
}}
for(const directory of (final?['private','auths','systemd','plus']:['private','auths','systemd','plus','bin','monitor','static']))walk(directory);
fs.writeFileSync(listing,selected.join('\\0')+'\\0',{mode:0o600});
const tar=spawnSync('tar',['--null','--verbatim-files-from','--no-recursion','--hard-dereference','-czf',archive,'-C',root,'-T',listing],{stdio:'ignore'});
if(tar.status!==0&&tar.status!==1)throw Error('Archive failed');fs.chmodSync(archive,0o600);console.log(JSON.stringify({files:selected.length,bytes:fs.statSync(archive).size}));
"""
    try:
        summary=json.loads(old.run(client,old.ROOT+'/bin/node --input-type=module -e '+shlex.quote(script)+' '+archive+' '+listing+' '+('1' if final else '0')))
        if summary['bytes']>MAX_TOTAL:raise ValueError('Compressed source archive exceeds bound')
        raw=fastread(sftp,archive);total=0
        with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
            for member in tar:
                pathcheck(member.name);total+=member.size
                if not member.isfile() or member.name in files or total>MAX_TOTAL:raise ValueError('Unsafe source archive')
                body=tar.extractfile(member).read();files[member.name]=(body,member.mode&0o777)
                if member.name.startswith('auths/') and member.name.endswith('.json'):json.loads(body)
        if len(files)!=summary['files']:raise ValueError('Source archive is incomplete')
    finally:
        for path in [archive,listing]:
            try:sftp.remove(path)
            except FileNotFoundError:pass
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

def export(req=None):
    req=req or json.loads(Path('.github/migration-request.json').read_text());session=checked_id(req['session']);kind=checked_id(req['object'])
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
