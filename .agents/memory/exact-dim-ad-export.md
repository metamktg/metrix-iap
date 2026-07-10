---
name: Exact-dimension ad PNG export
description: How to export HTML ad creatives (mockup-sandbox) to pixel-exact PNGs in this environment, and the traps that waste time.
---

# Exact-dimension PNG export from mockup-sandbox HTML ads

Goal: render `artifacts/mockup-sandbox/public/ads/*.html` to PNGs at exact Meta dims
(e.g. 1080×1080, 1080×1920) with no scaling drift.

## Use the pre-installed chromium, NOT npx
- A Playwright chromium binary already exists; its path is in env
  `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
- Install **`playwright-core`** (library only, never downloads a browser) and launch with
  `chromium.launch({ executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE, args:["--no-sandbox"] })`.
- **Do NOT run `npx playwright ...`** — it tries to *download* a browser and hangs past the
  bash timeout. This burned real time. `playwright-core` + the env-var executable is the path.
- Render each ad via the running mockup server URL `http://localhost:80/__mockup/ads/<file>.html`
  (goes through the shared proxy), `deviceScaleFactor:1`, `viewport = target dims`, and a real
  `clip:{x:0,y:0,width,height}`. Wait for `document.fonts.ready` + per-image decode before shot,
  or fonts/images race and you capture a half-rendered frame.
- A reusable script lives at `artifacts/mockup-sandbox/export-ads.mjs`.

## Baked-in mockup margins make framed-print images look tiny
- AI "print on a wall" source images carry a large near-white wall border. In a tall (9:16)
  flex-grown container with `object-fit:contain; max-width`, the print shrinks to a small center
  with big empty bands. Root-cause fix (helps every ratio) is to trim the border off the SOURCE:
  `magick in.jpg -fuzz ~14% -trim +repage out.jpg` (back up originals first). Prefer this over
  CSS `object-fit:cover` hacks, which crop the frame edges away.

## Canvas image shapes from local files
- Copy PNGs to `.canvas/assets/`, serve via `https://<REPLIT_DOMAINS>:5904/<file>.png` (documented
  in the canvas skill). After re-exporting a changed image, the board caches by URL — bust it by
  updating the shape `src` with a `?v=N` query param, or the old image sticks.
