# Deployment

The build output (`dist/`) is plain static files with relative links. Any static host works, and there
is no server code.

```bash
python scripts/build_static_site.py --strict
python scripts/check_site.py
```

| Host | Cost | Notes |
|---|---|---|
| **Cloudflare Pages** | free | Build command `python scripts/build_static_site.py --strict`, output `dist`. Works with private repos. |
| **Netlify** | free tier | Same build command and output directory. Serves `404.html` automatically. |
| **GitHub Pages** | free for public repos | Needs a public repo or a paid plan. Add a Pages deploy job that uploads `dist/`. |

After you pick a domain, set `base_url` in `data/site.json`. It's used for canonical links, Open
Graph tags and `sitemap.xml`. If the site lives in a sub-folder (for example
`https://user.github.io/gaming-site-mvp/`), also set `base_path` to `/gaming-site-mvp/` so the 404
page's links work.

## GitHub Pages (current setup)

`.github/workflows/pages.yml` runs on every push to `main`. It runs the tests, builds with the strict
rights gate, sets `base_url` and `base_path` from the repository name automatically, checks links, and
deploys to `https://<owner>.github.io/<repo>/`. One-time setup: in the repo, go to **Settings → Pages →
Build and deployment → Source** and choose **GitHub Actions**. Free Pages requires a public repository.

CI (`.github/workflows/ci.yml`) runs the tests, the strict rights gate, and the link checker on
every push and pull request.
