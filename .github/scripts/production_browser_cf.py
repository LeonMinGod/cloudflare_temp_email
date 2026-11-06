"""Publish one private browser hostname and verify the actual authenticated desktop."""
import base64, contextlib, io, json, os, secrets, time, urllib.error, urllib.parse, urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
import websocket
from production_ops import BASE,OUT,phase,connect,read
from production_crypto import unseal,seal
from vps_monitor import cf,CF_ZONE
import yifu_key_api as api
DOMAIN='browser.leonmingod.com'
WORKER='leonmingod-private-browser'

def _publish(req):
    phase('browser-publish-read-owner-envelope');c=connect()
    try:
        with c.open_sftp() as sf:state=json.loads(unseal(json.dumps(req['browser_route_envelope']).encode(),read(sf,BASE+'/private/recipient.pem'),req['session'],'browser-route'))
    finally:c.close()
    if state.get('owner')!=WORKER or state.get('public_url')!='https://'+DOMAIN:raise RuntimeError('Browser deployment ownership mismatch')
    before={name:api.active(name) for name in ['leonmingod-home','leonmingod-free-token','cpa-abuse-guard','leonmingod-private-vps','leonmingod-muse2api']}
    account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()
    if any(d['hostname']==DOMAIN and d['service']!=WORKER for d in cf('accounts/'+account+'/workers/domains')):raise RuntimeError('Browser hostname already belongs to another service')
    try:
        previous=api.cf(WORKER+'/settings')
        if not any(b['name']=='BROWSER_PROJECT' and b.get('text')==WORKER for b in previous['bindings']):raise RuntimeError('Existing browser Worker is unmanaged')
    except RuntimeError as error:
        if not str(error).endswith('HTTP 404'):raise
    phase('browser-publish-websocket-preserving-private-worker')
    metadata={'main_module':'index.js','compatibility_date':'2026-11-01','observability':{'enabled':False},'bindings':[{'type':'plain_text','name':'BROWSER_PROJECT','text':WORKER},{'type':'secret_text','name':'BROWSER_ORIGIN_PREFIX','text':state['prefix']},{'type':'secret_text','name':'BROWSER_ORIGIN_TOKEN','text':state['origin_token']}]}
    boundary='browser-'+secrets.token_hex(12);parts=[]
    for name,mime,body in [('metadata','application/json',json.dumps(metadata).encode()),('index.js','application/javascript+module',Path('.github/scripts/browser_proxy.js').read_bytes())]:
        disposition='form-data; name="'+name+'"'+('' if name=='metadata' else '; filename="'+name+'"')
        parts.extend([('--'+boundary+'\r\nContent-Disposition: '+disposition+'\r\nContent-Type: '+mime+'\r\n\r\n').encode(),body,b'\r\n'])
    parts.append(('--'+boundary+'--\r\n').encode());api.cf(WORKER,'PUT',b''.join(parts),{'Content-Type':'multipart/form-data; boundary='+boundary})
    api.cf(WORKER+'/subdomain','POST',{'enabled':False,'previews_enabled':False})
    cf('accounts/'+account+'/workers/domains','PUT',{'hostname':DOMAIN,'service':WORKER,'zone_id':CF_ZONE,'environment':'production'})
    base='https://'+DOMAIN;jar=CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def request(path,body=None,headers=None,owner=False):
        h={'User-Agent':'Private-VPS-Monitor/1.0',**(headers or {})}
        if body is not None:h['Origin']=base
        q=urllib.request.Request(base+path,headers=h,data=body)
        try:
            with (opener.open(q,timeout=75) if owner else urllib.request.urlopen(q,timeout=75)) as response:return response.status,response.read(1024*1024),response.headers
        except urllib.error.HTTPError as error:return error.code,error.read(4096),error.headers
    for _ in range(60):
        try:
            code,html,_=request('/')
            if code==200 and '独立访问密码'.encode() in html:break
        except Exception:pass
        time.sleep(2)
    else:raise RuntimeError('Public browser login page unavailable')
    phase('browser-public-login-session-csrf-and-desktop-verification')
    if request('/api/status')[0]!=401 or request('/novnc/core/rfb.js')[0]!=401:raise RuntimeError('Unauthenticated browser information exposed')
    password=urllib.parse.urlencode({'password':state['owner_password']}).encode()
    code,_,_=request('/login',password,{'Content-Type':'application/x-www-form-urlencoded'},True)
    if code!=200:raise RuntimeError('Owner browser password login failed')
    cookie=next((x for x in jar if x.name=='__Host-rak-browser'),None)
    if not cookie or not cookie.secure or cookie._rest.get('SameSite')!='strict' or not cookie.has_nonstandard_attr('HttpOnly'):raise RuntimeError('Private session cookie protection missing')
    code,raw,_=request('/api/status',owner=True)
    if code!=200:raise RuntimeError('Authenticated browser status failed')
    csrf=json.loads(raw)['csrf'];headers={'X-CSRF-Token':csrf}
    if request('/api/start',b'{}',headers,True)[0]!=200:raise RuntimeError('Authenticated browser startup failed')
    cookie_header='; '.join(x.name+'='+x.value for x in jar)
    def ws_test(cookie_value,accepted):
        try:
            w=websocket.create_connection('wss://'+DOMAIN+'/websockify',origin=base,cookie=cookie_value,timeout=20)
            try:
                if not accepted:raise RuntimeError('Anonymous public desktop accepted')
                if not w.recv().startswith(b'RFB '):raise RuntimeError('Public desktop returned invalid RFB data')
            finally:w.close()
        except websocket.WebSocketBadStatusException:
            if accepted:raise
    ws_test('',False);ws_test(cookie_header,True)
    screenshot=None
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser=playwright.webkit.launch(headless=True)
        try:
            context=browser.new_context(viewport={'width':1440,'height':1000})
            page=context.new_page();errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)[:600]))
            page.on('console',lambda event:errors.append(event.type+': '+event.text[:600]) if event.type=='error' else None)
            page.on('request',lambda request:errors.append('login origin: '+request.headers.get('origin','missing')) if request.url==base+'/login' else None)
            page.on('response',lambda response:errors.append(str(response.status)+' '+response.url) if response.status>=400 and DOMAIN in response.url else None)
            page.goto(base,wait_until='domcontentloaded',timeout=45000)
            page.locator('input[name=password]').fill(state['owner_password']);page.locator('form button').click()
            try:page.wait_for_function("document.querySelector('#state')?.textContent==='已安全连接'",timeout=60000)
            except Exception:
                text=page.locator('body').inner_text()[:1600]
                raise RuntimeError('Desktop UI did not connect: '+json.dumps({'errors':errors[-12:],'page_text':text,'url':page.url},ensure_ascii=False)) from None
            page.wait_for_function("document.querySelector('#screen canvas')?.width>100",timeout=20000)
            page.wait_for_timeout(2000)
            screenshot=page.screenshot(full_page=True)
            if page.locator('#screen canvas').count()!=1:raise RuntimeError('Desktop canvas missing')
            context.close()
        finally:browser.close()
    if request('/api/stop',b'{}',headers,True)[0]!=200:raise RuntimeError('Browser resource sleep check failed')
    if {name:api.active(name) for name in before}!=before:raise RuntimeError('An existing production Worker changed')
    owner={'url':base,'password':state['owner_password'],'agent_token':state['agent_token'],'desktop_screenshot_png':base64.b64encode(screenshot).decode()}
    OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(owner).encode(),base64.b64decode(req['owner_public_key']),req['session'],'browser-owner'))
    return {'status':'passed','mode':'browser-publish','url':base,'login_http':200,'anonymous_api_http':401,'anonymous_assets_http':401,'secure_httponly_session':True,'owner_login_verified':True,'public_websocket_authenticated_rfb_verified':True,'anonymous_websocket_rejected':True,'actual_novnc_canvas_rendered':True,'browser_stopped_after_test':True,'existing_five_workers_unchanged':True,'screenshot_encrypted_to_owner':True}


def publish(req):
    try:return _publish(req)
    except Exception as error:
        OUT.joinpath("owner.enc.json").write_bytes(seal(json.dumps({"error_type":type(error).__name__,"detail":str(error)[:6000]}).encode(),base64.b64decode(req["owner_public_key"]),req["session"],"browser-diagnostics"))
        raise
