"""Publish the owner's monitor domain and start only the Wuliao metrics agent."""
import base64,hashlib,json,os,re,secrets,time,urllib.error,urllib.request
from pathlib import Path
from vps_monitor import BASE,DOMAIN,WORKER,CF_ZONE,baseline,cf,checkpoint,connect,read,write,run
from vps_monitor_crypto import unseal,checked_id
from vps_monitor_install import install_agent,protect_unchanged

def public_json(path,method='GET',body=None):
    data=None if body is None else json.dumps(body).encode()
    request=urllib.request.Request('https://'+DOMAIN+path,data=data,method=method,headers={'Content-Type':'application/json','Cache-Control':'no-cache','User-Agent':'Private-VPS-Monitor/1.0'})
    try:
        with urllib.request.urlopen(request,timeout=20) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:return error.code,{}

def publish_worker(peer):
    import yifu_key_api as api
    account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip();domains=cf('accounts/'+account+'/workers/domains')
    existing=[r for r in domains if r['hostname']==DOMAIN]
    if existing and any(r['service']!=WORKER for r in existing):raise ValueError('Hostname belongs to another existing service')
    try:
        settings=api.cf(WORKER+'/settings')
        binding=next((r for r in settings['bindings'] if r['name']=='MONITOR_PROJECT'),None)
        if not binding or binding.get('text')!='owner-beszel-monitor':raise ValueError('Existing Worker is not owned by this monitor')
    except RuntimeError as error:
        if not str(error).endswith('HTTP 404'):raise
    metadata={'main_module':'index.js','compatibility_date':'2026-11-01','bindings':[
        {'name':'MONITOR_PROJECT','type':'plain_text','text':'owner-beszel-monitor'},
        {'name':'MONITOR_ORIGIN_TOKEN','type':'secret_text','text':peer['origin_token']}],
        'observability':{'enabled':False},'annotations':{'workers/message':'Private Beszel dashboard; owner authentication, closed registration, no public machine data'}}
    boundary='vps-monitor-'+secrets.token_hex(12);chunks=[]
    for name,mime,raw in [('metadata','application/json',json.dumps(metadata).encode()),('index.js','application/javascript+module',Path('.github/scripts/vps_monitor_proxy.js').read_bytes())]:
        disposition='form-data; name="'+name+'"'+('' if name=='metadata' else '; filename="'+name+'"')
        chunks.extend([('--'+boundary+'\r\nContent-Disposition: '+disposition+'\r\nContent-Type: '+mime+'\r\n\r\n').encode(),raw,b'\r\n'])
    chunks.append(('--'+boundary+'--\r\n').encode())
    api.cf(WORKER,'PUT',b''.join(chunks),{'Content-Type':'multipart/form-data; boundary='+boundary})
    api.cf(WORKER+'/subdomain','POST',{'enabled':False,'previews_enabled':False})
    cf('accounts/'+account+'/workers/domains','PUT',{'hostname':DOMAIN,'service':WORKER,'zone_id':CF_ZONE,'environment':'production'})
    return api.active(WORKER)

def source_install(req):
    session=checked_id(req['session']);client=connect()
    try:
        before=baseline(client)
        import yifu_key_api as business_api
        business_workers=['leonmingod-home','leonmingod-free-token','cpa-abuse-guard']
        business_versions={name:business_api.active(name) for name in business_workers}
        with client.open_sftp() as sftp:
            checkpoint('decrypt-source-monitor-configuration')
            private=read(sftp,BASE+'/private/recipient-'+session+'.pem')
            peer=json.loads(unseal(json.dumps(req['peer_envelope']).encode(),private,session,'monitor-peer'))
            if peer['session']!=session or peer['domain']!=DOMAIN or peer['hub_url']!='https://'+DOMAIN:raise ValueError('Unexpected monitor recipient identity')
            if not re.fullmatch(r'[A-Za-z0-9_-]{43}',peer['origin_token']) or not peer['hub_key'].startswith('ssh-ed25519 '):raise ValueError('Unexpected monitor credential format')
            write(sftp,BASE+'/private/peer.json',json.dumps(peer))
            checkpoint('publish-private-monitor-domain');version=publish_worker(peer)
            checkpoint('wait-private-monitor-https')
            for attempt in range(75):
                try:
                    if public_json('/api/health')[0]==200:break
                except Exception:pass
                time.sleep(2)
            else:raise RuntimeError('Private monitor HTTPS did not become ready')
            checkpoint('install-source-outbound-agent');install_agent(client,sftp,peer)
            protect_unchanged(client,before)
            status,body=public_json('/api/collections/systems/records')
            if status==200 and body.get('totalItems')!=0:raise ValueError('Anonymous machine data became visible')
            if status not in [200,401,403,404]:raise ValueError('Unexpected anonymous systems response')
            status,body=public_json('/api/beszel/create-user','POST',{'email':'not-allowed@example.invalid','password':'not-a-real-account'})
            if status!=403:raise ValueError('Public user registration was not blocked')
            if public_json('/api/beszel/first-run')[1].get('firstRun') is not False:raise ValueError('Bootstrap is still open')
            if {name:business_api.active(name) for name in business_workers}!=business_versions:raise ValueError('Original business Worker versions changed')
            if business_api.request('https://yifu.leonmingod.com/healthz')[0]!=200:raise ValueError('Original public CPA health failed')
            source_egress=run(client,'curl -4 --fail --silent --max-time 20 https://api.ipify.org').strip()
            if source_egress!='23.94.180.2':raise ValueError('Unexpected Wuliao source identity')
            return {'status':'passed','role':'source','mode':'install','domain':DOMAIN,'worker':WORKER,'worker_version':version,
                    'agent_service':run(client,'systemctl is-active beszel-agent').strip(),'outbound_tls_enabled':True,'agent_ssh_disabled':True,
                    'anonymous_machine_data_hidden':True,'public_registration_blocked':True,'public_hub_health':200,
                    'existing_public_station_processes_and_configuration_unchanged':True,'original_website_and_auth_workers_unchanged':True,'public_cpa_health':200,'business_migration_remains_cancelled':True,
                    'public_monitor_ports_added':0,'resource_caps':{'agent_memory_mib':48,'agent_cpu_percent_one_core':5}}
    finally:client.close()

def diagnose(req):
    import fnmatch,re
    client=connect();result={'status':'passed','role':'source','mode':'verify','operation':'domain-diagnostics'}
    try:
        with client.open_sftp() as sftp:peer=json.loads(read(sftp,BASE+'/private/peer.json'))
        def probe(url):
            request=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'Private-VPS-Monitor-Diagnostic'})
            try:
                with urllib.request.urlopen(request,timeout=20) as response:status=response.status;headers=response.headers;raw=response.read(8192)
            except urllib.error.HTTPError as error:status=error.code;headers=error.headers;raw=error.read(8192)
            except Exception as error:return {'error_type':type(error).__name__}
            title=re.search(rb'<title[^>]*>(.*?)</title>',raw,re.I|re.S)
            value={'http':status,'content_type':headers.get('Content-Type'),'server':headers.get('Server'),'body_bytes_sampled':len(raw),'title':title.group(1).decode(errors='replace')[:100] if title else None}
            try:value['health_json_status']=json.loads(raw).get('code')
            except Exception:pass
            return value
        result['public_monitor']=probe('https://'+DOMAIN+'/api/health')
        result['direct_private_origin']=probe('https://sj.leonmingod.com/_vpsmon/'+peer['origin_token']+'/api/health')
        try:
            routes=cf('zones/'+CF_ZONE+'/workers/routes')
            result['applicable_zone_routes']=[{'pattern':row['pattern'],'script':row.get('script')} for row in routes if fnmatch.fnmatch('https://'+DOMAIN+'/api/health',row['pattern']) or fnmatch.fnmatch(DOMAIN+'/api/health',row['pattern'])]
        except Exception as error:result['zone_routes_error_type']=type(error).__name__
        domains=cf('accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()+'/workers/domains')
        result['domain_binding']=[{'hostname':row['hostname'],'service':row['service']} for row in domains if row['hostname']==DOMAIN]
        return result
    finally:client.close()
