"""Finish the existing Komari installation without reinstalling or exposing secrets."""
import base64,copy,json,os,re,secrets,shlex,time,urllib.error,urllib.request
from pathlib import Path
from production_ops import BASE,OUT,phase,connect,read,write,run
from production_crypto import seal,unseal
from vps_monitor import baseline
from vps_monitor_install import protect_unchanged

LAUNCH='/opt/lmg-runtime/v1/lib/ld-linux-x86-64.so.2 --library-path /opt/lmg-runtime/v1/lib /opt/lmg-runtime/v1/node'
USERNAME='leonming0107@gmail.com'

def credentials(sftp,req):
    private=read(sftp,BASE+'/private/recipient.pem')
    value=json.loads(unseal(json.dumps(req['credential_envelope']).encode(),private,req['session'],'komari-admin'))
    if value['username']!=USERNAME or not value['password'].endswith('!') or ord(value['password'][-1])!=33:raise ValueError('Unexpected administrator identity')
    return value

PASSWORD_UPDATE=r'''import fs from'node:fs';import{DatabaseSync,backup}from'node:sqlite';import{createHash}from'node:crypto';
const input=JSON.parse(fs.readFileSync(process.argv[1],'utf8')),root=input.backup;
fs.mkdirSync(root,{recursive:true,mode:0o700});
for(const [name,path]of [['control','/var/lib/komari/data/komari.db'],['metrics','/var/lib/komari/data/metrics/metrics.db']]){
 const db=new DatabaseSync(path);await backup(db,root+'/'+name+'.sqlite');
 if(name==='control'){
  const row=db.prepare('SELECT uuid,username,passwd FROM users WHERE username=?').get(input.username);if(!row)throw Error('Existing administrator not found');
  const value=createHash('sha256').update(input.password+'06Wm4Jv1Hkxx').digest('base64');
  if(row.passwd!==value){db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET passwd=? WHERE uuid=?').run(value,row.uuid);db.prepare('DELETE FROM sessions WHERE uuid=?').run(row.uuid);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}}
 }
 db.close();
}console.log(JSON.stringify({administrator_preserved:true,password_record_ready:true,consistent_backups:true}));'''

CONFIGURE=r'''import json,sys,http.cookiejar,urllib.request,urllib.error
q=json.load(open(sys.argv[1]));jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def api(path,method='GET',body=None):
 req=urllib.request.Request('http://127.0.0.1:25774'+path,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),method=method,headers={'Content-Type':'application/json','User-Agent':'Komari-Owner-Provisioner'})
 with opener.open(req,timeout=25) as response:return json.load(response)
if api('/api/login','POST',{'username':q['username'],'password':q['password']}).get('status')!='success':raise RuntimeError('Administrator authentication failed')
settings=api('/api/admin/settings/');settings=settings.get('data',settings)
head=settings.get('custom_head','') or '';start='<!-- rak-mobile-budget-v1:start -->';end='<!-- rak-mobile-budget-v1:end -->'
if start in head:head=head.split(start)[0]+head.split(end,1)[-1]
patch={'private_site':True,'send_ip_addr_to_guest':False,'theme':'default','custom_head':head+'\n'+q['mobile_head'],'sitename':'LeonMinGod VPS'}
if api('/api/admin/settings/','POST',patch).get('status')!='success':raise RuntimeError('Private settings update failed')
nodes=json.load(open('/opt/komari/.node-access.json'))
for name,key in [('RAKsmart · 美国节点','rak'),('无聊云 · 原公益站','yifu')]:
 node=nodes[key];res=api('/api/admin/client/'+node['uuid']+'/edit','POST',{'uuid':node['uuid'],'name':name,'traffic_limit':1000000000000,'traffic_limit_type':'sum'})
 if res.get('status')!='success':raise RuntimeError('Monthly quota update failed')
listed=api('/api/admin/client/list');listed=listed.get('data',[]) if isinstance(listed,dict) else listed
if len(listed)!=2 or any(n.get('traffic_limit')!=1000000000000 or n.get('traffic_limit_type')!='sum' for n in listed):raise RuntimeError('Node budget mismatch')
print(json.dumps({'administrator_login':True,'private_site':True,'official_default_theme':True,'mobile_budget_overlay':True,'nodes':2,'monthly_quota_bytes':1000000000000,'traffic_mode':'sum'}))
'''

def compatible_unit(raw,memory,cpu):
    lines=[]
    for line in raw.decode().splitlines():
        if line.startswith(('MemoryMax=','MemoryHigh=','MemoryLimit=','CPUQuota=','Nice=','ReadWritePaths=')):continue
        if line=='[Install]':lines.extend(['MemoryLimit='+memory,'CPUQuota='+cpu,'Nice=10','Environment=TZ=UTC'])
        lines.append(line)
    return '\n'.join(lines)+'\n'

def admin(req):
    phase('komari-existing-admin');client=connect()
    try:
        before=baseline(client)
        with client.open_sftp() as sftp:
            auth=credentials(sftp,req);directory=BASE+'/'+req['session'];run(client,'install -d -m 0700 '+directory)
            payload={**auth,'backup':directory+'/komari-before','mobile_head':Path('.github/scripts/komari_mobile_head.html').read_text()}
            path=directory+'/komari-request.private.json';write(sftp,path,json.dumps(payload))
            write(sftp,directory+'/komari-admin.enc.json',json.dumps(req['credential_envelope']))
            try:
                phase('komari-consistent-backup-password')
                updated=json.loads(run(client,LAUNCH+' --input-type=module -e '+shlex.quote(PASSWORD_UPDATE)+' '+path,timeout=120))
                phase('komari-private-login-and-monthly-quota')
                configured=json.loads(run(client,'python3 -c '+shlex.quote(CONFIGURE)+' '+path,timeout=120))
            finally:sftp.remove(path)
            phase('komari-service-resource-protection')
            for name,memory,cpu in [('komari-hub','256M','15%'),('komari-agent','64M','5%')]:
                unitpath='/etc/systemd/system/'+name+'.service';old=read(sftp,unitpath);write(sftp,directory+'/'+name+'.before.service',old)
                new=compatible_unit(old,memory,cpu)
                if old.decode()!=new:write(sftp,unitpath,new,0o644)
            confpath='/var/lib/komari-agent/config.json';config=json.loads(read(sftp,confpath));oldtoken=config['token']
            config.update(month_rotate=1,disable_web_ssh=True,disable_auto_update=True,interval=5);write(sftp,confpath,json.dumps(config))
            run(client,'chown komari-agent:komari-agent '+confpath)
            run(client,'systemctl daemon-reload');run(client,'systemctl restart komari-hub komari-agent')
            nodes=json.loads(read(sftp,'/opt/komari/.node-access.json'));peer={'session':req['session'],'token':nodes['yifu']['token'],'uuid':nodes['yifu']['uuid'],'endpoint':'https://vps.leonmingod.com','month_rotate':1}
            OUT.joinpath('peer.enc.json').write_bytes(seal(json.dumps(peer).encode(),base64.b64decode(req['source_public_key']),req['session'],'komari-source-agent'))
            protect_unchanged(client,before)
            return {'status':'passed','mode':'komari-admin',**updated,**configured,'reset_day':1,'reset_timezone':'UTC','root_password_and_vpn_unchanged':True,'agent_credentials_preserved':oldtoken==config['token'],'backup_path':directory+'/komari-before'}
    finally:client.close()

DOMAIN='https://vps.leonmingod.com'
UA='Private-VPS-Monitor/1.0'
def public_session(auth):
    import http.cookiejar
    jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def api(path,body=None):
        request=urllib.request.Request(DOMAIN+path,data=None if body is None else json.dumps(body).encode(),headers={'User-Agent':UA,'Content-Type':'application/json','Origin':DOMAIN})
        with opener.open(request,timeout=30) as response:return json.load(response)
    if api('/api/login',auth).get('status')!='success':raise RuntimeError('Public administrator login failed')
    return jar,opener,api

def public_check(auth,expected=1):
    import websocket
    # A private site may serve its login HTML publicly; node and admin data must reject guests.
    anonymous=[]
    for path in ['/api/nodes','/api/admin/client/list']:
        try:
            with urllib.request.urlopen(urllib.request.Request(DOMAIN+path,headers={'User-Agent':UA}),timeout=20) as response:status=response.status
        except urllib.error.HTTPError as error:status=error.code
        anonymous.append(status)
    if anonymous!=[401,401]:raise RuntimeError('Anonymous monitoring data is not protected')
    jar,opener,api=public_session(auth)
    version=api('/api/version');nodes=api('/api/admin/client/list');nodes=nodes.get('data',[]) if isinstance(nodes,dict) else nodes
    cookie='; '.join(c.name+'='+c.value for c in jar)
    ws=websocket.create_connection(DOMAIN.replace('https','wss')+'/api/clients',cookie=cookie,origin=DOMAIN,header=['User-Agent: '+UA],timeout=30)
    try:
        ws.send('get');data=json.loads(ws.recv())['data'];online=data['online'];reports=data['data']
    finally:ws.close()
    if len(online)<expected:raise RuntimeError('Not all registered agents are connected')
    checked=[]
    for node in nodes:
        uuid=node['uuid'];r=reports.get(uuid,{})
        if uuid not in online:continue
        history=api('/api/rpc2',{'jsonrpc':'2.0','id':1,'method':'public:getClientRecentRecords','params':{'uuid':uuid}})
        if 'error' in history or not history.get('result'):raise RuntimeError('Recent monitoring history missing')
        if node['traffic_limit']!=10**12 or node['traffic_limit_type']!='sum':raise RuntimeError('Monthly quota mismatch')
        checked.append({'name':node['name'],'online':True,'recent_history':True,'report_fields':sorted(r),'monthly_limit_bytes':node['traffic_limit']})
    return {'public_admin_login':True,'anonymous_data_status':anonymous,'websocket_upgrade_and_reports':True,'online_agents':len(online),'nodes':checked,'version':version}

def switch(req):
    phase('komari-route-snapshot');client=connect();timer='rak-komari-rollback';changed=False
    try:
        before=baseline(client)
        with client.open_sftp() as sftp:
            auth=credentials(sftp,req);directory=BASE+'/'+req['session'];path='/etc/hysteria/subscription-caddy.json'
            config=json.loads(read(sftp,path));updated=copy.deepcopy(config);routes=updated['apps']['http']['servers']['subscription']['routes']
            found=[route for route in routes if route.get('group')=='private-vps-monitor']
            if len(found)!=1:raise RuntimeError('Private monitoring route not uniquely identified')
            proxy=[h for h in found[0]['handle'] if h.get('handler')=='reverse_proxy'][0]
            old=proxy['upstreams']
            if old not in [[{'dial':'127.0.0.1:18273'}],[{'dial':'127.0.0.1:25774'}]]:raise RuntimeError('Unexpected monitoring upstream')
            proxy['upstreams']=[{'dial':'127.0.0.1:25774'}]
            backup=directory+'/caddy-before-komari.json';candidate=directory+'/caddy-komari.json';rollback=directory+'/rollback-komari.sh'
            write(sftp,backup,json.dumps(config));write(sftp,candidate,json.dumps(updated));write(sftp,rollback,'#!/bin/sh\nset -e\ncp '+backup+' '+path+'\nsystemctl restart rak-vpn-subscription\n',0o700)
            run(client,'/usr/local/bin/caddy validate --config '+candidate)
            run(client,'systemctl stop '+timer+'.timer '+timer+'.service >/dev/null 2>&1 || true')
            run(client,'systemd-run --unit='+timer+' --on-active=180 /bin/sh '+rollback)
            phase('komari-route-activate-with-automatic-rollback');write(sftp,path,json.dumps(updated));changed=True
            run(client,'systemctl restart rak-vpn-subscription')
            phase('komari-public-login-websocket')
            result=public_check(auth,1)
            protect_unchanged(client,before,caddy_restart=True)
            run(client,'systemctl stop '+timer+'.timer');changed=False
            write(sftp,directory+'/komari-route.accepted.json',json.dumps({'accepted':int(time.time()),'checks':result}))
            return {'status':'passed','mode':'komari-switch','url':DOMAIN,'private_origin_loopback':True,'worker_unchanged':True,'security_rules_unchanged':True,'vpn_preserved':True,'snapshot':backup,**result}
    except Exception:
        if changed:
            run(client,'/bin/sh '+rollback);run(client,'systemctl stop '+timer+'.timer >/dev/null 2>&1 || true')
        raise
    finally:client.close()

def source_agent(req):
    phase('komari-source-agent');client=connect()
    try:
        before=baseline(client)
        with client.open_sftp() as sftp:
            packet=json.loads(unseal(json.dumps(req['peer_envelope']).encode(),read(sftp,BASE+'/private/recipient.pem'),req['session'],'komari-source-agent'))
            binary='/opt/komari-agent/komari-agent';expected='78c28d89e523816baea010c0ed0714f245f508ffdaca0540f5c9f230f7053c8c'
            if run(client,'sha256sum '+binary).split()[0]!=expected:raise RuntimeError('Installed official agent checksum mismatch')
            from vps_monitor_install import user
            user(client,'komari-agent');run(client,'install -d -m 0700 -o komari-agent -g komari-agent /var/lib/komari-agent')
            config={'endpoint':packet['endpoint'],'token':packet['token'],'interval':5,'month_rotate':1,'disable_web_ssh':True,'disable_auto_update':True}
            write(sftp,'/var/lib/komari-agent/config.json',json.dumps(config));run(client,'chown komari-agent:komari-agent /var/lib/komari-agent/config.json')
            unit='''[Unit]
Description=Komari private monitoring agent
After=network-online.target
Wants=network-online.target
[Service]
User=komari-agent
Group=komari-agent
WorkingDirectory=/var/lib/komari-agent
ExecStart=/opt/komari-agent/komari-agent --config /var/lib/komari-agent/config.json
Restart=always
RestartSec=5
Environment=TZ=UTC
Environment=GOMEMLIMIT=40MiB
MemoryLimit=64M
CPUQuota=5%
Nice=10
NoNewPrivileges=true
CapabilityBoundingSet=
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
UMask=0077
[Install]
WantedBy=multi-user.target
'''
            write(sftp,'/etc/systemd/system/komari-agent.service',unit,0o644);run(client,'systemctl daemon-reload');run(client,'systemctl enable komari-agent >/dev/null 2>&1');run(client,'systemctl restart komari-agent');time.sleep(6)
            if run(client,'systemctl is-active komari-agent').strip()!='active':raise RuntimeError('Agent failed')
            protect_unchanged(client,before)
            return {'status':'passed','mode':'source-agent','official_binary_reused':True,'agent_active':True,'outbound_only':True,'web_ssh_disabled':True,'monthly_reset_day':1,'monthly_reset_timezone':'UTC','monthly_traffic_persisted_on_disk':True,'old_business_unchanged':True}
    finally:client.close()

def verify(req):
    phase('komari-live-verification');client=connect()
    try:
        with client.open_sftp() as sftp:auth=credentials(sftp,req)
        result=public_check(auth,2)
        return {'status':'passed','mode':'verify',**result}
    finally:client.close()
