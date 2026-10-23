#!/usr/bin/env python3
"""Zero-dependency CREDIT-1 scorer.

Tallies credit GIVEN (by publisher) and RECEIVED (by recipient) across published
CREDIT-1 files.  Sources may be local paths or https URLs / bare domains (fetched
read-only from /.well-known/credit.json, honouring robots.txt).

Usage: credit_score.py [--json] SOURCE [SOURCE...]
"""
import json, sys, urllib.request, urllib.robotparser, urllib.parse
from collections import defaultdict

sys.path.insert(0, __import__("os").path.dirname(__file__))
from credit_validate import validate  # noqa: E402

UA = "credit-scorer/1.0 (+https://github.com/fitzyracing1/credit)"


def key(e):
    return f"{e['type']}:{e['id'].lower()}"


def allowed(url, opener=urllib.request.urlopen):
    p = urllib.parse.urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        with opener(urllib.request.Request(f"{p.scheme}://{p.netloc}/robots.txt", headers={"User-Agent": UA}), timeout=10) as r:
            rp.parse(r.read().decode("utf-8", "replace").splitlines())
    except Exception:
        return True  # no robots.txt => allowed
    return rp.can_fetch(UA, url)


def load(src):
    if src.startswith(("http://", "https://")) or ("/" not in src and "." in src and not src.endswith(".json")):
        url = src if "://" in src else f"https://{src}/.well-known/credit.json"
        if not allowed(url):
            raise PermissionError(f"robots.txt disallows {url}")
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read(1_000_000))
    with open(src) as fh:
        return json.load(fh)


def tally(docs):
    given, received = defaultdict(int), defaultdict(int)
    for d in docs:
        pub = key(d["publisher"])
        for c in d["credits"]:
            w = c.get("weight", 1)
            to = key(c["to"])
            if to == pub:
                continue  # self-credit ignored
            given[pub] += w
            received[to] += w
    names = set(given) | set(received)
    return {n: {"given": given[n], "received": received[n]} for n in sorted(names)}


def main(argv):
    as_json = "--json" in argv
    srcs = [a for a in argv if a != "--json"]
    if not srcs:
        print(__doc__); return 2
    docs = []
    for s in srcs:
        try:
            d = load(s)
        except Exception as e:
            print(f"dark  {s}: {e}", file=sys.stderr); continue
        errs = validate(d)
        if errs:
            print(f"dark  {s}: invalid ({len(errs)} errors)", file=sys.stderr); continue
        docs.append(d)
    t = tally(docs)
    if as_json:
        print(json.dumps(t, indent=2))
    else:
        print(f"{'entity':48} {'given':>6} {'received':>8}")
        for n, v in sorted(t.items(), key=lambda kv: -(kv[1]['given'] + kv[1]['received'])):
            print(f"{n:48} {v['given']:>6} {v['received']:>8}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
