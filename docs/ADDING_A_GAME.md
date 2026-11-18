# Adding a game

1. **Create the module** at `games/<slug>/`:
   - `index.html`: a standalone page. It must work when opened directly.
   - `game.js` and `game.css`: the game's own logic and styles. Put pure logic in a separate file so Node can test it.
   - `thumb.svg` (or `.webp`/`.png`): 16:10 artwork, ideally 640×400.
2. **Talk to the host page.** Add this to the game:
   ```js
   function post(m){ try { if (window.parent !== window) window.parent.postMessage(m, '*'); } catch(e){} }
   window.addEventListener('error', ev => post({type:'gl:error', message: ev.message}));
   window.addEventListener('message', ev => { if (ev.data && ev.data.type === 'gl:restart') restartGame(); });
   // when ready:
   post({type:'gl:ready'});
   ```
3. **Add a rights record** to `data/assets.json` with `"status": "pending"`. Then get it reviewed:
   `python scripts/rights_review.py approve rights-<slug> --by "Name" --note "What you checked"`.
4. **Add the catalogue entry** to `data/games.json`. Copy an existing entry and update the `id`,
   `slug`, text, `categories`, `entry` (`play/<slug>/index.html`), `source_dir` (`games/<slug>`),
   `rights_id`, `orientation` (`landscape` | `square` | `portrait`) and `date_added`.
5. **Store progress** under a namespaced localStorage key (`gl_<slug>_v1`), wrap every access in
   `try/catch`, and list the key in `docs/RIGHTS_AND_CONSENT.md`.
6. **Verify:**
   ```bash
   python scripts/build_static_site.py --strict
   python scripts/check_site.py
   python -m unittest discover -s tests
   ```

## Checklist

- [ ] Keyboard **and** touch controls
- [ ] Pause and restart, plus a game-over or win state
- [ ] Doesn't scroll the page and fits phone screens in portrait
- [ ] Respects `prefers-reduced-motion` where it animates heavily
- [ ] Doesn't rely on color alone
- [ ] No external network requests
