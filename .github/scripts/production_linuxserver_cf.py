"""Protect and verify the official LinuxServer Chrome + Pelorus public portal."""
import base64,json,os,secrets,shutil,time,urllib.request,urllib.error
from pathlib import Path
from production_ops import BASE,OUT,phase,connect,read
from production_crypto import unseal,seal
from vps_monitor import cf,CF_ZONE
import yifu_key_api as api
WORKER='leonmingod-private-browser'
DOMAIN='browser.leonmingod.com'

def publish(req):
    phase('linuxserver-public-owner-route');c=connect()
    try:
        with c.open_sftp() as sf:state=json.loads(unseal(json.dumps(req['linuxserver_route_envelope']).encode(),read(sf,BASE+'/private/recipient.pem'),req['session'],'linuxserver-route'))
    finally:c.close()
    if state.get('owner')!='leonmingod-linuxserver-chrome' or state.get('public_url')!='https://'+DOMAIN:raise RuntimeError('Chrome route owner mismatch')
    before={n:api.active(n) for n in ['leonmingod-home','leonmingod-free-token','cpa-abuse-guard','leonmingod-private-vps','leonmingod-muse2api']}
    existing=api.cf(WORKER+'/settings')
    if not any(b['name']=='BROWSER_PROJECT' and b.get('text')==WORKER for b in existing['bindings']):raise RuntimeError('Unmanaged browser Worker')
    metadata={'main_module':'index.js','compatibility_date':'2026-11-01','observability':{'enabled':False},'bindings':[{'type':'plain_text','name':'BROWSER_PROJECT','text':WORKER},{'type':'secret_text','name':'BROWSER_ORIGIN_PREFIX','text':state['prefix']},{'type':'secret_text','name':'BROWSER_ORIGIN_TOKEN','text':state['origin_token']},{'type':'secret_text','name':'BROWSER_AUTH_SHA256','text':state['auth_header_sha256']}]}
    boundary='lsio-'+secrets.token_hex(12);parts=[]
    for name,mime,body in [('metadata','application/json',json.dumps(metadata).encode()),('index.js','application/javascript+module',Path('.github/scripts/browser_proxy.js').read_bytes())]:
        disposition='form-data; name="'+name+'"'+('' if name=='metadata' else '; filename="'+name+'"')
        parts.extend([('--'+boundary+'\r\nContent-Disposition: '+disposition+'\r\nContent-Type: '+mime+'\r\n\r\n').encode(),body,b'\r\n'])
    parts.append(('--'+boundary+'--\r\n').encode());api.cf(WORKER,'PUT',b''.join(parts),{'Content-Type':'multipart/form-data; boundary='+boundary})
    api.cf(WORKER+'/subdomain','POST',{'enabled':False,'previews_enabled':False})
    basic='Basic '+base64.b64encode((state['username']+':'+state['password']).encode()).decode();base='https://'+DOMAIN
    def get(path,auth=False):
        headers={'User-Agent':'Private-VPS-Monitor/1.0'}
        if auth:headers['Authorization']=basic
        try:
            with urllib.request.urlopen(urllib.request.Request(base+path,headers=headers),timeout=25) as r:return r.status,r.read(1500000),r.headers
        except urllib.error.HTTPError as e:return e.code,e.read(500),e.headers
    phase('linuxserver-public-authorization-and-official-desktop')
    if get('/')[0]!=401 or get('/pelorus/')[0]!=401:raise RuntimeError('Public desktop is not protected')
    for path in ['/','/pelorus/']:
        code,raw,headers=get(path,True)
        if code!=200 or b'<html' not in raw.lower():raise RuntimeError('Authenticated official UI unavailable')
    from playwright.sync_api import sync_playwright
    screenshots={};browser_error=[]
    try:
        with sync_playwright() as playwright:
            executable=shutil.which('google-chrome') or shutil.which('google-chrome-stable')
            if not executable:raise RuntimeError('Missing native Chrome test browser')
            browser=playwright.chromium.launch(headless=True,executable_path=executable)
            try:
                for name,viewport,mobile in [('desktop',{'width':1440,'height':1000},False),('phone',{'width':390,'height':844},True)]:
                    context=browser.new_context(viewport=viewport,is_mobile=mobile,has_touch=mobile,http_credentials={'username':state['username'],'password':state['password']})
                    page=context.new_page();page.on('pageerror',lambda e:browser_error.append(str(e)[:400]))
                    page.goto(base,wait_until='domcontentloaded',timeout=60000)
                    page.wait_for_function("Array.from(document.querySelectorAll('canvas')).some(c=>c.width>200&&c.height>100)||Array.from(document.querySelectorAll('video')).some(v=>v.videoWidth>200)",timeout=60000)
                    page.wait_for_timeout(2000)
                    screenshots[name]=base64.b64encode(page.screenshot(full_page=True)).decode()
                    if mobile and page.evaluate('document.documentElement.scrollWidth>window.innerWidth+12'):raise RuntimeError('Phone UI horizontal overflow')
                    context.close()
                context=browser.new_context(http_credentials={'username':state['username'],'password':state['password']});page=context.new_page()
                page.goto(base+'/pelorus/',wait_until='domcontentloaded',timeout=45000)
                page.wait_for_function("document.body.innerText.length>40",timeout=15000)
                screenshots['pelorus']=base64.b64encode(page.screenshot(full_page=True)).decode();context.close()
            finally:browser.close()
    except Exception as error:
        OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps({'error_type':type(error).__name__,'detail':str(error)[:4000],'browser_errors':browser_error[-10:]}).encode(),base64.b64decode(req['owner_public_key']),req['session'],'linuxserver-diagnostics'));raise
    if {n:api.active(n) for n in before}!=before:raise RuntimeError('Existing application Worker changed')
    OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps({'url':base,'username':state['username'],'password':state['password'],'screenshots':screenshots}).encode(),base64.b64decode(req['owner_public_key']),req['session'],'linuxserver-owner'))
    return {'status':'passed','mode':'linuxserver-publish','url':base,'username':state['username'],'anonymous_desktop_http':401,'anonymous_pelorus_http':401,'authenticated_desktop_http':200,'authenticated_pelorus_http':200,'real_chrome_desktop_and_phone_canvas':True,'pelorus_ui_verified':True,'image':state['image'],'existing_five_workers_preserved':True,'cdp_not_published':True,'screenshots_encrypted_to_owner':True}
