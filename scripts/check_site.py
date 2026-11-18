#!/usr/bin/env python3
"""Check a built site for broken internal links and basic page quality.

Checks every HTML file in the output folder:
  * every internal href/src resolves to a file that exists
  * <title>, meta description and exactly one <h1> are present
  * every <img> has an alt attribute
  * no page references a third-party script host (we ship none)

Usage:
    python scripts/check_site.py [dist]
"""
from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self.title = False
        self.desc = False
        self.h1 = 0
        self.img_no_alt = 0
        self.ext_scripts: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "title":
            self.title = True
        elif tag == "meta" and a.get("name") == "description" and a.get("content"):
            self.desc = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "img" and "alt" not in a:
            self.img_no_alt += 1
        for attr in ("href", "src", "action"):
            if a.get(attr):
                if tag == "link" and a.get("rel") == "canonical":
                    continue
                self.links.append((tag, a[attr]))
        if tag == "script" and a.get("src", "").startswith(("http://", "https://", "//")):
            self.ext_scripts.append(a["src"])


def is_external(url: str) -> bool:
    return url.startswith(("http://", "https://", "//", "mailto:", "tel:", "data:", "javascript:")) or url.startswith("#")


def check(out: Path, base_path: str = "/") -> list[str]:
    problems: list[str] = []
    if not out.exists():
        return [f"{out} does not exist; build the site first"]
    for page in sorted(out.rglob("*.html")):
        rel = page.relative_to(out).as_posix()
        if rel.startswith("play/"):
            continue  # game internals are tested by their own test-suite
        p = PageParser()
        p.feed(page.read_text(encoding="utf-8"))
        if not p.title:
            problems.append(f"{rel}: missing <title>")
        if not p.desc:
            problems.append(f"{rel}: missing meta description")
        if p.h1 != 1:
            problems.append(f"{rel}: expected 1 <h1>, found {p.h1}")
        if p.img_no_alt:
            problems.append(f"{rel}: {p.img_no_alt} <img> without alt")
        for s in p.ext_scripts:
            problems.append(f"{rel}: external script {s}")
        for tag, url in p.links:
            if is_external(url):
                continue
            path = unquote(urlsplit(url).path)
            if not path:
                continue
            if path.startswith("/"):
                if not path.startswith(base_path):
                    problems.append(f"{rel}: absolute link outside base path: {url}")
                    continue
                target = out / path[len(base_path):]
            else:
                target = (page.parent / path).resolve()
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                problems.append(f"{rel}: broken link <{tag}> {url}")
    for required in ("index.html", "404.html", "sitemap.xml", "robots.txt"):
        if not (out / required).exists():
            problems.append(f"missing {required}")
    return problems


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    out = Path(argv[0]) if argv else ROOT / "dist"
    base_path = argv[1] if len(argv) > 1 else "/"
    problems = check(out, base_path if base_path.endswith("/") else base_path + "/")
    pages = len([p for p in out.rglob("*.html") if not p.relative_to(out).as_posix().startswith("play/")]) if out.exists() else 0
    if problems:
        print(f"check_site: {len(problems)} problem(s) in {pages} pages")
        for prob in problems:
            print("  -", prob)
        return 1
    print(f"check_site: OK ({pages} pages, no broken links)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
