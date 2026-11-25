"""Private Beszel hub and outbound-only unprivileged agents."""
import base64,copy,hashlib,json,os,secrets,shlex,time,urllib.request,uuid
from pathlib import Path
import yaml
from vps_monitor import BASE,DOMAIN,baseline,binaries,checkpoint,connect,read,write,run
from vps_monitor_crypto import seal,checked_id

HUB_PORT=18273
HUB_DATA='/var/lib/beszel-hub'
AGENT_DATA='/var/lib/beszel-agent'

def envfile(values):return ''.join(key+'='+json.dumps(value)+'\n' for key,value in values.items())

def user(client,name):
    run(client,'getent group '+name+' >/dev/null || groupadd --system '+name)
    run(client,'getent passwd '+name+' >/dev/null || useradd --system --gid '+name+' --no-create-home --shell /sbin/nologin '+name)

def protect_unchanged(client,before,caddy_restart=False):
    after=baseline(client)
    if caddy_restart:
        for row in [before,after]:row['rak-vpn-subscription']='\n'.join(line for line in row['rak-vpn-subscription'].splitlines() if not line.startswith('MainPID='))
    if before!=after:
        Path('monitor-operation/diagnostics.json').write_text(json.dumps({'phase':'production-invariant-check','changed_fields':[key for key in before if before[key]!=after.get(key)]}))
        raise ValueError('Existing production process or protected configuration changed')

def hub_request(client,sftp,path,data=None,token=None):
    # A private file transports request bodies/tokens, never process arguments.
    value={'path':path,'data':data,'token':token};request_path=BASE+'/private/request-'+secrets.token_hex(8)+'.json'
    write(sftp,request_path,json.dumps(value))
    source='''from __future__ import print_function
import json,sys
try:import urllib.request as urllib2
except ImportError:import urllib2
r=json.load(open(sys.argv[1]));headers={'Content-Type':'application/json'}
if r.get('token'):headers['Authorization']=r['token']
body=None if r['data'] is None else json.dumps(r['data']).encode()
try:
 response=urllib2.urlopen(urllib2.Request('http://127.0.0.1:18273'+r['path'],data=body,headers=headers),timeout=20)
 print(json.dumps({'http':response.getcode(),'body':json.load(response)}))
except urllib2.HTTPError as error:print(json.dumps({'http':error.code,'body':{}}))
'''
    try:return json.loads(run(client,'/usr/bin/python -c '+shlex.quote(source)+' '+request_path))
    finally:sftp.remove(request_path)

def wait_hub(client,sftp):
    for attempt in range(60):
        try:
            if hub_request(client,sftp,'/api/health')['http']==200:return
        except Exception:pass
        time.sleep(.5)
    raise RuntimeError('Private hub did not become ready')

def install_agent(client,sftp,config):
    user(client,'beszel-agent');run(client,'install -d -o beszel-agent -g beszel-agent -m 0700 '+AGENT_DATA)
    run(client,'install -d -m 0755 '+BASE+' '+BASE+'/bin; install -d -m 0700 '+BASE+'/private')
    expected=json.loads(Path('.github/vps-monitor-release.json').read_text())['archives']['beszel-agent']['binary_sha256']
    try:current=run(client,'sha256sum '+BASE+'/bin/beszel-agent').split()[0]
    except Exception:current=None
    if current!=expected:write(sftp,BASE+'/bin/beszel-agent',binaries(['beszel-agent'])['beszel-agent'],0o755)
    if run(client,'sha256sum '+BASE+'/bin/beszel-agent').split()[0]!=expected:raise ValueError('Agent hash differs')
    run(client,BASE+'/bin/beszel-agent --version',public_probe=True)
    write(sftp,AGENT_DATA+'/hub.pub',config['hub_key']);write(sftp,AGENT_DATA+'/token',config['token'])
    run(client,'chown beszel-agent:beszel-agent '+AGENT_DATA+'/hub.pub '+AGENT_DATA+'/token')
    values={'BESZEL_AGENT_HUB_URL':config['hub_url'],'BESZEL_AGENT_KEY_FILE':AGENT_DATA+'/hub.pub','BESZEL_AGENT_TOKEN_FILE':AGENT_DATA+'/token',
            'BESZEL_AGENT_DATA_DIR':AGENT_DATA,'BESZEL_AGENT_DISABLE_SSH':'true','BESZEL_AGENT_SKIP_GPU':'true',
            'BESZEL_AGENT_SKIP_SYSTEMD_LOGS':'true','BESZEL_AGENT_PACKAGE_UPDATES_INTERVAL':'0','BESZEL_AGENT_SMART_DEVICES':'',
            'GOMEMLIMIT':'24MiB','GOMAXPROCS':'1'}
    write(sftp,BASE+'/private/agent.env',envfile(values))
    unit='''[Unit]
Description=Private VPS monitoring agent (outbound only)
After=network-online.target
Wants=network-online.target
[Service]
User=beszel-agent
Group=beszel-agent
EnvironmentFile=/opt/beszel-monitor/private/agent.env
ExecStart=/opt/beszel-monitor/bin/beszel-agent
WorkingDirectory=/var/lib/beszel-agent
Restart=on-failure
RestartSec=10
MemoryLimit=48M
CPUQuota=5%
Nice=15
IOSchedulingClass=idle
NoNewPrivileges=true
CapabilityBoundingSet=
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
UMask=0077
[Install]
WantedBy=multi-user.target
'''
    write(sftp,'/etc/systemd/system/beszel-agent.service',unit,0o644)
    run(client,'systemctl daemon-reload');run(client,'systemctl enable beszel-agent >/dev/null 2>&1');run(client,'systemctl restart beszel-agent')

def origin_config(config,token):
    prefix='/_vpsmon/'+token;updated=copy.deepcopy(config)
    server=updated['apps']['http']['servers']['subscription'];routes=server['routes']
    existing=[r for r in routes if r.get('group')=='private-vps-monitor']
    route={'group':'private-vps-monitor','terminal':True,'match':[{'host':['sj.leonmingod.com'],'path':[prefix+'/*']}],
        'handle':[{'handler':'rewrite','strip_path_prefix':prefix},{'handler':'reverse_proxy','upstreams':[{'dial':'127.0.0.1:'+str(HUB_PORT)}],
        'headers':{'request':{'set':{'Host':[DOMAIN],'X-Forwarded-Host':[DOMAIN],'X-Forwarded-Proto':['https']}}}}]}
    if existing and existing!=[route]:raise ValueError('Existing private monitor route differs')
    if not existing:routes.insert(0,route)
    if updated['apps']['tls']!=config['apps']['tls'] or updated['storage']!=config['storage']:raise ValueError('Existing VPN TLS storage changed')
    return updated,not bool(existing)

def target_install(req):
    checkpoint('target-connect');client=connect();session=checked_id(req['session'])
    try:
        before=baseline(client)
        with client.open_sftp() as sftp:
            run(client,'install -d -m 0755 '+BASE+' '+BASE+'/bin; install -d -m 0700 '+BASE+'/private')
            state_path=BASE+'/private/state.json'
            try:state=json.loads(read(sftp,state_path))
            except FileNotFoundError:
                try:sftp.stat(HUB_DATA+'/data.db');raise ValueError('Existing hub data is unrecognized')
                except FileNotFoundError:pass
                state={'session':session,'domain':DOMAIN,'email':'owner@leonmingod.com','password':secrets.token_urlsafe(24),
                       'origin_token':secrets.token_urlsafe(32),'rak_token':str(uuid.uuid4()),'source_token':str(uuid.uuid4())}
                write(sftp,state_path,json.dumps(state))
            if state['domain']!=DOMAIN or state['session']!=session:raise ValueError('Existing hub identity differs')
            checkpoint('target-native-hub')
            expected=json.loads(Path('.github/vps-monitor-release.json').read_text())['archives']['beszel']['binary_sha256']
            try:current=run(client,'sha256sum '+BASE+'/bin/beszel').split()[0]
            except Exception:current=None
            if current!=expected:write(sftp,BASE+'/bin/beszel',binaries(['beszel'])['beszel'],0o755)
            if run(client,'sha256sum '+BASE+'/bin/beszel').split()[0]!=expected:raise ValueError('Hub upload differs')
            version=run(client,BASE+'/bin/beszel --version',public_probe=True).strip()
            user(client,'beszel-hub');run(client,'install -d -o beszel-hub -g beszel-hub -m 0700 '+HUB_DATA)
            systems={'systems':[{'name':'RAKsmart · 个人 VPN','host':'198.247.1.206','port':45876,'token':state['rak_token'],'users':[state['email']]},
                                {'name':'无聊云 · 公益站','host':'23.94.180.2','port':45876,'token':state['source_token'],'users':[state['email']]}]}
            write(sftp,HUB_DATA+'/config.yml',yaml.safe_dump(systems,allow_unicode=True));run(client,'chown beszel-hub:beszel-hub '+HUB_DATA+'/config.yml')
            values={'BESZEL_HUB_USER_EMAIL':state['email'],'BESZEL_HUB_USER_PASSWORD':state['password'],'BESZEL_HUB_USER_CREATION':'false',
                    'BESZEL_HUB_SHARE_ALL_SYSTEMS':'false','BESZEL_HUB_DISABLE_SSH':'true','BESZEL_HUB_CHECK_UPDATES':'false',
                    'BESZEL_HUB_APP_URL':'https://'+DOMAIN,'GOMEMLIMIT':'128MiB','GOMAXPROCS':'1'}
            write(sftp,BASE+'/private/hub.env',envfile(values))
            unit='''[Unit]
Description=Private Beszel dashboard for the owner's two VPS
After=network-online.target
Wants=network-online.target
[Service]
User=beszel-hub
Group=beszel-hub
EnvironmentFile=/opt/beszel-monitor/private/hub.env
ExecStart=/opt/beszel-monitor/bin/beszel serve --http=127.0.0.1:18273 --dir=/var/lib/beszel-hub
WorkingDirectory=/var/lib/beszel-hub
Restart=on-failure
RestartSec=5
MemoryLimit=256M
CPUQuota=15%
Nice=10
IOSchedulingClass=idle
NoNewPrivileges=true
CapabilityBoundingSet=
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
UMask=0077
[Install]
WantedBy=multi-user.target
'''
            write(sftp,'/etc/systemd/system/beszel-hub.service',unit,0o644);run(client,'systemctl daemon-reload')
            run(client,'systemctl enable beszel-hub >/dev/null 2>&1');run(client,'systemctl restart beszel-hub');wait_hub(client,sftp)
            checkpoint('private-hub-owner-auth')
            auth=hub_request(client,sftp,'/api/collections/users/auth-with-password',{'identity':state['email'],'password':state['password']})
            if auth['http']!=200:raise ValueError('Owner bootstrap authentication failed')
            token=auth['body']['token'];info=hub_request(client,sftp,'/api/beszel/info',token=token)['body']
            state['hub_key']=info['key'];write(sftp,state_path,json.dumps(state))
            anon=hub_request(client,sftp,'/api/collections/systems/records')
            if anon['http']==200 and anon['body'].get('totalItems')!=0:raise ValueError('Anonymous systems data visible')
            if hub_request(client,sftp,'/api/beszel/first-run')['body'].get('firstRun') is not False:raise ValueError('First-run registration remains open')
            del values['BESZEL_HUB_USER_PASSWORD'];del values['BESZEL_HUB_USER_EMAIL'];write(sftp,BASE+'/private/hub.env',envfile(values))
            run(client,'systemctl restart beszel-hub');wait_hub(client,sftp)
            checkpoint('target-outbound-agent');install_agent(client,sftp,{'hub_key':state['hub_key'],'token':state['rak_token'],'hub_url':'http://127.0.0.1:'+str(HUB_PORT)})
            checkpoint('private-origin-route');config=json.loads(read(sftp,'/etc/hysteria/subscription-caddy.json'));updated,changed=origin_config(config,state['origin_token'])
            if changed:
                write(sftp,BASE+'/private/caddy-before.json',json.dumps(config));write(sftp,BASE+'/private/caddy-next.json',json.dumps(updated))
                run(client,'/usr/local/bin/caddy validate --config '+BASE+'/private/caddy-next.json')
                write(sftp,'/etc/hysteria/subscription-caddy.json',json.dumps(updated))
                try:run(client,'systemctl restart rak-vpn-subscription')
                except Exception:
                    write(sftp,'/etc/hysteria/subscription-caddy.json',json.dumps(config))
                    run(client,'systemctl restart rak-vpn-subscription')
                    raise
            protect_unchanged(client,before,caddy_restart=changed)
            checkpoint('encrypt-monitor-access')
            peer={'session':session,'domain':DOMAIN,'hub_key':state['hub_key'],'token':state['source_token'],'hub_url':'https://'+DOMAIN,'origin_token':state['origin_token']}
            owner={'url':'https://'+DOMAIN,'email':state['email'],'password':state['password'],'project':'Beszel','version':'0.21.1'}
            Path('monitor-operation/peer.enc.json').write_bytes(seal(json.dumps(peer).encode(),base64.b64decode(req['source_public_key'],validate=True),session,'monitor-peer'))
            Path('monitor-operation/owner.enc.json').write_bytes(seal(json.dumps(owner).encode(),base64.b64decode(req['owner_public_key'],validate=True),session,'monitor-owner'))
            return {'status':'passed','role':'target','mode':'install','domain':DOMAIN,'project':'henrygd/beszel','version':version,
                    'owner_initialized':True,'anonymous_systems_hidden':True,'registration_closed':True,'private_hub_listens_loopback_only':True,
                    'agent_ssh_disabled':True,'public_monitor_ports_added':0,'vpn_credentials_unchanged':True,
                    'caddy_route_added':changed,'existing_vpn_services_healthy':True,'business_migration_remains_cancelled':True,
                    'resource_caps':{'hub_memory_mib':256,'hub_cpu_percent_one_core':15,'agent_memory_mib':48,'agent_cpu_percent_one_core':5}}
    finally:client.close()
