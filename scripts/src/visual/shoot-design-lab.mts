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
/** The five heading faces. One list — the warm-up, the probe and the gate all read it. */
const FACES = ["Space Grotesk", "Outfit", "Lato", "Rubik", "Figtree"];

const problems: string[] = [];

fs.mkdirSync(OUT, { recursive: true });
/** Phone, tablet, laptop. A layout that holds at one width is not responsive. */
const WIDTHS: [number, string][] = [[390, "phone"], [768, "tablet"], [1440, "laptop"]];

// The browser needs the container's proxy or it cannot reach fonts.gstatic.com
// and every webfont silently falls back — which is precisely the failure this
// harness exists to catch, so it must not be the harness's own blind spot.
const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: CHROME,
  // Bypass for the dev server itself — routing 127.0.0.1 through the proxy
  // means the page never loads and every check reports "did not render".
  ...(PROXY ? { proxy: { server: PROXY, bypass: "127.0.0.1,localhost,::1" } } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
const consoleErrors: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, "design-lab.png"), fullPage: true });

// ── Force the faces to download before measuring them ─────────────────
//
// A @font-face is fetched lazily, when something on the page actually paints
// with that exact family AND weight. The probe below measures at weight 700;
// the lab renders H3 at font-semibold (600). Outfit-700.woff2 is its own src,
// so nothing had requested it and the synchronous measurement read the
// fallback — the gate reported "Outfit did not load" while the file was on
// disk, valid, and served 200.
//
// document.fonts.load() is the right API here. Note that its sibling
// document.fonts.check() is NOT: check() returns true for a family with zero
// loaded faces, which is how an earlier version of this harness passed while
// nothing had loaded at all. load() returns the FontFaces it actually matched,
// so an empty array is itself a fact worth failing on — it means no
// @font-face rule matched the family at that weight.
const WARMUP = `(async () => {
  const out = {};
  for (const f of ${JSON.stringify(FACES)}) {
    try { out[f] = (await document.fonts.load('700 64px "' + f + '"')).length; }
    catch (e) { out[f] = -1; }
  }
  await document.fonts.ready;
  return out;
})()`;
const matched = await page.evaluate(WARMUP) as Record<string, number>;

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
  // Every panel whose cells carry a value as text over a generated fill:
  // the diverging scale, the magnitude scale, and both Map views.
  const titles = Array.from(document.querySelectorAll("section h2")).map((h) => h.textContent.trim());
  const wanted = ["Diverging scale — verdicts", "Sequential scale — magnitude", "Map — verdict scale", "Map — magnitude scale"];
  const panels = wanted.map((t) => document.querySelectorAll("section")[titles.indexOf(t)]).filter(Boolean);
  panels.forEach((panel) => panel.querySelectorAll("[style*='background']").forEach((el) => {
    const span = el.querySelector("span"); if (!span) return;
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || bg === "rgba(0, 0, 0, 0)") return;
    bands.push({ fill: bg, ratio: +contrast(getComputedStyle(span).color, bg).toFixed(2) });
  }));
  return {
    sizes: { h1: px(".text-bignum"), h2: px(".text-h2"), h3: px(".text-h3"), h4: px(".text-h4"),
             h5: px(".text-h5"), body: px(".text-body"), caption: px(".text-caption"),
             label: px(".text-label"), micro: px(".text-micro") },
    faces: (() => {
      // Measure what PAINTS, not what is declared. getComputedStyle returns
      // the declared stack whether or not a single face in it loaded, so the
      // previous version passed while all five fell back to one generic.
      // A face that loaded renders the same string at a different width from
      // the fallback; one that did not renders at exactly the fallback width.
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-size:64px;font-weight:700";
      probe.textContent = "Analysis Overview 18.40";
      document.body.appendChild(probe);
      const width = (stack) => { probe.style.fontFamily = stack; return Math.round(probe.getBoundingClientRect().width); };
      // The baseline must be a family that CANNOT exist. An unloaded font
      // falls back to the browser's DEFAULT face, not to sans-serif — so
      // comparing against sans-serif reported every missing font as loaded,
      // which is how the first version of this check passed while nothing
      // had loaded at all.
      const fallback = width('"__no_such_family_1a2b3c__"');
      const out = {};
      for (const f of ${JSON.stringify(FACES)}) {
        const w = width('"' + f + '", "__no_such_family_1a2b3c__"');
        out[f] = { w, loaded: w !== fallback };
      }
      out._fallback = { w: fallback, loaded: true };
      probe.remove();
      return out;
    })(),
    smoothing: getComputedStyle(document.documentElement).webkitFontSmoothing,
    wrap: (() => { const e = document.querySelector(".text-h3"); return e ? getComputedStyle(e).textWrap : null; })(),
    bands,
    overflow: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
  };
})()`;

const report = await page.evaluate(PROBE) as {
  sizes: Record<string, number | null>;
  faces: Record<string, { w: number; loaded: boolean }>;
  smoothing: string; wrap: string;
  bands: { fill: string; ratio: number }[];
  overflow: { scroll: number; client: number };
};
// ── Responsive pass ───────────────────────────────────────────────────
// Content inside a horizontal scroll container is SUPPOSED to be wider than
// the viewport — that is what scrolling means. Only an element with no
// scrollable ancestor is actually pushing the page sideways.
const OVERFLOW_PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const inScroller = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const ov = getComputedStyle(n).overflowX;
      if (ov === "auto" || ov === "scroll" || ov === "hidden") return true;
    }
    return false;
  };
  document.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.width <= vw + 1) return;
    if (inScroller(el)) return;
    // Report the DEEPEST offenders, not the outermost. When the whole chain
    // up to <body> overflows, an outermost-only filter names nothing at all —
    // which is exactly the useless "cause not isolated" this replaced.

    const sec = el.closest("section"), h = sec ? sec.querySelector("h2") : null;
    out.push({ panel: h ? h.textContent.trim() : "(page)", text: (el.textContent || "").trim().slice(0, 40),
               cls: (el.className || "").toString().replace(/\\s+/g, " ").slice(0, 70) });
  });
  return { vw, docScroll: document.documentElement.scrollWidth, out: out.slice(0, 8) };
})()`;

const responsive: string[] = [];
for (const [w, name] of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(OVERFLOW_PROBE) as {
    vw: number; docScroll: number;
    out: { panel: string; text: string; cls: string }[];
  };
  // The signal that means something is "is any element pushing the page",
  // not documentElement.scrollWidth. The latter reads a dozen px high even
  // when every wide thing is correctly inside a scroll container, so failing
  // on it produces an alarm nobody can act on. The element list is the fact.
  responsive.push(`${name} ${w}px: ${r.out.length === 0 ? "clean" : `${r.out.length} pushing`} (doc ${r.docScroll})`);
  for (const o of r.out) {
    problems.push(
      `at ${name} (${w}px) "${o.panel}" pushes the page sideways — element "${o.text}" (${o.cls}). ` +
        `Either let it wrap, give it min-w-0 so it can shrink, or put it in an overflow-x-auto container.`,
    );
  }
}
await page.setViewportSize({ width: 1440, height: 1100 });

await browser.close();

const { sizes, bands, overflow } = report;
const ladder: [string, number | null, string, number | null][] = [
  ["H1", sizes.h1, "H2", sizes.h2], ["H2", sizes.h2, "H3", sizes.h3],
  ["H3", sizes.h3, "H4", sizes.h4], ["H4", sizes.h4, "H5", sizes.h5],
  ["H5", sizes.h5, "body", sizes.body],
];
for (const [an, a, bn, b] of ladder) {
  if (a == null || b == null) { problems.push(`could not measure ${an} or ${bn} in the browser`); continue; }
  if (a - b < MIN_STEP) problems.push(`${an} (${a}px) is only ${a - b}px above ${bn} (${b}px) — needs ${MIN_STEP}px`);
}
if (sizes.body != null && sizes.body < BODY_FLOOR) problems.push(`body computes to ${sizes.body}px, below the ${BODY_FLOOR}px floor`);
for (const family of FACES) {
  const m = report.faces?.[family];
  if (!m) { problems.push(`could not measure whether ${family} painted`); continue; }
  // Two different failures, kept apart because they have different fixes.
  if (matched[family] === 0) {
    problems.push(
      `${family} matched no @font-face rule at weight 700 — check public/fonts/fonts.css ` +
        `declares it and that the .woff2 is being served.`,
    );
    continue;
  }
  if (!m.loaded) {
    problems.push(
      `${family} did not load — it renders at the fallback's exact width (${m.w}px). ` +
        `The ramp separates five heading levels by face as well as size; a face that ` +
        `silently falls back collapses two levels into one with nothing in the CSS to show for it.`,
    );
  }
}
if (report.smoothing !== "antialiased") problems.push(`font smoothing is "${report.smoothing}", not antialiased`);
if (report.wrap !== "balance") problems.push(`heading text-wrap is "${report.wrap}", not balance`);
if (overflow.scroll > overflow.client) problems.push(`the page scrolls horizontally (${overflow.scroll} > ${overflow.client})`);
if (bands.length === 0) problems.push("no generated fills were measurable — the scale panels did not render");
for (const b of bands) {
  if (b.ratio < AA_TEXT) problems.push(`a generated fill (${b.fill}) carries text at ${b.ratio}:1, below AA ${AA_TEXT}:1`);
}
for (const e of consoleErrors) problems.push(`uncaught page error: ${e}`);

console.log(`\nScreenshot → ${path.join(OUT, "design-lab.png")}`);
console.log(`Ladder: H1 ${sizes.h1} → H2 ${sizes.h2} → H3 ${sizes.h3} → H4 ${sizes.h4} → H5 ${sizes.h5} → body ${sizes.body} → caption ${sizes.caption} → label ${sizes.label} → micro ${sizes.micro}`);
console.log(`Faces:           ${Object.entries(report.faces).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k} ${v.loaded ? "ok" : "FALLBACK"}`).join(" · ")}`);
console.log(`Responsive:      ${responsive.join(" · ")}`);
console.log(`Generated fills: ${bands.length} measured, worst text contrast ${Math.min(...bands.map((b) => b.ratio))}:1`);

if (problems.length > 0) {
  console.error("\nFAIL  Rendered-UI violations:\n");
  for (const p of problems) console.error(`      · ${p}`);
  console.error("");
  process.exit(1);
}
console.log("\nPASS  The rendered UI conforms.\n");
