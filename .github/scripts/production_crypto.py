"""Bounded, authenticated migration envelopes; no cleartext files or keys in results."""
import base64,hashlib,json,os,re
from pathlib import PurePosixPath
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PURPOSE='lmg-production-ops-v1'


def checked_id(value):
    if not isinstance(value,str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{5,79}',value):raise ValueError('Invalid object identity')
    return value


def aad(session,kind):return (PURPOSE+'\n'+checked_id(session)+'\n'+checked_id(kind)).encode()


def seal(raw,public,session,kind):
    if len(raw)>256*1024*1024:raise ValueError('Migration payload too large')
    key=serialization.load_pem_public_key(public)
    if not isinstance(key,rsa.RSAPublicKey) or key.key_size<3072:raise ValueError('Invalid recipient key')
    secret=os.urandom(32);nonce=os.urandom(12)
    result={'format':'AES-256-GCM+RSA-OAEP-SHA256','purpose':PURPOSE,'session':session,'kind':kind,
        'wrapped_key':base64.b64encode(key.encrypt(secret,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))).decode(),
        'nonce':base64.b64encode(nonce).decode(),
        'ciphertext':base64.b64encode(AESGCM(secret).encrypt(nonce,raw,aad(session,kind))).decode()}
    return json.dumps(result,separators=(',',':')).encode()


def unseal(raw,private,session,kind):
    if len(raw)>360*1024*1024:raise ValueError('Migration envelope too large')
    value=json.loads(raw)
    if value.get('purpose')!=PURPOSE or value.get('format')!='AES-256-GCM+RSA-OAEP-SHA256' or value.get('session')!=session or value.get('kind')!=kind:
        raise ValueError('Unexpected migration envelope')
    key=serialization.load_pem_private_key(private,password=None)
    secret=key.decrypt(base64.b64decode(value['wrapped_key'],validate=True),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
    return AESGCM(secret).decrypt(base64.b64decode(value['nonce'],validate=True),base64.b64decode(value['ciphertext'],validate=True),aad(session,kind))


def signing_message(session,kind,digest):
    if not re.fullmatch(r'[a-f0-9]{64}',digest):raise ValueError('Invalid transport digest')
    return aad(session,kind)+b'\n'+digest.encode()


def sign(raw,private,session,kind):
    key=serialization.load_pem_private_key(private,password=None)
    digest=hashlib.sha256(raw).hexdigest()
    signature=key.sign(signing_message(session,kind,digest),padding.PKCS1v15(),hashes.SHA256())
    return {'X-Migration-Object':kind,'X-Migration-SHA256':digest,'X-Migration-Signature':base64.b64encode(signature).decode()}


def verify_signature(raw,public,session,kind,signature):
    key=serialization.load_pem_public_key(public)
    key.verify(base64.b64decode(signature,validate=True),signing_message(session,kind,hashlib.sha256(raw).hexdigest()),padding.PKCS1v15(),hashes.SHA256())


def checked_path(name):
    path=PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or str(path)!=name or not path.parts or '\\' in name:
        raise ValueError('Unsafe migration file path')
    return path
