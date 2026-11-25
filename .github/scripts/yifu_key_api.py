"""Scoped Render/Cloudflare API helpers; no embedded client credentials."""
import json
import hashlib
import hmac
import os
import time
import urllib.error
import urllib.parse
import urllib.request

SERVICE = 'srv-d9c4kkvavr4c73ab3sfg'
WORKSPACE = 'tea-d779tahr0fns73e1h3lg'
RENDER_ORIGIN = 'https://cpa-dhke.onrender.com'
CPA_ORIGIN = 'https://yifu.leonmingod.com'
ORIGIN = 'https://leonmingod.com'


def is_cpa_repo(value):
    return isinstance(value, str) and value.removesuffix('.git').rstrip('/') in {
        'https://github.com/LeonMinGod/cpa', 'https://github.com/928886540/cpa'}

def request(url, method='GET', body=None, headers=None):
    headers = {'User-Agent': 'Mozilla/5.0', **(headers or {})}
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.headers, res.read()
    except urllib.error.HTTPError as error:
        # Provider error bodies can contain the submitted configuration or secrets.
        raise RuntimeError(f'{method} {urllib.parse.urlsplit(url).path}: HTTP {error.code}') from None

def render(path, method='GET', body=None):
    return json.loads(request('https://api.render.com/v1' + path, method, body,
                             {'Authorization': 'Bearer ' + os.environ['RENDER_API_KEY'].strip()})[2])

def cf(path, method='GET', body=None, headers=None, raw=False):
    result = request('https://api.cloudflare.com/client/v4/accounts/' +
                     os.environ['CLOUDFLARE_ACCOUNT_ID'].strip() + '/workers/scripts/' + path,
                     method, body, {'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'].strip(),
                                    **(headers or {})})
    if raw:
        return result
    data = json.loads(result[2])
    if not data.get('success'):
        raise RuntimeError('Cloudflare rejected the operation')
    return data['result']

def active(worker):
    versions = cf(worker + '/deployments')['deployments'][0]['versions']
    if len(versions) != 1 or versions[0]['percentage'] != 100:
        raise RuntimeError('Only a single fully deployed Worker version is supported')
    return versions[0]['version_id']

def site_claim():
    """Private signed operational verification; never weaken the public human gate."""
    body = json.dumps({'oath': '义父', 'confirmed': True}).encode()
    timestamp = str(int(time.time() * 1000))
    signing = os.environ.get('YIFU_OPS_SECRET', '').strip() or hmac.new(os.environ['RENDER_API_KEY'].strip().encode(), b'leonmingod-ops-probe-v1', hashlib.sha256).hexdigest()
    message = timestamp + '\nPOST\n/api/free-token/claim\n' + body.decode()
    signature = hmac.new(signing.encode(), message.encode(), hashlib.sha256).hexdigest()
    return json.loads(request(ORIGIN + '/api/free-token/claim', 'POST', body,
        {'Origin': ORIGIN, 'Content-Type': 'application/json', 'X-LMG-Operation': timestamp + ':' + signature})[2])

def management_request(key, path, method='GET', body=None):
    return request(CPA_ORIGIN + '/v8/management/' + path, method, body,
                   {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})[2]

def models(key):
    status, _, body = request(CPA_ORIGIN + '/v1/models', headers={'Authorization': 'Bearer ' + key})
    assert status == 200
    data = json.loads(body)
    assert isinstance(data.get('data'), list), 'Invalid models response'
    return len(data['data'])

def latest_deploy():
    items = render('/services/' + SERVICE + '/deploys?limit=1')
    return items[0]['deploy']

def restore_credentials(management, backups, original_files):
    current = json.loads(management_request(management, 'credentials'))['files']
    names = {f['name'] for f in current}
    restored = 0
    for file in original_files:
        name = file['name']
        if name in names:
            continue
        management_request(management, 'credentials?name=' + urllib.parse.quote(name, safe=''),
                           'POST', backups[name].encode())
        if file.get('disabled'):
            management_request(management, 'credentials/status', 'PATCH', {'name': name, 'disabled': True})
        restored += 1
    current = json.loads(management_request(management, 'credentials'))['files']
    by_name = {f['name']: f for f in current}
    assert {f['name'] for f in original_files} <= set(by_name), 'Credential restoration incomplete'
    assert all(bool(by_name[f['name']].get('disabled')) == bool(f.get('disabled')) for f in original_files)
    print('CREDENTIALS_VERIFIED=' + json.dumps({'retained': len(original_files), 'restored': restored}))
