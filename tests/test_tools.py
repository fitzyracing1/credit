import json, os, sys, unittest
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from credit_validate import validate, main as vmain  # noqa
from credit_score import tally, key  # noqa

def ex(p):
    with open(os.path.join(ROOT, "examples", p)) as f: return json.load(f)

class Validate(unittest.TestCase):
    def test_wellknown_lit(self): self.assertEqual(validate(ex(".well-known/credit.json")), [])
    def test_company_lit(self): self.assertEqual(validate(ex("company.json")), [])
    def test_invalid_dark(self): self.assertGreaterEqual(len(validate(ex("invalid.json"))), 5)
    def test_unknown_field(self):
        d = ex("company.json"); d["evil"] = 1
        self.assertTrue(any("unknown" in e for e in validate(d)))
    def test_bool_weight_rejected(self):
        d = ex("company.json"); d["credits"][0]["weight"] = True
        self.assertTrue(validate(d))
    def test_bad_sig_alg(self):
        d = ex("company.json"); d["signature"]["alg"] = "rot13"
        self.assertTrue(validate(d))
    def test_cli_exit(self):
        self.assertEqual(vmain([os.path.join(ROOT, "examples/company.json")]), 0)
        self.assertEqual(vmain([os.path.join(ROOT, "examples/invalid.json")]), 1)

class Score(unittest.TestCase):
    def test_tally(self):
        t = tally([ex(".well-known/credit.json"), ex("company.json")])
        self.assertEqual(t["github:fitzyracing1"], {"given": 16, "received": 3})
        self.assertEqual(t["github:foundry-rs/foundry"]["received"], 11)
        self.assertEqual(t["company:example.com"]["given"], 4)
    def test_self_credit_ignored(self):
        d = ex("company.json"); d["credits"] = [{"to": d["publisher"], "for": "me", "date": "2026-01-01", "weight": 99}]
        self.assertEqual(tally([d]), {})
    def test_key_case_insensitive(self):
        self.assertEqual(key({"type": "github", "id": "Foo"}), "github:foo")

class Schema(unittest.TestCase):
    def test_schema_json_parses(self):
        with open(os.path.join(ROOT, "schema/credit-1.schema.json")) as f:
            self.assertEqual(json.load(f)["properties"]["credit"]["const"], "CREDIT-1")

if __name__ == "__main__": unittest.main()
