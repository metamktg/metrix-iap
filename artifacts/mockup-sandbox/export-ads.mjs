// One-off exporter: renders each ad HTML at exact pixel dims to PNG using the
// pre-installed Playwright chromium (no browser download). Run from repo root:
//   node artifacts/mockup-sandbox/export-ads.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const EXEC = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!EXEC) throw new Error("REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE not set");

const BASE = "http://localhost:80/__mockup/ads";
const OUT = resolve(process.cwd(), "exports/eca-ads");
mkdirSync(OUT, { recursive: true });

const CODES = ["c1a", "c2b", "c3c", "c4d", "c1d", "c2c", "c3b", "c4a"];
const FORMATS = [
  { suffix: "1x1", w: 1080, h: 1080 },
  { suffix: "9x16", w: 1080, h: 1920 },
];

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
let ok = 0;
for (const code of CODES) {
  for (const f of FORMATS) {
    const name = `${code}-${f.suffix}`;
    const ctx = await browser.newContext({
      viewport: { width: f.w, height: f.h },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${name}.html`, { waitUntil: "networkidle", timeout: 30000 });
    // ensure fonts + all images fully decoded before capture
    await page.evaluate(async () => {
      await document.fonts.ready;
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth
            ? Promise.resolve()
            : new Promise((res) => {
                img.addEventListener("load", res, { once: true });
                img.addEventListener("error", res, { once: true });
              })
        )
      );
    });
    await page.waitForTimeout(350);
    const out = `${OUT}/${name}.png`;
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: f.w, height: f.h } });
    await ctx.close();
    console.log(`✓ ${name}.png  (${f.w}×${f.h})`);
    ok++;
  }
}
await browser.close();
console.log(`\nDone: ${ok}/16 PNGs → exports/eca-ads/`);
