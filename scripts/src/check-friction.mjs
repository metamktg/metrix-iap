// ─── check:friction ───────────────────────────────────────────────────
//
// What a reader meets on the first layer of every page, measured in a real
// browser and held against a baseline that may only shrink.
//
// The friction this catches is not one bug. It is the accumulation that
// makes a data product feel unfinished: a page that opens with a warning
// box before it has said anything, a panel that reports "No demographic
// data" while the page beside it lists twelve segments, a paragraph of
// explanation sitting on a card face where the rulebook says a fragment
// belongs. Each is defensible alone. Together they are the difference
// between a tool that proves something and one that apologises.
//
// WHY A BROWSER. Every signal here is a property of the rendered page:
// whether a warning is visible or inside a popover, whether prose is on the
// card face or behind a reveal, whether a page overflows at 390px. A source
// scan sees the JSX that could produce any of them and cannot tell which
// one a reader actually gets. jsdom has no layout, so it cannot either.
//
// TWO KINDS OF FINDING.
//   HARD — must stay at zero, never baselined: an uncaught exception or
//   console error, horizontal overflow at either width, a <button> nested
//   in a <button>, and copy the signal/coverage rework retired. Each is a
//   defect with no legitimate instance, so a count would only make room
//   for one.
//   RATCHETED — first-layer warning boxes, warning glyphs, and prose over
//   the rulebook's 220 characters, counted per route and compared against
//   `check-friction.baseline.json`. A route may lower its count freely;
//   raising it fails. Same contract as check:disclosure-rulebook, and for
//   the same reason: the number that matters is the direction.
//
// NO-DATA PHRASES are held as a SET per route, not a count. "No creative
// scan yet" on the Creative Scan page is the honest empty state the loop
// depends on; the same sentence appearing on Analysis Overview means a
// surface stopped reading a dataset its siblings still have. A count
// cannot tell those apart — the phrase and the route together can, so a
// NEW phrase on a route is the finding and a disappearing one is progress.
//
// Routes are enumerated from `navTree.ts` and `App.tsx` rather than listed
// here, so a page added tomorrow is measured tomorrow. Fixture accounts
// only: this reads the checked-in seed through a request stub and never
// touches a live database.
//
// NOT WIRED INTO .replit — needs a running dev server, the same constraint
// that keeps check:accessible-names, check:chart-geometry and
// check:unexplained-dashes out of the validation set.
//
//   PORT=5178 BASE_PATH=/ pnpm --filter @workspace/metrix-iap run dev
//   pnpm --filter @workspace/scripts run check:friction
//   pnpm --filter @workspace/scripts run check:friction -- --write-baseline
//
// Exit 0 clean / 1 with findings / 2 could not reach the server.

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

// Resolved from THIS FILE, not from cwd: pnpm runs the script with cwd set
// to scripts/, where a repo-root-relative path points at nothing.
const REPO = path.resolve(import.meta.dirname, "../..");
const BASE = process.env.FRICTION_CHECK_BASE ?? "http://localhost:5178";
const BASELINE = path.join(import.meta.dirname, "check-friction.baseline.json");
const WRITE = process.argv.includes("--write-baseline");
const ACCOUNTS = (process.env.FRICTION_ACCOUNTS ?? "bookster,ecas").split(",");
const WIDTHS = (process.env.FRICTION_WIDTHS ?? "1440,390").split(",").map(Number);

const SEED = fs.readFileSync(
  path.join(REPO, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"),
  "utf8",
);

// Phrases the signal/coverage rework retired. Each was a sentence that told
// the reader to distrust a number without saying what to do about it; the
// evidence chips replaced them. If one comes back, a surface has been
// written against the old model.
const RETIRED = [
  /insufficient join coverage/i,
  /not enough attributable spend/i,
  /Read these numbers as directional/i,
  /does not guess Meta's cause/i,
  /Placement data is account-level in this import/i,
];

function routes() {
  const found = new Set();
  const nav = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/navigation/navTree.ts"), "utf8");
  for (const m of nav.matchAll(/"(\/app\/[a-z0-9/-]*)"/g)) found.add(m[1]);
  const app = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/App.tsx"), "utf8");
  for (const m of app.matchAll(/path="(\/app[a-z0-9/-]*)"/g)) found.add(m[1]);
  // A legacy path is a redirect to somewhere already in this list; visiting
  // it measures the target twice and reports the finding against the wrong
  // route.
  const legacy = new Set(
    [...fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/navigation/legacyRoutes.ts"), "utf8")
      .matchAll(/\["(\/app[^"]*)",\s*"[^"]*"\]/g)].map((m) => m[1]),
  );
  return [...found].filter((r) => !r.includes(":") && !legacy.has(r)).sort();
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

async function stub(p) {
  await p.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await p.route("**/api/metrix/auth/me", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { id: "t", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } }),
  }));
  await p.route("**/api/metrix/seed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: SEED }));
  await p.route("**/api/metrix/workspaces/*/reports", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }),
  }));
}

const probe = await browser.newPage();
await stub(probe);
try {
  await probe.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
} catch {
  await browser.close();
  console.log(`check:friction — could not reach ${BASE}. Start the dev server first; nothing was checked.`);
  process.exit(2);
}
await probe.close();

const ROUTES = routes();
const measured = new Map(); // route -> { warnBoxes, warnIcons, longProse, noData:Set }
const hard = [];            // findings that are never baselined
let visits = 0;

const record = (route) => {
  if (!measured.has(route)) measured.set(route, { warnBoxes: 0, warnIcons: 0, longProse: 0, noData: new Set(), proseSample: null });
  return measured.get(route);
};

try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(9000);
    await stub(page);
    let noise = [];
    page.on("pageerror", (e) => noise.push("uncaught: " + String(e).slice(0, 150)));
    page.on("console", (m) => { if (m.type() === "error") noise.push("console: " + m.text().slice(0, 150)); });

    for (const account of ACCOUNTS) {
      for (const route of ROUTES) {
        noise = [];
        const where = `${route} · ${account} · ${width}px`;
        try {
          await page.goto(`${BASE}${route}?account=${account}`, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(1400);
        } catch (e) {
          hard.push(`${where} — did not load: ${String(e).slice(0, 100)}`);
          continue;
        }
        visits++;
        const facts = await page.evaluate((retired) => {
          // A warning inside a popover, dialog or menu is the reader's own
          // doing — they opened it. Only the first layer counts.
          const inOverlay = (el) => !!el.closest('[role="tooltip"], [role="dialog"], [data-radix-popper-content-wrapper], [data-state="open"][role="menu"]');
          const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          const all = [...document.querySelectorAll("body *")];
          const warnBoxes = all.filter((el) =>
            el instanceof HTMLElement
            && /(^|\s)(bg|border)-status-warning/.test(el.className)
            && /(^|\s)border(\s|$|-)/.test(el.className)
            && !inOverlay(el) && shown(el) && el.getBoundingClientRect().width > 120).length;
          const warnIcons = all.filter((el) =>
            el.tagName.toLowerCase() === "svg"
            && (el.getAttribute("class") || "").includes("lucide-triangle-alert")
            && !inOverlay(el) && shown(el)).length;
          // Leaf text only: an ancestor's textContent repeats its children.
          const texts = all
            .filter((el) => (el.tagName === "P" || el.tagName === "SPAN" || el.tagName === "DIV") && el.children.length === 0 && shown(el) && !inOverlay(el))
            .map((el) => (el.textContent || "").trim())
            .filter(Boolean);
          const noData = texts.filter((t) => /^No [a-z -]*(data|rows|results|export|signal|scan|creative|performance)/i.test(t) && t.length < 140);
          const stale = texts.filter((t) => retired.some((s) => new RegExp(s.source, s.flags).test(t)));
          const longProse = texts.filter((t) => t.length > 220).map((t) => t.slice(0, 80));
          return {
            warnBoxes, warnIcons,
            noData: [...new Set(noData)],
            stale: [...new Set(stale)].map((t) => t.slice(0, 90)),
            longProse,
            nested: document.querySelectorAll("button button").length,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          };
        }, RETIRED.map((r) => ({ source: r.source, flags: r.flags })));

        const m = record(route);
        m.warnBoxes += facts.warnBoxes;
        m.warnIcons += facts.warnIcons;
        m.longProse += facts.longProse.length;
        m.proseSample ??= facts.longProse[0] ?? null;
        for (const t of facts.noData) m.noData.add(t);

        for (const n of [...new Set(noise)]) hard.push(`${where} — ${n}`);
        if (facts.overflow) hard.push(`${where} — the page scrolls sideways`);
        if (facts.nested > 0) hard.push(`${where} — ${facts.nested} <button> nested inside a <button>`);
        for (const t of facts.stale) hard.push(`${where} — retired copy: "${t}"`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const current = {};
for (const route of [...measured.keys()].sort()) {
  const m = measured.get(route);
  current[route] = {
    warnBoxes: m.warnBoxes,
    warnIcons: m.warnIcons,
    longProse: m.longProse,
    noData: [...m.noData].sort(),
  };
  if (m.proseSample) current[route].sample = m.proseSample;
}

if (WRITE) {
  const stored = Object.fromEntries(
    Object.entries(current).map(([route, { sample: _sample, ...keep }]) => [route, keep]),
  );
  fs.writeFileSync(BASELINE, JSON.stringify(stored, null, 2) + "\n");
  const tot = (k) => Object.values(current).reduce((s, r) => s + r[k], 0);
  console.log(
    `check:friction — baseline written: ${Object.keys(current).length} routes, ${visits} visits, ` +
    `${tot("warnBoxes")} warning box(es), ${tot("warnIcons")} warning glyph(s), ${tot("longProse")} long prose block(s), ` +
    `${Object.values(current).reduce((s, r) => s + r.noData.length, 0)} distinct no-data phrase(s).`,
  );
  process.exit(hard.length === 0 ? 0 : 1);
}

let base = {};
try { base = JSON.parse(fs.readFileSync(BASELINE, "utf8")); } catch {
  console.log(`check:friction — no baseline at ${BASELINE}. Run with -- --write-baseline once, then commit it.`);
  process.exit(2);
}

const raised = [];
for (const [route, r] of Object.entries(current)) {
  const b = base[route];
  if (!b) {
    // A new page starts at zero: it is measured the moment it exists, and
    // the first commit that adds it says what it costs.
    for (const k of ["warnBoxes", "warnIcons", "longProse"]) {
      if (r[k] > 0) raised.push(`${route} — new page opens with ${r[k]} ${k}; add it to the baseline or clear them`);
    }
    for (const t of r.noData) raised.push(`${route} — new page says "${t}"`);
    continue;
  }
  for (const [k, label] of [["warnBoxes", "warning box(es)"], ["warnIcons", "warning glyph(s)"], ["longProse", "block(s) of first-layer prose over 220 chars"]]) {
    if (r[k] > b[k]) {
      // A count names the direction; the sample names the thing to fix.
      const why = k === "longProse" && r.sample ? ` — e.g. "${r.sample}…"` : "";
      raised.push(`${route} — ${label}: ${b[k]} → ${r[k]}${why}`);
    }
  }
  for (const t of r.noData) {
    if (!(b.noData ?? []).includes(t)) raised.push(`${route} — now says "${t}", which it did not before`);
  }
}

const lowered = Object.entries(current).filter(([route, r]) => {
  const b = base[route];
  return b && (r.warnBoxes < b.warnBoxes || r.warnIcons < b.warnIcons || r.longProse < b.longProse || r.noData.length < (b.noData ?? []).length);
}).length;

if (hard.length === 0 && raised.length === 0) {
  console.log(
    `check:friction — clean (${visits} visits across ${ROUTES.length} routes x ${ACCOUNTS.length} accounts x ${WIDTHS.length} widths` +
    (lowered ? `; ${lowered} route(s) below baseline — re-run with --write-baseline to lock the gain)` : ")"),
  );
  process.exit(0);
}

console.log(`\ncheck:friction — ${hard.length} defect(s), ${raised.length} raised ratchet(s)\n`);
if (hard.length) {
  console.log("  Defects — these have no legitimate instance:\n");
  for (const h of [...new Set(hard)].slice(0, 30)) console.log("   " + h);
  console.log("");
}
if (raised.length) {
  console.log("  Raised against the baseline:\n");
  for (const r of raised.slice(0, 30)) console.log("   " + r);
  console.log("");
}
console.log(
  "A warning box, a warning glyph and a paragraph are each defensible once.\n" +
  "The baseline exists because they are never added once: every surface has\n" +
  "a reason, and the sum is a product that opens by apologising. Put the\n" +
  "explanation behind a DetailReveal, state the fact as an evidence chip,\n" +
  "and keep the card face a fragment. If the raise is genuinely the honest\n" +
  "reading, re-run with --write-baseline and say why in the commit.\n",
);
process.exit(1);
