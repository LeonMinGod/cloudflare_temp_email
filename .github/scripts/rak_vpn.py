"""Operate only the owner's new San Jose host, without changing SSH credentials."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shlex
import time

import paramiko

HOST = '198.247.1.206'
PORT = 22881
HOST_PIN = Path('.github/known_hosts/rak-sj')


def report(value):
    Path('rak-operation').mkdir(exist_ok=True)
    Path('rak-operation/report.json').write_text(json.dumps(value, indent=2) + '\n')
    print('RAK_VPN=' + json.dumps(value), flush=True)


def command(client, source, timeout=45):
    _, stdout, stderr = client.exec_command(source, timeout=timeout)
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
        else:
            raise RuntimeError('Deployment is prepared after the read-only host inspection')
    finally:
        client.close()


if __name__ == '__main__':
    main()
