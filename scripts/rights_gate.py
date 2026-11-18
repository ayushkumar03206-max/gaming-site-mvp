#!/usr/bin/env python3
"""Rights gate: decides which games may be published.

A game is publishable only when ALL of these hold:
  * games.json marks it ``"status": "published"``
  * its ``rights_id`` points at a record in assets.json
  * that record has ``"status": "approved"``, a non-empty owner, licence and evidence
  * every entry in ``third_party_components`` is itself approved with a licence

Anything else is withheld from the build. With ``--strict`` (used in CI) any
published game that fails the gate makes the command exit non-zero, so a
mistake can never silently ship.

Usage:
    python scripts/rights_gate.py            # report
    python scripts/rights_gate.py --strict   # exit 1 on any problem
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

REQUIRED_RECORD_FIELDS = ("id", "kind", "owner", "license", "status", "evidence")
APPROVED = "approved"
VALID_STATUSES = {"pending", "approved", "rejected", "revoked"}


@dataclass
class GateResult:
    publishable: list = field(default_factory=list)
    withheld: list = field(default_factory=list)  # (game, reason)
    errors: list = field(default_factory=list)    # data problems

    @property
    def ok(self) -> bool:
        return not self.withheld and not self.errors


def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def index_records(assets: dict) -> tuple[dict, list]:
    errors = []
    records = {}
    for rec in assets.get("records", []):
        rid = rec.get("id")
        if not rid:
            errors.append("assets.json: record without id")
            continue
        if rid in records:
            errors.append(f"assets.json: duplicate record id {rid!r}")
        missing = [f for f in REQUIRED_RECORD_FIELDS if not rec.get(f)]
        if missing:
            errors.append(f"assets.json: record {rid!r} missing {', '.join(missing)}")
        if rec.get("status") not in VALID_STATUSES:
            errors.append(f"assets.json: record {rid!r} has unknown status {rec.get('status')!r}")
        records[rid] = rec
    return records, errors


def check_record(rec: dict | None) -> str | None:
    """Return a reason string if the record does not clear publishing, else None."""
    if rec is None:
        return "no rights record"
    if rec.get("status") != APPROVED:
        return f"rights status is {rec.get('status')!r}, not approved"
    for f in ("owner", "license", "evidence"):
        if not rec.get(f):
            return f"rights record missing {f}"
    for comp in rec.get("third_party_components", []) or []:
        name = comp.get("name", "?")
        if not comp.get("license"):
            return f"third-party component {name!r} has no licence"
        if comp.get("status", APPROVED) != APPROVED:
            return f"third-party component {name!r} is not approved"
    return None


def evaluate(games_doc: dict, assets_doc: dict) -> GateResult:
    result = GateResult()
    records, errors = index_records(assets_doc)
    result.errors.extend(errors)
    seen_ids, seen_slugs = set(), set()
    for game in games_doc.get("games", []):
        gid, slug = game.get("id"), game.get("slug")
        if gid in seen_ids:
            result.errors.append(f"games.json: duplicate id {gid!r}")
        if slug in seen_slugs:
            result.errors.append(f"games.json: duplicate slug {slug!r}")
        seen_ids.add(gid)
        seen_slugs.add(slug)
        if game.get("status") != "published":
            continue  # drafts are simply not built; not an error
        reason = check_record(records.get(game.get("rights_id")))
        if reason:
            result.withheld.append((game, reason))
        else:
            result.publishable.append(game)
    return result


def run(strict: bool = False, data_dir: Path = DATA) -> GateResult:
    res = evaluate(load_json(data_dir / "games.json"), load_json(data_dir / "assets.json"))
    for game in res.publishable:
        print(f"  PASS  {game['slug']}")
    for game, reason in res.withheld:
        print(f"  HOLD  {game.get('slug')}: {reason}")
    for err in res.errors:
        print(f"  ERROR {err}")
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--strict", action="store_true", help="exit 1 if any published game is withheld")
    ap.add_argument("--data", type=Path, default=DATA)
    args = ap.parse_args(argv)
    print("Rights gate")
    res = run(args.strict, args.data)
    if args.strict and not res.ok:
        print("Rights gate FAILED (strict mode).")
        return 1
    print(f"{len(res.publishable)} game(s) cleared for publishing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
