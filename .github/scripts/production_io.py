"""Public deployment metadata and recipient-encrypted credentials only."""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path

def select():
    path=Path('.github/production-request.json');req=json.loads(path.read_text())
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{5,100}',req['request_id']):raise ValueError('Invalid request identity')
    if req['mode'] not in ['source-health','system-keyring','os-upgrade-audit','komari-style','komari-browser','audit','komari-admin','komari-switch','source-agent','remove-beszel','verify','migration-prepare','migration-export','migration-stage','migration-freeze','migration-switch','migration-observe']:raise ValueError('Invalid monitor operation')
    with open(os.environ['GITHUB_ENV'],'a') as env:env.write('OPS_REQUEST_ID='+req['request_id']+'\nOPS_MODE='+req['mode']+'\n')

def publish():
    root=Path('production-operation');root.mkdir(exist_ok=True);report=root/'report.json'
    if not report.exists():report.write_text(json.dumps({'status':'failed-before-report'}))
    req=os.environ['OPS_REQUEST_ID'];files=[report]
    for name in ['debian-archive-keyring.gpg','business.enc.json','diagnostics.json','audit.enc.json','peer.enc.json','owner.enc.json']:
        path=root/name
        if path.exists():
            if name.endswith('.enc.json'):
                value=json.loads(path.read_text())
                if value.get('format')!='AES-256-GCM+RSA-OAEP-SHA256' or value.get('purpose')!='lmg-production-ops-v1':raise ValueError('Unexpected encrypted output')
            files.append(path)
    manifest={'request_id':req,'run_id':os.environ['GITHUB_RUN_ID'],'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
              'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    root.joinpath('manifest.json').write_text(json.dumps(manifest,indent=2));files.append(root/'manifest.json')
    entries=[]
    for path in sorted(files):
        blob=subprocess.check_output(['git','hash-object','-w','--stdin'],input=path.read_bytes()).decode().strip();entries.append('100644 blob '+blob+'\t'+path.name+'\n')
    tree=subprocess.check_output(['git','mktree'],input=''.join(entries).encode()).decode().strip()
    commit=subprocess.check_output(['git','-c','user.name=RAK Production Operations','-c','user.email=private-vps-monitor@users.noreply.github.com','commit-tree',tree],input=('Private monitor deployment '+req+'\n').encode()).decode().strip()
    subprocess.run(['git','push','origin',commit+':refs/heads/production-results/'+req],check=True)

if __name__=='__main__':{'select':select,'publish':publish}[sys.argv[1]]()
