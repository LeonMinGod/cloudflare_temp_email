"""Verify the actual two-host production boundary and preserve private diagnostic evidence."""
import base64,json,os,shlex,urllib.request
from pathlib import Path
from production_ops import BASE,OUT,phase,connect,read,run
from production_crypto import seal

RESOURCES=r'''import fs from'node:fs';import os from'node:os';import{execFileSync}from'node:child_process';
const run=(...a)=>{try{return execFileSync(a[0],a.slice(1),{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{return null}};
const names=['hysteria-server','rak-vpn-subscription','rak-vpn-tcp','rak-vpn-firewall','rak-vpn-traffic.timer','komari-hub','komari-agent','beszel-hub','beszel-agent','yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','yifu-tunnel','yifu-health.timer','yifu-plus-budget.timer'];const units={};
for(const n of names){const p=run('systemctl','show','-p','ActiveState','-p','UnitFileState','-p','MemoryCurrent','-p','CPUUsageNSec','-p','NRestarts',n)||'';units[n]=Object.fromEntries(p.split('\n').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}))}
const d=fs.statfsSync('/'),memory=Object.fromEntries(fs.readFileSync('/proc/meminfo','utf8').split('\n').filter(x=>/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/.test(x)).map(x=>[x.split(':')[0],Number(x.match(/\d+/)[0])*1024]));
let health=null;try{health=JSON.parse(fs.readFileSync('/opt/yifu-cpa/data/health.json'))}catch{}
const auth=fs.readdirSync('/opt/yifu-cpa/auths').filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync('/opt/yifu-cpa/auths/'+x)));
console.log(JSON.stringify({os:fs.readFileSync('/etc/os-release','utf8'),kernel:os.release(),cpu_count:os.availableParallelism(),load:os.loadavg(),memory_bytes:memory,disk_bytes:{total:d.blocks*d.bsize,used:(d.blocks-d.bfree)*d.bsize,free:d.bavail*d.bsize},uptime_seconds:os.uptime(),units,health,auth_count:auth.length,disabled:auth.filter(x=>x.disabled).length,observed_at_utc:new Date().toISOString()}));'''

def observe(req):
    role=os.environ['MONITOR_ROLE'];phase('final-'+role+'-production-observation');client=connect()
    try:
        launcher='/usr/local/bin/node' if role=='target' else '/opt/yifu-cpa/bin/node'
        data=json.loads(run(client,launcher+' --input-type=module -e '+shlex.quote(RESOURCES),timeout=90))
        expected=['yifu-cpa','yifu-gateway','yifu-monitor','yifu-plus','yifu-tunnel']
        units=data['units']
        if role=='source':
            if any(units[n].get('ActiveState')!='inactive' or units[n].get('UnitFileState')!='disabled' for n in expected):raise RuntimeError('Source still hosts production or has autostart enabled')
            if units['komari-agent'].get('ActiveState')!='active':raise RuntimeError('Source monitoring agent offline')
            run(client,'test -f '+BASE+'/'+req['session']+'/source-migration-committed.json')
            import yaml
            from yifu_safety import public_probe
            with client.open_sftp() as sf:cfg=yaml.safe_load(read(sf,'/opt/yifu-cpa/private/config.yaml'))
            public=public_probe(cfg)
            if public.get('http')!=200 or not public.get('models'):raise RuntimeError('Public API unavailable while source stopped')
            disabled=[]
            for name in ['yifu-vps.yaml','yifu-vps-backup.yaml']:
                url='https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+'/actions/workflows/'+name
                headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'}
                with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as response:state=json.load(response)['state']
                if not state.startswith('disabled'):
                    with urllib.request.urlopen(urllib.request.Request(url+'/disable',method='PUT',headers=headers),timeout=30) as response:
                        if response.status!=204:raise RuntimeError('Old VPS writer workflow not disabled')
                disabled.append(name)
            data['public_api_with_source_stopped']={'http':public['http'],'models':public['models']};data['old_vps_writer_workflows_disabled']=disabled
            if req.get('expected_cf_versions'):
                import yifu_key_api as cf
                observed={name:cf.active(name) for name in req['expected_cf_versions']}
                if observed!=req['expected_cf_versions']:raise RuntimeError('Cloudflare production versions unexpectedly changed')
                data['cloudflare_versions_unchanged']=True
                data['frontend_http']={}
                for url in ['https://leonmingod.com','https://www.leonmingod.com']:
                    r=urllib.request.Request(url,headers={'User-Agent':'Private-VPS-Monitor/1.0'})
                    try:
                        with urllib.request.urlopen(r,timeout=30) as response:data['frontend_http'][url]=response.status
                    except urllib.error.HTTPError as error:data['frontend_http'][url]=error.code
        else:
            active=expected+['hysteria-server','rak-vpn-subscription','rak-vpn-tcp','komari-hub','komari-agent','yifu-health.timer','yifu-plus-budget.timer']
            if any(units[n].get('ActiveState')!='active' or units[n].get('UnitFileState')!='enabled' for n in active):raise RuntimeError('A destination service is not active and enabled')
            if not data['health'] or not data['health'].get('healthy'):raise RuntimeError('Local production health record failed')
            # Caddy already runs as root. Isolate bearer subscription files from the new CPA account.
            if run(client,'systemctl show -p User --value rak-vpn-subscription').strip() not in ['','root']:raise RuntimeError('Unexpected web server identity')
            run(client,'chmod 0700 /var/www/rak-sj\nfind /var/www/rak-sj -maxdepth 1 -type f -exec chmod 0600 {} +')
            with client.open_sftp() as sf:
                marker=json.loads(read(sf,'/etc/hysteria/rak-clash.json'));body=read(sf,'/var/www/rak-sj/'+marker['filename'])
                request=urllib.request.Request('https://sj.leonmingod.com/'+marker['filename'],headers={'User-Agent':'RAK-Owner-Subscription/1.0'})
                with urllib.request.urlopen(request,timeout=30) as response:
                    if response.status!=200 or response.read(262144)!=body:raise RuntimeError('Clash subscription contents changed')
                from production_komari import credentials,public_check,public_session,probe_history
                auth=credentials(sf,req);data['komari']=public_check(auth,2);jar,opener,api=public_session(auth);data['carrier_probes']=probe_history(api)
            data['subscription_root_only_and_https_verified']=True
        if any(units[n].get('ActiveState')=='active' for n in ['beszel-hub','beszel-agent']):raise RuntimeError('Beszel unexpectedly running')
        OUT.joinpath('owner.enc.json').write_bytes(seal(json.dumps(data).encode(),base64.b64decode(req['owner_public_key']),req['session'],'production-final-'+role))
        return {'status':'passed','mode':'migration-observe','role':role,**data}
    finally:client.close()
