"""Finish the existing Komari installation without reinstalling or exposing secrets."""
import base64,copy,json,os,re,secrets,shlex,time,urllib.error,urllib.request,urllib.parse
from pathlib import Path
from production_ops import BASE,OUT,phase,connect,read,write,run
from production_crypto import seal,unseal
from vps_monitor import baseline
from vps_monitor_install import protect_unchanged

LAUNCH='/opt/lmg-runtime/v1/lib/ld-linux-x86-64.so.2 --library-path /opt/lmg-runtime/v1/lib /opt/lmg-runtime/v1/node'
USERNAME='leonming0107@gmail.com'

def node_launcher(client):
    return '/usr/local/bin/node' if run(client,'test -x /usr/local/bin/node && echo native || true').strip()=='native' else LAUNCH

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
                updated=json.loads(run(client,node_launcher(client)+' --input-type=module -e '+shlex.quote(PASSWORD_UPDATE)+' '+path,timeout=120))
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
        persisted=api('/api/rpc2',{'jsonrpc':'2.0','id':2,'method':'public:getRecordsByUUID','params':{'uuid':uuid,'load_type':'cpu','hours':'1'}})
        if 'error' in persisted or not persisted.get('result'):raise RuntimeError('Persistent monitoring history missing')
        if node['traffic_limit']!=10**12 or node['traffic_limit_type']!='sum':raise RuntimeError('Monthly quota mismatch')
        checked.append({'name':node['name'],'online':True,'recent_history':True,'persistent_history':True,'report_fields':sorted(r),'monthly_limit_bytes':node['traffic_limit']})
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
        # The old unit used this same node/config. Two units evict each other's
        # WebSocket and can spend the account's entire Worker request quota.
        run(client,'if systemctl is-active --quiet komari-source-agent.service || systemctl is-enabled --quiet komari-source-agent.service; then exit 42; fi')
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

def browser(req):
    from playwright.sync_api import sync_playwright
    phase('komari-iphone-webkit-browser');client=connect()
    try:
        with client.open_sftp() as sftp:auth=credentials(sftp,req)
    finally:client.close()
    live=public_check(auth,2)
    evidence={'screenshots':{},'checks':[],'live':live}
    try:
        with sync_playwright() as p:
            browser=p.webkit.launch()
            device=dict(p.devices['iPhone 13']);device['user_agent']=UA
            context=browser.new_context(**device,locale='zh-CN',color_scheme='light')
            page=context.new_page();network_errors=[];console_errors=[]
            page.on('response',lambda r:network_errors.append({'path':urllib.parse.urlsplit(r.url).path,'status':r.status}) if r.status>=400 else None)
            page.on('pageerror',lambda e:console_errors.append(str(e)))
            response=page.goto(DOMAIN+'/admin/login',wait_until='networkidle',timeout=60000)
            evidence['initial']={'status':response.status,'title':page.title(),'html':page.content()[:100000]}
            OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(evidence).encode(),base64.b64decode(req['owner_public_key']),req['session'],'komari-browser-evidence'))
            page.locator('input[name="username"]').fill(auth['username']);page.locator('input[name="password"]').fill(auth['password'])
            with page.expect_response(lambda r:r.url.endswith('/api/login')) as login:
                page.locator('form').filter(has=page.locator('input[name="password"]')).locator('button[type="submit"]').click()
            if login.value.status!=200:raise RuntimeError('WebKit form login failed')
            home=page.goto(DOMAIN,wait_until='networkidle',timeout=60000)
            page.wait_for_timeout(6000)
            evidence['home']={'status':home.status,'url':page.url,'html':page.content()[:120000],'text':page.inner_text('body')[:12000],'network_errors':network_errors,'page_errors':console_errors,'cookie_names':[c['name'] for c in context.cookies()]}
            evidence['screenshots']['home-diagnostic']=base64.b64encode(page.screenshot(full_page=True)).decode()
            OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(evidence).encode(),base64.b64decode(req['owner_public_key']),req['session'],'komari-browser-evidence'))
            page.locator('.km-node-card').nth(1).wait_for(timeout=60000)
            page.wait_for_function("document.querySelectorAll('.rak-month-budget').length===2",timeout=45000)
            for width,scheme in [(390,'light'),(375,'dark')]:
                page.set_viewport_size({'width':width,'height':844});page.emulate_media(color_scheme=scheme);page.wait_for_timeout(1000)
                layout=page.evaluate('''()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('.km-node-card')].map(x=>({x:x.getBoundingClientRect().x,width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height,name:x.textContent.includes('RAKsmart')?'RAKsmart':'无聊云'})),budgets:[...document.querySelectorAll('.rak-month-budget')].map(x=>x.textContent)})''')
                if layout['scroll']>width+1 or len(layout['cards'])!=2 or any(c['width']>width or c['x']<0 for c in layout['cards']):raise RuntimeError('Mobile card layout overflow')
                evidence['checks'].append({'width':width,'scheme':scheme,'layout':layout})
                evidence['screenshots'][str(width)+'-'+scheme]=base64.b64encode(page.screenshot(full_page=True)).decode()
            if page.locator('.km-node-card button[data-detail]').count():
                page.locator('.km-node-card button[data-detail]').first.click()
                page.locator('#detail-dialog[open]').wait_for(timeout=45000)
                page.locator('#detail-content svg, #detail-content canvas').first.wait_for(timeout=45000)
                detail=page.locator('#detail-content').inner_text()
                evidence['node_detail']={'theme':'MIKU39','dialog_open':True,'chart_elements':page.locator('#detail-content svg, #detail-content canvas').count(),'body_has_cpu':'CPU' in detail,'text':detail[:6000]}
            else:
                page.locator('.km-node-card a[href^="/instance/"]').first.click();page.wait_for_url('**/instance/**');page.locator('.km-load-chart svg.recharts-surface').first.wait_for(timeout=45000)
                evidence['node_detail']={'url_path':urllib.parse.urlsplit(page.url).path,'svg_elements':page.locator('svg').count(),'body_has_cpu':'CPU' in page.inner_text('body')}
            evidence['screenshots']['node-detail']=base64.b64encode(page.screenshot(full_page=True)).decode()
            page.goto(DOMAIN+'/admin',wait_until='networkidle',timeout=45000)
            if '/admin' not in page.url or page.locator('input[name="password"]').count():raise RuntimeError('Admin page not authenticated')
            evidence['admin_ui']=True
            context.close();browser.close()
    except Exception:
        evidence['failed']=True
        OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(evidence).encode(),base64.b64decode(req['owner_public_key']),req['session'],'komari-browser-evidence'))
        raise
    OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(evidence).encode(),base64.b64decode(req['owner_public_key']),req['session'],'komari-browser-evidence'))
    retired=remove_beszel(req) if req.get('retire_beszel') else None
    return {'beszel_retirement':retired,'status':'passed','mode':'komari-browser','engine':'WebKit','iphone_form_login':True,'viewports':[390,375],'light_and_dark':True,'two_distinct_cards':True,'horizontal_overflow':False,'monthly_used_remaining_percent_visible':True,'node_detail_ui':True,'admin_ui':True,'screenshots_encrypted_to_owner':True}

def remove_beszel(req):
    phase('beszel-offline-backup-and-retirement');client=connect();role=os.environ['MONITOR_ROLE']
    try:
        before=baseline(client);directory=BASE+'/'+req['session'];archive=directory+'/beszel-offline-'+role+'.tar.gz'
        names=['beszel-hub','beszel-agent'] if role=='target' else ['beszel-agent']
        # Prove the replacement is active before retiring either old agent.
        run(client,'systemctl is-active komari-agent'+(' komari-hub' if role=='target' else ''))
        for name in names:run(client,'systemctl stop '+name+'; systemctl disable '+name+' >/dev/null 2>&1')
        paths=['opt/beszel-monitor','var/lib/beszel-agent','etc/systemd/system/beszel-agent.service']
        if role=='target':paths+=['var/lib/beszel-hub','etc/systemd/system/beszel-hub.service']
        existing=[]
        with client.open_sftp() as sftp:
            for path in paths:
                try:sftp.stat('/'+path);existing.append(path)
                except FileNotFoundError:pass
            run(client,'tar -czf '+archive+' -C / '+' '.join(existing));run(client,'chmod 0600 '+archive)
            for name in names:run(client,'rm -f /etc/systemd/system/'+name+'.service')
            run(client,'rm -rf /opt/beszel-monitor /var/lib/beszel-agent'+(' /var/lib/beszel-hub' if role=='target' else ''))
            run(client,'systemctl daemon-reload; systemctl reset-failed >/dev/null 2>&1 || true')
        protect_unchanged(client,before)
        # A retired workflow must not recreate Beszel later.
        repository=os.environ['GITHUB_REPOSITORY'];request=urllib.request.Request('https://api.github.com/repos/'+repository+'/actions/workflows/vps-monitor.yaml/disable',method='PUT',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
        with urllib.request.urlopen(request,timeout=30) as response:disabled=response.status==204
        return {'status':'passed','mode':'remove-beszel','role':role,'offline_backup':archive,'hub_removed':role=='target','agent_removed':True,'old_workflow_disabled':disabled,'vpn_or_business_unchanged':True}
    finally:client.close()


def style(req):
    phase('komari-mobile-contrast-refinement');client=connect()
    try:
        with client.open_sftp() as sftp:
            auth=credentials(sftp,req);path=BASE+'/'+req['session']+'/style.private.json'
            write(sftp,path,json.dumps({**auth,'mobile_head':Path('.github/scripts/komari_mobile_head.html').read_text()}))
            try:result=json.loads(run(client,'python3 -c '+shlex.quote(CONFIGURE)+' '+path,timeout=120))
            finally:sftp.remove(path)
            return {'status':'passed','mode':'komari-style','no_service_restart':True,**result}
    finally:client.close()

def theme_style(req):
    """Update only our marked monthly widget, preserving the owner's chosen theme."""
    phase('komari-theme-aware-monthly-widget');client=connect()
    try:
        with client.open_sftp() as sftp:
            auth=credentials(sftp,req);jar,opener,api=public_session(auth)
            existing=api('/api/admin/settings/');existing=existing.get('data',existing)
            snapshot=BASE+'/'+req['session']+'/komari-style-before-'+req['request_id']+'.json'
            write(sftp,snapshot,json.dumps(existing))
            head=existing.get('custom_head','') or ''
            start='<!-- rak-mobile-budget-v1:start -->';end='<!-- rak-mobile-budget-v1:end -->'
            if start in head:
                if end not in head:raise RuntimeError('Monthly widget marker incomplete')
                head=head.split(start,1)[0]+head.split(end,1)[1]
            patch={'custom_head':head+'\n'+Path('.github/scripts/komari_mobile_head.html').read_text()}
            if api('/api/admin/settings/',patch).get('status')!='success':raise RuntimeError('Monthly widget update failed')
            checked=api('/api/admin/settings/');checked=checked.get('data',checked)
            if checked.get('theme')!=existing.get('theme') or checked.get('private_site')!=existing.get('private_site'):
                api('/api/admin/settings/',{'custom_head':existing.get('custom_head','')})
                raise RuntimeError('Existing theme or privacy unexpectedly changed')
            probes=configure_probes_and_billing(client,sftp,req,api)
            return {'status':'passed','mode':'komari-theme-style','theme_preserved':existing.get('theme'),'privacy_preserved':True,'monthly_progress_widget':True,'vpn_and_hub_not_restarted':True,'snapshot':snapshot,**probes}
    finally:client.close()

def allow_agent_icmp(client,sftp,req):
    # The official Agent opens a raw ICMP socket. Grant only NET_RAW, without root.
    directory='/etc/systemd/system/komari-agent.service.d'
    run(client,'install -d -m 0755 '+directory)
    path=directory+'/20-icmp-probes.conf'
    body='[Service]\nCapabilityBoundingSet=CAP_NET_RAW\nAmbientCapabilities=CAP_NET_RAW\n'
    try:previous=read(sftp,path).decode()
    except FileNotFoundError:previous=''
    if previous!=body:
        write(sftp,path,body,0o644)
        run(client,'systemctl daemon-reload\nsystemctl restart komari-agent')
    pid=run(client,'systemctl show -p MainPID --value komari-agent').strip()
    status=run(client,'cat /proc/'+pid+'/status')
    caps=int(re.search(r'^CapEff:\s*([0-9a-f]+)',status,re.M).group(1),16)
    if caps!=0x2000:raise RuntimeError('Agent must have only the ICMP capability')
    if run(client,'systemctl show -p User --value komari-agent').strip()!='komari-agent':raise RuntimeError('Agent unexpectedly privileged')
    return {'agent_user':'komari-agent','agent_only_capability':'CAP_NET_RAW'}

def agent_probes(req):
    from vps_monitor_install import protect_unchanged
    phase('komari-agent-icmp-capability');client=connect()
    try:
        before=baseline(client)
        with client.open_sftp() as sftp:result=allow_agent_icmp(client,sftp,req)
        protect_unchanged(client,before)
        return {'status':'passed','mode':'komari-agent-probes','business_and_vpn_unchanged':True,**result}
    finally:client.close()

def configure_probes_and_billing(client,sftp,req,api):
    phase('komari-three-carrier-probes-and-billing')
    nodes=json.loads(read(sftp,'/opt/komari/.node-access.json'))
    uuids=[nodes[k]['uuid'] for k in ['rak','yifu']]
    # Existing operator public DNS endpoints: a single ICMP packet per minute per Agent.
    desired=[('电信','202.96.128.86'),('联通','202.99.104.68'),('移动','211.136.192.6')]
    current=api('/api/admin/ping');current=current.get('data',[]) if isinstance(current,dict) else current
    write(sftp,BASE+'/'+req['session']+'/ping-before-'+req['request_id']+'.json',json.dumps(current))
    for name,target in desired:
        matching=[t for t in current if t.get('name')==name]
        if len(matching)>1:raise RuntimeError('Ambiguous existing carrier probe')
        item={'name':name,'type':'icmp','target':target,'clients':uuids,'default_on':False,'interval':60}
        payload={'tasks':[{**matching[0],**item}]} if matching else item
        endpoint='/api/admin/ping/edit' if matching else '/api/admin/ping/add'
        if api(endpoint,payload).get('status')!='success':raise RuntimeError('Carrier probe update failed')
    billing=[('rak',3.21,'$',30,'2026-11-05','2026-12-05T00:00:00+08:00'),('yifu',10,'¥',365,'2026-11-04','2027-11-04T00:00:00+08:00')]
    listed=api('/api/admin/client/list');listed=listed.get('data',[]) if isinstance(listed,dict) else listed
    write(sftp,BASE+'/'+req['session']+'/billing-before-'+req['request_id']+'.json',json.dumps(listed))
    for key,price,currency,cycle,purchased,expiry in billing:
        uuid=nodes[key]['uuid'];previous=next(n for n in listed if n['uuid']==uuid)
        remark=previous.get('public_remark','') or ''
        marker='购买日期：'+purchased
        if marker not in remark:remark=(remark+'\n'+marker+'；续费日期按购买日推算。').strip()
        payload={'price':price,'currency':currency,'billing_cycle':cycle,'expired_at':expiry,'public_remark':remark}
        if api('/api/admin/client/'+uuid+'/edit',payload).get('status')!='success':raise RuntimeError('Node billing update failed')
    capability=allow_agent_icmp(client,sftp,req)
    checked=api('/api/admin/client/list');checked=checked.get('data',[]) if isinstance(checked,dict) else checked
    for key,price,currency,cycle,purchased,expiry in billing:
        n=next(n for n in checked if n['uuid']==nodes[key]['uuid'])
        if n.get('price')!=price or n.get('billing_cycle')!=cycle or n.get('currency')!=currency:raise RuntimeError('Billing verification failed')
    return {'carrier_probe_interval_seconds':60,'carrier_probe_type':'icmp','carrier_probe_targets':dict(desired),'agents_assigned':2,'billing':{'RAKsmart':{'price':3.21,'currency':'USD','cycle':'monthly','purchased':'2026-11-05','estimated_next_renewal':'2026-12-05'},'无聊云':{'price':10,'currency':'CNY','cycle':'yearly','purchased':'2026-11-04','estimated_next_renewal':'2027-11-04'}},**capability}
