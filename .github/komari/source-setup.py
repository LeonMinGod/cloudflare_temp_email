import json
import os
import pathlib
import pwd
import grp
import subprocess

base = pathlib.Path("/opt/komari-agent")
cipher = (base / ".request.enc").read_bytes()
if len(cipher) != 384:
    raise RuntimeError("Unexpected encrypted agent request")
r = subprocess.run(
    ["openssl", "pkeyutl", "-decrypt", "-inkey", str(base / ".access-key.pem"),
     "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256"],
    input=cipher, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True
)
request = json.loads(r.stdout.decode("utf-8"))
if request.get("endpoint") != "https://vps.leonmingod.com" or len(request.get("token","")) < 16:
    raise RuntimeError("Invalid Komari source enrollment")
uid = pwd.getpwnam("komari-agent").pw_uid
gid = grp.getgrnam("komari-agent").gr_gid
folder = pathlib.Path("/var/lib/komari-agent")
folder.mkdir(exist_ok=True)
os.chown(str(folder),uid,gid)
os.chmod(str(folder),0o700)
config = {
    "endpoint": request["endpoint"],
    "token": request["token"],
    "interval": 5,
    "disable_web_ssh": True,
    "disable_auto_update": True,
    "ignore_unsafe_cert": False,
    "month_rotate": 1
}
p = folder / "config.json"
p.write_text(json.dumps(config))
os.chown(str(p),uid,gid)
os.chmod(str(p),0o600)
(base / ".request.enc").unlink()
print("Source Komari agent enrollment prepared without exposing token")
