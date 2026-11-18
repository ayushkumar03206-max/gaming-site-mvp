#!/usr/bin/env python3
"""Register a game from a JSON spec file.

Adds the game to data/games.json and creates a *pending* rights record in
data/assets.json. Nothing is published until the record is approved with
scripts/rights_review.py, so the rights gate stays in charge.

The spec is a games.json entry plus a "rights" object:
    {"slug": "highway-rush", "title": "...", ..., "rights": {"title": "...", "evidence": "..."}}

Usage:
    python scripts/add_game.py spec.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
REQUIRED = ("slug", "title", "categories", "short_description", "description", "instructions", "controls", "orientation")


def add(spec: dict, data_dir: Path = DATA) -> dict:
    games = json.loads((data_dir / "games.json").read_text(encoding="utf-8"))
    assets = json.loads((data_dir / "assets.json").read_text(encoding="utf-8"))
    cats = {c["slug"] for c in json.loads((data_dir / "categories.json").read_text(encoding="utf-8"))["categories"]}
    missing = [k for k in REQUIRED if not spec.get(k)]
    if missing:
        raise SystemExit(f"spec missing: {', '.join(missing)}")
    slug = spec["slug"]
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
        raise SystemExit(f"bad slug {slug!r}")
    if any(g["slug"] == slug or g["title"].lower() == spec["title"].lower() for g in games["games"]):
        raise SystemExit(f"game {slug!r} is already registered")
    unknown = [c for c in spec["categories"] if c not in cats]
    if unknown:
        raise SystemExit(f"unknown categories: {unknown}")
    if not (ROOT / "games" / slug / "index.html").exists():
        raise SystemExit(f"games/{slug}/index.html not found")
    rights = spec.pop("rights", {})
    nums = [int(g["id"].split("-")[1]) for g in games["games"] if re.fullmatch(r"gl-\d+", g.get("id", ""))]
    entry = {
        "id": f"gl-{(max(nums) + 1 if nums else 1):03d}",
        "status": "published",
        "entry": f"play/{slug}/index.html",
        "source_dir": f"games/{slug}",
        "thumbnail": "thumb.svg",
        "saves_progress": True,
        "featured": False,
        "curated_trending": False,
        "modes": {"single": True, "local": False, "online": False},
        "players": {"min": 1, "max": 1},
        "rights_id": f"rights-{slug}",
    }
    entry.update(spec)
    games["games"].append(entry)
    rid = entry["rights_id"]
    if any(r["id"] == rid for r in assets["records"]):
        raise SystemExit(f"rights record {rid!r} already exists")
    assets["records"].append({
        "id": rid, "kind": "game", "title": rights.get("title", entry["title"]),
        "owner": rights.get("owner", "Gridlight Arcade"), "origin": rights.get("origin", "original"),
        "license": rights.get("license", "proprietary-owned"), "license_url": rights.get("license_url"),
        "source_url": rights.get("source_url"), "third_party_components": rights.get("third_party_components", []),
        "status": "pending", "reviewed_by": None, "reviewed_at": None,
        "evidence": rights.get("evidence", ""),
    })
    (data_dir / "games.json").write_text(json.dumps(games, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (data_dir / "assets.json").write_text(json.dumps(assets, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return entry


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1:
        print(__doc__)
        return 2
    entry = add(json.loads(Path(argv[0]).read_text(encoding="utf-8-sig")))
    print(f"Registered {entry['slug']} as {entry['id']} with a PENDING rights record {entry['rights_id']}.")
    print(f"Approve it with: python scripts/rights_review.py approve {entry['rights_id']} --by \"<name>\" --note \"...\"")
    return 0


if __name__ == "__main__":
    sys.exit(main())
