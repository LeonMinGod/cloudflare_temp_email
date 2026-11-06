"""Attach only the new Muse hostname; preserve all existing production Workers."""
import base64,json,os,secrets,time,urllib.request,urllib.error
from pathlib import Path
from production_ops import BASE,OUT,phase,connect,read
from production_crypto import unseal,seal
from vps_monitor import cf,CF_ZONE
import yifu_key_api as api
DOMAIN='muse2api.leonmingod.com'
WORKER='leonmingod-muse2api'

def publish(req):
    phase('muse-decrypt-private-origin');c=connect()
    try:
        with c.open_sftp() as sf:peer=json.loads(unseal(json.dumps(req['muse_route_envelope']).encode(),read(sf,BASE+'/private/recipient.pem'),req['session'],'muse-route'))
    finally:c.close()
    if peer.get('domain')!='https://'+DOMAIN or peer.get('owner')!=WORKER:raise ValueError('Muse ownership mismatch')
    before={name:api.active(name) for name in ['leonmingod-home','leonmingod-free-token','cpa-abuse-guard','leonmingod-private-vps']}
    account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip();domains=cf('accounts/'+account+'/workers/domains')
    if any(d['hostname']==DOMAIN and d['service']!=WORKER for d in domains):raise ValueError('Hostname already used by another project')
    try:
        existing=api.cf(WORKER+'/settings')
        if not any(b['name']=='MUSE_PROJECT' and b.get('text')==WORKER for b in existing['bindings']):raise ValueError('Worker ownership not established')
    except RuntimeError as error:
        if not str(error).endswith('HTTP 404'):raise
    phase('muse-publish-isolated-worker-and-hostname')
    metadata={'main_module':'index.js','compatibility_date':'2026-11-01','bindings':[{'name':'MUSE_PROJECT','type':'plain_text','text':WORKER},{'name':'MUSE_ORIGIN_PREFIX','type':'secret_text','text':peer['prefix']}],'observability':{'enabled':False}}
    boundary='muse-'+secrets.token_hex(12);chunks=[]
    for name,mime,raw in [('metadata','application/json',json.dumps(metadata).encode()),('index.js','application/javascript+module',Path('.github/scripts/muse_proxy.js').read_bytes())]:
        disposition='form-data; name="'+name+'"'+('' if name=='metadata' else '; filename="'+name+'"')
        chunks.extend([('--'+boundary+'\r\nContent-Disposition: '+disposition+'\r\nContent-Type: '+mime+'\r\n\r\n').encode(),raw,b'\r\n'])
    chunks.append(('--'+boundary+'--\r\n').encode());api.cf(WORKER,'PUT',b''.join(chunks),{'Content-Type':'multipart/form-data; boundary='+boundary})
    api.cf(WORKER+'/subdomain','POST',{'enabled':False,'previews_enabled':False})
    cf('accounts/'+account+'/workers/domains','PUT',{'hostname':DOMAIN,'service':WORKER,'zone_id':CF_ZONE,'environment':'production'})
    phase('muse-public-tls-auth-and-import-ui')
    def request(path,auth=False):
        headers={'User-Agent':'Private-VPS-Monitor/1.0','Cache-Control':'no-cache'}
        if auth:headers['Authorization']='Bearer '+peer['api_key']
        try:
            with urllib.request.urlopen(urllib.request.Request('https://'+DOMAIN+path,headers=headers),timeout=25) as r:return r.status,r.read(1024*1024)
        except urllib.error.HTTPError as error:return error.code,error.read(1024)
    for attempt in range(60):
        try:
            if request('/healthz')[0]==200:break
        except Exception:pass
        time.sleep(2)
    else:raise RuntimeError('New Muse HTTPS hostname not ready')
    if request('/v1/models')[0]!=401 or request('/readyz')[0]!=401:raise RuntimeError('Unauthenticated data not protected')
    code,raw=request('/v1/models',True)
    if code!=200 or not json.loads(raw).get('data'):raise RuntimeError('Authenticated public model endpoint failed')
    code,raw=request('/admin')
    if code!=200 or b'location.hash.slice(1)' not in raw:raise RuntimeError('Private-key fragment bootstrap missing')
    code,raw=request('/admin/status',True)
    if code!=200:raise RuntimeError('Authenticated admin status failed')
    status=json.loads(raw)
    if {name:api.active(name) for name in before}!=before:raise RuntimeError('Existing Worker versions changed')
    owner={'base_url':'https://'+DOMAIN+'/v1','admin_url':'https://'+DOMAIN+'/admin','login_url':'https://'+DOMAIN+'/admin#key='+peer['api_key'],'api_key':peer['api_key'],'extension_url':'https://'+DOMAIN+'/admin/extension'}
    OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(owner).encode(),base64.b64decode(req['owner_public_key']),req['session'],'muse-owner'))
    return {'status':'passed','mode':'muse-publish','domain':DOMAIN,'health_http':200,'anonymous_models_http':401,'anonymous_readiness_http':401,'authenticated_models_http':200,'admin_ui_http':200,'accounts':len(status['accounts']),'conversation_verified':False,'requires_owner_session_import':True,'existing_workers_unchanged':True,'browser_cookie_delivery':'Owner Chrome extension directly to authenticated HTTPS endpoint','key_in_url_fragment_not_http_query':True}
