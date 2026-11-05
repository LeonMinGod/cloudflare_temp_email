"""Operate only the owner's new San Jose host, without changing SSH credentials."""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import shlex
import subprocess
import time
import urllib.parse
import urllib.request

import paramiko
import yaml
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HOST = '198.247.1.206'
PORT = 22881
HOST_PIN = Path('.github/known_hosts/rak-sj')
DOMAIN = 'sj.leonmingod.com'
VERSION = 'v2.13.0'
RELEASE = 'https://github.com/HyNetworks/hysteria/releases/download/app/v2.13.0/hysteria-linux-amd64'
BINARY_SHA256 = '907ba8c9693edb104b20582681fb7dc15639d5b64a9cbb616a7b539190a86691'
PURPOSE = b'RAK-VPN-198.247.1.206-v1'


def write(sftp, path, data, mode=0o600):
    with sftp.open(path + '.next', 'wb') as f:
        f.write(data.encode() if isinstance(data, str) else data)
    sftp.chmod(path + '.next', mode)
    sftp.posix_rename(path + '.next', path)


def read(sftp, path):
    with sftp.open(path, 'rb') as f:
        return f.read()


def public_delivery_key():
    raw = base64.b64decode(os.environ.get('RAK_OUTPUT_PUBLIC_KEY', ''), validate=True)
    key = serialization.load_pem_public_key(raw)
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 2048:
        raise ValueError('A valid RSA delivery public key is required')
    return key


def encrypt_share(value, key):
    secret, nonce = os.urandom(32), os.urandom(12)
    wrapped = key.encrypt(secret, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    envelope = {'format': 'AES-256-GCM+RSA-OAEP-SHA256', 'purpose': PURPOSE.decode(),
        'wrapped_key': base64.b64encode(wrapped).decode(), 'nonce': base64.b64encode(nonce).decode(),
        'ciphertext': base64.b64encode(AESGCM(secret).encrypt(nonce, json.dumps(value).encode(), PURPOSE)).decode()}
    Path('rak-operation').mkdir(exist_ok=True)
    Path('rak-operation/share.enc.json').write_text(json.dumps(envelope))


def download_binary():
    target = Path('hysteria-linux-amd64')
    if not target.exists():
        with urllib.request.urlopen(RELEASE, timeout=90) as r:
            raw = r.read(40 * 1024 * 1024)
        if hashlib.sha256(raw).hexdigest() != BINARY_SHA256:
            raise RuntimeError('Official Hysteria binary checksum mismatch')
        target.write_bytes(raw)
    if hashlib.sha256(target.read_bytes()).hexdigest() != BINARY_SHA256:
        raise RuntimeError('Unexpected Hysteria binary')
    target.chmod(0o755)
    return target.resolve()


def server_config(auth, obfs, stats):
    return {'listen': '0.0.0.0:443',
        'acme': {'domains': [DOMAIN], 'ca': 'letsencrypt', 'type': 'tls',
                 'listenHost': '0.0.0.0', 'dir': '/var/lib/hysteria/acme'},
        'auth': {'type': 'userpass', 'userpass': {'leon': auth}},
        'obfs': {'type': 'salamander', 'salamander': {'password': obfs}},
        'speedTest': False,
        'trafficStats': {'listen': '127.0.0.1:9999', 'secret': stats},
        'masquerade': {'type': 'file', 'file': {'dir': '/var/www/rak-sj'}},
        'outbounds': [{'name': 'directv4', 'type': 'direct', 'direct': {'mode': '4'}}],
        'acl': {'inline': ['reject(127.0.0.0/8)', 'reject(10.0.0.0/8)',
                          'reject(172.16.0.0/12)', 'reject(192.168.0.0/16)',
                          'reject(169.254.0.0/16)', 'reject(::1/128)',
                          'reject(fc00::/7)', 'reject(fe80::/10)', 'directv4(all)']}}


FIREWALL = '''*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]
-A INPUT -i lo -j ACCEPT
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -m conntrack --ctstate INVALID -j DROP
-A INPUT -p icmp -j ACCEPT
-A INPUT -p tcp --dport 22881 -j ACCEPT
-A INPUT -p udp --dport 443 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT
COMMIT
'''
SERVICE = '''[Unit]
Description=RAK San Jose Hysteria2
After=network-online.target rak-vpn-firewall.service
Wants=network-online.target
Requires=rak-vpn-firewall.service
[Service]
Type=simple
User=root
WorkingDirectory=/var/lib/hysteria
Environment=GOMEMLIMIT=256MiB
ExecStart=/usr/local/bin/hysteria server --config /etc/hysteria/config.yaml --log-level warn
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
MemoryLimit=384M
NoNewPrivileges=true
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
UMask=0077
[Install]
WantedBy=multi-user.target
'''
FW_SERVICE = '''[Unit]
Description=RAK VPN minimal IPv4 firewall
Before=network-pre.target hysteria-server.service
Wants=network-pre.target
After=local-fs.target
[Service]
Type=oneshot
ExecStart=/bin/sh -c '/sbin/iptables-restore < /etc/hysteria/firewall.v4'
RemainAfterExit=true
[Install]
WantedBy=multi-user.target
'''
METER = '''#!/usr/bin/python
from __future__ import print_function
import datetime,json,os,subprocess,sys
path='/var/lib/hysteria/traffic-meter.json'
route=subprocess.check_output(['ip','-4','route','show','default']).decode().split()
interface=route[route.index('dev')+1]
now={name:int(open('/sys/class/net/'+interface+'/statistics/'+name+'_bytes').read()) for name in ['rx','tx']}
try:state=json.load(open(path))
except IOError:state={'started_at':datetime.datetime.utcnow().isoformat()+'Z','interface':interface,'last':now,'months':{}}
month=(datetime.datetime.utcnow()+datetime.timedelta(hours=8)).strftime('%Y-%m')
row=state['months'].setdefault(month,{'rx_bytes':0,'tx_bytes':0})
for name in ['rx','tx']:
 old=state.get('last',{}).get(name,now[name]);row[name+'_bytes']+=now[name]-old if now[name]>=old else now[name]
state['last']=now;state['updated_at']=datetime.datetime.utcnow().isoformat()+'Z';state['monthly_reference_bytes']=1000000000000
state['months']={k:v for k,v in state['months'].items() if k in sorted(state['months'])[-12:]}
temporary=path+'.next'
with open(temporary,'w') as f:json.dump(state,f)
os.chmod(temporary,0o600);os.rename(temporary,path)
total=row['rx_bytes']+row['tx_bytes']
if total>=900000000000 and state.get('warned_month')!=month:
 print('RAK VPN local traffic reached 900GB; inspect provider billing before further heavy use')
 state['warned_month']=month
 with open(temporary,'w') as f:json.dump(state,f)
 os.chmod(temporary,0o600);os.rename(temporary,path)
if '--show' in sys.argv:print(json.dumps(state,sort_keys=True))
'''
METER_SERVICE = '''[Unit]
Description=Record RAK local traffic without network probes
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/rak-vpn-traffic
Nice=19
'''
METER_TIMER = '''[Unit]
Description=Record RAK VPN traffic every five minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
AccuracySec=30s
[Install]
WantedBy=timers.target
'''


def deploy(client):
    delivery = public_delivery_key()
    binary = download_binary()
    ssh_baseline = command(client, "stat -c '%i:%s:%Y' /etc/ssh/sshd_config /etc/shadow")
    assert 'port 22881' in command(client, '/usr/sbin/sshd -T')
    assert command(client, 'hostname').split('.')[0] == 'V20261105060164-001'
    command(client, 'command -v iptables-restore >/dev/null; command -v iptables-save >/dev/null')
    with client.open_sftp() as sftp:
        marker = {}
        try:
            existing = yaml.safe_load(read(sftp, '/etc/hysteria/config.yaml'))
            marker = json.loads(read(sftp, '/etc/hysteria/rak-managed.json'))
            if marker.get('host') != HOST:
                raise RuntimeError('Existing VPN configuration is not owned by this installation')
        except FileNotFoundError:
            existing = None
            try:
                sftp.stat('/etc/hysteria/config.yaml')
                raise RuntimeError('Refusing to overwrite an existing unrecognized VPN configuration')
            except FileNotFoundError:
                pass
        stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
        backup = '/root/rak-vpn-backup-' + stamp
        command(client, 'install -d -m 0700 ' + backup + ' /etc/hysteria /var/lib/hysteria; install -d -m 0755 /var/www/rak-sj')
        previous = command(client, '/sbin/iptables-save')
        write(sftp, backup + '/iptables.v4', previous)
        write(sftp, '/usr/local/bin/hysteria.next-upload', binary.read_bytes(), 0o755)
        assert command(client, 'sha256sum /usr/local/bin/hysteria.next-upload').split()[0] == BINARY_SHA256
        version = command(client, '/usr/local/bin/hysteria.next-upload version')
        assert VERSION in version, 'Native binary is not compatible with this system'
        sftp.posix_rename('/usr/local/bin/hysteria.next-upload', '/usr/local/bin/hysteria')
        config = existing or server_config(secrets.token_urlsafe(32), secrets.token_urlsafe(24), secrets.token_urlsafe(32))
        write(sftp, '/etc/hysteria/rak-managed.json', json.dumps({'host': HOST, 'domain': DOMAIN, 'version': VERSION,
            'backup': backup, 'original_firewall_backup': marker.get('original_firewall_backup', backup)}))
        write(sftp, '/etc/hysteria/config.yaml', yaml.safe_dump(config, sort_keys=False))
        write(sftp, '/etc/hysteria/firewall.v4', FIREWALL)
        write(sftp, '/var/www/rak-sj/index.html', '<!doctype html><title>San Jose</title><h1>Welcome</h1>\n', 0o644)
        write(sftp, '/etc/systemd/system/hysteria-server.service', SERVICE, 0o644)
        write(sftp, '/etc/systemd/system/rak-vpn-firewall.service', FW_SERVICE, 0o644)
        write(sftp, '/usr/local/sbin/rak-vpn-traffic', METER, 0o755)
        write(sftp, '/etc/systemd/system/rak-vpn-traffic.service', METER_SERVICE, 0o644)
        write(sftp, '/etc/systemd/system/rak-vpn-traffic.timer', METER_TIMER, 0o644)
        write(sftp, '/etc/sysctl.d/90-hysteria-udp.conf', 'net.core.rmem_max=8388608\nnet.core.wmem_max=8388608\n', 0o644)
        command(client, 'sysctl -p /etc/sysctl.d/90-hysteria-udp.conf >/dev/null')
        rollback = ('#!/bin/sh\n/sbin/iptables-restore < ' + backup + '/iptables.v4\n') if previous.strip() else '''#!/bin/sh
/sbin/iptables -P INPUT ACCEPT
/sbin/iptables -P FORWARD ACCEPT
/sbin/iptables -P OUTPUT ACCEPT
/sbin/iptables -F
'''
        write(sftp, backup + '/rollback-firewall.sh', rollback, 0o700)
        command(client, 'systemctl daemon-reload; systemd-run --quiet --unit=rak-vpn-fw-rollback --on-active=3min ' + backup + '/rollback-firewall.sh')
        try:
            command(client, 'systemctl enable rak-vpn-firewall.service >/dev/null 2>&1; systemctl start rak-vpn-firewall.service')
            test = connect()
            try:
                assert command(test, 'id -u').strip() == '0'
            finally:
                test.close()
            command(client, 'systemctl stop rak-vpn-fw-rollback.timer')
        except Exception:
            command(client, backup + '/rollback-firewall.sh')
            raise
        command(client, 'systemctl enable hysteria-server rak-vpn-traffic.timer >/dev/null 2>&1; systemctl start hysteria-server rak-vpn-traffic.timer; /usr/local/sbin/rak-vpn-traffic')
        ready = False
        for _ in range(90):
            listeners = command(client, 'ss -lnup')
            if ':443 ' in listeners and 'hysteria' in listeners:
                ready = True
                break
            time.sleep(2)
        if not ready:
            # Strip generated credentials from diagnostics before returning any
            # error detail. The journal and raw configuration are never artifacts.
            logs = command(client, 'journalctl -u hysteria-server -n 20 --no-pager')
            for secret in [os.environ.get('RAK_SSH_PASSWORD'), config['auth']['userpass']['leon'], config['obfs']['salamander']['password'], config['trafficStats']['secret']]:
                if secret:
                    logs = logs.replace(secret, '[REDACTED]')
            report({'mode': 'deploy', 'server_ready': False, 'sanitized_diagnostics': logs[-5000:]})
            raise RuntimeError('Hysteria did not become ready; inspect the sanitized report')
        assert command(client, "stat -c '%i:%s:%Y' /etc/ssh/sshd_config /etc/shadow") == ssh_baseline
    return verify(client, delivery=delivery, binary=binary, deployed=True)


def fetch_via_node(url):
    result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '35',
        '--max-filesize', '262144', '--proxy', 'socks5h://127.0.0.1:10808', '--noproxy', '', url], capture_output=True)
    if result.returncode:
        raise RuntimeError('Low-traffic proxy request failed; curl exit=' + str(result.returncode))
    return result.stdout


def verify(client, delivery=None, binary=None, deployed=False):
    delivery = delivery or public_delivery_key()
    binary = binary or download_binary()
    with client.open_sftp() as sftp:
        config = yaml.safe_load(read(sftp, '/etc/hysteria/config.yaml'))
    auth = 'leon:' + config['auth']['userpass']['leon']
    query = urllib.parse.urlencode({'obfs': 'salamander', 'obfs-password': config['obfs']['salamander']['password'], 'sni': DOMAIN, 'insecure': '0'})
    uri = 'hysteria2://' + urllib.parse.quote(auth, safe=':') + '@' + DOMAIN + ':443/?' + query + '#' + urllib.parse.quote('RAK San Jose Hysteria2')
    encrypt_share({'share_uri': uri, 'host': HOST, 'domain': DOMAIN, 'port': 443, 'protocol': 'Hysteria2', 'tls_verified': True}, delivery)
    cfg = {'server': DOMAIN + ':443', 'auth': auth, 'obfs': config['obfs'],
        'tls': {'sni': DOMAIN, 'insecure': False}, 'socks5': {'listen': '127.0.0.1:10808'}}
    local = Path('rak-client.private.yaml')
    local.write_text(yaml.safe_dump(cfg));local.chmod(0o600)
    log = Path('rak-client.private.log').open('wb')
    process = subprocess.Popen([str(binary), 'client', '--config', str(local), '--log-level', 'warn'], stdout=log, stderr=log)
    try:
        import socket
        ready = False
        for _ in range(40):
            try:
                with socket.create_connection(('127.0.0.1', 10808), timeout=1):
                    ready = True
                    break
            except OSError:
                time.sleep(0.5)
        if not ready:
            raise RuntimeError('External Hysteria client failed to start')
        raw = fetch_via_node('https://api.ipify.org')
        assert raw.decode().strip() == HOST, 'Proxy egress IP did not match the requested VPS'
        purity_raw = fetch_via_node('https://my.ippure.com/v1/info')
        purity = json.loads(purity_raw)
        assert purity.get('ip') == HOST, 'IPPure response describes a different IP'
        allowed = ['ip', 'asn', 'asOrganization', 'country', 'countryCode', 'region', 'city', 'fraudScore', 'isResidential', 'isBroadcast']
        quality = {'ippure': {name: purity[name] for name in allowed if name in purity}}
        ipqs_key = os.environ.get('IPQS_API_KEY', '').strip()
        if ipqs_key:
            try:
                url = 'https://www.ipqualityscore.com/api/json/ip/' + urllib.parse.quote(ipqs_key, safe='') + '/' + HOST
                with urllib.request.urlopen(url + '?strictness=1&allow_public_access_points=true', timeout=30) as r:
                    score = json.load(r)
                if score.get('success'):
                    quality['ipqs'] = {name: score[name] for name in ['fraud_score', 'proxy', 'vpn', 'tor', 'ISP', 'ASN', 'country_code'] if name in score}
                else:
                    quality['ipqs'] = {'status': 'query_not_authorized_or_plan_restricted'}
            except Exception:
                quality['ipqs'] = {'status': 'official_query_failed'}
        else:
            quality['ipqs'] = {'status': 'unavailable_without_official_login_or_api_key'}
        cert_paths = command(client, "find /var/lib/hysteria/acme -type f -name '*.crt'").strip().splitlines()
        certificate = None
        with client.open_sftp() as sftp:
            for path in cert_paths:
                cert = x509.load_pem_x509_certificate(read(sftp, path))
                names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.DNSName)
                if DOMAIN in names:
                    certificate = {'issuer': cert.issuer.rfc4514_string(), 'not_after_utc': cert.not_valid_after_utc.isoformat(), 'dns_names': names}
                    break
        assert certificate, 'Public certificate was not found'
        meter = json.loads(command(client, '/usr/local/sbin/rak-vpn-traffic --show'))
        services = command(client, 'systemctl is-active hysteria-server rak-vpn-firewall rak-vpn-traffic.timer').strip().splitlines()
        assert services == ['active', 'active', 'active']
        report({'mode': 'deploy' if deployed else 'verify', 'host': HOST, 'domain': DOMAIN,
            'protocol': 'Hysteria2', 'version': VERSION, 'binary_sha256': BINARY_SHA256,
            'service': services,
            'ssh_port': PORT, 'ssh_password_and_configuration_unchanged': True,
            'protocol_port': '443/udp', 'certificate_validation_port': '443/tcp',
            'trusted_tls_verified': True, 'certificate': certificate,
            'external_native_client_egress_ip': raw.decode().strip(), 'quality': quality,
            'verification_response_bytes': len(raw) + len(purity_raw), 'speed_test_performed': False,
            'monthly_reference_bytes': 1000000000000, 'traffic_meter': meter,
            'share_result_encrypted_to_client_key': True,
            'china_mainland_route_tested': False})
    finally:
        process.terminate()
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:process.kill();process.wait()
        log.close();local.unlink(missing_ok=True)
        Path('rak-client.private.log').unlink(missing_ok=True)


def report(value):
    Path('rak-operation').mkdir(exist_ok=True)
    Path('rak-operation/report.json').write_text(json.dumps(value, indent=2) + '\n')
    print('RAK_VPN=' + json.dumps(value), flush=True)


def command(client, source, timeout=45):
    _, stdout, stderr = client.exec_command('set -e\n' + source, timeout=timeout)
    raw = stdout.read()
    error = stderr.read()
    status = stdout.channel.recv_exit_status()
    if status:
        # Command output can contain server configuration or credentials.
        raise RuntimeError('Remote operation failed with exit ' + str(status))
    return raw.decode()


def connect(inspect=False):
    password = os.environ.get('RAK_SSH_PASSWORD', '')
    if not password:
        raise RuntimeError('RAK_SSH_PASSWORD is not configured in GitHub Actions')
    client = paramiko.SSHClient()
    if HOST_PIN.exists():
        client.load_host_keys(str(HOST_PIN))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
    elif inspect:
        # First connection records the provided address's public host key;
        # installation and all future logins must use that exact pinned key.
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    else:
        raise RuntimeError('Inspect and pin the SSH host identity before installing')
    client.connect(HOST, port=PORT, username='root', password=password,
                   look_for_keys=False, allow_agent=False, timeout=20,
                   auth_timeout=25, banner_timeout=25)
    return client


def inspect(client):
    key = client.get_transport().get_remote_server_key()
    fingerprint = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
    source = '''import json,os,subprocess
def run(args):
 try:return subprocess.check_output(args,stderr=subprocess.STDOUT).decode('utf-8','replace').strip()
 except Exception:return None
os_release=open('/etc/os-release').read() if os.path.exists('/etc/os-release') else run(['cat','/etc/redhat-release'])
result={'hostname':run(['hostname']),'kernel':run(['uname','-srmo']),'os_release':os_release,
 'systemd':(run(['systemctl','--version']) or '').split('\\n')[0],
 'memory':run(['free','-b']),'disk':run(['df','-B1','/']),
 'listeners':run(['ss','-lntup']),'selinux':run(['getenforce']),
 'firewalld_active':run(['systemctl','is-active','firewalld']),
 'iptables':run(['iptables-save']),
 'sshd_effective_ports':[l for l in (run(['/usr/sbin/sshd','-T']) or '').split('\\n') if l.startswith('port ')],
 'egress_ip':run(['curl','-4','--fail','--silent','--max-time','20','https://api.ipify.org'])}
print(json.dumps(result))
'''
    # CentOS 7 ships Python 2.7; keep this inventory script compatible and do not
    # install packages or execute a distribution upgrade just to inspect it.
    data = json.loads(command(client, 'python -c ' + shlex.quote(source)))
    data.update({'mode': 'inspect', 'target': HOST, 'ssh_port': PORT,
                 'host_fingerprint': fingerprint,
                 'known_host': '[%s]:%s %s %s' % (HOST, PORT, key.get_name(), key.get_base64()),
                 'changes_applied': False})
    report(data)


def main():
    mode = os.environ.get('RAK_VPN_MODE', 'inspect')
    client = connect(inspect=mode == 'inspect')
    try:
        if mode == 'inspect':
            inspect(client)
        elif mode == 'deploy':
            deploy(client)
        elif mode == 'verify':
            verify(client)
        else:
            raise ValueError('Unsupported RAK operation')
    finally:
        client.close()


if __name__ == '__main__':
    main()
