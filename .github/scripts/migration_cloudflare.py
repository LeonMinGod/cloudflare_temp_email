"""Capture exact live modules and bindings without reading or printing secret values."""
import base64,email.policy,hashlib,json,os,secrets,time,urllib.parse,urllib.request
from email.parser import BytesParser
from pathlib import Path
import yifu_key_api as api
import yifu_vps as old
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import padding
from migration_archive import pack
from migration_snapshot import deliver

WORKERS={'site':'leonmingod-home','guard':'cpa-abuse-guard'}

def capture(worker):
    before=api.active(worker);settings=api.cf(worker+'/settings');status,headers,body=api.cf(worker,raw=True)
    if 'multipart/' not in headers['Content-Type']:raise ValueError('Expected modular live Worker')
    message=BytesParser(policy=email.policy.default).parsebytes(('Content-Type: '+headers['Content-Type']+'\r\n\r\n').encode()+body)
    modules={}
    metadata={}
    for part in message.iter_parts():
        name=part.get_filename() or part.get_param('name',header='Content-Disposition');raw=part.get_payload(decode=True)
        if name=='metadata':metadata=json.loads(raw)
        else:modules[name]=(raw,part.get_content_type())
    main=metadata.get('main_module') or settings.get('main_module') or ('index.js' if 'index.js' in modules else 'index.mjs')
    if main not in modules:raise ValueError('Live Worker main module missing')
    if api.active(worker)!=before:raise ValueError('Live Worker changed during capture')
    return {'worker':worker,'version':before,'settings':settings,'metadata':metadata,'main':main},modules

def capture_export(req=None):
    req=req or json.loads(Path('.github/migration-request.json').read_text());files={};metadata={'session':req['session'],'workers':{}}
    for role,worker in WORKERS.items():
        row,modules=capture(worker);metadata['workers'][role]=row
        for name,(raw,mime) in modules.items():files['website/live/'+role+'/'+name]=(raw,0o600)
    for file in Path('sites/rak-vps-site').rglob('*.mjs'):
        if '/tests/' not in str(file):files['website/adapter/'+str(file.relative_to('sites/rak-vps-site'))]=(file.read_bytes(),0o644)
    files['website/package.json']=(b'{"type":"module"}',0o644)
    files['website/live/metadata.json']=(json.dumps(metadata).encode(),0o600)
    payload,manifest=pack(files,{'session':req['session'],'kind':'cloudflare-code','workers':{r:row['version'] for r,row in metadata['workers'].items()}})
    client=old.connect()
    try:
        with client.open_sftp() as sftp:
            signer=old.read(sftp,old.ROOT+'/private/'+req['session']+'-signer.pem')
            receipt=deliver(payload,req['object'],req,signer)
    finally:client.close()
    return {'status':'passed','role':'source','mode':'export','kind':'cloudflare-code','object':req['object'],'files':len(files),'workers':{role:{'version':row['version'],'bindings':len(row['settings']['bindings'])} for role,row in metadata['workers'].items()},'encrypted_transfer_verified':True,'ciphertext_bytes':receipt['bytes'],'production_unchanged':True}

def multipart(metadata,modules):
    boundary='migration-'+secrets.token_hex(16);chunks=[]
    for name,mime,raw in [('metadata','application/json',json.dumps(metadata).encode()),*[(n,row['mime'],base64.b64decode(row['body'])) for n,row in modules.items()]]:
        disposition='form-data; name="'+name+'"'+('' if name=='metadata' else '; filename="'+name+'"')
        chunks.extend([('--'+boundary+'\r\nContent-Disposition: '+disposition+'\r\nContent-Type: '+mime+'\r\n\r\n').encode(),raw,b'\r\n'])
    chunks.append(('--'+boundary+'--\r\n').encode());return b''.join(chunks),{'Content-Type':'multipart/form-data; boundary='+boundary}

def hooks():
    req=json.loads(Path('.github/migration-request.json').read_text());session=req['session'];client=old.connect();versions={}
    try:
        with client.open_sftp() as sftp:
            signer=serialization.load_pem_private_key(old.read(sftp,old.ROOT+'/private/'+session+'-signer.pem'),password=None)
            recipient=serialization.load_pem_public_key(base64.b64decode(req['recipient_public_key']))
            config={'session':session,'signing_public_der':base64.b64encode(signer.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)).decode(),
                    'recipient_public_der':base64.b64encode(recipient.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)).decode()}
            for role,worker in WORKERS.items():
                row,captured=capture(worker)
                if row['version']!=req['expected_versions'][role]:raise ValueError('Live version differs from captured target code')
                settings=row['settings'];bindings=settings['bindings'];main=row['main'];modules={n:{'body':base64.b64encode(raw).decode(),'mime':mime} for n,(raw,mime) in captured.items()}
                if api.active(worker)!=row['version']:raise ValueError('Captured production version changed')
                object_name='GameRun' if role=='site' else 'AbuseState'
                wrapper=Path('sites/rak-vps-site/cf-wrapper.mjs').read_text().replace('__OBJECT__',object_name).replace('__CONFIG__',json.dumps({**config,'role':role},separators=(',',':')))
                modules={('migration-original.js' if name==main else name):value for name,value in modules.items()}
                modules['migration-wrapper.js']={'mime':'application/javascript+module','body':base64.b64encode(wrapper.encode()).decode()}
                metadata={'main_module':'migration-wrapper.js','compatibility_date':settings['compatibility_date'],'compatibility_flags':settings.get('compatibility_flags',[]),
                          'keep_bindings':['secret_text','plain_text','json'],'bindings':[b for b in bindings if b['type'] not in ['secret_text','plain_text','json']],
                          'annotations':{'workers/message':'Stage signed encrypted migration hooks; preserve exact business modules and all state'}}
                if role=='site':metadata['keep_assets']=True
                raw,headers=multipart(metadata,modules);version=api.cf(worker+'/versions','POST',raw,headers)
                staged=version['resources']['bindings']
                if {(b['name'],b['type']) for b in staged}!={(b['name'],b['type']) for b in bindings}:raise ValueError('Staged bindings differ')
                for binding in ['KV','GAME_RUNS','KEYS','STATE']:
                    if [b for b in staged if b['name']==binding]!=[b for b in bindings if b['name']==binding]:raise ValueError('Staged namespace differs')
                versions[role]={'worker':worker,'before':row['version'],'staged':version['id']}
            for role in ['guard','site']:
                row=versions[role]
                if api.active(row['worker'])!=row['before']:raise ValueError('Production version changed before publishing')
                api.cf(row['worker']+'/deployments','POST',{'strategy':'percentage','versions':[{'version_id':row['staged'],'percentage':100}]})
                if api.active(row['worker'])!=row['staged']:raise ValueError('Migration hook publish mismatch')
            old.write(sftp,old.ROOT+'/private/'+session+'-cf-hooks.json',json.dumps(versions))
        return {'status':'passed','role':'source','mode':'prepare','operation':'cloudflare-hooks','workers':versions,'business_modules_unchanged':True,'bindings_and_namespaces_preserved':True,'traffic_not_switched':True}
    finally:client.close()

def cf_request(client,sftp,role,body,req):
    private=serialization.load_pem_private_key(old.read(sftp,old.ROOT+'/private/'+req['session']+'-signer.pem'),password=None)
    stamp=str(int(time.time()*1000));raw=json.dumps(body,separators=(',',':')).encode()
    signature=private.sign(b'lmg-cf-migration-v1\n'+req['session'].encode()+b'\n'+stamp.encode()+b'\n'+raw,padding.PKCS1v15(),hashes.SHA256())
    if role=='site':origin='https://leonmingod.com'
    else:
        url=urllib.parse.urlsplit(old.private_env(sftp)['CPA_ABUSE_URL']);origin=url.scheme+'://'+url.netloc
        if url.scheme!='https' or not url.hostname.endswith('.workers.dev'):raise ValueError('Unexpected guard origin')
    query=urllib.request.Request(origin+'/_migration/'+req['session'],data=raw,method='POST',headers={'Content-Type':'application/json','X-Migration-Time':stamp,'X-Migration-Signature':base64.b64encode(signature).decode()})
    with urllib.request.urlopen(query,timeout=120) as response:result=response.read(24*1024*1024)
    envelope=json.loads(result)
    if envelope.get('session')!=req['session'] or envelope.get('kind')!=body['kind'] or envelope.get('format')!='AES-256-GCM+RSA-OAEP-SHA256':raise ValueError('Unexpected encrypted CF export')
    return result

def state_export():
    req=json.loads(Path('.github/migration-request.json').read_text());client=old.connect();files={};counts={}
    try:
        with client.open_sftp() as sftp:
            for role in WORKERS:
                kind=role+'-bindings';files['migration/cf/'+kind+'.enc']=(cf_request(client,sftp,role,{'action':'bindings','kind':kind},req),0o600)
            # Cursor is returned only inside an encrypted envelope. Have the Worker
            # return the complete KV snapshot in one bounded multi-page export.
            files['migration/cf/site-kv.enc']=(cf_request(client,sftp,'site',{'action':'kv-all','kind':'site-kv'},req),0o600)
            files['migration/cf/guard-state.enc']=(cf_request(client,sftp,'guard',{'action':'guard','kind':'guard-state'},req),0o600)
            account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip();namespace='2dffacc2783647f0bec81263501de5e1'
            url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/durable_objects/namespaces/'+namespace+'/objects?limit=1000'
            data=json.loads(api.request(url,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'].strip()})[2])
            if not data.get('success') or len(data['result'])>=1000:raise ValueError('Object listing incomplete')
            ids=[r['id'] for r in data['result']]
            for at in range(0,len(ids),40):
                kind='site-objects-'+str(at//40).zfill(3)
                files['migration/cf/'+kind+'.enc']=(cf_request(client,sftp,'site',{'action':'objects','kind':kind,'ids':ids[at:at+40]},req),0o600)
            raw,manifest=pack(files,{'session':req['session'],'kind':'cloudflare-state','objects':len(ids),'final':req.get('final',False)})
            signer=old.read(sftp,old.ROOT+'/private/'+req['session']+'-signer.pem');receipt=deliver(raw,req['object'],req,signer)
        return {'status':'passed','role':'source','mode':'export','operation':'cloudflare-state','object':req['object'],'encrypted_objects':len(files),'durable_objects':len(ids),'encrypted_transfer_verified':True,'ciphertext_bytes':receipt['bytes'],'final':req.get('final',False)}
    finally:client.close()
