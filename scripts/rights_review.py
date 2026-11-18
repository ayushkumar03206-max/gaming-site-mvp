#!/usr/bin/env python3
"""Review rights records and keep an append-only audit trail.

Every status change is written to data/rights_audit_log.jsonl. The log is
append-only: this tool never edits or removes earlier lines.

Usage:
    python scripts/rights_review.py list
    python scripts/rights_review.py show rights-pathforge
    python scripts/rights_review.py approve rights-pathforge --by "Asha" --note "Checked source repo"
    python scripts/rights_review.py reject  rights-foo --by "Asha" --note "No licence found"
    python scripts/rights_review.py revoke  rights-foo --by "Asha" --note "Takedown request #12"
    python scripts/rights_review.py pending rights-foo --by "Asha" --note "Re-check after update"
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

TRANSITIONS = {"approve": "approved", "reject": "rejected", "revoke": "revoked", "pending": "pending"}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load(data_dir: Path) -> dict:
    return json.loads((data_dir / "assets.json").read_text(encoding="utf-8"))


def save(data_dir: Path, doc: dict) -> None:
    tmp = data_dir / "assets.json.tmp"
    tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(data_dir / "assets.json")


def append_log(data_dir: Path, entry: dict) -> None:
    with (data_dir / "rights_audit_log.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def find(doc: dict, rid: str) -> dict:
    for rec in doc.get("records", []):
        if rec.get("id") == rid:
            return rec
    raise SystemExit(f"No rights record with id {rid!r}")


def change_status(data_dir: Path, rid: str, action: str, actor: str, note: str) -> dict:
    if not actor.strip():
        raise SystemExit("--by is required: every decision needs a named reviewer")
    if action in ("approve",) and not note.strip():
        raise SystemExit("--note is required when approving: record what evidence you checked")
    doc = load(data_dir)
    rec = find(doc, rid)
    new_status = TRANSITIONS[action]
    old_status = rec.get("status")
    if action == "approve":
        missing = [f for f in ("owner", "license", "evidence") if not rec.get(f)]
        if missing:
            raise SystemExit(f"Cannot approve {rid}: missing {', '.join(missing)} in assets.json")
    ts = now_iso()
    rec["status"] = new_status
    rec["reviewed_by"] = actor
    rec["reviewed_at"] = ts
    save(data_dir, doc)
    entry = {"ts": ts, "record_id": rid, "action": action, "from_status": old_status,
             "to_status": new_status, "actor": actor, "note": note}
    append_log(data_dir, entry)
    return entry


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Rights review tool")
    ap.add_argument("--data", type=Path, default=DATA)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    sp = sub.add_parser("show"); sp.add_argument("id")
    for name in TRANSITIONS:
        p = sub.add_parser(name)
        p.add_argument("id")
        p.add_argument("--by", required=True)
        p.add_argument("--note", default="")
    args = ap.parse_args(argv)

    if args.cmd == "list":
        for rec in load(args.data).get("records", []):
            print(f"{rec.get('status', '?'):9} {rec.get('id'):24} {rec.get('title', '')}")
        return 0
    if args.cmd == "show":
        print(json.dumps(find(load(args.data), args.id), indent=2, ensure_ascii=False))
        return 0
    entry = change_status(args.data, args.id, args.cmd, args.by, args.note)
    print(f"{entry['record_id']}: {entry['from_status']} -> {entry['to_status']} (logged)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
