#!/usr/bin/env python3
"""Host-side DNS and Traefik aliases for nb3-<PR> previews; no CI secrets needed."""
import argparse
import fcntl
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

OWNER = "nb3-factory preview DNS"
PR = re.compile(r"preview-pr-([1-9][0-9]*)$")


def atomic_json(path, data):
    path = Path(path)
    text = json.dumps(data, indent=2, sort_keys=True) + "\n"
    if path.exists() and path.read_text() == text:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(text)
    temporary.replace(path)


def discover(root):
    # Include stopped containers and instance directories in desired DNS, so a
    # failed app or a redeploy does not prematurely remove its public hostname.
    ids = subprocess.check_output(["docker", "ps", "-aq"], text=True).split()
    containers = json.loads(subprocess.check_output(["docker", "inspect", *ids], text=True)) if ids else []
    wanted, routes = set(), {}
    for directory in (root / "instances").iterdir():
        match = re.fullmatch(r"pr-([1-9][0-9]*)", directory.name)
        if match and directory.is_dir() and not directory.is_symlink():
            wanted.add(match[1])
    for container in containers:
        match = PR.fullmatch(container["Name"].lstrip("/"))
        if not match:
            continue
        number = match[1]
        labels = container["Config"].get("Labels") or {}
        if labels.get("traefik.enable") != "true":
            continue
        if "nb3-preview" not in container["NetworkSettings"]["Networks"]:
            continue
        if f"traefik.http.services.pr{number}.loadbalancer.server.port" not in labels:
            continue
        wanted.add(number)
        if container["State"]["Running"]:
            routes[number] = f"pr{number}@docker"
    return wanted, routes


def alias_config(routes, domain):
    return {"http": {"routers": {
        f"nb3{number}": {"rule": f"Host(`nb3-{number}.{domain}`)",
                         "entryPoints": ["web"], "service": service, "priority": 1000,
                         "middlewares": ["nb3-root"]}
        for number, service in routes.items()
    }, "middlewares": {"nb3-root": {"redirectRegex": {
        "regex": r"^https?://([^/]+)/?$", "replacement": "https://${1}/main/", "permanent": False
    }}}}}


class Cloudflare:
    def __init__(self, config):
        self.token = Path(config["token_file"]).read_text().strip()
        self.base = f'https://api.cloudflare.com/client/v4/zones/{config["zone_id"]}/dns_records'

    def request(self, method, suffix="", body=None):
        req = urllib.request.Request(self.base + suffix,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"},
            method=method)
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            # Never include request headers or the credential in diagnostics.
            raise RuntimeError(f"Cloudflare DNS {method} failed: HTTP {error.code}") from None
        if not result.get("success"):
            raise RuntimeError("Cloudflare DNS operation unsuccessful")
        return result

    def records(self):
        records, page = [], 1
        while True:
            result = self.request("GET", "?" + urllib.parse.urlencode({"per_page": 100, "page": page}))
            records.extend(result["result"])
            if page >= result["result_info"]["total_pages"]:
                return records
            page += 1


def plan_dns(records, wanted, config, missing, now):
    """Only adopt exact preview CNAMEs; only delete marked records after grace."""
    domain, target = config["domain"], config["target"]
    desired = {f"nb3-{number}.{domain}" for number in wanted}
    names = {}
    for record in records:
        names.setdefault(record["name"], []).append(record)
    operations, absent = [], {}
    for name in sorted(desired):
        body = {"type": "CNAME", "name": name, "content": target,
                "proxied": True, "ttl": 1, "comment": OWNER}
        existing = names.get(name, [])
        if not existing:
            operations.append(("POST", "", body))
            continue
        if len(existing) != 1 or existing[0]["type"] != "CNAME" or existing[0]["content"].rstrip(".") != target:
            raise RuntimeError(f"Refusing to overwrite conflicting DNS record: {name}")
        record = existing[0]
        if record.get("comment") not in (None, "", OWNER):
            raise RuntimeError(f"Refusing to adopt another owner's DNS record: {name}")
        if not record.get("proxied") or record.get("comment") != OWNER:
            operations.append(("PATCH", "/" + record["id"], body))
    pattern = re.compile(r"nb3-[1-9][0-9]*\." + re.escape(domain) + r"$")
    for record in records:
        if (record.get("comment") != OWNER or not pattern.fullmatch(record["name"])
                or record["type"] != "CNAME" or record["content"].rstrip(".") != target
                or record["name"] in desired):
            continue
        first_missing = missing.get(record["id"], now)
        if now - first_missing >= config.get("cleanup_grace_seconds", 600):
            operations.append(("DELETE", "/" + record["id"], None))
        else:
            absent[record["id"]] = first_missing
    return operations, absent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/srv/nb3-preview/cloudflare/config.json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--routes-only", action="store_true")
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    root = Path(config.get("root", "/srv/nb3-preview"))
    # Same lock as deploy/destroy: never observe the middle of a replacement.
    with (root / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        wanted, routes = discover(root)
        if not args.dry_run:
            # JSON is a YAML subset. Traefik's file provider requires .yml/.yaml.
            atomic_json(root / "routing/aliases.yml", alias_config(routes, config["domain"]))
        if args.routes_only:
            print(f"Preview aliases: {len(routes)}")
            return
        api = Cloudflare(config)
        state_file = root / "cloudflare/missing.json"
        missing = json.loads(state_file.read_text()) if state_file.exists() else {}
        operations, absent = plan_dns(api.records(), wanted, config, missing, time.time())
        for method, suffix, body in operations:
            print(f'{"Would " if args.dry_run else ""}{method} preview DNS {body["name"] if body else suffix}')
            if not args.dry_run:
                api.request(method, suffix, body)
        if not args.dry_run:
            atomic_json(state_file, absent)
        print(f"Preview DNS sync: {len(wanted)} instances, {len(routes)} routes, {len(operations)} changes")


if __name__ == "__main__":
    main()
