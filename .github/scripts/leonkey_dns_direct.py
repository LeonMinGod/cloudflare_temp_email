"""One-time, owner-authorized DNS cutover; credentials stay in Actions."""
import copy
import datetime
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ZONE = "4f078f06b815a404337c3b5387c45275"
ACCOUNT = "855d4f34079c0fa88e70628ff65be84a"
HOSTS = ("ops.leonmingod.com", "redeem.leonmingod.com")
ADDRESS = "198.247.1.206"
OUTPUT = Path("leonkey-dns-result")


class Stop(RuntimeError):
    pass


def request(method, path, body=None):
    token = os.environ["CLOUDFLARE_API_TOKEN"].strip()
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4" + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        try:
            codes = [item.get("code") for item in json.load(error).get("errors", [])]
        except Exception:
            codes = []
        raise Stop(f"Cloudflare HTTP {error.code}, codes={codes}") from None
    except Exception as error:
        raise Stop("Cloudflare transport failure: " + type(error).__name__) from None
    if not result.get("success"):
        raise Stop("Cloudflare rejected request, codes=" + str([
            item.get("code") for item in result.get("errors", [])]))
    return result["result"]


def records(api, name):
    rows = api("GET", f"/zones/{ZONE}/dns_records?" + urllib.parse.urlencode({"name": name, "per_page": 100}))
    if len(rows) != 1 or rows[0].get("name") != name or rows[0].get("type") not in ("A", "CNAME"):
        raise Stop("Expected exactly one A or CNAME and no extra records: " + name)
    return rows[0]


def payload(record):
    return {key: copy.deepcopy(record[key]) for key in
            ("type", "name", "content", "ttl", "proxied", "comment", "tags", "settings") if key in record}


def desired(record):
    result = payload(record)
    result.pop("settings", None)  # CNAME-only options must not be applied to an A record.
    result.update(type="A", content=ADDRESS, proxied=False, ttl=300)
    return result


def matches(record, expected):
    return all(record.get(key) == expected.get(key) for key in
               ("type", "name", "content", "ttl", "proxied", "comment", "tags") if key in expected)


def cutover(api, save):
    zone = api("GET", f"/zones/{ZONE}")
    if zone.get("name") != "leonmingod.com" or zone.get("account", {}).get("id") != ACCOUNT:
        raise Stop("Unexpected zone/account; no DNS writes attempted")
    before = {name: records(api, name) for name in HOSTS}
    save("before.json", {"zone": ZONE, "records": before})
    changed = []
    try:
        for name in HOSTS:
            original = before[name]
            current = records(api, name)
            if current != original:
                raise Stop("Record changed since backup: " + name)
            target = desired(original)
            if matches(current, target):
                continue
            changed.append(name)  # Includes ambiguous transport failures.
            api("PUT", f"/zones/{ZONE}/dns_records/{original['id']}", target)
            if not matches(records(api, name), target):
                raise Stop("Update verification failed: " + name)
        after = {name: records(api, name) for name in HOSTS}
        if not all(matches(after[name], desired(before[name])) for name in HOSTS):
            raise Stop("Final DNS verification failed")
        save("after.json", {"zone": ZONE, "records": after})
        return {"status": "passed", "hosts": list(HOSTS), "type": "A", "address": ADDRESS,
                "proxied": False, "changed_count": len(changed), "backup_written_before_mutation": True}
    except Exception as failure:
        rollback = {}
        for name in reversed(changed):
            try:
                current = records(api, name)
                old = before[name]
                if current["id"] != old["id"]:
                    raise Stop("Record identity changed")
                if matches(current, payload(old)):
                    rollback[name] = "already_original"
                elif matches(current, desired(old)):
                    api("PUT", f"/zones/{ZONE}/dns_records/{old['id']}", payload(old))
                    if not matches(records(api, name), payload(old)):
                        raise Stop("Rollback verification failed")
                    rollback[name] = "restored"
                else:
                    raise Stop("Concurrent change; refusing to overwrite")
            except Exception:
                rollback[name] = "needs_review"
        save("failure.json", {"status": "failed", "error": str(failure) if isinstance(failure, Stop)
                              else type(failure).__name__, "rollback": rollback})
        raise


def self_test():
    class Fake:
        def __init__(self, fail=False, extra=False):
            self.rows = {name: {"id": str(i), "name": name, "type": "CNAME", "content": "old.example.net",
                               "ttl": 1, "proxied": True, "tags": [], "comment": "keep"}
                         for i, name in enumerate(HOSTS)}
            self.saved = {}
            self.writes = []
            self.fail, self.extra = fail, extra

        def api(self, method, path, body=None):
            if path == f"/zones/{ZONE}":
                return {"name": "leonmingod.com", "account": {"id": ACCOUNT}}
            if method == "GET":
                name = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)["name"][0]
                row = copy.deepcopy(self.rows[name])
                return [row, dict(row, type="AAAA")] if self.extra else [row]
            assert method == "PUT" and "before.json" in self.saved
            name = next(name for name, row in self.rows.items() if path.endswith("/" + row["id"]))
            self.writes.append(name)
            self.rows[name].update(copy.deepcopy(body))
            if self.fail and name == HOSTS[1] and body["type"] == "A":
                raise Stop("Simulated timeout after server accepted update")
            return copy.deepcopy(self.rows[name])

        def save(self, name, data):
            self.saved[name] = copy.deepcopy(data)

    good = Fake()
    assert cutover(good.api, good.save)["changed_count"] == 2
    assert len(good.writes) == 2 and all(row["comment"] == "keep" for row in good.rows.values())
    assert cutover(good.api, good.save)["changed_count"] == 0
    bad = Fake(fail=True)
    original = copy.deepcopy(bad.rows)
    try:
        cutover(bad.api, bad.save)
        raise AssertionError("Expected failure")
    except Stop:
        assert bad.rows == original
        assert set(bad.saved["failure.json"]["rollback"].values()) == {"restored"}
    unsafe = Fake(extra=True)
    try:
        cutover(unsafe.api, unsafe.save)
        raise AssertionError("Expected refusal")
    except Stop:
        assert not unsafe.writes
    print("Offline checks passed: exact scope, backup ordering, idempotency, ambiguous-write rollback, extra-record refusal")


def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        return
    OUTPUT.mkdir(exist_ok=False)

    def save(name, data):
        (OUTPUT / name).write_text(json.dumps(data, indent=2) + "\n")

    try:
        report = cutover(request, save)
    except Exception as error:
        print("DNS cutover failed: " + (str(error) if isinstance(error, Stop) else type(error).__name__))
        raise SystemExit(1) from None
    report["recorded_at_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save("report.json", report)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
