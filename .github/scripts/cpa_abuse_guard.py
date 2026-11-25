"""Deploy and operate the CPA abuse guard without printing credentials or client IPs."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import yifu_key_api as api
import yifu_keys


WORKER = "cpa-abuse-guard"
BACKUP = Path("cpa-abuse-rollout/cpa-before-rollout.enc.json")
TERMINAL_FAILURES = {
    "build_failed", "update_failed", "pre_deploy_failed", "canceled", "cancelled",
}


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError("Missing GitHub Actions secret: " + name)
    return value


def derive(label):
    return hmac.new(required("RENDER_API_KEY").encode(),
                    ("leonmingod-cpa-abuse-guard/v1/" + label).encode(),
                    hashlib.sha256).hexdigest()


def cf_account(path, method="GET", body=None):
    account = required("CLOUDFLARE_ACCOUNT_ID")
    token = required("CLOUDFLARE_API_TOKEN")
    _, _, raw = api.request(
        "https://api.cloudflare.com/client/v4/accounts/" + account + "/" + path.lstrip("/"),
        method, body, {"Authorization": "Bearer " + token})
    payload = json.loads(raw)
    if not payload.get("success"):
        raise RuntimeError("Cloudflare rejected the request")
    return payload["result"]


def worker_url():
    subdomain = cf_account("workers/subdomain").get("subdomain", "").strip()
    if not subdomain:
        raise RuntimeError("Cloudflare Workers subdomain is unavailable")
    return "https://" + WORKER + "." + subdomain + ".workers.dev"


def signature(path, body, admin):
    stamp = str(int(time.time() * 1000))
    nonce = secrets.token_hex(16)
    message = stamp + "\n" + nonce + "\nPOST\n" + path + "\n" + body.decode()
    digest = hmac.new(derive("admin" if admin else "service").encode(),
                      message.encode(), hashlib.sha256).hexdigest()
    return stamp + ":" + nonce + ":" + digest


def rpc(payload, admin=True):
    path = "/admin" if admin else "/rpc"
    body = json.dumps(payload, separators=(",", ":")).encode()
    _, _, raw = api.request(worker_url() + path, "POST", body, {
        "Content-Type": "application/json",
        "X-CPA-Guard": signature(path, body, admin),
    })
    return json.loads(raw)


def ip_fingerprint(value):
    return hmac.new(derive("report").encode(), value.encode(), hashlib.sha256).hexdigest()[:12]


def safe_status(result):
    config = result.get("config") or {}
    peers = []
    for peer in result.get("peers") or []:
        peers.append({
            "ip_fingerprint": ip_fingerprint(peer["ip"]),
            "active": peer.get("active"),
            "ban_count": len(peer.get("bans") or []),
            "counters": peer.get("counters") or {},
            "windows": peer.get("windows") or {},
        })
    records = []
    for record in result.get("records") or []:
        records.append({"ip_fingerprint": ip_fingerprint(record["ip"]), **{
            key: value for key, value in record.items() if key != "ip"
        }})
    return {
        "enabled": bool(config.get("enabled")),
        "allowlist": [ip_fingerprint(value) for value in config.get("allowlist") or []],
        "policy": result.get("policy"),
        "peers": peers,
        "records": records,
    }


def print_status(result):
    status = safe_status(result)
    schedule_result = api.cf(WORKER + "/schedules")
    schedules = (schedule_result.get("schedules") or []) \
        if isinstance(schedule_result, dict) else schedule_result
    if not isinstance(schedules, list):
        raise RuntimeError("Unexpected Cloudflare schedules response")
    status["worker"] = {
        "name": WORKER,
        "active_version": api.active(WORKER),
        "crons": sorted(item["cron"] for item in schedules
                        if isinstance(item, dict) and item.get("cron")),
    }
    print("CPA_GUARD_STATUS=" + json.dumps(status, separators=(",", ":")), flush=True)


def service():
    value = api.render("/services/" + api.SERVICE)
    if value.get("ownerId") != api.WORKSPACE:
        raise RuntimeError("Unexpected Render workspace")
    if not api.is_cpa_repo(value.get("repo")) or value.get("branch") != "main":
        raise RuntimeError("Unexpected Render source repository")
    return value


def set_auto_deploy(value):
    if value not in {"yes", "no"}:
        raise ValueError("Invalid auto-deploy value")
    api.render("/services/" + api.SERVICE, "PATCH", {"autoDeploy": value})
    current = service()
    if current.get("autoDeploy") != value:
        raise RuntimeError("Render auto-deploy update was not retained")
    print("RENDER_AUTO_DEPLOY=" + value, flush=True)


def hold():
    current = service()
    deploy = api.latest_deploy()
    if deploy.get("status") != "live":
        raise RuntimeError("Render must have a live deploy before rollout hold")
    set_auto_deploy("no")
    print("CPA_ROLLOUT_HOLD=" + json.dumps({
        "service": current["id"], "live_commit": deploy["commit"]["id"],
    }), flush=True)


def install_secrets():
    values = {"SERVICE_SECRET": derive("service"), "ADMIN_SECRET": derive("admin")}
    for name, value in values.items():
        api.cf(WORKER + "/secrets", "PUT", {
            "name": name, "text": value, "type": "secret_text",
        })
    listed = {item["name"] for item in api.cf(WORKER + "/secrets")}
    if not set(values) <= listed:
        raise RuntimeError("Cloudflare Worker secrets were not retained")
    print("CPA_GUARD_SECRETS=" + json.dumps({
        "installed": sorted(values),
        "service_fingerprint": hashlib.sha256(values["SERVICE_SECRET"].encode()).hexdigest()[:16],
    }), flush=True)


def download_credentials(state):
    if any(item.get("runtime_only") for item in state["files"]):
        raise RuntimeError("A runtime-only credential cannot be backed up")

    def read(item):
        name = item["name"]
        payload = api.management_request(
            state["management"],
            "credentials/download?name=" + urllib.parse.quote(name, safe=""))
        json.loads(payload)
        return name, payload.decode()

    with ThreadPoolExecutor(max_workers=4) as pool:
        return dict(pool.map(read, state["files"]))


def seal_backup(state, credentials):
    BACKUP.parent.mkdir(parents=True, exist_ok=True)
    nonce = secrets.token_bytes(12)
    key = hashlib.sha256((required("RENDER_API_KEY") + "\ncpa-abuse-rollout-v1").encode()).digest()
    raw = json.dumps({"state": state, "credentials": credentials}, separators=(",", ":")).encode()
    envelope = {
        "format": "AES-256-GCM",
        "purpose": "cpa-abuse-rollout-v1",
        "created": int(time.time()),
        "nonce": base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(
            AESGCM(key).encrypt(nonce, raw, b"cpa-abuse-rollout-v1")).decode(),
    }
    BACKUP.write_text(json.dumps(envelope))
    BACKUP.chmod(0o600)
    print("CPA_ROLLOUT_BACKUP=" + json.dumps({
        "encrypted": True,
        "credentials": len(credentials),
        "deploy": state["deploy"]["id"],
    }), flush=True)


def update_guard_environment(url):
    values = {
        "CPA_ABUSE_URL": url,
        "CPA_ABUSE_SECRET": derive("service"),
        "CPA_REMOTE_KEY_AUTH": "1",
    }
    for key, value in values.items():
        api.render("/services/" + api.SERVICE + "/env-vars/" + urllib.parse.quote(key, safe=""),
                   "PUT", {"value": value})
    current = {item["envVar"]["key"]: item["envVar"]["value"]
               for item in api.render("/services/" + api.SERVICE + "/env-vars?limit=100")}
    if any(current.get(key) != value for key, value in values.items()):
        raise RuntimeError("Render guard environment did not persist")
    print("CPA_GUARD_ENVIRONMENT=" + json.dumps({
        "url": url,
        "secret_fingerprint": hashlib.sha256(values["CPA_ABUSE_SECRET"].encode()).hexdigest()[:16],
        "preserved_env_vars": len(current) - len([key for key in values if key in current]),
    }), flush=True)


def wait_deploy(deploy_id, expected_commit):
    deadline = time.monotonic() + 15 * 60
    previous = None
    while time.monotonic() < deadline:
        current = api.render("/services/" + api.SERVICE + "/deploys/" + deploy_id)
        status = current.get("status")
        if status != previous:
            print("RENDER_DEPLOY_STATUS=" + json.dumps({"id": deploy_id, "status": status}), flush=True)
            previous = status
        if status == "live":
            if current.get("commit", {}).get("id") != expected_commit:
                raise RuntimeError("Render deployed a different commit")
            return current
        if status in TERMINAL_FAILURES:
            raise RuntimeError("Render deployment failed: " + str(status))
        time.sleep(5)
    raise RuntimeError("Render deployment timed out")


def status_request(url, method="GET", body=None, headers=None):
    request = urllib.request.Request(url, data=body, method=method,
                                     headers={"User-Agent": "CPA-Guard-Live-Test/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read(4096)
    except urllib.error.HTTPError as error:
        return error.code, error.read(4096)


def peer_counters(result):
    return {peer["ip"]: int((peer.get("counters") or {}).get("404", 0))
            for peer in result.get("peers") or []}


def find_test_peer(before, after):
    old = peer_counters(before)
    changed = [peer["ip"] for peer in after.get("peers") or []
               if int((peer.get("counters") or {}).get("404", 0)) > old.get(peer["ip"], 0)]
    if len(changed) != 1:
        raise RuntimeError("Could not uniquely identify the rollout test client")
    return changed[0]


def verify_observe_mode():
    before = rpc({"action": "status"})
    status, _ = status_request(api.RENDER_ORIGIN + "/api/show", "POST", b"{}",
                               {"Content-Type": "application/json"})
    if status != 404:
        raise RuntimeError("Observe probe did not reach the expected 404 route")
    after = rpc({"action": "status"})
    peer = find_test_peer(before, after)
    rpc({"action": "unban", "ip": peer, "resetHistory": True})
    if after.get("config", {}).get("enabled"):
        raise RuntimeError("Guard unexpectedly enforced during observe verification")
    print("CPA_GUARD_OBSERVE_VERIFIED=" + ip_fingerprint(peer), flush=True)
    return peer


def verify_enforcement():
    before = rpc({"action": "status"})
    statuses = []
    peer = None
    try:
        for _ in range(21):
            status, _ = status_request(api.RENDER_ORIGIN + "/api/show", "POST", b"{}",
                                       {"Content-Type": "application/json"})
            statuses.append(status)
        if statuses[:20] != [404] * 20 or statuses[20] != 403:
            raise RuntimeError("Live threshold mismatch: " + json.dumps(statuses))
        after = rpc({"action": "status"})
        peer = find_test_peer(before, after)
        current = next(item for item in after["peers"] if item["ip"] == peer)
        active = current.get("active") or {}
        if active.get("reason") != "20_in_5m" or int(active.get("duration", 0)) != 3600000:
            raise RuntimeError("Live ban record does not match the one-hour policy")
        print("CPA_GUARD_ENFORCEMENT_VERIFIED=" + json.dumps({
            "ip_fingerprint": ip_fingerprint(peer),
            "origin_404": statuses.count(404),
            "blocked_403": statuses.count(403),
            "reason": active["reason"],
            "automatic_expiry": active["until"],
        }), flush=True)
    finally:
        if peer:
            rpc({"action": "unban", "ip": peer, "resetHistory": True})
    if peer is None:
        after = rpc({"action": "status"})
        try:
            peer = find_test_peer(before, after)
            rpc({"action": "unban", "ip": peer, "resetHistory": True})
        except RuntimeError:
            pass
    status, _ = status_request(api.RENDER_ORIGIN + "/api/show", "POST", b"{}",
                               {"Content-Type": "application/json"})
    if status != 404:
        raise RuntimeError("Automatic block cleanup test failed")
    if peer:
        rpc({"action": "unban", "ip": peer, "resetHistory": True})


def verify_health_exemption():
    for _ in range(25):
        status, _ = status_request(api.RENDER_ORIGIN + "/healthz")
        if status != 200:
            raise RuntimeError("Health check exemption failed")
    print("CPA_HEALTH_EXEMPTION_VERIFIED=25", flush=True)


def restore_credentials(state, credentials):
    for attempt in range(5):
        try:
            api.restore_credentials(state["management"], credentials, state["files"])
            return
        except (RuntimeError, urllib.error.URLError):
            if attempt == 4:
                raise
            time.sleep(min(2 ** attempt, 8))


def verify_client_keys(state):
    """Fail closed unless every Render client key from config.yaml lists models after the deploy.

    The website no longer publishes a shared key, so the keys come from the Render secret file
    already read by read_state(). Only counts are printed, never key values.
    """
    keys = state.get("keys") or []
    if not keys:
        raise RuntimeError("No Render client keys are available for post-deploy verification")
    counts = []
    for key in keys:
        try:
            counts.append(api.models(key))
        except (AssertionError, RuntimeError, urllib.error.URLError, ValueError):
            raise RuntimeError("Post-deploy models check failed for a Render client key") from None
    print("CPA_CLIENT_KEYS_VERIFIED=" + str(len(counts)), flush=True)
    return counts[0]


def verify_optional_test_client():
    """Check one extra client key only when an operator set CPA_TEST_CLIENT_KEY.

    CI leaves the variable unset, and that case stays silent. The value is never printed.
    """
    key = os.environ.get("CPA_TEST_CLIENT_KEY", "").strip()
    if not key:
        return
    try:
        api.models(key)
    except (AssertionError, RuntimeError, urllib.error.URLError, ValueError):
        raise RuntimeError("Post-deploy test client models check failed") from None
    print("CPA_TEST_CLIENT_VERIFIED=1", flush=True)


def deploy():
    expected = os.environ.get("CPA_EXPECTED_COMMIT", "").strip()
    if len(expected) != 40 or any(character not in "0123456789abcdef" for character in expected):
        raise RuntimeError("CPA_EXPECTED_COMMIT must be a full lowercase commit SHA")
    current = service()
    if current.get("autoDeploy") != "no":
        raise RuntimeError("Run the rollout hold before pushing CPA main")
    state = yifu_keys.read_state()
    credentials = download_credentials(state)
    seal_backup(state, credentials)
    success = False
    try:
        rpc({"action": "disable"})
        update_guard_environment(worker_url())
        deployment = api.render("/services/" + api.SERVICE + "/deploys", "POST", {
            "commitId": expected,
        })
        wait_deploy(deployment["id"], expected)
        restore_credentials(state, credentials)
        verify_observe_mode()
        rpc({"action": "enable"})
        verify_health_exemption()
        verify_enforcement()
        model_count = verify_client_keys(state)
        verify_optional_test_client()
        health, _ = status_request(api.RENDER_ORIGIN + "/healthz")
        if health != 200:
            raise RuntimeError("Render health check failed after guard deployment")
        final = rpc({"action": "status"})
        if not final.get("config", {}).get("enabled"):
            raise RuntimeError("Guard did not remain enabled")
        print("CPA_GUARD_LIVE=" + json.dumps({
            "deploy": deployment["id"], "commit": expected,
            "models": model_count, "health": health, "credentials": len(credentials),
        }), flush=True)
        print_status(final)
        success = True
    finally:
        try:
            restore_credentials(state, credentials)
        finally:
            if not success:
                try:
                    rpc({"action": "disable"})
                except Exception:
                    pass
            set_auto_deploy("yes")


def operate(mode):
    if mode == "status":
        print_status(rpc({"action": "status"}))
        return
    if mode in {"enable", "disable"}:
        rpc({"action": mode})
        print_status(rpc({"action": "status"}))
        return
    if mode not in {"allow", "unallow", "unban"}:
        raise RuntimeError("Unknown operation")
    value = str(ipaddress.ip_address(os.environ.get("CPA_GUARD_IP", "").strip()))
    payload = {"action": mode, "ip": value}
    if mode == "unban":
        payload["resetHistory"] = os.environ.get("CPA_RESET_HISTORY", "false").lower() == "true"
    rpc(payload)
    print("CPA_GUARD_OPERATION=" + json.dumps({
        "action": mode, "ip_fingerprint": ip_fingerprint(value),
        "reset_history": payload.get("resetHistory", False),
    }), flush=True)
    print_status(rpc({"action": "status", "ip": value}))


def main():
    for name in ["RENDER_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]:
        required(name)
    mode = os.environ.get("CPA_GUARD_MODE", "status")
    if mode == "install-secrets":
        install_secrets()
    elif mode == "hold":
        hold()
    elif mode == "deploy":
        deploy()
    else:
        operate(mode)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("CPA_GUARD_ERROR=" + str(error), file=sys.stderr, flush=True)
        raise
