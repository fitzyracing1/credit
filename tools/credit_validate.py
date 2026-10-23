#!/usr/bin/env python3
"""Zero-dependency CREDIT-1 validator.  Usage: credit_validate.py FILE [FILE...]"""
import json, re, sys

ENTITY_TYPES = {"github", "company", "person", "domain", "eth"}
SIG_ALGS = {"ed25519", "eip191"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _extra(obj, allowed, path, errs):
    for k in obj:
        if k not in allowed:
            errs.append(f"{path}: unknown field '{k}'")


def _entity(e, path, errs):
    if not isinstance(e, dict):
        return errs.append(f"{path}: must be object")
    _extra(e, {"type", "id", "name", "url"}, path, errs)
    if e.get("type") not in ENTITY_TYPES:
        errs.append(f"{path}.type: must be one of {sorted(ENTITY_TYPES)}")
    i = e.get("id")
    if not isinstance(i, str) or not (1 <= len(i) <= 256):
        errs.append(f"{path}.id: must be non-empty string <=256")
    if "name" in e and not isinstance(e["name"], str):
        errs.append(f"{path}.name: must be string")
    if "url" in e and not (isinstance(e["url"], str) and re.match(r"^https?://", e["url"])):
        errs.append(f"{path}.url: must be http(s) URI")


def validate(doc):
    errs = []
    if not isinstance(doc, dict):
        return ["root: must be object"]
    _extra(doc, {"credit", "publisher", "updated", "credits", "signature"}, "root", errs)
    if doc.get("credit") != "CREDIT-1":
        errs.append("credit: must equal 'CREDIT-1'")
    if "publisher" not in doc:
        errs.append("publisher: required")
    else:
        _entity(doc["publisher"], "publisher", errs)
    cs = doc.get("credits")
    if not isinstance(cs, list):
        errs.append("credits: required array")
        cs = []
    for n, c in enumerate(cs):
        p = f"credits[{n}]"
        if not isinstance(c, dict):
            errs.append(f"{p}: must be object"); continue
        _extra(c, {"to", "for", "date", "weight", "tags"}, p, errs)
        if "to" not in c: errs.append(f"{p}.to: required")
        else: _entity(c["to"], p + ".to", errs)
        f = c.get("for")
        if not isinstance(f, str) or not (1 <= len(f) <= 1000):
            errs.append(f"{p}.for: required non-empty string")
        if not (isinstance(c.get("date"), str) and DATE.match(c["date"])):
            errs.append(f"{p}.date: required YYYY-MM-DD")
        w = c.get("weight", 1)
        if not (isinstance(w, int) and not isinstance(w, bool) and 1 <= w <= 100):
            errs.append(f"{p}.weight: integer 1..100")
        t = c.get("tags", [])
        if not (isinstance(t, list) and len(t) <= 16 and all(isinstance(x, str) and len(x) <= 64 for x in t)):
            errs.append(f"{p}.tags: up to 16 strings <=64")
    if "signature" in doc:
        s = doc["signature"]
        if not isinstance(s, dict):
            errs.append("signature: must be object")
        else:
            _extra(s, {"alg", "key", "sig"}, "signature", errs)
            if s.get("alg") not in SIG_ALGS: errs.append(f"signature.alg: one of {sorted(SIG_ALGS)}")
            for k in ("key", "sig"):
                if not isinstance(s.get(k), str): errs.append(f"signature.{k}: required string")
    return errs


def main(argv):
    if not argv:
        print(__doc__); return 2
    bad = 0
    for path in argv:
        try:
            with open(path) as fh: doc = json.load(fh)
            errs = validate(doc)
        except (OSError, ValueError) as e:
            errs = [f"parse: {e}"]
        if errs:
            bad += 1
            print(f"dark  {path}")
            for e in errs: print(f"      - {e}")
        else:
            print(f"lit   {path}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
