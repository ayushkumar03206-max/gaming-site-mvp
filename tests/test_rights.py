import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import migrate_rights  # noqa: E402
import rights_gate  # noqa: E402
import rights_review  # noqa: E402


def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


class RightsGateTests(unittest.TestCase):
    def setUp(self):
        self.games = load("games.json")
        self.assets = load("assets.json")

    def test_repo_data_passes_gate(self):
        """Repo data is valid: the original games are publishable, and anything withheld is withheld ONLY
        because its rights review is still pending (no missing, rejected or malformed records)."""
        res = rights_gate.evaluate(self.games, self.assets)
        self.assertEqual(res.errors, [])
        self.assertTrue({"pathforge", "neon-dodge", "chroma-shift"} <= {g["slug"] for g in res.publishable})
        for g, why in res.withheld:
            self.assertEqual(why, "rights status is 'pending', not approved", g["slug"])
        # preview mode builds exactly the pending games in addition
        prev = rights_gate.evaluate(self.games, self.assets, allow_pending=True)
        self.assertEqual(len(prev.publishable), len(self.games["games"]))
        self.assertEqual({g["slug"] for g in prev.pending}, {g["slug"] for g, _ in res.withheld})

    def test_preview_never_includes_rejected_or_revoked(self):
        assets = copy.deepcopy(self.assets)
        assets["records"][0]["status"] = "rejected"
        res = rights_gate.evaluate(self.games, assets, allow_pending=True)
        self.assertNotIn("pathforge", [g["slug"] for g in res.publishable])

    def test_pending_record_is_withheld(self):
        assets = copy.deepcopy(self.assets)
        assets["records"][0]["status"] = "pending"
        res = rights_gate.evaluate(self.games, assets)
        self.assertIn("pathforge", [g["slug"] for g, _ in res.withheld])
        self.assertNotIn("pathforge", [g["slug"] for g in res.publishable])

    def test_missing_record_is_withheld(self):
        games = copy.deepcopy(self.games)
        games["games"][1]["rights_id"] = "does-not-exist"
        res = rights_gate.evaluate(games, self.assets)
        self.assertEqual(res.withheld[0][1], "no rights record")

    def test_unlicensed_third_party_component_is_withheld(self):
        assets = copy.deepcopy(self.assets)
        assets["records"][2]["third_party_components"] = [{"name": "some-lib", "license": "", "status": "approved"}]
        res = rights_gate.evaluate(self.games, assets)
        self.assertIn("chroma-shift", [g["slug"] for g, _ in res.withheld])

    def test_draft_game_is_skipped_not_error(self):
        games = copy.deepcopy(self.games)
        games["games"][0]["status"] = "draft"
        base = rights_gate.evaluate(self.games, self.assets)
        res = rights_gate.evaluate(games, self.assets)
        self.assertEqual(res.errors, [])
        self.assertNotIn("pathforge", [g["slug"] for g in res.publishable])
        self.assertNotIn("pathforge", [g["slug"] for g, _ in res.withheld])
        self.assertEqual(len(res.publishable), len(base.publishable) - 1)

    def test_duplicate_slug_is_error(self):
        games = copy.deepcopy(self.games)
        games["games"][1]["slug"] = "pathforge"
        res = rights_gate.evaluate(games, self.assets)
        self.assertTrue(any("duplicate slug" in e for e in res.errors))

    def test_every_published_game_has_required_fields(self):
        for g in self.games["games"]:
            for f in ("id", "slug", "title", "short_description", "description", "instructions", "controls",
                      "entry", "source_dir", "thumbnail", "categories", "rights_id", "date_added"):
                self.assertTrue(g.get(f), f"{g.get('slug')} missing {f}")
            self.assertTrue((ROOT / g["source_dir"] / "index.html").exists())
            self.assertTrue((ROOT / g["source_dir"] / g["thumbnail"]).exists())


class RightsReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copy(ROOT / "data" / "assets.json", self.tmp / "assets.json")
        shutil.copy(ROOT / "data" / "rights_audit_log.jsonl", self.tmp / "rights_audit_log.jsonl")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_status_change_is_logged_append_only(self):
        before = (self.tmp / "rights_audit_log.jsonl").read_text(encoding="utf-8")
        rights_review.change_status(self.tmp, "rights-neon-dodge", "revoke", "tester", "unit test")
        after = (self.tmp / "rights_audit_log.jsonl").read_text(encoding="utf-8")
        self.assertTrue(after.startswith(before))
        last = json.loads(after.strip().splitlines()[-1])
        self.assertEqual(last["to_status"], "revoked")
        self.assertEqual(last["actor"], "tester")
        doc = json.loads((self.tmp / "assets.json").read_text(encoding="utf-8"))
        rec = next(r for r in doc["records"] if r["id"] == "rights-neon-dodge")
        self.assertEqual(rec["status"], "revoked")

    def test_approve_requires_note_and_reviewer(self):
        with self.assertRaises(SystemExit):
            rights_review.change_status(self.tmp, "rights-neon-dodge", "approve", "tester", "")
        with self.assertRaises(SystemExit):
            rights_review.change_status(self.tmp, "rights-neon-dodge", "approve", "  ", "note")


class MigrateTests(unittest.TestCase):
    def test_v1_records_migrate_safely(self):
        v1 = {"assets": [
            {"id": "a", "kind": "game", "owner": "X", "licence": "MIT", "approved": True, "evidence": "repo LICENSE"},
            {"id": "b", "kind": "game", "owner": "Y", "licence": "MIT", "approved": True},
            {"id": "c", "kind": "game", "owner": "Z", "approved": False},
        ]}
        new, changed = migrate_rights.migrate(v1)
        self.assertEqual(new["schema_version"], 2)
        by = {r["id"]: r for r in new["records"]}
        self.assertEqual(by["a"]["status"], "approved")
        self.assertEqual(by["a"]["license"], "MIT")
        self.assertEqual(by["b"]["status"], "pending", "approval without evidence must not survive")
        self.assertEqual(by["c"]["status"], "pending")
        self.assertEqual(set(changed), {"a", "b", "c"})

    def test_current_schema_is_noop(self):
        doc = load("assets.json")
        new, changed = migrate_rights.migrate(doc)
        self.assertEqual(changed, [])
        self.assertIs(new, doc)


if __name__ == "__main__":
    unittest.main()
