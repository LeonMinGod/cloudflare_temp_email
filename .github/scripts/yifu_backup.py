"""Encrypt and validate Yifu backup envelopes without restoring production data."""
import base64
import hashlib
import json
import os
from pathlib import PurePosixPath
import time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PURPOSE = 'yifu-vps-backup-v1'


def validate_files(files):
    if not isinstance(files, dict) or not files or len(files) > 1024:
        raise ValueError('Invalid backup file set')
    total = 0
    for name, encoded in files.items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or str(path) != name:
            raise ValueError('Unsafe backup path')
        if not ((len(path.parts) == 2 and path.parts[0] in ['private', 'auths', 'systemd']) or name == 'data/pool.sqlite'):
            raise ValueError('Backup path outside allowlist')
        raw = base64.b64decode(encoded, validate=True)
        total += len(raw)
        if total > 64 * 1024 * 1024:
            raise ValueError('Backup exceeds bounded memory budget')
        if path.parts[0] == 'auths' and name.endswith('.json'):
            if not isinstance(json.loads(raw), dict):
                raise ValueError('Invalid credential backup')
    return total


def encrypt_files(files, secret):
    validate_files(files)
    key = hashlib.sha256((secret.strip() + '\n' + PURPOSE).encode()).digest()
    nonce = os.urandom(12)
    raw = json.dumps({'schema': 1, 'files': files}, separators=(',', ':')).encode()
    result = {'format': 'AES-256-GCM', 'purpose': PURPOSE, 'created': int(time.time()),
              'nonce': base64.b64encode(nonce).decode(),
              'ciphertext': base64.b64encode(AESGCM(key).encrypt(nonce, raw, PURPOSE.encode())).decode()}
    if decrypt_files(result, secret) != files:
        raise ValueError('Backup verification mismatch')
    return result


def decrypt_files(envelope, secret):
    if envelope.get('format') != 'AES-256-GCM' or envelope.get('purpose') != PURPOSE:
        raise ValueError('Unrecognized backup envelope')
    key = hashlib.sha256((secret.strip() + '\n' + PURPOSE).encode()).digest()
    nonce = base64.b64decode(envelope['nonce'], validate=True)
    if len(nonce) != 12:
        raise ValueError('Invalid backup nonce')
    raw = AESGCM(key).decrypt(nonce, base64.b64decode(envelope['ciphertext'], validate=True), PURPOSE.encode())
    data = json.loads(raw)
    if data.get('schema') != 1:
        raise ValueError('Unknown backup schema')
    validate_files(data['files'])
    return data['files']
