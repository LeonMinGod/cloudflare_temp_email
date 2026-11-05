"""Read-only source and destination inventory for the owner's staged migration."""
import collections,hashlib,json,os,sys,traceback
from pathlib import Path


def source():
    import yifu_vps as old
    import yifu_key_api as api
    client=old.connect()
    try:
        with client.open_sftp() as sftp:
            old.verify(client,sftp)
            result=json.loads(Path('yifu-operation/verify.json').read_text())
            result.update({'status':'passed','role':'source','services':old.run(client,'systemctl is-active yifu-cpa yifu-tunnel yifu-monitor yifu-gateway yifu-plus || true').splitlines(),
                'root_exists':True,'node_version':old.run(client,'/opt/yifu-cpa/bin/node --version').strip(),
                'binaries_sha256':old.run(client,'sha256sum /opt/yifu-cpa/bin/CLIProxyAPI /opt/yifu-cpa/bin/yifu-gateway /opt/yifu-cpa/bin/cloudflared /opt/yifu-cpa/bin/node').strip(),
                'sizes':old.run(client,'du -sk /opt/yifu-cpa/private /opt/yifu-cpa/auths /opt/yifu-cpa/data /opt/yifu-cpa/plus /opt/yifu-cpa/bin').strip(),
                'runtime_variable_names':sorted(old.private_env(sftp).keys()),
                'shell_tools':old.run(client,'command -v tar; command -v sha256sum').strip()})
        workers={}
        for name in ['leonmingod-home','leonmingod-free-token','cpa-abuse-guard']:
            try:
                settings=api.cf(name+'/settings')
                workers[name]={'version':api.active(name),'bindings':[{'name':b['name'],'type':b['type']} for b in settings.get('bindings',[])]}
            except Exception as exc:workers[name]={'error_type':type(exc).__name__}
        result['cloudflare_workers']=workers
        result['credential_bindings_present']={name:bool(os.environ.get(name)) for name in ['YIFU_SSH_PRIVATE_KEY','YIFU_BACKUP_SECRET','YIFU_OPS_SECRET','CLOUDFLARE_API_TOKEN','KEY_ENC_SECRET','RESEND_API_KEY','FREE_TOKEN_OPS_SECRET','FREE_TOKEN_TURNSTILE_SECRET','FREE_TOKEN_TURNSTILE_SITEKEY']}
        return result
    finally:client.close()


def target():
    import rak_vpn as rak
    client=rak.connect()
    try:
        return {'status':'passed','role':'target','hostname':rak.command(client,'hostname').strip(),
            'resources':rak.command(client,'free -b; df -B1 /').strip(),
            'kernel':rak.command(client,'uname -srmo').strip(),
            'libc':rak.command(client,'getconf GNU_LIBC_VERSION').strip(),
            'services':rak.command(client,'systemctl is-active hysteria-server rak-vpn-subscription rak-vpn-tcp rak-vpn-firewall rak-vpn-traffic.timer || true').splitlines(),
            'new_app_root_exists':rak.command(client,'test ! -e /opt/yifu-cpa && echo absent || echo present').strip(),
            'runtime_tools':rak.command(client,'command -v docker || true; command -v podman || true; command -v python; command -v openssl; /usr/bin/openssl version').strip(),
            'protected_metadata':rak.command(client,"stat -c '%i:%s:%Y' /etc/ssh/sshd_config /etc/shadow /etc/hysteria/config.yaml /etc/hysteria/subscription-caddy.json /etc/hysteria/rak-tcp.json /etc/hysteria/rak-subscription.json").strip()}
    finally:client.close()


def main():
    mode=os.environ['MIGRATION_MODE']
    role=os.environ['MIGRATION_ROLE']
    req=json.loads(Path('.github/migration-request.json').read_text())
    if role=='source' and req.get('operation')=='cloudflare-hooks':
        from migration_cloudflare import hooks
        return hooks()
    if role=='source' and req.get('operation')=='cloudflare-state':
        from migration_cloudflare import state_export
        return state_export()
    if mode=='prepare' and role=='source':
        from migration_source import prepare
        return prepare()
    if mode=='export' and role=='source' and json.loads(Path('.github/migration-request.json').read_text()).get('operation')=='cloudflare-code':
        from migration_cloudflare import capture_export
        return capture_export()
    if mode=='export' and role=='source':
        from migration_snapshot import export
        return export()
    if mode=='verify' and role=='source':
        from migration_source import state_permissions
        return state_permissions()
    if mode!='inventory':raise ValueError('Unsupported migration phase')
    return source() if role=='source' else target()


if __name__=='__main__':
    Path('migration-operation').mkdir(exist_ok=True)
    try:data=main()
    except Exception as exc:
        data={'status':'failed','role':os.environ.get('MIGRATION_ROLE'),'error_type':type(exc).__name__,'error':'Migration operation failed; private outputs withheld','location':[{'file':Path(f.filename).name,'function':f.name,'line':f.lineno} for f in traceback.extract_tb(exc.__traceback__)]}
    Path('migration-operation/report.json').write_text(json.dumps(data,indent=2))
    print(json.dumps(data),flush=True)
    if data['status']!='passed':sys.exit(1)
