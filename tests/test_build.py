import json
import re
import shutil
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_static_site  # noqa: E402
import check_site  # noqa: E402


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.out = cls.tmp / "dist"
        cls.ctx = build_static_site.build(cls.out, data_dir=ROOT / "data", strict=True, today=date(2026, 11, 18))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def read(self, rel):
        return (self.out / rel).read_text(encoding="utf-8")

    def test_required_pages_exist(self):
        for rel in ["index.html", "games/index.html", "categories/index.html", "search/index.html",
                    "about/index.html", "contact/index.html", "privacy/index.html", "terms/index.html",
                    "licensing/index.html", "faq/index.html", "404.html", "sitemap.xml", "robots.txt",
                    "assets/site.css", "assets/consent.js", "assets/site-data.js"]:
            self.assertTrue((self.out / rel).exists(), rel)

    def test_each_game_has_page_and_playable_bundle(self):
        for slug in ("pathforge", "neon-dodge", "chroma-shift"):
            page = self.read(f"games/{slug}/index.html")
            self.assertIn(f'data-src="../../play/{slug}/index.html"', page)
            self.assertIn("How to play", page)
            self.assertIn('"@type": "VideoGame"', page)
            self.assertTrue((self.out / "play" / slug / "index.html").exists())
            self.assertTrue((self.out / "play" / slug / "game.js").exists())

    def test_home_has_all_sections(self):
        home = self.read("index.html")
        for sid in ("featured", "trending", "new", "categories", "popular", "recent"):
            self.assertIn(f'id="{sid}"', home)
        self.assertIn("About the platform", home)

    def test_no_fabricated_stats(self):
        for page in self.out.rglob("*.html"):
            text = page.read_text(encoding="utf-8").lower()
            for bad in ("plays</", "k plays", "ratingvalue", "aggregaterating", "reviewcount"):
                self.assertNotIn(bad, text, f"{page} contains '{bad}'")

    def test_withheld_game_is_not_built(self):
        data = Path(tempfile.mkdtemp())
        try:
            for f in (ROOT / "data").iterdir():
                shutil.copy(f, data / f.name)
            assets = json.loads((data / "assets.json").read_text(encoding="utf-8"))
            assets["records"][1]["status"] = "pending"  # neon-dodge
            (data / "assets.json").write_text(json.dumps(assets), encoding="utf-8")
            out = data / "dist"
            build_static_site.build(out, data_dir=data)
            self.assertFalse((out / "games" / "neon-dodge").exists())
            self.assertFalse((out / "play" / "neon-dodge").exists())
            self.assertNotIn("neon-dodge", (out / "assets" / "site-data.js").read_text(encoding="utf-8"))
            with self.assertRaises(SystemExit):
                build_static_site.build(data / "dist2", data_dir=data, strict=True)
        finally:
            build_static_site.DATA = ROOT / "data"
            shutil.rmtree(data)

    def test_search_index_matches_games(self):
        js = self.read("assets/site-data.js")
        m = re.search(r"window\.GL_GAMES=(\[.*?\]);", js)
        games = json.loads(m.group(1))
        self.assertEqual(sorted(g["slug"] for g in games), ["chroma-shift", "neon-dodge", "pathforge"])

    def test_no_broken_links(self):
        problems = check_site.check(self.out)
        self.assertEqual(problems, [], "\n".join(problems))

    def test_sitemap_lists_game_pages(self):
        sm = self.read("sitemap.xml")
        self.assertIn("/games/pathforge/", sm)
        self.assertNotIn("404", sm)


if __name__ == "__main__":
    unittest.main()
