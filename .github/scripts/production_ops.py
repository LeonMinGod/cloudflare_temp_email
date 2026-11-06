"""Authorized Komari completion and full migration; encrypted audit outputs."""
import base64,hashlib,json,os,secrets,shlex,sys,time,traceback
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from production_crypto import seal,unseal,checked_id
from vps_monitor import connect,read,write,run

BASE='/opt/rak-production'
OUT=Path('production-operation')

def phase(value):
    OUT.mkdir(exist_ok=True);OUT.joinpath('diagnostics.json').write_text(json.dumps({'phase':value}))

def recipient(client,sftp,session):
    run(client,'install -d -m 0755 '+BASE+'; install -d -m 0700 '+BASE+'/private '+BASE+'/'+session)
    path=BASE+'/private/recipient.pem'
    try:key=serialization.load_pem_private_key(read(sftp,path),password=None)
    except FileNotFoundError:
        key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
        write(sftp,path,key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    return key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)

AUDIT=r'''from __future__ import print_function
import os,json,subprocess,glob,hashlib
def command(args):
 try:return subprocess.check_output(args,stderr=subprocess.STDOUT).decode('utf-8','replace').strip()
 except Exception:return None
services=['hysteria-server','rak-vpn-subscription','rak-vpn-tcp','rak-vpn-firewall','rak-vpn-traffic.timer','beszel-hub','beszel-agent','komari-hub','komari-agent','yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','yifu-tunnel']
result={'hostname':command(['hostname']),'kernel':command(['uname','-srmo']),'memory':command(['free','-b']),'disk':command(['df','-B1','/']),'load':open('/proc/loadavg').read().strip(),'cpu_count':len([line for line in open('/proc/cpuinfo') if line.startswith('processor')]),'listeners':command(['ss','-lntup']),'services':{}}
for name in services:
 unit=name if name.endswith('.timer') else name+'.service'
 result['services'][name]=command(['systemctl','show','-p','ActiveState','-p','MainPID','-p','FragmentPath',unit])
roots=['/opt/komari','/var/lib/komari','/opt/komari-agent','/var/lib/komari-agent','/opt/beszel-monitor','/var/lib/beszel-hub','/opt/lmg-migration','/opt/lmg-runtime/v1','/opt/yifu-cpa','/etc/hysteria']
result['files']={}
for root in roots:
 rows=[]
 if os.path.isdir(root):
  for directory,dirs,files in os.walk(root):
   dirs[:]=[d for d in dirs if d not in ['logs','node_modules','.git','cache','static','monitor']]
   for name in files:
    p=os.path.join(directory,name)
    try:rows.append({'path':p,'bytes':os.stat(p).st_size,'mode':oct(os.stat(p).st_mode&511)})
    except OSError:pass
   if len(rows)>400:break
 result['files'][root]=rows
if os.path.isfile('/etc/hysteria/subscription-caddy.json'):
 cfg=json.load(open('/etc/hysteria/subscription-caddy.json'));result['caddy']=cfg
result['komari_units']={}
for name in ['komari-hub','komari-agent']:
 path='/etc/systemd/system/'+name+'.service'
 if os.path.isfile(path):result['komari_units'][name]=open(path).read()
if os.path.isfile('/opt/komari/.bootstrap-key.pem'):
 result['existing_komari_bootstrap_public_key']=command(['openssl','pkey','-in','/opt/komari/.bootstrap-key.pem','-pubout'])
print(json.dumps(result))
'''

SQL_AUDIT=r'''import fs from 'node:fs';import{DatabaseSync}from'node:sqlite';
const files=process.argv.slice(1),result={};
for(const file of files){
 if(!fs.existsSync(file))continue;
 try{
  const db=new DatabaseSync(file,{readOnly:true});const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);const out={tables:{}};
  for(const name of tables){if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))continue;out.tables[name]={columns:db.prepare('PRAGMA table_info('+name+')').all().map(r=>r.name),count:db.prepare('SELECT count(*) AS n FROM '+name).get().n};}
  if(tables.includes('users'))out.users=db.prepare('SELECT uuid,username FROM users').all();
  if(tables.includes('clients')){const cols=out.tables.clients.columns.filter(c=>!/token|pass|key|remark/i.test(c));out.clients=db.prepare('SELECT '+cols.join(',')+' FROM clients').all();}
  if(tables.includes('settings')){const cols=out.tables.settings.columns;const safe=cols.filter(c=>!/api_key|secret|password|token|custom_head|custom_body/i.test(c));out.settings=db.prepare('SELECT '+safe.join(',')+' FROM settings').all();}
  if(tables.includes('config_items'))out.config_items=db.prepare('SELECT * FROM config_items').all().map(r=>/secret|password|token|api_key/i.test(String(r.key||''))?{key:r.key,redacted:true}:r);
  out.integrity=db.prepare('PRAGMA quick_check').all();result[file]=out;db.close();
 }catch(error){result[file]={error:String(error)}}
}
console.log(JSON.stringify(result));'''

def audit(req):
    phase('audit-connect');client=connect();role=os.environ['MONITOR_ROLE'];session=checked_id(req['session'])
    try:
        with client.open_sftp() as sftp:
            public=recipient(client,sftp,session)
            phase('audit-services-and-resources')
            data=json.loads(run(client,'/usr/bin/python -c '+shlex.quote(AUDIT),timeout=120)) if role=='target' else json.loads(run(client,'/opt/yifu-cpa/bin/node --input-type=module -e '+shlex.quote(SOURCE_AUDIT),timeout=120))
            if role=='target':
                files=[]
                for rows in data['files'].values():files.extend(row['path'] for row in rows if row['path'].endswith(('.db','.sqlite')) and '/var/lib/komari/' in row['path'])
                launcher='/opt/lmg-runtime/v1/lib/ld-linux-x86-64.so.2 --library-path /opt/lmg-runtime/v1/lib /opt/lmg-runtime/v1/node'
                if files:data['komari_databases']=json.loads(run(client,launcher+' --input-type=module -e '+shlex.quote(SQL_AUDIT)+' '+' '.join(shlex.quote(p) for p in files),timeout=120))
                for path in ['/api/version','/api/install/status','/api/public','/api/nodes']:
                    data.setdefault('komari_local_http',{})[path]=run(client,'curl -sS --max-time 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:25774'+path)
            else:
                import yifu_key_api as api
                data['workers']={name:{'version':api.active(name),'bindings':[{'name':b['name'],'type':b['type']} for b in api.cf(name+'/settings')['bindings']]} for name in ['leonmingod-home','leonmingod-free-token','cpa-abuse-guard','leonmingod-private-vps']}
                data['monitor_worker_source_sha256']=hashlib.sha256(api.cf('leonmingod-private-vps',raw=True)[2]).hexdigest()
            raw=seal(json.dumps(data).encode(),base64.b64decode(req['owner_public_key'],validate=True),session,'production-audit-'+role)
            OUT.joinpath('audit.enc.json').write_bytes(raw)
            return {'status':'passed','role':role,'mode':'audit','session':session,'recipient_public_key':base64.b64encode(public).decode(),'audit_encrypted_to_owner':True,'production_routes_unchanged':True}
    finally:client.close()

SOURCE_AUDIT=r'''import fs from'node:fs';import os from'node:os';import{execFileSync}from'node:child_process';
const run=a=>{try{return execFileSync(a[0],a.slice(1),{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{return null}};
const units=['yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','yifu-tunnel','beszel-agent','komari-agent'];const services={};for(const name of units)services[name]=run(['systemctl','show','-p','ActiveState','-p','MainPID','-p','FragmentPath',name+'.service']);
const files={};for(const root of ['/opt/yifu-cpa','/opt/komari-agent','/var/lib/komari-agent','/opt/komari','/opt/beszel-monitor']){const list=[];function walk(p){if(list.length>250)return;try{for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.isSymbolicLink())continue;const q=p+'/'+e.name;if(e.isDirectory()){if(!['logs','monitor','static','node_modules','.git'].includes(e.name))walk(q)}else{const s=fs.statSync(q);list.push({path:q,bytes:s.size,mode:(s.mode&511).toString(8)})}}}catch{}}walk(root);files[root]=list;}
const privateFiles=['config.yaml','runtime.env','cloudflared.token','pool-runtime.json','plus-config.json','plus-admin.key'];const hashes={};for(const file of privateFiles){const p='/opt/yifu-cpa/private/'+file;hashes[file]=run(['sha256sum',p])}
const authDir='/opt/yifu-cpa/auths';let auths=[];for(const file of fs.readdirSync(authDir)){if(!file.endsWith('.json'))continue;const value=JSON.parse(fs.readFileSync(authDir+'/'+file));auths.push({name:file,disabled:!!value.disabled});}
const unitsText={};for(const name of units){try{unitsText[name]=fs.readFileSync('/etc/systemd/system/'+name+'.service','utf8')}catch{}}
console.log(JSON.stringify({hostname:os.hostname(),kernel:os.release(),cpu_count:os.availableParallelism(),memory:run(['free','-b']),disk:run(['df','-B1','/']),load:os.loadavg(),listeners:run(['ss','-lntup']),services,files,units:unitsText,protected_hashes:hashes,auths}));'''

def main():
    OUT.mkdir(exist_ok=True)
    try:
        req=json.loads(Path('.github/production-request.json').read_text())
        if req['mode']=='audit':result=audit(req)
        elif req['mode']=='komari-admin':
            from production_komari import admin
            result=admin(req)
        elif req['mode'] in ['komari-switch','source-agent','verify']:
            import production_komari as k
            result={'komari-switch':k.switch,'source-agent':k.source_agent,'verify':k.verify}[req['mode']](req)
        else:raise ValueError('Unsupported production phase')
    except Exception as error:
        result={'status':'failed','role':os.environ.get('MONITOR_ROLE'),'error_type':type(error).__name__,'location':[{'file':Path(f.filename).name,'function':f.name,'line':f.lineno} for f in traceback.extract_tb(error.__traceback__)]}
    OUT.joinpath('report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    if result['status']!='passed':sys.exit(1)

if __name__=='__main__':main()
