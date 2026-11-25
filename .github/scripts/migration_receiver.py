# Python 2.7/3 compatible ciphertext-only receiver. It has no recipient private key.
from __future__ import print_function
import base64,hashlib,json,os,re,subprocess,sys,tempfile,time
try:
 from BaseHTTPServer import BaseHTTPRequestHandler,HTTPServer
except ImportError:
 from http.server import BaseHTTPRequestHandler,HTTPServer

LIMIT=360*1024*1024

class Receiver(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def answer(self,status,value):
  raw=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def do_POST(self):
  cfg=self.server.config
  if self.path!='/upload' or time.time()>cfg['expires']:
   return self.answer(404,{'error':'unavailable'})
  kind=self.headers.get('X-Migration-Object','');digest=self.headers.get('X-Migration-SHA256','');signature=self.headers.get('X-Migration-Signature','')
  if not re.match(r'^[a-z0-9][a-z0-9-]{5,79}$',kind) or not re.match(r'^[a-f0-9]{64}$',digest) or not re.match(r'^[A-Za-z0-9+/=]{100,800}$',signature):
   return self.answer(403,{'error':'invalid signature metadata'})
  try:length=int(self.headers.get('Content-Length','0'))
  except ValueError:return self.answer(400,{'error':'length required'})
  if not 1<=length<=LIMIT:return self.answer(413,{'error':'payload too large'})
  target=os.path.join(cfg['inbox'],kind+'.enc');meta=target+'.json'
  if os.path.exists(target):return self.answer(409,{'error':'object already exists'})
  self.connection.settimeout(60)
  try:
   with tempfile.NamedTemporaryFile(dir=cfg['inbox']) as message,tempfile.NamedTemporaryFile(dir=cfg['inbox']) as sig:
    text='lmg-migration-transport-v1\n'+cfg['session']+'\n'+kind+'\n'+digest
    message.write(text.encode());message.flush();sig.write(base64.b64decode(signature));sig.flush()
    with open(os.devnull,'wb') as sink:
     status=subprocess.call(['/usr/bin/openssl','dgst','-sha256','-verify',cfg['signing_public_key'],'-signature',sig.name,message.name],stdout=sink,stderr=subprocess.STDOUT)
   if status:raise ValueError('signature rejected')
  except Exception:return self.answer(403,{'error':'signature rejected'})
  fd,path=tempfile.mkstemp(prefix='.incoming-',dir=cfg['inbox']);os.chmod(path,0o600)
  try:
   h=hashlib.sha256();remaining=length
   with os.fdopen(fd,'wb') as stream:
    while remaining:
     part=self.rfile.read(min(65536,remaining))
     if not part:raise ValueError('incomplete body')
     stream.write(part);h.update(part);remaining-=len(part)
   if h.hexdigest()!=digest:raise ValueError('digest mismatch')
   os.rename(path,target)
   value={'received':True,'session':cfg['session'],'kind':kind,'sha256':digest,'bytes':length}
   with open(meta,'w') as stream:json.dump(value,stream)
   os.chmod(meta,0o600)
   self.answer(200,value)
  except Exception:
   try:os.unlink(path)
   except OSError:pass
   self.answer(403,{'error':'authenticated transfer rejected'})

if __name__=='__main__':
 config=json.load(open(sys.argv[1]))
 server=HTTPServer(('127.0.0.1',18388),Receiver);server.config=config
 server.serve_forever()
