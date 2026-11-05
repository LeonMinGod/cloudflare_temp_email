import io,json,tarfile,unittest
from migration_archive import pack,unpack

class ArchiveTests(unittest.TestCase):
 def test_metadata_private_modes_and_binary_roundtrip(self):
  files={'auths/current.json':(b'{"disabled":true}',0o600),'bin/current':(b'\x00\x01binary',0o755)}
  raw,manifest=pack(files,{'session':'test-session'})
  self.assertEqual(unpack(raw),(files,manifest))
 def test_links_traversal_and_hash_mismatch_are_rejected(self):
  for name,kind in [('../etc/shadow',tarfile.REGTYPE),('private/link',tarfile.SYMTYPE),('private/key',tarfile.REGTYPE)]:
   buf=io.BytesIO()
   with tarfile.open(fileobj=buf,mode='w:gz') as tar:
    manifest=json.dumps({'schema':1,'files':{name:{'sha256':'0'*64,'size':1,'mode':0o600}}}).encode()
    member=tarfile.TarInfo('manifest.json');member.size=len(manifest);tar.addfile(member,io.BytesIO(manifest))
    member=tarfile.TarInfo(name);member.type=kind;member.size=1;member.mode=0o600;tar.addfile(member,io.BytesIO(b'x'))
   with self.subTest(name=name),self.assertRaises(ValueError):unpack(buf.getvalue())
