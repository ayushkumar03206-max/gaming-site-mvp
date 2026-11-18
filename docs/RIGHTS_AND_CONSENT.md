# Rights and consent

## Rights gate

Nothing reaches the public site unless it clears `scripts/rights_gate.py`.

A game is published only if:

1. `games.json` has `"status": "published"`.
2. Its `rights_id` matches a record in `assets.json`.
3. That record has `"status": "approved"` and non-empty `owner`, `license` and `evidence` fields.
4. Every entry in `third_party_components` has a licence and is approved.

If a game fails any of these, the build **withholds** it: there is no game page, no `play/` bundle,
and no entry in the search index. With `--strict`, which CI uses, the build fails outright, so a
problem can't slip through.

### Record fields (schema v2)

| Field | Meaning |
|---|---|
| `id` | referenced by `games.json → rights_id` |
| `kind` | `game`, `site`, `font`, `audio`, `image`, … |
| `owner` | legal owner of the work |
| `origin` | `original`, `licensed`, `open-source`, … |
| `license` | e.g. `proprietary-owned`, `MIT`, `CC-BY-4.0`, or a contract reference |
| `license_url`, `source_url` | where the licence and source can be checked |
| `third_party_components` | list of `{name, license, source_url, status}` |
| `status` | `pending` → `approved` / `rejected` / `revoked` |
| `evidence` | what was checked, and how |
| `reviewed_by`, `reviewed_at` | set by `rights_review.py` |

### Workflow

```bash
python scripts/rights_review.py list
python scripts/rights_review.py approve rights-mygame --by "Reviewer Name" --note "Checked contract #42"
python scripts/rights_review.py revoke  rights-mygame --by "Reviewer Name" --note "Takedown request"
```

Every change is appended to `data/rights_audit_log.jsonl`. Never edit or delete lines in that file.
Approving requires a named reviewer and a note.

**Takedowns:** revoke the record, rebuild, and redeploy. The game disappears from every page.

### Migration

`scripts/migrate_rights.py` upgrades v1 data, which used `approved: bool` and `licence`, to v2. An
approval without recorded evidence is downgraded to `pending` and needs another review. It does a dry
run by default; pass `--write` to apply. It writes a backup and logs every migrated record.

## Consent

`site_src/consent.js`:

- Reads the optional scripts from `data/tracking.json`, which the build embeds into `assets/site-data.js`.
- **Nothing optional loads before an explicit opt-in.** The default is rejected.
- The banner appears automatically only when at least one tracker has `"enabled": true`.
- The footer's **Privacy settings** button reopens the panel at any time.
- Choices are stored in `localStorage` under `gl_consent_v1`. Other scripts can check them with
  `window.GLConsent.has('analytics')` or listen for the `gl:consent` event.

### Strictly necessary storage (not consent-gated)

| Key | Purpose |
|---|---|
| `gl_pathforge_v1` | settings and win/loss record vs AI |
| `gl_neon_dodge_best` | best score |
| `gl_chroma_shift_v1` | unlocked levels, stars, scores |
| `gl_plays_v1` | local play counts for “Popular with you” (never sent anywhere) |
| `gl_consent_v1` | the consent choice itself |

All of these stay in the visitor's browser. The Privacy page describes them.
