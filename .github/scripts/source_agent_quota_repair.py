"""Retire the confirmed duplicate monitor unit, with a private backup and rollback."""
import base64,json,os,re,shlex
from pathlib import Path
from production_crypto import seal
from yifu_vps import connect

REMOTE=r'''import fs from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const q=JSON.parse(fs.readFileSync(0,'utf8')),keep='komari-agent.service',retire='komari-source-agent.service',config='/var/lib/komari-agent/config.json';
const run=args=>execFileSync(args[0],args.slice(1),{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']}).trim();
const property=(name,key)=>run(['systemctl','show',name,'--value','-p',key]);
const enabled=name=>{try{return run(['systemctl','is-enabled',name])}catch(e){return e.stdout?.toString().trim()||'unknown'}};
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function agents(){const rows=[];for(const p of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){try{const a=fs.readFileSync('/proc/'+p+'/cmdline').toString().split('\0');if(a[0]!=='/opt/komari-agent/komari-agent')continue;rows.push({pid:Number(p),config:a[a.indexOf('--config')+1]})}catch{}}return rows}
const before={keep_pid:Number(property(keep,'MainPID')),retire_pid:Number(property(retire,'MainPID')),keep_active:property(keep,'ActiveState'),retire_active:property(retire,'ActiveState'),retire_enabled:enabled(retire),agents:agents(),config_sha256:digest(config)};
if(before.keep_active!=='active'||before.retire_active!=='active'||before.agents.length!==2||new Set(before.agents.map(p=>p.pid)).size!==2||before.agents.some(p=>p.config!==config)||!before.agents.some(p=>p.pid===before.keep_pid)||!before.agents.some(p=>p.pid===before.retire_pid))throw Error('Duplicate Agent preflight changed; refusing to alter services');
const directory='/opt/rak-production/'+q.session+'/cf-quota-'+q.request_id;fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.chmodSync(directory,0o700);
for(const name of[keep,retire]){const source=property(name,'FragmentPath');if(!source.startsWith('/etc/systemd/system/'))throw Error('Unexpected monitor unit path');fs.copyFileSync(source,directory+'/'+name);fs.chmodSync(directory+'/'+name,0o600)}
fs.copyFileSync(config,directory+'/agent-config.private.json');fs.chmodSync(directory+'/agent-config.private.json',0o600);fs.writeFileSync(directory+'/before.json',JSON.stringify(before,null,2),{mode:0o600});
fs.writeFileSync(directory+'/rollback.sh','#!/bin/sh\nset -eu\n'+(before.retire_enabled==='enabled'?'systemctl enable '+retire+'\n':'')+'systemctl start '+retire+'\n',{mode:0o700});
let stopped=false;try{
 run(['systemctl','stop',retire]);stopped=true;
 if(property(keep,'ActiveState')!=='active'||Number(property(keep,'MainPID'))!==before.keep_pid||agents().length!==1)throw Error('Canonical Agent changed unexpectedly');
 await new Promise(resolve=>setTimeout(resolve,45000));
 const since=new Date(Date.now()-30000).toISOString(),log=run(['journalctl','-u',keep,'--since',since,'--no-pager']),closed=(log.match(/WebSocket (?:disconnected|read error)/g)||[]).length,connected=(log.match(/WebSocket connected/g)||[]).length;
 if(closed>0||connected>0)throw Error('Agent is still reconnecting; restoring previous unit state');
 run(['systemctl','disable',retire]);
 const after={keep_pid:Number(property(keep,'MainPID')),keep_active:property(keep,'ActiveState'),retire_active:property(retire,'ActiveState'),retire_enabled:enabled(retire),agents:agents(),config_sha256:digest(config),last_30s_disconnects:closed,last_30s_reconnects:connected};
 if(after.keep_active!=='active'||after.keep_pid!==before.keep_pid||after.retire_active!=='inactive'||after.retire_enabled!=='disabled'||after.agents.length!==1||after.config_sha256!==before.config_sha256)throw Error('Monitor deduplication validation failed');
 console.log(JSON.stringify({status:'passed',before,after,backup:directory,canonical_agent_not_restarted:true,observation_seconds:45,worker_requests_from_repair:0,config_unchanged:true}));
}catch(error){if(stopped){if(before.retire_enabled==='enabled')run(['systemctl','enable',retire]);run(['systemctl','start',retire])}console.log(JSON.stringify({status:'failed',rollback:stopped,backup:directory,error:String(error)}));process.exitCode=1}
'''

def main():
    q=json.loads(Path('.github/source-agent-repair-request.json').read_text())
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{5,100}',q['request_id']) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{5,100}',q['session']):raise ValueError('Invalid repair identity')
    with open(os.environ['GITHUB_ENV'],'a') as env:env.write('OPS_REQUEST_ID='+q['request_id']+'\n')
    root=Path('production-operation');root.mkdir(exist_ok=True)
    try:
        c=connect()
        try:
            inp,out,err=c.exec_command('/opt/yifu-cpa/bin/node --input-type=module -e '+shlex.quote(REMOTE),timeout=110)
            inp.write(json.dumps({'request_id':q['request_id'],'session':q['session']}));inp.flush();inp.channel.shutdown_write()
            raw=out.read();error=err.read();exit_code=out.channel.recv_exit_status()
            d=json.loads(raw) if raw.strip() else {'status':'failed','remote_exit':exit_code,'error':error.decode(errors='replace')[-1500:]}
        finally:c.close()
    except Exception as error:d={'status':'failed','error_type':type(error).__name__,'detail':str(error)[:1000]}
    root.joinpath('owner.enc.json').write_bytes(seal(json.dumps(d).encode(),base64.b64decode(q['owner_public_key']),q['session'],'source-agent-quota-repair'))
    report={k:d[k] for k in ['status','backup','canonical_agent_not_restarted','observation_seconds','config_unchanged','rollback'] if k in d}
    report.update(mode='source-agent-quota-repair',private_details_encrypted=True)
    root.joinpath('report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
    if d.get('status')!='passed':raise SystemExit(1)

if __name__=='__main__':main()
