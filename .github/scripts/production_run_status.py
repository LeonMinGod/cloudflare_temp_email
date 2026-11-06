"""Read GitHub run/step metadata only; never fetch command logs or SSH to a server."""
import json,os,subprocess,urllib.request
from pathlib import Path
req=json.loads(Path('.github/production-status-request.json').read_text())
repo=os.environ['GITHUB_REPOSITORY']
def api(path):
    request=urllib.request.Request('https://api.github.com/repos/'+repo+path,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'})
    with urllib.request.urlopen(request,timeout=20) as response:return json.load(response)
runs=api('/actions/workflows/production-ops.yaml/runs?per_page=15')['workflow_runs']
run=next(r for r in runs if r['head_sha'].startswith(req['head_sha']))
result={key:run.get(key) for key in ['id','status','conclusion','run_started_at','updated_at']}
result['jobs']=[]
for job in api('/actions/runs/'+str(run['id'])+'/jobs')['jobs']:
    result['jobs'].append({**{key:job.get(key) for key in ['id','name','status','conclusion','started_at','completed_at']},'steps':[{key:step.get(key) for key in ['number','name','status','conclusion','started_at','completed_at']} for step in job['steps']]})
raw=json.dumps(result,indent=2).encode()
blob=subprocess.check_output(['git','hash-object','-w','--stdin'],input=raw).decode().strip()
tree=subprocess.check_output(['git','mktree'],input=('100644 blob '+blob+'\tstatus.json\n').encode()).decode().strip()
commit=subprocess.check_output(['git','-c','user.name=Read-only Run Status','-c','user.email=run-status@users.noreply.github.com','commit-tree',tree],input=b'Read-only Actions metadata\n').decode().strip()
subprocess.run(['git','push','origin',commit+':refs/heads/operations-status/'+req['request_id']],check=True)
print(raw.decode())
