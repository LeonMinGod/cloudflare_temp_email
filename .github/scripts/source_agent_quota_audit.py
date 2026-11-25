"""Read only the old VPS monitor process/configuration; encrypt all diagnostics."""
import base64, json, os, re, shlex
from pathlib import Path
from production_crypto import seal
from yifu_vps import connect

REMOTE_NODE = r'''import fs from 'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const cfg=JSON.parse(fs.readFileSync('/var/lib/komari-agent/config.json')),token=cfg.token||'',url=new URL(cfg.endpoint);
function run(args){try{let text=execFileSync(args[0],args.slice(1),{encoding:'utf8',timeout:25000,maxBuffer:1024*1024,stdio:['ignore','pipe','ignore']}).slice(-70000);if(token)text=text.split(token).join('[REDACTED]');return{exit:0,text:text.replace(/([?&](?:token|secret|password|key)=)[^&\s"']+/gi,'$1[REDACTED]')}}catch(e){return{exit:e.status||1,text:''}}}
const processes=[];for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){try{const args=fs.readFileSync('/proc/'+pid+'/cmdline').toString().split('\0'),exe=args[0];if(exe!=='komari-agent'&&!exe.endsWith('/komari-agent'))continue;const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].split(' ');processes.push({pid:Number(pid),ppid:Number(stat[1]),executable:exe,config_paths:args.flatMap((v,i)=>v==='--config'?[args[i+1]]:[])})}catch{}}
console.log(JSON.stringify({config:{endpoint_scheme:url.protocol,endpoint_host:url.hostname,has_path_prefix:url.pathname!=='/',interval:cfg.interval,reconnect_interval:cfg.reconnect_interval,token_sha256_prefix:createHash('sha256').update(token).digest('hex').slice(0,12)},processes,agent_unit:run(['systemctl','show','komari-agent','-p','ActiveState','-p','MainPID','-p','NRestarts','-p','FragmentPath','-p','ExecMainStartTimestamp']),units:run(['systemctl','list-units','--all','--no-pager','*komari*']),agent_logs:run(['journalctl','-u','komari-agent','--since','10 minutes ago','-n','500','--no-pager'])}));'''

def main():
    q=json.loads(Path('.github/source-agent-audit-request.json').read_text())
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{5,100}',q['request_id']):raise ValueError('Invalid request identity')
    with open(os.environ['GITHUB_ENV'],'a') as env:env.write('OPS_REQUEST_ID='+q['request_id']+'\n')
    root=Path('production-operation');root.mkdir(exist_ok=True)
    try:
        client=connect()
        try:
            _,out,err=client.exec_command('/opt/yifu-cpa/bin/node --input-type=module -e '+shlex.quote(REMOTE_NODE),timeout=65)
            raw=out.read();error=err.read();code=out.channel.recv_exit_status()
            data=json.loads(raw) if code==0 else {'remote_exit':code,'error':error.decode(errors='replace')[-2000:]}
        finally:client.close()
    except Exception as error:data={'error_type':type(error).__name__,'detail':str(error)[:1500]};code=1
    root.joinpath('owner.enc.json').write_bytes(seal(json.dumps(data).encode(),base64.b64decode(q['owner_public_key']),q['session'],'source-agent-quota-audit'))
    report={'status':'passed' if code==0 else 'partial','mode':'source-agent-quota-audit','read_only':True,'worker_requests_made':0,'private_details_encrypted':True}
    root.joinpath('report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

if __name__=='__main__':main()
