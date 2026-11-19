#!/usr/bin/env python3
"""Static site generator for Gridlight Arcade.

Reads data/*.json, runs the rights gate, and writes a fully static site to
dist/ (or --out). Only the Python standard library is used.

All internal links are *relative* (e.g. ``../games/pathforge/index.html``)
so the output works from any sub-path, on GitHub Pages, Netlify, Cloudflare
Pages, or straight from disk via file://. The 404 page is the exception: it
can be served from any URL, so it uses ``base_path`` from data/site.json.

Usage:
    python scripts/build_static_site.py [--out dist] [--strict]
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date, datetime
from html import escape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rights_gate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SITE_SRC = ROOT / "site_src"
GAMES_SRC = ROOT / "games"

e = escape


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


# --------------------------------------------------------------------------
# Context
# --------------------------------------------------------------------------
class Ctx:
    def __init__(self, data_dir: Path, out: Path, today: date | None = None, preview_pending: bool = False):
        global DATA
        DATA = data_dir
        self.out = out
        self.preview = preview_pending
        self.site = load("site.json")
        self.categories = load("categories.json")["categories"]
        self.cat_by_slug = {c["slug"]: c for c in self.categories}
        self.tracking = load("tracking.json")
        gate = rights_gate.evaluate(load("games.json"), load("assets.json"), allow_pending=preview_pending)
        self.gate = gate
        self.games = sorted(gate.publishable, key=lambda g: (g.get("date_added", ""), g["title"]), reverse=True)
        self.assets = {r["id"]: r for r in load("assets.json")["records"]}
        self.today = today or date.today()
        self.pages: list[str] = []  # relative paths written, for the sitemap

    def games_in(self, cat_slug: str):
        return [g for g in self.games if cat_slug in g.get("categories", [])]

    def is_new(self, g) -> bool:
        try:
            added = datetime.strptime(g.get("date_added", ""), "%Y-%m-%d").date()
        except ValueError:
            return False
        return (self.today - added).days <= int(self.site.get("new_game_window_days", 60))

    def url(self, rel: str) -> str:
        base = self.site["base_url"].rstrip("/")
        rel = rel[:-len("index.html")] if rel.endswith("index.html") else rel
        return f"{base}/{rel}"


# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------
LOGO_SVG = (
    '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">'
    '<rect x="2" y="2" width="28" height="28" rx="8" fill="url(#lg)"/>'
    '<path d="M9 11h6v6H9zM17 15h6v6h-6zM9 19h4v4H9zM19 9h4v4h-4z" fill="#0b0d1a"/>'
    '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">'
    '<stop offset="0" stop-color="#29f0ff"/><stop offset="1" stop-color="#ff3fb4"/></linearGradient></defs></svg>'
)


def head(ctx: Ctx, root: str, title: str, desc: str, rel_path: str, extra_head: str = "", og_image: str | None = None) -> str:
    site = ctx.site
    full_title = title if title == site["name"] else f"{title} | {site['name']}"
    canonical = ctx.url(rel_path)
    og = f'<meta property="og:image" content="{e(ctx.url(og_image))}">' if og_image else ""
    return f"""<!doctype html>
<html lang="{e(site.get('default_locale', 'en'))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(site['name'])}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(canonical)}">
{og}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b0d1a">{'<meta name="robots" content="noindex">' if ctx.preview else ''}
<link rel="icon" href="{root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{root}assets/site.css">
{extra_head}
</head>"""


def header(ctx: Ctx, root: str, active: str) -> str:
    def nav(key, href, label):
        cur = ' aria-current="page"' if key == active else ""
        return f'<a href="{root}{href}"{cur}>{label}</a>'

    banner = ""
    if ctx.preview:
        names = ", ".join(g["title"] for g in ctx.gate.pending) or "none"
        banner = (f'<div class="preview-banner" role="note"><strong>Preview build, not for publishing.</strong> '
                  f'Includes games whose rights review is still pending: {e(names)}.</div>')
    return f"""<body data-root="{root}">
{banner}<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="{root}index.html">{LOGO_SVG}<span>{e(ctx.site['name'])}</span></a>
    <form class="search" role="search" action="{root}search/index.html" method="get">
      <label class="sr" for="q">Search games</label>
      <input id="q" name="q" type="search" placeholder="Search games or categories" autocomplete="off">
      <button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>
    </form>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="Menu"><span></span><span></span><span></span></button>
    <nav id="main-nav" class="main-nav" aria-label="Main">
      {nav('home', 'index.html', 'Home')}
      {nav('games', 'games/index.html', 'All Games')}
      {nav('categories', 'categories/index.html', 'Categories')}
      {nav('about', 'about/index.html', 'About')}
    </nav>
  </div>
</header>
<main id="main">"""


def footer(ctx: Ctx, root: str, extra_js: str = "") -> str:
    cats = "".join(f'<li><a href="{root}categories/{c["slug"]}/index.html">{e(c["name"])}</a></li>'
                   for c in ctx.categories if ctx.games_in(c["slug"]))
    year = ctx.today.year
    return f"""</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <a class="brand" href="{root}index.html">{LOGO_SVG}<span>{e(ctx.site['name'])}</span></a>
      <p class="muted">{e(ctx.site['tagline'])}</p>
    </div>
    <div><h2>Play</h2><ul>
      <li><a href="{root}games/index.html">All games</a></li>
      <li><a href="{root}categories/index.html">Categories</a></li>
      <li><a href="{root}search/index.html">Search</a></li></ul></div>
    <div><h2>Categories</h2><ul>{cats}</ul></div>
    <div><h2>Info</h2><ul>
      <li><a href="{root}about/index.html">About us</a></li>
      <li><a href="{root}contact/index.html">Contact</a></li>
      <li><a href="{root}faq/index.html">FAQ</a></li>
      <li><a href="{root}licensing/index.html">Game licensing</a></li>
      <li><a href="{root}privacy/index.html">Privacy policy</a></li>
      <li><a href="{root}terms/index.html">Terms &amp; conditions</a></li>
      <li><button type="button" class="linklike" data-consent-open>Privacy settings</button></li></ul></div>
  </div>
  <div class="wrap legal">© {year} {e(ctx.site['operator'])}. All games on this site are original works.</div>
</footer>
<script src="{root}assets/site-data.js"></script>
<script src="{root}assets/consent.js"></script>
<script src="{root}assets/app.js"></script>
{extra_js}
</body>
</html>
"""


PLACEHOLDER_DOMAINS = ("example.com", "example.org", "example.net")


def is_placeholder_email(addr: str | None) -> bool:
    addr = (addr or "").strip().lower()
    return not addr or "@" not in addr or addr.split("@")[-1] in PLACEHOLDER_DOMAINS


def config_warnings(site: dict) -> list[str]:
    """Placeholder values that must be replaced by the owner before a public launch."""
    out = []
    if is_placeholder_email(site.get("contact_email")):
        out.append("data/site.json contact_email is a placeholder; the site shows 'contact email not yet published' instead of a mailto link")
    if any(d in (site.get("base_url") or "") for d in PLACEHOLDER_DOMAINS):
        out.append("data/site.json base_url is a placeholder; canonical/OG/sitemap URLs will be wrong unless --base-url is passed")
    return out


def contact_html(site: dict) -> str:
    """Never render a fake address: placeholder emails become an explicit notice."""
    addr = site.get("contact_email")
    if is_placeholder_email(addr):
        return '<span class="muted">contact email not yet published</span>'
    return f'<a href="mailto:{e(addr)}">{e(addr)}</a>'


def cat_name(ctx: Ctx, slug: str) -> str:
    c = ctx.cat_by_slug.get(slug)
    return c["name"] if c else slug.title()


def modes(g) -> dict:
    m = g.get("modes") or {}
    return {"single": bool(m.get("single", True)), "local": bool(m.get("local", False)), "online": bool(m.get("online", False))}


def online_live(ctx: Ctx, g) -> bool:
    """Online play is only advertised when the game says so AND a multiplayer server is configured."""
    return modes(g)["online"] and bool((ctx.site.get("multiplayer") or {}).get("server_url"))


def badges(ctx: Ctx, g) -> str:
    m = modes(g)
    out = ['<span class="badge badge-play">Playable now</span>']
    if m["single"]:
        out.append('<span class="badge">1 player</span>')
    if m["local"]:
        out.append('<span class="badge">2P same device</span>')
    if online_live(ctx, g):
        out.append('<span class="badge badge-new">Online</span>')
    if ctx.is_new(g):
        out.append('<span class="badge badge-new">New</span>')
    if g.get("saves_progress"):
        out.append('<span class="badge">Saves progress</span>')
    return "".join(out)


def mode_text(ctx: Ctx, g) -> str:
    m = modes(g)
    parts = (["Single player"] if m["single"] else []) + (["2 players on one device"] if m["local"] else [])
    parts.append("Online with a friend" if online_live(ctx, g) else "Online play not available yet")
    return " · ".join(parts)


def card(ctx: Ctx, g, root: str) -> str:
    first = g["categories"][0] if g.get("categories") else ""
    href = f'{root}games/{g["slug"]}/index.html'
    return f"""<article class="card">
  <a class="card-thumb" href="{href}" tabindex="-1" aria-hidden="true"><img src="{root}play/{g['slug']}/{g['thumbnail']}" alt="" width="320" height="200" loading="lazy"></a>
  <div class="card-body">
    <div class="card-meta"><a class="chip" href="{root}categories/{first}/index.html">{e(cat_name(ctx, first))}</a></div>
    <h3><a href="{href}">{e(g['title'])}</a></h3>
    <p>{e(g['short_description'])}</p>
    <div class="badges">{badges(ctx, g)}</div>
    <a class="btn btn-primary btn-sm" href="{href}">Play now</a>
  </div>
</article>"""


def grid(ctx, games, root, empty="No games here yet.") -> str:
    if not games:
        return f'<p class="muted">{e(empty)}</p>'
    return '<div class="grid">' + "".join(card(ctx, g, root) for g in games) + "</div>"


def section(title: str, body: str, sub: str = "", link: str = "", sid: str = "") -> str:
    more = f'<a class="more" href="{link}">View all →</a>' if link else ""
    subp = f'<p class="section-sub">{sub}</p>' if sub else ""
    ida = f' id="{sid}"' if sid else ""
    return f"""<section class="section"{ida}><div class="wrap">
<div class="section-head"><div><h2>{title}</h2>{subp}</div>{more}</div>
{body}
</div></section>"""


def cat_tiles(ctx, root) -> str:
    tiles = []
    for c in ctx.categories:
        n = len(ctx.games_in(c["slug"]))
        if not n:
            continue
        tiles.append(f'<a class="cat-tile" href="{root}categories/{c["slug"]}/index.html">'
                     f'<span class="cat-icon" aria-hidden="true">{e(c["icon"])}</span>'
                     f'<span class="cat-name">{e(c["name"])}</span>'
                     f'<span class="cat-count">{n} game{"s" if n != 1 else ""}</span></a>')
    return '<div class="cat-grid">' + "".join(tiles) + "</div>"


def write(ctx: Ctx, rel: str, html: str, sitemap: bool = True) -> None:
    path = ctx.out / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    if sitemap:
        ctx.pages.append(rel)


def page(ctx: Ctx, rel: str, title: str, desc: str, active: str, body: str, extra_head="", extra_js="", og_image=None) -> None:
    depth = rel.count("/")
    root = "../" * depth
    html = head(ctx, root, title, desc, rel, extra_head, og_image) + header(ctx, root, active) + body + footer(ctx, root, extra_js)
    write(ctx, rel, html)


def breadcrumb(root, items) -> str:
    parts = [f'<li><a href="{root}index.html">Home</a></li>']
    for label, href in items:
        parts.append(f'<li><a href="{href}">{e(label)}</a></li>' if href else f'<li aria-current="page">{e(label)}</li>')
    return '<nav class="crumbs" aria-label="Breadcrumb"><ol>' + "".join(parts) + "</ol></nav>"


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------
def build_home(ctx: Ctx) -> None:
    root = ""
    feat = [g for g in ctx.games if g.get("featured")] or ctx.games[:1]
    hero_game = feat[0] if feat else None
    trending = [g for g in ctx.games if g.get("curated_trending")]
    new = [g for g in ctx.games if ctx.is_new(g)]
    recent = sorted(ctx.games, key=lambda g: g.get("date_added", ""), reverse=True)[:8]

    hero = ""
    if hero_game:
        hg = hero_game
        hero = f"""<section class="hero"><div class="wrap hero-grid">
  <div class="hero-copy">
    <p class="eyebrow">Free original browser games</p>
    <h1>Play smart.<br><span class="grad">Play instantly.</span></h1>
    <p class="lead">Hand-built games that load in seconds on phone, tablet or desktop. No downloads, no accounts, no fake hype.</p>
    <div class="hero-cta"><a class="btn btn-primary" href="games/{hg['slug']}/index.html">Play {e(hg['title'])}</a>
    <a class="btn btn-ghost" href="games/index.html">Browse all games</a></div>
    <ul class="hero-points"><li>Runs in your browser</li><li>Touch &amp; keyboard</li><li>Progress saved on your device</li></ul>
  </div>
  <a class="hero-card" href="games/{hg['slug']}/index.html">
    <img src="play/{hg['slug']}/{hg['thumbnail']}" alt="{e(hg['title'])} artwork" width="640" height="400">
    <span class="hero-card-label"><strong>{e(hg['title'])}</strong><span>{e(hg['short_description'])}</span></span>
  </a>
</div></section>"""

    about = """<section class="section"><div class="wrap about-band">
<div><h2>About the platform</h2>
<p>Gridlight Arcade is a small, independent collection of original HTML5 games. Every game here is designed and coded in-house, checked through our rights review before it goes live, and built to run well on low-end phones as well as desktops.</p>
<p>We don't show invented player counts, ratings or reviews. When a section says <em>curated</em>, it means a person picked it.</p>
<a class="btn btn-ghost" href="about/index.html">More about us</a></div>
<ul class="facts"><li><strong>0</strong><span>downloads needed</span></li><li><strong>100%</strong><span>original games</span></li><li><strong>0</strong><span>accounts required</span></li></ul>
</div></section>"""

    body = hero
    body += section("Featured games", grid(ctx, feat, root), "Our current highlights.", "games/index.html", "featured")
    body += section("Trending games", grid(ctx, trending, root), "Curated by our team. We don't publish play counts.", "", "trending")
    body += section("New games", grid(ctx, new, root, "No new releases right now. Check back soon."),
                    f"Added in the last {ctx.site.get('new_game_window_days', 60)} days.", "", "new")
    body += section("Game categories", cat_tiles(ctx, root), "", "categories/index.html", "categories")
    body += section("Popular with you",
                    '<div class="grid" data-popular data-empty="Play a few games and your most-played will show up here. This list lives only on your device."></div>',
                    "Based only on games you've played on this device.", "", "popular")
    body += section("Recently added", grid(ctx, recent, root), "", "games/index.html", "recent")
    body += about
    ld = {"@context": "https://schema.org", "@type": "WebSite", "name": ctx.site["name"], "url": ctx.url("index.html"),
          "potentialAction": {"@type": "SearchAction", "target": ctx.url("search/index.html") + "?q={search_term_string}",
                              "query-input": "required name=search_term_string"}}
    page(ctx, "index.html", ctx.site["name"], ctx.site["tagline"] + " Strategy, arcade and puzzle games that run on any device.",
         "home", body, extra_head=f'<script type="application/ld+json">{json.dumps(ld)}</script>')


def build_all_games(ctx: Ctx) -> None:
    root = "../"
    chips = '<button type="button" class="chip is-on" data-filter="all" aria-pressed="true">All</button>' + "".join(
        f'<button type="button" class="chip" data-filter="{c["slug"]}" aria-pressed="false">{e(c["name"])}</button>'
        for c in ctx.categories if ctx.games_in(c["slug"]))
    cards = "".join(card(ctx, g, root).replace('<article class="card">',
                    f'<article class="card" data-cats="{" ".join(g["categories"])}">', 1) for g in ctx.games)
    body = f"""<div class="wrap page-head">{breadcrumb(root, [("All games", None)])}
<h1>All games</h1><p class="lead">{len(ctx.games)} original game{'s' if len(ctx.games) != 1 else ''}, all playable right now.</p>
<div class="chips" role="toolbar" aria-label="Filter by category">{chips}</div></div>
<section class="section tight"><div class="wrap"><div class="grid" data-filter-grid>{cards}</div>
<p class="muted" data-filter-empty hidden>No games in this category yet.</p></div></section>"""
    page(ctx, "games/index.html", "All games", f"Browse all {len(ctx.games)} original browser games on {ctx.site['name']}.", "games", body)


def build_categories(ctx: Ctx) -> None:
    root = "../"
    body = f"""<div class="wrap page-head">{breadcrumb(root, [("Categories", None)])}
<h1>Categories</h1><p class="lead">Pick a mood.</p></div>
<section class="section tight"><div class="wrap">{cat_tiles(ctx, root)}</div></section>"""
    page(ctx, "categories/index.html", "Game categories", "Browse games by category: strategy, puzzle, arcade and more.", "categories", body)
    for c in ctx.categories:
        games = ctx.games_in(c["slug"])
        if not games:
            continue
        r2 = "../../"
        body = f"""<div class="wrap page-head">{breadcrumb(r2, [("Categories", r2 + "categories/index.html"), (c["name"], None)])}
<h1><span aria-hidden="true">{e(c['icon'])}</span> {e(c['name'])} games</h1><p class="lead">{e(c['description'])}</p></div>
<section class="section tight"><div class="wrap">{grid(ctx, games, r2)}</div></section>"""
        page(ctx, f"categories/{c['slug']}/index.html", f"{c['name']} games", c["description"], "categories", body)


def related_for(ctx: Ctx, g, limit=4):
    cats = set(g.get("categories", []))
    others = [o for o in ctx.games if o["slug"] != g["slug"]]
    others.sort(key=lambda o: (-len(cats & set(o.get("categories", []))), o["title"]))
    return others[:limit]


def build_game_pages(ctx: Ctx) -> None:
    for g in ctx.games:
        root = "../../"
        slug = g["slug"]
        cats = "".join(f'<a class="chip" href="{root}categories/{c}/index.html">{e(cat_name(ctx, c))}</a>' for c in g["categories"])
        steps = "".join(f"<li>{e(s)}</li>" for s in g.get("instructions", []))
        rec = ctx.assets.get(g["rights_id"], {})
        related = related_for(ctx, g)
        ld = {"@context": "https://schema.org", "@type": "VideoGame", "name": g["title"], "description": g["description"],
              "url": ctx.url(f"games/{slug}/index.html"), "image": ctx.url(f"play/{slug}/{g['thumbnail']}"),
              "genre": [cat_name(ctx, c) for c in g["categories"]], "gamePlatform": ["Web browser"],
              "applicationCategory": "Game", "operatingSystem": "Any", "isAccessibleForFree": True,
              "author": {"@type": "Organization", "name": rec.get("owner", ctx.site["operator"])},
              "datePublished": g.get("date_added")}
        body = f"""<div class="wrap page-head">{breadcrumb(root, [("Games", root + "games/index.html"), (cat_name(ctx, g['categories'][0]), root + "categories/" + g['categories'][0] + "/index.html"), (g['title'], None)])}</div>
<section class="player-section"><div class="wrap">
  <div class="player orient-{e(g.get('orientation', 'landscape'))}" data-player data-src="{root}{e(g['entry'])}" data-slug="{e(slug)}" data-title="{e(g['title'])}">
    <div class="player-poster" data-state="idle">
      <img src="{root}play/{slug}/{g['thumbnail']}" alt="" aria-hidden="true">
      <div class="poster-inner">
        <h1>{e(g['title'])}</h1>
        <button type="button" class="btn btn-primary btn-lg" data-play><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Play now</button>
        <p class="muted small">Free · runs in your browser</p>
      </div>
    </div>
    <div class="player-state" data-state="loading" hidden><div class="spinner" aria-hidden="true"></div><p role="status">Loading {e(g['title'])}…</p></div>
    <div class="player-state" data-state="error" hidden><p role="alert"><strong>The game didn't load.</strong><br><span data-error-msg>Check your connection and try again.</span></p><button type="button" class="btn btn-primary" data-retry>Try again</button></div>
    <div class="player-notice" data-notice hidden role="alert"><span data-notice-msg></span><button type="button" class="btn btn-primary btn-sm" data-notice-restart>Restart</button><button type="button" class="btn btn-ghost btn-sm" data-notice-close aria-label="Dismiss">✕</button></div>
    <button type="button" class="exit-fs btn btn-ghost btn-sm" data-exit-fs hidden>✕ Exit fullscreen</button>
  </div>
  <div class="player-bar">
    <div class="pb-title"><img src="{root}play/{slug}/{g['thumbnail']}" alt="" width="40" height="40"><span><strong>{e(g['title'])}</strong><span class="muted small">{e(cat_name(ctx, g['categories'][0]))}</span></span></div>
    <div class="pb-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-restart disabled>↻ Restart</button>
      <button type="button" class="btn btn-ghost btn-sm" data-share>⤴ Share</button>
      <button type="button" class="btn btn-primary btn-sm" data-fullscreen aria-pressed="false">⛶ Fullscreen</button>
    </div>
  </div>
  <p class="share-msg muted small" data-share-msg role="status" aria-live="polite"></p>
</div></section>
<section class="section tight"><div class="wrap detail-grid">
  <article class="detail-main">
    <h2>About {e(g['title'])}</h2>
    <p>{e(g['description'])}</p>
    <h2>How to play</h2>
    <ol class="steps">{steps}</ol>
    <h2>Controls</h2>
    <dl class="controls"><dt>Desktop</dt><dd>{e(g['controls']['desktop'])}</dd><dt>Mobile &amp; tablet</dt><dd>{e(g['controls']['mobile'])}</dd></dl>
  </article>
  <aside class="detail-side">
    <h2>Game details</h2>
    <dl class="facts-list">
      <dt>Categories</dt><dd class="chips">{cats}</dd>
      <dt>Platform</dt><dd>Desktop, tablet &amp; mobile browsers</dd>
      <dt>Modes</dt><dd>{e(mode_text(ctx, g))}</dd>
      <dt>Progress</dt><dd>{'Saved on this device' if g.get('saves_progress') else 'Not saved'}</dd>
      <dt>Added</dt><dd><time datetime="{e(g.get('date_added', ''))}">{e(g.get('date_added', ''))}</time></dd>
      <dt>Made by</dt><dd>{e(rec.get('owner', ctx.site['operator']))}</dd>
      <dt>Rights</dt><dd><a href="{root}licensing/index.html#{e(g['rights_id'])}">Rights record ({e(rec.get('status', 'unknown'))})</a></dd>
    </dl>
  </aside>
</div></section>
{section("You might also like", grid(ctx, related, root, "More games are on the way."), "", root + "games/index.html")}"""
        page(ctx, f"games/{slug}/index.html", f"{g['title']}: play free online", g["short_description"], "games", body,
             extra_head=f'<script type="application/ld+json">{json.dumps(ld)}</script>',
             extra_js=f'<script src="{root}assets/player.js"></script>', og_image=f"play/{slug}/{g['thumbnail']}")


def build_search(ctx: Ctx) -> None:
    root = "../"
    body = f"""<div class="wrap page-head">{breadcrumb(root, [("Search", None)])}
<h1 data-search-title>Search games</h1>
<form class="search search-lg" role="search" action="index.html" method="get">
  <label class="sr" for="q2">Search games</label>
  <input id="q2" name="q" type="search" placeholder="Try “strategy” or “color”" data-search-input>
  <button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>
</form></div>
<section class="section tight"><div class="wrap">
<p class="muted" data-search-count role="status" aria-live="polite"></p>
<div class="grid" data-search-results></div>
</div></section>"""
    page(ctx, "search/index.html", "Search", "Search all games by name, category or tag.", "", body)


def text_page(ctx: Ctx, slug: str, title: str, desc: str, inner: str, active="") -> None:
    root = "../"
    body = f"""<div class="wrap page-head">{breadcrumb(root, [(title, None)])}<h1>{e(title)}</h1></div>
<section class="section tight"><div class="wrap prose">{inner}</div></section>"""
    page(ctx, f"{slug}/index.html", title, desc, active, body)


def build_info_pages(ctx: Ctx) -> None:
    s = ctx.site
    mail = contact_html(s)
    updated = "2026-11-17"
    text_page(ctx, "about", "About us", f"Who runs {s['name']} and how we build games.", f"""
<p class="lead">{e(s['name'])} is an independent home for original browser games.</p>
<p>We design and code every game ourselves using open web technology (HTML5, CSS and JavaScript), so games start instantly and work on phones, tablets and computers without installs or plug-ins.</p>
<h2>What we believe</h2>
<ul><li><strong>Honest presentation.</strong> No invented play counts, ratings or reviews.</li>
<li><strong>Rights first.</strong> Every game passes a recorded rights review before it is published. See <a href="../licensing/index.html">Game licensing</a>.</li>
<li><strong>Light and fast.</strong> No heavy frameworks, no tracking unless you opt in.</li>
<li><strong>Playable by more people.</strong> Keyboard and touch controls, readable contrast, and color-independent cues where color matters.</li></ul>
<h2>The games</h2><p>We currently have {len(ctx.games)} games, and we add new ones as they are finished and reviewed.</p>""", "about")

    text_page(ctx, "contact", "Contact us", f"How to reach the {s['name']} team.", f"""
<p>We read every message. For the fastest reply, choose the topic that fits:</p>
<ul><li><strong>Bug reports:</strong> tell us the game, your device and browser, and what happened.</li>
<li><strong>Rights or takedown requests:</strong> include the work concerned, proof of ownership, and the page URL. We act on these first.</li>
<li><strong>Privacy requests:</strong> see the <a href="../privacy/index.html">Privacy policy</a>.</li>
<li><strong>Partnerships:</strong> game licensing and distribution.</li></ul>
<p class="callout">Email: {mail}</p>
<p class="muted small">We don't run a contact form, so we don't store your message on this website.</p>""")

    online_section = ""
    if (ctx.site.get("multiplayer") or {}).get("server_url"):
        online_section = """
<h2>Online play with friends</h2>
<p>Some games let you play with a friend online. This only happens if you choose “Play with a friend online”. When you do:</p>
<ul><li>Your browser connects to our multiplayer server. The server receives the <strong>display name</strong> you type (it does not need to be your real name), the room code, your moves, and, like any internet connection, your <strong>IP address</strong>.</li>
<li>Rooms exist only in the server's memory. They are deleted about 10 minutes after everyone has left, and in any case after 3 hours. We do not keep match history or store your moves in a database.</li>
<li>The server does not use cookies. Your browser remembers your display name in <code>localStorage</code>, and a temporary reconnect key in <code>sessionStorage</code> (deleted when you close the tab) so you can rejoin after a dropped connection.</li>
<li>Other players in your room see your display name. Please don't use your full name or other personal details as a display name.</li>
<li>The multiplayer server is hosted by Render (render.com). Like most hosts, Render may keep technical logs such as IP addresses and request times for security and reliability.</li></ul>
"""
    text_page(ctx, "privacy", "Privacy policy", "What data this site stores and why.", f"""
<p class="muted">Last updated {updated}. This is a template. Have it reviewed for your jurisdiction (for example GDPR, UK GDPR or India's DPDP Act) before launch.</p>
<h2>Summary</h2><p>No accounts. No advertising trackers. Game progress stays in your own browser.</p>
<h2>Data stored on your device</h2>
<p>We use your browser's <code>localStorage</code> for strictly functional purposes:</p>
<ul><li>Game progress and high scores (for example unlocked levels and best scores).</li>
<li>A list of games you've played recently and how often, used only for the “Popular with you” section. It never leaves your device.</li>
<li>Your privacy choices.</li></ul>
<p>You can clear this at any time by clearing site data in your browser.</p>
<h2>Optional analytics</h2>
<p>Optional analytics scripts are only loaded if you opt in through <button type="button" class="linklike" data-consent-open>Privacy settings</button>. At the moment no optional scripts are enabled.</p>
{online_section}<h2>Server logs</h2><p>Our hosting provider may keep standard access logs (IP address, time, page requested) for security and reliability.</p>
<h2>Children</h2><p>Our games are designed to be suitable for a general audience. We don't knowingly collect personal data from anyone.</p>
<h2>Contact</h2><p>Questions: {mail}.</p>""")

    text_page(ctx, "terms", "Terms & conditions", "Rules for using this website.", f"""
<p class="muted">Last updated {updated}. This is a template. Have it reviewed before launch.</p>
<h2>Use of the site</h2><p>You may play the games for personal, non-commercial entertainment. Please don't copy, rehost, scrape or modify the games or website without written permission.</p>
<h2>Ownership</h2><p>All games, code, artwork and text on this site are owned by {e(s['operator'])} unless stated otherwise on the <a href="../licensing/index.html">licensing page</a>.</p>
<h2>No warranty</h2><p>Games are provided “as is”. We work hard to keep them bug-free but can't guarantee uninterrupted availability. Locally saved progress can be lost if you clear your browser data.</p>
<h2>Limitation of liability</h2><p>To the extent permitted by law, we are not liable for indirect losses arising from use of the site.</p>
<h2>Changes</h2><p>We may update these terms. The date above shows the latest version.</p>
<h2>Contact</h2><p>{mail}</p>""")

    rows = []
    for g in ctx.games:
        r = ctx.assets.get(g["rights_id"], {})
        tp = r.get("third_party_components") or []
        tp_txt = ", ".join(f"{c.get('name')} ({c.get('license')})" for c in tp) or "None"
        rows.append(f"""<tr id="{e(g['rights_id'])}"><th scope="row"><a href="../games/{g['slug']}/index.html">{e(g['title'])}</a></th>
<td>{e(r.get('owner', ''))}</td><td>{e(r.get('origin', ''))}</td><td>{e(r.get('license', ''))}</td><td>{e(tp_txt)}</td>
<td><span class="badge badge-play">{e(r.get('status', ''))}</span><br><span class="muted small">{e((r.get('reviewed_at') or '')[:10])}</span></td></tr>""")
    text_page(ctx, "licensing", "Game licensing", "Rights and licence status of every game on the site.", f"""
<p>Every game passes our rights gate before it is published. A game only appears on this site when its rights record is <strong>approved</strong> and lists an owner, a licence and the evidence that was checked. Every approval and change is written to an append-only audit log.</p>
<div class="table-scroll"><table><thead><tr><th>Game</th><th>Owner</th><th>Origin</th><th>Licence</th><th>Third-party parts</th><th>Status</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>
<h2>Fonts &amp; libraries</h2><p>The site uses your device's system fonts and no third-party JavaScript libraries.</p>
<h2>Rights concerns</h2><p>If you believe something here infringes your rights, contact us ({mail}) with details. We review takedown requests promptly and can withdraw a game from the site within one build.</p>""")

    faqs = [
        ("Are the games free?", "Yes. Every game is free to play in your browser."),
        ("Do I need to download or sign up?", "No. Games run directly in the browser. There are no accounts."),
        ("Does it work on my phone?", "Yes. Every game supports touch controls and adapts to small screens. Use Fullscreen for the best experience."),
        ("Where is my progress saved?", "In your browser's local storage on this device. Clearing site data, or switching device or browser, starts fresh."),
        ("Why don't you show play counts or ratings?", "We won't display numbers we can't verify. Sections like “Trending” are picked by our team and labelled that way."),
        ("A game won't load. What can I do?", "Press “Try again”, then reload the page. If it still fails, tell us your browser and device via the Contact page."),
        ("Can I put your games on my website?", "Not without permission. Contact us about licensing."),
    ]
    items = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in faqs)
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}
    root = "../"
    body = f"""<div class="wrap page-head">{breadcrumb(root, [("FAQ", None)])}<h1>Frequently asked questions</h1></div>
<section class="section tight"><div class="wrap prose faq">{items}</div></section>"""
    page(ctx, "faq/index.html", "FAQ", "Answers to common questions about playing games on this site.", "", body,
         extra_head=f'<script type="application/ld+json">{json.dumps(ld)}</script>')


def build_404(ctx: Ctx) -> None:
    root = ctx.site.get("base_path", "/")
    if not root.endswith("/"):
        root += "/"
    body = f"""<section class="section"><div class="wrap center-block">
<p class="big-code grad">404</p><h1>This level doesn't exist</h1>
<p class="lead">The page you're looking for moved or never spawned.</p>
<div class="hero-cta"><a class="btn btn-primary" href="{root}index.html">Back to home</a><a class="btn btn-ghost" href="{root}games/index.html">All games</a></div>
</div></section>"""
    html = head(ctx, root, "Page not found", "Page not found.", "404.html",
                '<meta name="robots" content="noindex">') + header(ctx, root, "") + body + footer(ctx, root)
    write(ctx, "404.html", html, sitemap=False)


# --------------------------------------------------------------------------
# Assets
# --------------------------------------------------------------------------
def copy_assets(ctx: Ctx) -> None:
    dest = ctx.out / "assets"
    dest.mkdir(parents=True, exist_ok=True)
    for f in SITE_SRC.iterdir():
        if f.is_file():
            shutil.copy2(f, dest / f.name)
    # site-data.js: search index + tracking config, as a script so it works on file:// too
    index = [{"slug": g["slug"], "title": g["title"], "desc": g["short_description"], "tags": g.get("tags", []),
              "cats": [{"slug": c, "name": cat_name(ctx, c)} for c in g["categories"]],
              "thumb": f"play/{g['slug']}/{g['thumbnail']}", "saves": bool(g.get("saves_progress")),
              "isNew": ctx.is_new(g)} for g in ctx.games]
    trackers = [t for t in ctx.tracking.get("trackers", [])]
    (dest / "site-data.js").write_text(
        "window.GL_GAMES=" + json.dumps(index, ensure_ascii=False) + ";\n"
        "window.GL_TRACKING=" + json.dumps(trackers, ensure_ascii=False) + ";\n", encoding="utf-8")


def copy_games(ctx: Ctx) -> None:
    kit = ROOT / "games" / "_kit"
    if kit.exists():
        shutil.copytree(kit, ctx.out / "play" / "_kit", dirs_exist_ok=True)
        # Multiplayer config for the games. Online play is offered only for games whose registry entry has
        # modes.online = true AND when a server URL is configured; the game still checks /health before showing it.
        mp = ctx.site.get("multiplayer") or {}
        cfg = {"serverUrl": (mp.get("server_url") or "").rstrip("/"),
               "games": [g["slug"] for g in ctx.games if modes(g)["online"]] if mp.get("server_url") else []}
        (ctx.out / "play" / "_kit" / "mp-config.js").write_text(
            "window.GL_MP=" + json.dumps(cfg) + ";\n", encoding="utf-8")
    for g in ctx.games:
        src = ROOT / g["source_dir"]
        if not (src / "index.html").exists():
            raise SystemExit(f"Game {g['slug']}: {src}/index.html not found")
        dst = ctx.out / "play" / g["slug"]
        shutil.copytree(src, dst, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("*.test.js", "README.md", "__pycache__"))


def build_meta(ctx: Ctx) -> None:
    urls = "".join(f"<url><loc>{e(ctx.url(p))}</loc></url>" for p in sorted(ctx.pages))
    (ctx.out / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n',
        encoding="utf-8")
    (ctx.out / "robots.txt").write_text(
        f"User-agent: *\n{'Disallow: /' if ctx.preview else 'Allow: /'}\nSitemap: {ctx.site['base_url'].rstrip('/')}/sitemap.xml\n", encoding="utf-8")
    (ctx.out / ".nojekyll").write_text("", encoding="utf-8")


def build(out: Path, data_dir: Path = None, strict: bool = False, today: date | None = None,
          base_url: str | None = None, base_path: str | None = None, preview_pending: bool = False,
          mp_server: str | None = None) -> Ctx:
    if strict and preview_pending:
        raise SystemExit("--preview-pending cannot be combined with --strict: preview builds are never publishable.")
    ctx = Ctx(data_dir or ROOT / "data", out, today, preview_pending)
    for g in ctx.gate.pending:
        print(f"PREVIEW: including {g['slug']} although its rights record is pending")
    if base_url:
        ctx.site["base_url"] = base_url.rstrip("/")
    if base_path:
        ctx.site["base_path"] = base_path if base_path.endswith("/") else base_path + "/"
    if mp_server is not None:
        ctx.site["multiplayer"] = dict(ctx.site.get("multiplayer") or {}, server_url=mp_server)
    mp_url = (ctx.site.get("multiplayer") or {}).get("server_url") or ""
    if mp_url and not (mp_url.startswith("https://") or mp_url.startswith("http://localhost") or mp_url.startswith("http://127.0.0.1")):
        raise SystemExit("multiplayer server_url must be https:// (or http://localhost for local testing)")
    if ctx.gate.errors or ctx.gate.withheld:
        for g, why in ctx.gate.withheld:
            print(f"WARNING: withholding {g.get('slug')}: {why}")
        for err in ctx.gate.errors:
            print(f"WARNING: {err}")
        if strict:
            raise SystemExit("Build stopped by rights gate (--strict).")
    ctx.warnings = config_warnings(ctx.site)
    for w in ctx.warnings:
        print("CONFIG WARNING: " + w)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    copy_assets(ctx)
    copy_games(ctx)
    build_home(ctx)
    build_all_games(ctx)
    build_categories(ctx)
    build_game_pages(ctx)
    build_search(ctx)
    build_info_pages(ctx)
    build_404(ctx)
    build_meta(ctx)
    return ctx


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build the static site")
    ap.add_argument("--out", type=Path, default=ROOT / "dist")
    ap.add_argument("--strict", action="store_true", help="fail if the rights gate withholds anything")
    ap.add_argument("--base-url", help="override site.json base_url (e.g. https://user.github.io/repo)")
    ap.add_argument("--base-path", help="override site.json base_path (e.g. /repo/)")
    ap.add_argument("--preview-pending", action="store_true",
                    help="LOCAL PREVIEW ONLY: also build games whose rights record is pending (adds a banner and noindex)")
    ap.add_argument("--mp-server", help="override site.json multiplayer.server_url (e.g. http://localhost:3001 for local testing)")
    args = ap.parse_args(argv)
    ctx = build(args.out, strict=args.strict, base_url=args.base_url, base_path=args.base_path,
                preview_pending=args.preview_pending, mp_server=args.mp_server)
    print(f"Built {len(ctx.pages) + 1} pages and {len(ctx.games)} games into {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
