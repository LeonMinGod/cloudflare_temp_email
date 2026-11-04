"""Bounded resource inspection and safety operations for the dedicated Yifu VPS."""
import json
import copy
import base64
import hashlib
import os
from pathlib import Path
import shlex
import time
import yaml

ROOT = '/opt/yifu-cpa'


def node_remote(client, source):
    from yifu_vps import run
    return json.loads(run(client, ROOT + '/bin/node --input-type=module -e ' + shlex.quote(source)))


def inspect_resources(client, sftp):
    from yifu_vps import read, private_env
    config = yaml.safe_load(read(sftp, ROOT + '/private/config.yaml'))
    logs = (config.get('observability') or {}).get('logs') or {}
    env = private_env(sftp)
    result = node_remote(client, """
import fs from 'node:fs';import os from 'node:os';import {execFileSync} from 'node:child_process';
const root='/opt/yifu-cpa';
const memory=Object.fromEntries(fs.readFileSync('/proc/meminfo','utf8').split('\\n').filter(x=>/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/.test(x)).map(x=>[x.split(':')[0],Number(x.match(/\\d+/)[0])*1024]));
const disk=fs.statfsSync(root),units={};
for(const unit of ['yifu-cpa','yifu-tunnel','yifu-monitor','yifu-gateway']){let text='';try{text=execFileSync('systemctl',['show',unit,'-p','ActiveState','-p','MainPID','-p','MemoryCurrent','-p','NeedDaemonReload'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{}units[unit]=Object.fromEntries(text.trim().split('\\n').filter(x=>x.includes('=')).map(x=>x.split('=')));}
const sizes=Object.fromEntries(['pool.sqlite','pool.sqlite-wal','pool.sqlite-shm'].map(name=>[name,fs.existsSync(root+'/data/'+name)?fs.statSync(root+'/data/'+name).size:0]));
function bytes(path){let total=0;try{for(const item of fs.readdirSync(path,{withFileTypes:true})){if(item.isSymbolicLink())continue;try{total+=item.isDirectory()?bytes(path+'/'+item.name):fs.statSync(path+'/'+item.name).size;}catch{}}}catch{}return total;}
console.log(JSON.stringify({cpu_count:os.availableParallelism(),load:os.loadavg(),memory_bytes:memory,disk_bytes:{total:disk.blocks*disk.bsize,used:(disk.blocks-disk.bfree)*disk.bsize,free:disk.bavail*disk.bsize},services:units,database_bytes:sizes,application_log_bytes:bytes(root+'/logs')}));
""")
    result['logging'] = {name: logs.get(name, config.get(name, default)) for name, default in [
        ('logging-to-file', False), ('request-log', False), ('logs-max-total-size-mb', 0), ('error-logs-max-files', 10)]}
    result['static_keys'] = len((config.get('access') or {}).get('api-keys', config.get('api-keys', [])))
    result['bootstrap_enabled'] = bool(env.get('CPA_OAUTH_BOOTSTRAP_FILE'))
    return result


LOGS = {'logs-max-total-size-mb': 50, 'error-logs-max-files': 5, 'request-log': False}
JOURNAL = '[Journal]\nSystemMaxUse=32M\nRuntimeMaxUse=16M\nSystemKeepFree=256M\nRuntimeKeepFree=64M\nMaxRetentionSec=7day\n'
HOSTS = {'yifu.leonmingod.com', 'yifu-origin.leonmingod.com'}
TUNNEL = 'de798c3f-002c-4a28-8e7f-baa9780cfe6b'


def patch_logs(config, values=LOGS):
    result = copy.deepcopy(config)
    native = (result.get('observability') or {}).get('logs')
    for name, value in values.items():
        if name in result or native is None:
            result[name] = value
        if native is not None:
            native[name] = value
    return result


def route_gateway(config):
    result = copy.deepcopy(config)
    ordinary = [r for r in result.get('ingress', []) if r.get('hostname') in HOSTS and not r.get('path')]
    if len(ordinary) != 2 or any(r.get('service') not in ['http://127.0.0.1:8317', 'http://127.0.0.1:8319'] for r in ordinary):
        raise ValueError('Unexpected Tunnel route; refusing to overwrite')
    for route in ordinary:
        route['service'] = 'http://127.0.0.1:8319'
    return result


def tunnel(method='GET', config=None):
    import yifu_key_api as api
    path = '/accounts/' + os.environ['CLOUDFLARE_ACCOUNT_ID'].strip() + '/cfd_tunnel/' + TUNNEL + '/configurations'
    body = {'config': config} if config is not None else None
    raw = api.request('https://api.cloudflare.com/client/v4' + path, method, body,
        {'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'].strip()})[2]
    result = json.loads(raw)
    if not result.get('success'):
        raise RuntimeError('Tunnel configuration request rejected')
    return result['result']


def keys_of(config):
    return (config.get('access') or {}).get('api-keys', config.get('api-keys', []))


def logging_values(config):
    nested = (config.get('observability') or {}).get('logs') or {}
    return {name: nested.get(name, config.get(name, default)) for name, default in [
        ('logs-max-total-size-mb', 0), ('error-logs-max-files', 10), ('request-log', False)]}


def config_without_limits(config):
    result = copy.deepcopy(config)
    for name in LOGS:
        result.pop(name, None)
        (result.get('observability') or {}).get('logs', {}).pop(name, None)
    return result


def auth_state(sftp):
    from yifu_vps import read
    result = {}
    for item in sftp.listdir_attr(ROOT + '/auths'):
        if not item.filename.endswith('.json') or item.st_mode & 0o170000 != 0o100000:
            continue
        data = json.loads(read(sftp, ROOT + '/auths/' + item.filename))
        result[item.filename] = bool(data.get('disabled'))
    return result


def write_config(client, sftp, config):
    from yifu_vps import write, run
    temporary = ROOT + '/private/config.safety-next.yaml'
    write(sftp, temporary, yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
    run(client, 'chown cpa:cpa ' + temporary)
    sftp.posix_rename(temporary, ROOT + '/private/config.yaml')


def public_probe(config, model=None, stream=False):
    import urllib.request
    import urllib.error
    root = 'https://yifu.leonmingod.com'
    key = keys_of(config)[0]
    headers = {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'Yifu-Safety-Verification/1.0'}
    path = '/v1/chat/completions' if model else '/v1/models'
    payload = json.dumps({'model': model, 'messages': [{'role': 'user', 'content': 'Reply with exactly OK.'}], 'stream': stream, 'max_tokens': 16}).encode() if model else None
    try:
        with urllib.request.urlopen(urllib.request.Request(root + path, data=payload, headers=headers), timeout=90) as response:
            # The timeout bounds this operational probe, not production requests.
            raw = response.read(2 * 1024 * 1024)
            result = {'http': response.status, 'admission': response.headers.get('X-Yifu-Admission')}
            if not model:
                data = json.loads(raw)['data']
                result['models'] = len(data)
                result['model_ids'] = [row['id'] for row in data]
            elif stream:
                chunks = []
                for line in raw.decode().splitlines():
                    if line.startswith('data: ') and line[6:] != '[DONE]':
                        value = json.loads(line[6:]);chunks.extend(choice.get('delta', {}).get('content', '') for choice in value.get('choices', []))
                result.update({'generated': bool(''.join(chunks)), 'done': b'data: [DONE]' in raw})
            else:
                value = json.loads(raw)
                result['generated'] = bool(value.get('choices', [{}])[0].get('message', {}).get('content'))
            return result
    except urllib.error.HTTPError as error:
        return {'http': error.code, 'generated': False}
    except Exception as error:
        return {'http': None, 'generated': False, 'error_type': type(error).__name__}


def apply_safety(client, sftp):
    from yifu_vps import read, write, run, report, backup
    backup(client, sftp, 'backup-before')
    before = inspect_resources(client, sftp)
    original = yaml.safe_load(read(sftp, ROOT + '/private/config.yaml'))
    credentials = auth_state(sftp)
    if before['bootstrap_enabled'] or before['services']['yifu-cpa']['ActiveState'] != 'active':
        raise RuntimeError('CPA baseline is not safe for an update')
    old_tunnel = tunnel()['config']
    new_tunnel = route_gateway(old_tunnel)
    inventory = public_probe(original)
    if inventory.get('http') != 200 or not inventory.get('models'):
        raise RuntimeError('Baseline model API unavailable; no changes applied')
    model = next((m for m in ['gpt-6.1-sol', 'gpt-6.1-terra', 'grok-4.7'] if m in inventory['model_ids']), None)
    baseline = {kind: public_probe(original, model, stream) for kind, stream in [('nonstream', False), ('stream', True)]} if model else {}
    journal_path = '/etc/systemd/journald.conf.d/60-yifu-budget.conf'
    try:
        with sftp.open(journal_path, 'rb') as file:
            old_journal = file.read()
    except FileNotFoundError:
        old_journal = None
    baseline_path = ROOT + '/private/safety-baseline-v1.json'
    try:
        sftp.stat(baseline_path)
    except FileNotFoundError:
        write(sftp, baseline_path, json.dumps({'logging': logging_values(original), 'tunnel': old_tunnel,
            'journal': base64.b64encode(old_journal).decode() if old_journal is not None else None}))
    binary = Path('yifu-gateway').read_bytes()
    expected = hashlib.sha256(binary).hexdigest()
    current = node_remote(client, "import fs from 'node:fs';import {createHash} from 'node:crypto';const p='/opt/yifu-cpa/bin/yifu-gateway';console.log(JSON.stringify({hash:fs.existsSync(p)?createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null}));")['hash']
    if current and current != expected:
        raise RuntimeError('Existing gateway differs; use a drained gateway update instead')
    write(sftp, ROOT + '/bin/yifu-gateway.next', binary, 0o755)
    actual = run(client, 'sha256sum ' + ROOT + '/bin/yifu-gateway.next').split()[0]
    if actual != expected:
        raise RuntimeError('Gateway binary checksum mismatch')
    sftp.posix_rename(ROOT + '/bin/yifu-gateway.next', ROOT + '/bin/yifu-gateway')
    unit = '[Unit]\nDescription=Yifu bounded streaming admission gateway\nAfter=network-online.target yifu-cpa.service\n\n[Service]\nType=simple\nUser=cpa\nGroup=cpa\nWorkingDirectory=/opt/yifu-cpa\nEnvironment=GOMEMLIMIT=32MiB\nExecStart=/opt/yifu-cpa/bin/yifu-gateway\nRestart=on-failure\nRestartSec=3\nTimeoutStopSec=infinity\nUMask=0077\nNoNewPrivileges=true\n\n[Install]\nWantedBy=multi-user.target\n'
    write(sftp, ROOT + '/systemd/yifu-gateway.service', unit, 0o644)
    run(client, 'install -m 0644 /opt/yifu-cpa/systemd/yifu-gateway.service /etc/systemd/system/yifu-gateway.service; systemctl daemon-reload; systemctl enable --now yifu-gateway >/dev/null 2>&1')
    modified_tunnel = False
    try:
        ready = False
        for _ in range(20):
            try:
                health = json.loads(run(client, 'curl -fsS http://127.0.0.1:8319/_gateway/healthz'))
                if health['ok'] and health['maximum'] == 4:
                    ready = True;break
            except RuntimeError:
                pass
            time.sleep(0.3)
        if not ready:
            raise RuntimeError('Gateway failed local readiness; CPA route unchanged')
        patched = patch_logs(original)
        assert config_without_limits(patched) == config_without_limits(original)
        write_config(client, sftp, patched)
        write(sftp, ROOT + '/systemd/yifu-journal.conf', JOURNAL, 0o644)
        run(client, 'install -d -m 0755 /etc/systemd/journald.conf.d; install -m 0644 /opt/yifu-cpa/systemd/yifu-journal.conf /etc/systemd/journald.conf.d/60-yifu-budget.conf; systemctl restart systemd-journald')
        # Re-read before routing so a concurrent operator's Tunnel changes are preserved.
        if tunnel()['config'] != old_tunnel:
            raise RuntimeError('Tunnel changed concurrently; refusing to overwrite')
        tunnel('PUT', new_tunnel);modified_tunnel = True
        after_models = None
        for _ in range(20):
            after_models = public_probe(patched)
            if after_models.get('http') == 200 and after_models.get('admission') == 'v1':break
            time.sleep(1)
        if after_models.get('http') != 200 or after_models.get('admission') != 'v1':
            raise RuntimeError('Public gateway readiness failed')
        after_inference = {kind: public_probe(patched, model, stream) for kind, stream in [('nonstream', False), ('stream', True)]} if model else {}
        for kind, prior in baseline.items():
            if prior.get('generated') and (not after_inference[kind].get('generated') or (kind == 'stream' and not after_inference[kind].get('done'))):
                raise RuntimeError('Previously working generation failed after update')
        after = inspect_resources(client, sftp)
        current_config = yaml.safe_load(read(sftp, ROOT + '/private/config.yaml'))
        assert keys_of(current_config) == keys_of(original), 'Static key configuration changed'
        assert config_without_limits(current_config) == config_without_limits(original), 'Non-logging configuration changed'
        assert logging_values(current_config) == LOGS
        for name in ['yifu-cpa', 'yifu-tunnel', 'yifu-monitor']:
            assert after['services'][name]['ActiveState'] == 'active'
            assert after['services'][name]['MainPID'] == before['services'][name]['MainPID'], 'Existing application restarted'
        after_auth = auth_state(sftp)
        assert all(after_auth.get(name) == disabled for name, disabled in credentials.items()), 'Existing credential set/disabled state changed'
        assert not after['bootstrap_enabled']
        backup(client, sftp, 'backup-after')
        report('safety', {'global_inflight': 4, 'per_key_inflight': 2, 'queued_maximum': 4, 'queue_wait_seconds': 2,
            'maximum_body_mib': 16, 'retry_after_seconds': 2, 'binary_sha256': expected,
            'cpa_tunnel_monitor_pids_unchanged': True, 'static_keys_unchanged': True, 'auths_disabled_flags_preserved': True,
            'logging': LOGS, 'journald_persistent_max_mib': 32, 'journald_runtime_max_mib': 16,
            'models': after_models['models'], 'model': model, 'baseline_inference': baseline, 'after_inference': after_inference,
            'disk_bytes': after['disk_bytes'], 'database_bytes': after['database_bytes']})
    except Exception:
        if modified_tunnel and tunnel()['config'] == new_tunnel:
            tunnel('PUT', old_tunnel)
        current_config = yaml.safe_load(read(sftp, ROOT + '/private/config.yaml'))
        if config_without_limits(current_config) == config_without_limits(original):
            write_config(client, sftp, patch_logs(current_config, logging_values(original)))
        if old_journal is None:
            try:sftp.remove(journal_path)
            except FileNotFoundError:pass
        else:
            with sftp.open(journal_path, 'wb') as file:file.write(old_journal)
        run(client, 'systemctl restart systemd-journald')
        # Keep the gateway alive to drain any streams already routed to it.
        raise


def rollback_safety(client, sftp):
    from yifu_vps import read, write, run, backup, report
    backup(client, sftp, 'backup-before')
    baseline = json.loads(read(sftp, ROOT + '/private/safety-baseline-v1.json'))
    current = tunnel()['config']
    if current not in [baseline['tunnel'], route_gateway(baseline['tunnel'])]:
        raise RuntimeError('Tunnel changed since safety deployment; manual review required')
    tunnel('PUT', baseline['tunnel'])
    config = yaml.safe_load(read(sftp, ROOT + '/private/config.yaml'))
    write_config(client, sftp, patch_logs(config, baseline['logging']))
    path = '/etc/systemd/journald.conf.d/60-yifu-budget.conf'
    if baseline.get('journal') is None:
        try:sftp.remove(path)
        except FileNotFoundError:pass
    else:
        with sftp.open(path, 'wb') as file:file.write(base64.b64decode(baseline['journal'], validate=True))
    run(client, 'systemctl restart systemd-journald')
    backup(client, sftp, 'backup-after')
    report('safety-rollback', {'direct_cpa_route_restored': True, 'gateway_left_running_to_drain': True,
        'auths_and_keys_not_restored_from_snapshot': True})
