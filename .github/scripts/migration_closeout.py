"""Cancel migration jobs and restore the existing service boundaries at user request."""
import base64,copy,hashlib,json,os,shlex,sys,time,traceback,urllib.error,urllib.parse,urllib.request
from pathlib import Path

SESSION='rak-20261105-bd1662793abe'
EXPECTED={'leonmingod-home':'fe123ce3-a104-43df-a4b8-abbf8ff07322',
          'leonmingod-free-token':'51a33be8-6ca4-4b4f-886f-613bfea996b0',
          'cpa-abuse-guard':'616ff1c7-9019-42d5-8ed4-5753be0708d1'}
ACTIVE={'queued','in_progress','requested','waiting','pending'}

def github(path,method='GET'):
    request=urllib.request.Request('https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+path,
        method=method,data=b'' if method in ['POST','PUT'] else None,
        headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            raw=response.read();return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        if error.code==404:return None
        if error.code==409 and path.endswith('/cancel'):return {}
        raise RuntimeError('Workflow control API returned HTTP '+str(error.code)) from None

def cancel_migration():
    disabled=[];cancelled=[]
    for filename in ['rak-migration.yaml','rak-migration-status.yaml']:
        path='/actions/workflows/'+filename;workflow=github(path)
        if workflow is None:continue
        github(path+'/disable','PUT');disabled.append(filename)
        runs=github(path+'/runs?per_page=100')['workflow_runs']
        for run in runs:
            if run['status'] in ACTIVE:
                github('/actions/runs/'+str(run['id'])+'/cancel','POST');cancelled.append(run['id'])
    remaining=[]
    for attempt in range(25):
        remaining=[]
        for filename in disabled:
            rows=github('/actions/workflows/'+filename+'/runs?per_page=100')['workflow_runs']
            remaining.extend(r['id'] for r in rows if r['status'] in ACTIVE)
        if not remaining:break
        time.sleep(2)
    if remaining:raise RuntimeError('Migration run cancellation still pending')
    return {'disabled_workflows':disabled,'cancelled_runs':cancelled,'active_migration_runs':0}

def remove_migration_routes(config):
    updated=copy.deepcopy(config);server=updated['apps']['http']['servers']['subscription'];removed=0
    keep=[]
    for route in server['routes']:
        if route.get('group')=='migration-'+SESSION:
            paths=[p for match in route.get('match',[]) for p in match.get('path',[])]
            if paths!=['/_migration/'+SESSION+'/upload']:raise ValueError('Migration route differs from owned route')
            removed+=1
        else:keep.append(route)
    server['routes']=keep
    if updated['apps']['tls']!=config['apps']['tls'] or updated['storage']!=config['storage']:raise ValueError('TLS storage changed')
    return updated,removed

def source():
    import yaml
    import yifu_vps as old
    import yifu_key_api as api
    client=old.connect();restarted=[]
    try:
        with client.open_sftp() as sftp:
            config_raw=old.read(sftp,old.ROOT+'/private/config.yaml')
            env=old.private_env(sftp)
            if env.get('CPA_OAUTH_BOOTSTRAP_FILE'):raise ValueError('Unexpected obsolete OAuth bootstrap')
            services={}
            for name in ['yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','yifu-tunnel']:
                state=old.run(client,'systemctl is-active '+name+' || true').strip()
                if state!='active':
                    old.run(client,'systemctl start '+name);restarted.append(name)
                services[name]=old.run(client,'systemctl is-active '+name).strip()
            old.verify(client,sftp)
            verification=json.loads(Path('yifu-operation/verify.json').read_text())
            versions={name:api.active(name) for name in EXPECTED}
            # No cutover was authorized after the pause: never roll back an
            # unrelated Worker change or overwrite a registry with an old copy.
            if versions!=EXPECTED:raise ValueError('Live Worker version requires review before claiming original routing')
            pages={}
            for origin in ['https://leonmingod.com','https://www.leonmingod.com']:
                for path in ['/','/free-token/','/api/free-token/status','/api/leaderboard','/api/pool-status']:
                    status,headers,raw=api.request(origin+path,headers={'Cache-Control':'no-cache'})
                    if status!=200:raise ValueError('Public website health check failed')
                    if headers.get('X-LMG-Origin-Host')=='RAKsmart':raise ValueError('Unexpected RAK website forwarding')
                    pages[urllib.parse.urlsplit(origin).hostname+path]=status
            from yifu_plus import local_request
            plus=local_request(client,'/status')
            if plus['http']!=200:raise ValueError('Plus authenticated health failed')
            # One tiny generation verifies upstream service, without load testing.
            config=yaml.safe_load(config_raw);key=config['api-keys'][0]
            models=json.loads(api.request(old.ORIGIN+'/v1/models',headers={'Authorization':'Bearer '+key})[2])['data']
            ids=[row['id'] for row in models];options=[m for m in ids if 'gpt' in m.lower()]
            selected=next((m for m in options if 'codex' in m.lower()),options[0] if options else ids[0])
            try:
                status,headers,raw=api.request(old.ORIGIN+'/v1/chat/completions','POST',{'model':selected,'messages':[{'role':'user','content':'Reply OK.'}],'max_tokens':16,'stream':True},
                    {'Authorization':'Bearer '+key,'Content-Type':'application/json'})
                text=raw.decode();generation={'http':status,'sse_done':'data: [DONE]' in text,'response_bytes':len(raw)}
                if status!=200 or not generation['sse_done']:raise ValueError('Generation incomplete')
            except Exception as error:
                generation={'status':'failed','error_type':type(error).__name__}
            if old.read(sftp,old.ROOT+'/private/config.yaml')!=config_raw:raise ValueError('Source CPA configuration changed')
            egress=old.run(client,'curl -4 --fail --silent --max-time 20 https://api.ipify.org').strip()
            return {'source_services':services,'services_started':restarted,'public_api':old.ORIGIN+'/v1','source_egress_ip':egress,
                    'verification':verification,'website_http_checks':pages,'worker_versions':versions,
                    'cloudflare_business_and_state_unchanged':True,'source_configuration_unchanged':True,
                    'plus_authenticated_http':plus['http'],'generation':generation,
                    'staged_files_retained':True,'business_cutover':False}
    finally:client.close()

def target():
    import yaml
    import rak_vpn as rak
    from rak_tcp import validate_marker,verify_tcp_chain,download_xray,node_uri,dns_query,validate_dns_response
    from rak_subscription import MARKER as SUB_MARKER,ROOT
    client=rak.connect();changed=False;stopped=[]
    protected='/etc/ssh/sshd_config /etc/shadow /etc/hysteria/config.yaml /etc/hysteria/rak-tcp.json /etc/hysteria/rak-subscription.json'
    try:
        baseline=rak.command(client,"stat -c '%i:%s:%Y' "+protected)
        with client.open_sftp() as sftp:
            config=json.loads(rak.read(sftp,'/etc/hysteria/subscription-caddy.json'));updated,removed=remove_migration_routes(config)
            base='/opt/lmg-migration/'+SESSION
            rak.command(client,'install -d -m 0755 '+base)
            if removed:
                rak.write(sftp,base+'/closeout-caddy-before.json',json.dumps(config))
                rak.write(sftp,base+'/closeout-caddy-next.json',json.dumps(updated))
                rak.command(client,'/usr/local/bin/caddy validate --config '+base+'/closeout-caddy-next.json')
                rak.write(sftp,'/etc/hysteria/subscription-caddy.json',json.dumps(updated));changed=True
            for name in ['lmg-migration-receiver','yifu-tunnel','yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','lmg-website','lmg-website-stage']:
                try:sftp.stat('/etc/systemd/system/'+name+'.service')
                except FileNotFoundError:continue
                rak.command(client,'systemctl stop '+name)
                rak.command(client,'systemctl disable '+name+' >/dev/null 2>&1 || true');stopped.append(name)
            names=['rak-vpn-firewall','rak-vpn-subscription','rak-vpn-tcp','hysteria-server','rak-vpn-traffic.timer']
            if changed:rak.command(client,'systemctl restart rak-vpn-subscription')
            for name in names:rak.command(client,'systemctl start '+name)
            marker=validate_marker(json.loads(rak.read(sftp,'/etc/hysteria/rak-tcp.json')))
            sub=json.loads(rak.read(sftp,SUB_MARKER));body=rak.read(sftp,ROOT+'/'+sub['filename'])
            url='https://'+rak.DOMAIN+'/'+sub['filename']
            for attempt in range(20):
                try:
                    with urllib.request.urlopen(url,timeout=10) as response:external=response.read(65536)
                    break
                except Exception:
                    if attempt==19:raise
                    time.sleep(1)
            if external!=body:raise ValueError('Existing subscription response differs')
            lines=base64.b64decode(body).decode().strip().splitlines()
            if len(lines)!=2 or node_uri(marker) not in lines:raise ValueError('Existing two-node subscription changed')
            profile_url='https://'+rak.DOMAIN+'/'+marker['dns_token']+'.conf'
            profile=rak.read(sftp,ROOT+'/'+marker['dns_token']+'.conf').decode()
            with urllib.request.urlopen(profile_url,timeout=30) as response:
                if response.read(65536).decode()!=profile:raise ValueError('Existing DNS profile differs')
        chain=verify_tcp_chain(download_xray(),marker)
        # Reuse credentials, TLS and subscription; verify performs no installation.
        rak.verify(client,delivery_extra={'subscription_url':url,'subscription_import_uri':'sub://'+base64.b64encode(url.encode()).decode(),
            'tcp_share_uri':node_uri(marker),'dns_profile_url':profile_url,'dns_profile_content':profile,'doh_url':'https://'+rak.DOMAIN+'/'+marker['dns_token']+'/dns-query'})
        vpn=json.loads(Path('rak-operation/report.json').read_text())
        if baseline!=rak.command(client,"stat -c '%i:%s:%Y' "+protected):raise ValueError('VPN credentials or SSH changed')
        services={name:rak.command(client,'systemctl is-active '+name).strip() for name in names}
        receiver=rak.command(client,'systemctl is-active lmg-migration-receiver || true').strip()
        forbidden=rak.command(client,"ss -lnt | awk '$4 ~ /:(8317|8318|8319|8320|8321|18317|18320|18321|18388)$/ {n++} END {print n+0}'").strip()
        if forbidden!='0':raise ValueError('Unexpected application or migration listener still active')
        Path('migration-operation/vpn-share.enc.json').write_bytes(Path('rak-operation/share.enc.json').read_bytes())
        return {'vpn_services':services,'migration_routes_removed':removed,'migration_and_business_services_stopped':stopped,
                'receiver_state':receiver,'business_listeners':0,'staged_files_retained':True,'vpn_credentials_and_ssh_unchanged':True,
                'existing_subscription_https_verified':True,'subscription_nodes':len(lines),'tcp_chain':chain,
                'vpn_verification':vpn,'encrypted_share_file':'vpn-share.enc.json','mainland_phone_route_tested':False}
    finally:client.close()

def main():
    root=Path('migration-operation');root.mkdir(exist_ok=True)
    role=os.environ['MIGRATION_ROLE'];result={'role':role,'operation':'cancel-migration-and-restore-original-services'}
    try:
        result['workflow_control']=cancel_migration()
        result['checks']=source() if role=='source' else target()
        result['status']='passed'
        if role=='source' and result['checks']['generation'].get('status')=='failed':result['status']='needs-generation-review'
    except Exception as error:
        result.update(status='failed',error_type=type(error).__name__,location=[{'file':Path(f.filename).name,'function':f.name,'line':f.lineno} for f in traceback.extract_tb(error.__traceback__)])
    root.joinpath('report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    if result['status']!='passed':sys.exit(1)

if __name__=='__main__':main()
