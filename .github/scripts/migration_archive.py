"""Validate the complete migration archive before writing any destination file."""
import hashlib,io,json,tarfile
from migration_crypto import checked_path

MAX_TOTAL=240*1024*1024
MAX_FILES=3000
ROOTS={'private','auths','systemd','bin','monitor','static','data','plus','website','migration'}

def pathcheck(name):
    path=checked_path(name)
    if path.parts[0] not in ROOTS or len(path.parts)<2:raise ValueError('Unapproved archive root')
    return path

def pack(files,metadata):
    if len(files)>MAX_FILES or sum(len(raw) for raw,mode in files.values())>MAX_TOTAL:raise ValueError('Archive exceeds bounds')
    rows={}
    for name,(raw,mode) in files.items():
        pathcheck(name)
        rows[name]={'sha256':hashlib.sha256(raw).hexdigest(),'size':len(raw),'mode':mode&0o777}
    manifest={'schema':1,'metadata':metadata,'files':rows};buf=io.BytesIO()
    with tarfile.open(fileobj=buf,mode='w:gz',compresslevel=1) as archive:
        for name,(raw,mode) in {'manifest.json':(json.dumps(manifest).encode(),0o600),**files}.items():
            info=tarfile.TarInfo(name);info.mode=mode&0o777;info.size=len(raw);archive.addfile(info,io.BytesIO(raw))
    raw=buf.getvalue();unpack(raw)
    return raw,manifest

def unpack(raw):
    files={};manifest=None;total=0
    if len(raw)>MAX_TOTAL:raise ValueError('Oversize archive')
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
        for member in archive:
            if not member.isfile() or member.name in files or (member.name=='manifest.json' and manifest is not None):raise ValueError('Unsafe or duplicate archive entry')
            total+=member.size
            if member.size<0 or total>MAX_TOTAL or len(files)>MAX_FILES:raise ValueError('Archive expansion exceeds bounds')
            if member.name!='manifest.json':pathcheck(member.name)
            body=archive.extractfile(member).read(member.size+1)
            if len(body)!=member.size:raise ValueError('Truncated archive')
            if member.name=='manifest.json':manifest=json.loads(body)
            else:files[member.name]=(body,member.mode&0o777)
    if not manifest or manifest.get('schema')!=1 or set(files)!=set(manifest['files']):raise ValueError('Archive manifest incomplete')
    for name,(body,mode) in files.items():
        row=manifest['files'][name]
        if len(body)!=row['size'] or hashlib.sha256(body).hexdigest()!=row['sha256'] or mode!=row['mode']:raise ValueError('Archive content mismatch')
    return files,manifest
