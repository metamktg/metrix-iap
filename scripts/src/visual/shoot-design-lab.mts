// Screenshot the design lab and assert the things only a browser can answer.
//
// Phase 3 E0 calls for a Playwright screenshot corpus as the regression
// baseline. This is its first surface, and it exists because jsdom has now
// hidden three shipped bugs on this codebase: the KPI picker clipped by
// overflow:hidden, the donut painting two segments one colour, and "at goal"
// and "above goal" rendering identically across five files. Every one passed
// the whole suite.
//
// It checks the resolved values — computed font sizes, composited fills,
// measured contrast — not the markup, because the markup was always right.
//
// Usage: start `vite dev` for metrix-iap, then
//   pnpm --filter @workspace/scripts run shoot:design-lab

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
// playwright-core is hoisted into the workspace store, not this package.
const { chromium } = require("playwright-core") as typeof import("playwright-core");

const URL = process.env.DESIGN_LAB_URL ?? "http://127.0.0.1:5173/design-lab.html";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.SHOT_DIR ?? "/tmp/metrix-design-lab";

const BODY_FLOOR = 14;
const MIN_STEP = 3;
const AA_TEXT = 4.5;

const problems: string[] = [];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
const consoleErrors: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, "design-lab.png"), fullPage: true });

// The probe runs as a STRING, not a callback: tsx compiles through esbuild,
// which wraps named functions in a `__name` helper that does not exist in the
// page — a serialized callback throws `__name is not defined` on arrival.
const PROBE = `(() => {
  const px = (sel) => { const el = document.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : null; };
  const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const rgb = (s) => (s.match(/\\d+/g) || []).slice(0, 3).map(Number);
  const contrast = (a, b) => { const p = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x); return (p[0] + 0.05) / (p[1] + 0.05); };
  const bands = [];
  const panel = document.querySelectorAll("section")[2];
  if (panel) panel.querySelectorAll("div[style*='background']").forEach((el) => {
    const span = el.querySelector("span"); if (!span) return;
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || bg === "rgba(0, 0, 0, 0)") return;
    bands.push({ fill: bg, ratio: +contrast(getComputedStyle(span).color, bg).toFixed(2) });
  });
  return {
    sizes: { h1: px(".mx-section-header__title"), h2: px(".text-cardtitle"), h3: px(".text-title"),
             body: px(".text-body"), caption: px(".text-caption"), label: px(".text-label"), micro: px(".text-micro") },
    smoothing: getComputedStyle(document.documentElement).webkitFontSmoothing,
    wrap: getComputedStyle(document.querySelector(".text-cardtitle")).textWrap,
    bands,
    overflow: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
  };
})()`;

const report = await page.evaluate(PROBE) as {
  sizes: Record<string, number | null>;
  smoothing: string; wrap: string;
  bands: { fill: string; ratio: number }[];
  overflow: { scroll: number; client: number };
};
await browser.close();

const { sizes, bands, overflow } = report;
const ladder: [string, number | null, string, number | null][] = [
  ["H1", sizes.h1, "H2", sizes.h2], ["H2", sizes.h2, "H3", sizes.h3], ["H3", sizes.h3, "body", sizes.body],
];
for (const [an, a, bn, b] of ladder) {
  if (a == null || b == null) { problems.push(`could not measure ${an} or ${bn} in the browser`); continue; }
  if (a - b < MIN_STEP) problems.push(`${an} (${a}px) is only ${a - b}px above ${bn} (${b}px) — needs ${MIN_STEP}px`);
}
if (sizes.body != null && sizes.body < BODY_FLOOR) problems.push(`body computes to ${sizes.body}px, below the ${BODY_FLOOR}px floor`);
if (report.smoothing !== "antialiased") problems.push(`font smoothing is "${report.smoothing}", not antialiased`);
if (report.wrap !== "balance") problems.push(`heading text-wrap is "${report.wrap}", not balance`);
if (overflow.scroll > overflow.client) problems.push(`the page scrolls horizontally (${overflow.scroll} > ${overflow.client})`);
if (bands.length === 0) problems.push("no diverging bands were measurable — the scale panel did not render");
for (const b of bands) {
  if (b.ratio < AA_TEXT) problems.push(`a diverging band (${b.fill}) carries text at ${b.ratio}:1, below AA ${AA_TEXT}:1`);
}
for (const e of consoleErrors) problems.push(`uncaught page error: ${e}`);

console.log(`\nScreenshot → ${path.join(OUT, "design-lab.png")}`);
console.log(`Ladder: H1 ${sizes.h1} → H2 ${sizes.h2} → H3 ${sizes.h3} → body ${sizes.body} → caption ${sizes.caption} → label ${sizes.label} → micro ${sizes.micro}`);
console.log(`Diverging bands: ${bands.length} measured, worst text contrast ${Math.min(...bands.map((b) => b.ratio))}:1`);

if (problems.length > 0) {
  console.error("\nFAIL  Rendered-UI violations:\n");
  for (const p of problems) console.error(`      · ${p}`);
  console.error("");
  process.exit(1);
}
console.log("\nPASS  The rendered UI conforms.\n");
