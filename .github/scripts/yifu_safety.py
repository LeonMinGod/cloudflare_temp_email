"""Bounded resource inspection and safety operations for the dedicated Yifu VPS."""
import json
import shlex
import yaml

ROOT = '/opt/yifu-cpa'


def python_remote(client, source):
    from yifu_vps import run
    return json.loads(run(client, 'python3 -c ' + shlex.quote(source)))


def inspect_resources(client, sftp):
    from yifu_vps import read, private_env
    config = yaml.safe_load(read(sftp, ROOT + '/private/config.yaml'))
    logs = (config.get('observability') or {}).get('logs') or {}
    env = private_env(sftp)
    result = python_remote(client, '''
import os,json,shutil,subprocess
root='/opt/yifu-cpa'
memory={k:int(v.split()[0])*1024 for k,v in (line.split(':',1) for line in open('/proc/meminfo')) if k in ['MemTotal','MemAvailable','SwapTotal','SwapFree']}
disk=shutil.disk_usage(root)
units={}
for unit in ['yifu-cpa','yifu-tunnel','yifu-monitor','yifu-gateway']:
 p=subprocess.run(['systemctl','show',unit,'-p','ActiveState','-p','MainPID','-p','MemoryCurrent','-p','NeedDaemonReload'],capture_output=True,text=True)
 units[unit]=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
sizes={name:os.path.getsize(root+'/data/'+name) if os.path.isfile(root+'/data/'+name) else 0 for name in ['pool.sqlite','pool.sqlite-wal','pool.sqlite-shm']}
logs=sum(os.path.getsize(os.path.join(base,f)) for base,dirs,files in os.walk(root+'/logs') for f in files if not os.path.islink(os.path.join(base,f)))
print(json.dumps({'cpu_count':os.cpu_count(),'load':[float(x) for x in open('/proc/loadavg').read().split()[:3]],'memory_bytes':memory,'disk_bytes':{'total':disk.total,'used':disk.used,'free':disk.free},'services':units,'database_bytes':sizes,'application_log_bytes':logs}))
''')
    result['logging'] = {name: logs.get(name, config.get(name, default)) for name, default in [
        ('logging-to-file', False), ('request-log', False), ('logs-max-total-size-mb', 0), ('error-logs-max-files', 10)]}
    result['static_keys'] = len((config.get('access') or {}).get('api-keys', config.get('api-keys', [])))
    result['bootstrap_enabled'] = bool(env.get('CPA_OAUTH_BOOTSTRAP_FILE'))
    return result
