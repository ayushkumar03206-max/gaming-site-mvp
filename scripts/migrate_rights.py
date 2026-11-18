#!/usr/bin/env python3
"""Migrate data/assets.json to the current rights schema (v2).

v1 -> v2 changes:
  * ``approved: bool``          -> ``status: "approved" | "pending"``
  * ``licence`` (UK spelling)   -> ``license``
  * adds ``origin``, ``third_party_components``, ``evidence`` defaults
  * any record that cannot prove approval becomes ``pending`` (never auto-approved)

The migration is idempotent. A backup (assets.json.bak) is written first and
each migrated record is logged to rights_audit_log.jsonl.

Usage:
    python scripts/migrate_rights.py            # dry run
    python scripts/migrate_rights.py --write
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CURRENT = 2


def migrate_record(rec: dict) -> tuple[dict, bool]:
    out = dict(rec)
    changed = False
    if "licence" in out and "license" not in out:
        out["license"] = out.pop("licence"); changed = True
    if "status" not in out:
        out["status"] = "approved" if out.pop("approved", False) is True and out.get("license") and out.get("owner") else "pending"
        changed = True
    elif "approved" in out:
        out.pop("approved"); changed = True
    for key, default in (("origin", "unknown"), ("third_party_components", []), ("evidence", "")):
        if key not in out:
            out[key] = default; changed = True
    if out["status"] == "approved" and not out.get("evidence"):
        # an approval without recorded evidence is not trustworthy after migration
        out["status"] = "pending"; changed = True
    return out, changed


def migrate(doc: dict) -> tuple[dict, list]:
    version = doc.get("schema_version", 1)
    if version >= CURRENT:
        return doc, []
    changed_ids = []
    records = []
    for rec in doc.get("records", doc.get("assets", [])):
        new, changed = migrate_record(rec)
        records.append(new)
        if changed:
            changed_ids.append(new.get("id"))
    return {"schema_version": CURRENT, "records": records}, changed_ids


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Migrate rights data")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--data", type=Path, default=DATA)
    args = ap.parse_args(argv)
    path = args.data / "assets.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    new, changed = migrate(doc)
    if not changed and doc.get("schema_version", 1) >= CURRENT:
        print(f"assets.json already at schema v{CURRENT}; nothing to do.")
        return 0
    print(f"Would migrate {len(changed)} record(s): {', '.join(map(str, changed)) or '-'}")
    if not args.write:
        print("Dry run. Re-run with --write to apply.")
        return 0
    shutil.copyfile(path, path.with_suffix(".json.bak"))
    path.write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    with (args.data / "rights_audit_log.jsonl").open("a", encoding="utf-8") as fh:
        for rid in changed:
            fh.write(json.dumps({"ts": ts, "record_id": rid, "action": "migrate", "from_status": None,
                                 "to_status": None, "actor": "migrate_rights.py",
                                 "note": f"schema v{doc.get('schema_version', 1)} -> v{CURRENT}"}) + "\n")
    print("Migration written. Backup: assets.json.bak")
    return 0


if __name__ == "__main__":
    sys.exit(main())
