import base64,hashlib,importlib.util,json,os,tempfile,threading,time,unittest,urllib.error,urllib.request
from pathlib import Path
from http.server import HTTPServer
from cryptography.exceptions import InvalidSignature,InvalidTag
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import migration_crypto as crypto
from migration_receiver import Receiver

class MigrationCryptoTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.recipient=rsa.generate_private_key(public_exponent=65537,key_size=3072)
  cls.signer=rsa.generate_private_key(public_exponent=65537,key_size=3072)
  cls.private=cls.recipient.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
  cls.public=cls.recipient.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
  cls.sign_private=cls.signer.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
  cls.sign_public=cls.signer.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
 def test_only_recipient_can_decrypt(self):
  raw=crypto.seal(b'private-state',self.public,'rak-test-session','app-stage')
  self.assertEqual(crypto.unseal(raw,self.private,'rak-test-session','app-stage'),b'private-state')
  with self.assertRaises(ValueError):crypto.unseal(raw,self.sign_private,'rak-test-session','app-stage')
 def test_wrong_session_and_object_are_rejected(self):
  raw=crypto.seal(b'state',self.public,'rak-test-session','app-stage')
  with self.assertRaises(ValueError):crypto.unseal(raw,self.private,'rak-other-session','app-stage')
  with self.assertRaises(ValueError):crypto.unseal(raw,self.private,'rak-test-session','app-final')
 def test_ciphertext_tampering_is_rejected(self):
  value=json.loads(crypto.seal(b'state',self.public,'rak-test-session','app-stage'))
  raw=bytearray(base64.b64decode(value['ciphertext']));raw[0]^=1;value['ciphertext']=base64.b64encode(raw).decode()
  with self.assertRaises(InvalidTag):crypto.unseal(json.dumps(value).encode(),self.private,'rak-test-session','app-stage')
 def test_signature_binds_ciphertext_and_object(self):
  raw=b'ciphertext';headers=crypto.sign(raw,self.sign_private,'rak-test-session','app-stage')
  crypto.verify_signature(raw,self.sign_public,'rak-test-session','app-stage',headers['X-Migration-Signature'])
  with self.assertRaises(InvalidSignature):crypto.verify_signature(raw+b'x',self.sign_public,'rak-test-session','app-stage',headers['X-Migration-Signature'])
  with self.assertRaises(InvalidSignature):crypto.verify_signature(raw,self.sign_public,'rak-test-session','app-final',headers['X-Migration-Signature'])
 def test_unsafe_paths_rejected(self):
  for path in ['../config','/etc/shadow','private//key','private/../auth','private\\key','']:
   with self.subTest(path=path),self.assertRaises(ValueError):crypto.checked_path(path)
  self.assertEqual(str(crypto.checked_path('private/runtime.env')),'private/runtime.env')
 def test_receiver_verifies_signature_before_accepting_payload(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);public=root/'public.pem';public.write_bytes(self.sign_public)
   server=HTTPServer(('127.0.0.1',0),Receiver)
   server.config={'session':'rak-test-session','inbox':directory,'signing_public_key':str(public),'expires':time.time()+60}
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   try:
    url='http://127.0.0.1:'+str(server.server_port)+'/upload';raw=b'opaque-encrypted-data'
    headers=crypto.sign(raw,self.sign_private,'rak-test-session','app-stage')
    with urllib.request.urlopen(urllib.request.Request(url,data=raw,headers=headers),timeout=5) as response:
     result=json.load(response)
    self.assertTrue(result['received']);self.assertEqual((root/'app-stage.enc').read_bytes(),raw)
    with self.assertRaises(urllib.error.HTTPError) as replay:
     urllib.request.urlopen(urllib.request.Request(url,data=raw,headers=headers),timeout=5)
    self.assertEqual(replay.exception.code,409)
    bad={**headers,'X-Migration-Object':'app-final'}
    with self.assertRaises(urllib.error.HTTPError) as rejected:
     urllib.request.urlopen(urllib.request.Request(url,data=raw,headers=bad),timeout=5)
    self.assertEqual(rejected.exception.code,403);self.assertFalse((root/'app-final.enc').exists())
   finally:server.shutdown();server.server_close();thread.join(timeout=3)

if __name__=='__main__':unittest.main()
