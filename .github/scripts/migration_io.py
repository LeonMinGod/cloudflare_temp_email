"""Public request/result metadata only; never store secret values in Git results."""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path


def select():
    path=Path('.github/migration-request.json')
    changed=subprocess.check_output(['git','diff-tree','--root','--no-commit-id','--name-only','-r','HEAD'],text=True).splitlines()
    if not path.exists() or str(path) not in changed:
        values={'MIGRATION_MODE':'none','MIGRATION_REQUEST_ID':''}
    else:
        request=json.loads(path.read_text())
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{5,79}',request['request_id']):raise ValueError('Bad request ID')
        if request['mode'] not in ['inventory','prepare','export','import','verify','freeze','switch','resume']:
            raise ValueError('Bad migration mode')
        values={'MIGRATION_MODE':request['mode'],'MIGRATION_REQUEST_ID':request['request_id']}
    with open(os.environ['GITHUB_ENV'],'a') as stream:
        for name,value in values.items():stream.write(name+'='+value+'\n')


def publish():
    request=os.environ.get('MIGRATION_REQUEST_ID','')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{5,79}',request):raise ValueError('Bad result ID')
    root=Path('migration-operation');root.mkdir(exist_ok=True)
    report=root/'report.json'
    if not report.exists():report.write_text(json.dumps({'status':'failed-before-report','mode':os.environ.get('MIGRATION_MODE')}))
    paths=[report]
    for name in ['public.json','diagnostics.json']:
        if (root/name).exists():paths.append(root/name)
    manifest={'request_id':request,'mode':os.environ['MIGRATION_MODE'],'run_id':os.environ['GITHUB_RUN_ID'],
        'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2));paths.append(root/'manifest.json')
    entries=[]
    for path in sorted(paths):
        blob=subprocess.check_output(['git','hash-object','-w','--stdin'],input=path.read_bytes()).decode().strip()
        entries.append('100644 blob '+blob+'\t'+path.name+'\n')
    tree=subprocess.check_output(['git','mktree'],input=''.join(entries).encode()).decode().strip()
    commit=subprocess.check_output(['git','-c','user.name=RAK Migration','-c','user.email=rak-migration@users.noreply.github.com','commit-tree',tree],input=('Migration result '+request+'\n').encode()).decode().strip()
    subprocess.run(['git','push','origin',commit+':refs/heads/rak-migration-results/'+request],check=True)


if __name__=='__main__':{'select':select,'publish':publish}[sys.argv[1]]()
