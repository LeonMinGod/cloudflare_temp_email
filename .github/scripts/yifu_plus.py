"""Install the pinned native CPAMP release without restarting the public CPA."""
import hashlib
import io
import json
import os
from pathlib import Path
import shlex
import tarfile
import time
import urllib.request
import urllib.error

from yifu_vps import ROOT, backup, connect, private_env, read, report, run, write
from yifu_safety import auth_state, inspect_resources, public_probe, keys_of

VERSION = 'v1.14.10'
ARCHIVE_SHA256 = '113a651af78f4dd8c5279e03348729411d964043d74bbd338147dafa2bcb8d86'
PLUS = ROOT + '/plus'
CONFIG = ROOT + '/private/plus-config.json'
ADMIN = ROOT + '/private/plus-admin.key'
BINARY = ROOT + '/bin/cpa-manager-plus'
ORIGIN = 'https://yifuplus.leonmingod.com'


def native_binary(path):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA256:
        raise ValueError('Pinned CPAMP archive checksum mismatch')
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        item = archive.getmember('cpa-manager-plus_v1.14.10_linux_amd64/cpa-manager-plus')
        if not item.isfile() or item.size > 64 * 1024 * 1024:
            raise ValueError('Unexpected native binary')
        return archive.extractfile(item).read()


def plus_config():
    return {'httpAddr': '127.0.0.1:18317', 'dataDir': PLUS,
            'dbPath': PLUS + '/usage.sqlite', 'dataKeyPath': PLUS + '/data.key',
            'adminKeyFile': ADMIN, 'collectorMode': 'auto', 'queue': 'usage',
            'popSide': 'right', 'batchSize': 100, 'pollIntervalMs': 30000,
            'queryLimit': 5000, 'corsOrigins': [ORIGIN],
            'quotaCooldownEnabled': False, 'accountActionsEnabled': False,
            'accountActionsAutoDisable': False}


UNIT = '''[Unit]
Description=Yifu CPA Manager Plus
After=network-online.target yifu-cpa.service

[Service]
Type=simple
User=cpa
Group=cpa
WorkingDirectory=/opt/yifu-cpa/plus
Environment=CPA_MANAGER_CONFIG=/opt/yifu-cpa/private/plus-config.json
Environment=GOMEMLIMIT=64MiB
Environment=GOMAXPROCS=1
Environment=USAGE_IMPORT_DISK_QUOTA_BYTES=16777216
Environment=USAGE_IMPORT_MAX_SESSIONS=1
ExecStart=/opt/yifu-cpa/bin/cpa-manager-plus
Restart=on-failure
RestartSec=10
TimeoutStopSec=60
MemoryHigh=96M
MemoryMax=128M
CPUQuota=35%
Nice=10
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/yifu-cpa/plus

[Install]
WantedBy=multi-user.target
'''

# No cloud requests or database writes: pause only this optional panel if its
# retained files exceed the budget or the machine has little free disk left.
BUDGET_SCRIPT = '''import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root='/opt/yifu-cpa/plus';
function bytes(p){let n=0;for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.isSymbolicLink())continue;const q=p+'/'+e.name;n+=e.isDirectory()?bytes(q):fs.statSync(q).size;}return n;}
const s=fs.statfsSync(root),used=bytes(root),free=s.bavail*s.bsize;
if(used>32*1024*1024||free<200*1024*1024){execFileSync('systemctl',['stop','yifu-plus']);console.log('Optional CPAMP paused to protect CPA: bytes='+used+' free='+free);}
'''
BUDGET_UNIT = '''[Unit]
Description=Protect Yifu CPA disk from optional CPAMP history growth
[Service]
Type=oneshot
ExecStart=/opt/yifu-cpa/bin/node /usr/local/libexec/yifu-plus-budget.mjs
Nice=19
NoNewPrivileges=true
'''
BUDGET_TIMER = '''[Unit]
Description=Check optional CPAMP disk budget every five minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
AccuracySec=30s
[Install]
WantedBy=timers.target
'''


def local_request(client, path, method='GET', payload=None, authenticated=True):
    source = """
import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync('/opt/yifu-cpa/private/runtime.env','utf8').trim().split('\\n').filter(Boolean).map(l=>{const at=l.indexOf('=');return [l.slice(0,at),JSON.parse(l.slice(at+1))];}));
const options={method:METHOD,headers:{'Content-Type':'application/json'}};
if(AUTH)options.headers.Authorization='Bearer '+env.MANAGEMENT_PASSWORD;
if(BODY!==null)options.body=JSON.stringify(BODY);
const r=await fetch('http://127.0.0.1:18317'+PATH,{...options,signal:AbortSignal.timeout(30000)});
const text=await r.text();let body;try{body=JSON.parse(text);}catch{body={};}
console.log(JSON.stringify({http:r.status,body}));
"""
    for key, value in [('METHOD', method), ('AUTH', authenticated), ('BODY', payload), ('PATH', path)]:
        source = source.replace(key, json.dumps(value))
    return json.loads(run(client, ROOT + '/bin/node --input-type=module -e ' + shlex.quote(source)))


def ensure_unchanged(client, sftp, before, config, credentials):
    import yaml
    after = inspect_resources(client, sftp)
    assert read(sftp, ROOT + '/private/config.yaml') == config, 'CPA config changed'
    now = auth_state(sftp)
    assert all(now.get(name) == disabled for name, disabled in credentials.items()), 'Credential state changed'
    for name in ['yifu-cpa', 'yifu-tunnel', 'yifu-monitor', 'yifu-gateway']:
        assert after['services'][name]['ActiveState'] == 'active'
        assert after['services'][name]['MainPID'] == before['services'][name]['MainPID'], 'Existing service restarted'
    assert keys_of(yaml.safe_load(config)) and not after['bootstrap_enabled']
    return after


def collector_summary(value):
    fields = ['collector', 'mode', 'transport', 'lastConsumedAt', 'lastInsertedAt', 'totalInserted', 'totalSkipped', 'deadLetters']
    return {**{name: value[name] for name in fields if name in value}, 'has_error': bool(value.get('lastError'))}


def deploy(client, sftp):
    backup(client, sftp, 'backup-before')
    before = inspect_resources(client, sftp)
    if before['disk_bytes']['free'] < 300 * 1024 * 1024 or before['memory_bytes']['MemAvailable'] < 200 * 1024 * 1024:
        raise RuntimeError('Insufficient free resources for an optional panel')
    config = read(sftp, ROOT + '/private/config.yaml')
    credentials = auth_state(sftp)
    try:
        sftp.stat(PLUS + '/usage.sqlite')
        raise RuntimeError('CPAMP database already exists; refusing to overwrite existing setup')
    except FileNotFoundError:
        pass
    raw = native_binary('cpamp-native.tar.gz')
    run(client, 'install -d -o cpa -g cpa -m 0700 ' + PLUS)
    write(sftp, BINARY + '.next', raw, 0o755)
    assert run(client, 'sha256sum ' + BINARY + '.next').split()[0] == hashlib.sha256(raw).hexdigest()
    sftp.posix_rename(BINARY + '.next', BINARY)
    assert run(client, BINARY + ' --version').strip() == VERSION
    write(sftp, CONFIG, json.dumps(plus_config(), indent=2))
    password = private_env(sftp)['MANAGEMENT_PASSWORD'].strip()
    assert password
    write(sftp, ADMIN, password)
    run(client, 'chown cpa:cpa ' + CONFIG + ' ' + ADMIN)
    # Import into an encrypted database before opening the panel. Neither secret
    # appears in a command line, build artifact, browser source or public report.
    command = ('runuser -u cpa -- env CPA_MANAGER_CONFIG=' + CONFIG + ' GOMEMLIMIT=64MiB ' + BINARY +
               ' store-cpa-connection --cpa-base-url http://127.0.0.1:8317 --management-key-file ' + ADMIN)
    run(client, command)
    for name, content in [('yifu-plus.service', UNIT), ('yifu-plus-budget.service', BUDGET_UNIT),
                          ('yifu-plus-budget.timer', BUDGET_TIMER), ('plus-budget.mjs', BUDGET_SCRIPT)]:
        write(sftp, ROOT + '/systemd/' + name, content, 0o644)
    run(client, 'install -m 0644 /opt/yifu-cpa/systemd/yifu-plus.service /opt/yifu-cpa/systemd/yifu-plus-budget.service /opt/yifu-cpa/systemd/yifu-plus-budget.timer /etc/systemd/system/')
    run(client, 'install -d -o root -g root -m 0755 /usr/local/libexec; install -o root -g root -m 0644 /opt/yifu-cpa/systemd/plus-budget.mjs /usr/local/libexec/yifu-plus-budget.mjs')
    try:
        run(client, 'systemctl daemon-reload; systemctl enable --now yifu-plus yifu-plus-budget.timer >/dev/null 2>&1')
        ready = False
        for _ in range(30):
            try:
                result = local_request(client, '/status')
                if result['http'] == 200:
                    ready = True
                    break
            except RuntimeError:
                pass
            time.sleep(0.5)
        if not ready:
            raise RuntimeError('CPAMP did not pass local authenticated readiness')
        assert local_request(client, '/status', authenticated=False)['http'] == 401
        assert local_request(client, '/v0/management/auth-files')['http'] == 200
        assert local_request(client, '/v0/management/cpa-connection/validate', 'POST')['http'] == 200
        cfg = local_request(client, '/usage-service/config')['body']['config']
        assert cfg['cpaConnection']['managementKeyConfigured']
        assert cfg['cpaConnection']['cpaBaseUrl'] == 'http://127.0.0.1:8317'
        assert cfg['collector']['pollIntervalMs'] == 30000
        assert not cfg['codexInspection']['enabled']
        after = ensure_unchanged(client, sftp, before, config, credentials)
        backup(client, sftp, 'backup-after')
        report('plus-staged', {'version': VERSION, 'archive_sha256': ARCHIVE_SHA256,
            'binary_sha256': hashlib.sha256(raw).hexdigest(), 'loopback_port': 18317,
            'local_admin_login_http': 200, 'unauthenticated_http': 401, 'credential_proxy_http': 200,
            'admin_password_matches_cpa': True, 'connection_encrypted': True,
            'collector': collector_summary(result['body'].get('collector') or {}), 'existing_processes_unchanged': True,
            'cpa_config_and_keys_unchanged': True, 'credential_states_preserved': True,
            'memory_limit_mib': 128, 'cpu_quota_percent': 35,
            'disk_pause_threshold_mib': 32, 'minimum_free_disk_mib': 200,
            'requires_tunnel_and_dns_activation': True,
            'memory_available_bytes': after['memory_bytes']['MemAvailable'],
            'disk_free_bytes': after['disk_bytes']['free']})
    except Exception:
        run(client, 'systemctl disable --now yifu-plus yifu-plus-budget.timer >/dev/null 2>&1')
        # Preserve the fresh encrypted DB/key for diagnosis; never restore CPA.
        raise


def verify(client, sftp):
    import yaml
    config = read(sftp, ROOT + '/private/config.yaml')
    credentials = auth_state(sftp)
    before = inspect_resources(client, sftp)
    password = private_env(sftp)['MANAGEMENT_PASSWORD'].strip()
    assert read(sftp, ADMIN).decode().strip() == password
    for path in ['/status', '/v0/management/auth-files', '/usage-service/config']:
        request = urllib.request.Request(ORIGIN + path, headers={'Authorization': 'Bearer ' + password, 'User-Agent': 'Yifu-Plus-Verification/1.0'})
        with urllib.request.urlopen(request, timeout=45) as response:
            assert response.status == 200
            json.load(response)
    try:
        urllib.request.urlopen(urllib.request.Request(ORIGIN + '/status', headers={'User-Agent': 'Yifu-Plus-Verification/1.0'}), timeout=30)
        raise AssertionError('Unauthenticated admin data was exposed')
    except urllib.error.HTTPError as error:
        assert error.code == 401
    status_before = local_request(client, '/status')['body']
    inventory = public_probe(yaml.safe_load(config))
    model = next((m for m in ['gpt-6.1-sol', 'gpt-6.1-terra', 'grok-4.7'] if m in inventory.get('model_ids', [])), None)
    assert model, 'No suitable live canary model'
    inference = {kind: public_probe(yaml.safe_load(config), model, stream) for kind, stream in [('nonstream', False), ('stream', True)]}
    assert all(x.get('generated') for x in inference.values()) and inference['stream'].get('done')
    status_after = status_before
    for _ in range(20):
        status_after = local_request(client, '/status')['body']
        if status_after['events'] > status_before['events']:
            break
        time.sleep(1)
    assert status_after['events'] > status_before['events'], 'Live request was not recorded by CPAMP'
    ensure_unchanged(client, sftp, before, config, credentials)
    backup(client, sftp, 'backup-after')
    report('plus', {'origin': ORIGIN, 'version': VERSION, 'admin_password_matches_cpa': True,
        'public_admin_api_http': 200, 'public_unauthenticated_http': 401,
        'collector': collector_summary(status_after.get('collector') or {}), 'events_increased': True,
        'model': model, 'inference': inference, 'cpa_config_and_keys_unchanged': True,
        'existing_processes_unchanged': True, 'credential_states_preserved': True,
        'service': run(client, 'systemctl show yifu-plus -p ActiveState -p MemoryCurrent -p MemoryMax').strip().splitlines()})


def main():
    client = connect()
    try:
        with client.open_sftp() as sftp:
            mode = os.environ['YIFU_MODE']
            if mode == 'deploy-plus':
                deploy(client, sftp)
            elif mode == 'verify-plus':
                verify(client, sftp)
            else:
                raise ValueError('Unsupported CPAMP operation')
    finally:
        client.close()


if __name__ == '__main__':
    main()
