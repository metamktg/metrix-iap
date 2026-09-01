// ─── check:chart-geometry ─────────────────────────────────────────────
//
// Charts drawn OUTSIDE their own box, measured in a real browser.
//
// WHY A BROWSER. jsdom has no layout engine: every getBoundingClientRect is
// 0x0 and no CSS variable resolves. So a chart can be clipped in half in
// production while the whole unit suite passes, and no static check can see
// it either — the defect only exists once a box has a measured size.
//
// That is exactly how this shipped. SharePieChart set innerRadius={60}
// outerRadius={90} — absolute PIXELS, so the donut demanded a 180x180 box
// no matter what box it was handed. On Analysis Overview that box is
// 170x105, and all three sectors were drawn outside it: one starting 38px
// above the top edge, another running 33px below the bottom. The ring
// rendered as a set of clipped arcs. It was reported by a person looking at
// the screen, which is the only thing that could have caught it.
//
// WHAT IT CHECKS. For each route, every recharts <svg class="recharts-surface">
// is measured, then every mark inside it (pie sectors, bars, lines, areas,
// dots). A mark whose bounding box extends beyond its surface by more than
// TOLERANCE is a finding, reported with the overflow in pixels on each side.
//
// TOLERANCE exists because a stroke is centred on its path: a 2px line at
// the very edge legitimately spills 1px. Anything past 2px is geometry, not
// stroke width.
//
// NOT WIRED INTO .replit — like check:accessible-names it needs a running
// dev server, so it is registered in MANUAL_ONLY_CHECK_SCRIPTS. Run it
// against a server started on BASE.
//
//   pnpm --filter @workspace/scripts run check:chart-geometry
//
// Exit 0 clean / 1 with findings / 2 could not reach the server (nothing
// checked — not a verdict on the charts).

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.CHART_GEOMETRY_BASE ?? "http://localhost:5178";
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium";
const REPO = path.resolve(import.meta.dirname, "../..");
const FIXTURE = path.join(REPO, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json");

/** A stroke is centred on its path, so 1px of spill is legitimate. */
const TOLERANCE = 2;

/** Routes that carry a chart. One account with real data, one without. */
const ROUTES = [
  ["Analysis Overview", "/app/analysis/overview?account=bookster"],
  ["Audience", "/app/analysis/audience?account=bookster"],
  ["Placements", "/app/analysis/placements?account=bookster"],
  ["Engagement funnel", "/app/analysis/funnel?account=bookster"],
  ["Ad performance", "/app/analysis/performance?account=bookster"],
  ["Budget", "/app/analysis/budget?account=bookster"],
  ["Manager overview", "/app/overview"],
  ["Analysis Overview · sparse account", "/app/analysis/overview?account=ecas"],
];

const MARKS = [
  ".recharts-pie-sector path",
  ".recharts-bar-rectangle path",
  ".recharts-line-curve",
  ".recharts-area-area",
  ".recharts-dot",
];

const seed = fs.readFileSync(FIXTURE, "utf8");
const findings = [];
let surfaces = 0;
let marks = 0;

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

// Catch-all FIRST: playwright matches the most recently registered route,
// so the specific handlers below must come after it.
await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.route("**/api/metrix/auth/me", (r) =>
  r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { id: "t", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } }),
  }));
await page.route("**/api/metrix/seed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: seed }));
await page.route("**/api/metrix/workspaces/*/reports", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
} catch {
  await browser.close();
  console.log(`check:chart-geometry — could not reach ${BASE}. Start the dev server first; nothing was checked.`);
  process.exit(2);
}

for (const [label, url] of ROUTES) {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const result = await page.evaluate(
    ({ selectors, tol }) => {
      const out = { surfaces: 0, marks: 0, bad: [] };
      for (const svg of document.querySelectorAll("svg.recharts-surface")) {
        const box = svg.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue; // not laid out yet
        out.surfaces++;
        for (const sel of selectors) {
          for (const el of svg.querySelectorAll(sel)) {
            const b = el.getBoundingClientRect();
            if (b.width === 0 && b.height === 0) continue;
            out.marks++;
            const over = {
              top: Math.round(box.top - b.top),
              left: Math.round(box.left - b.left),
              right: Math.round(b.right - box.right),
              bottom: Math.round(b.bottom - box.bottom),
            };
            const worst = Math.max(over.top, over.left, over.right, over.bottom);
            if (worst > tol) {
              out.bad.push({
                sel,
                surface: `${Math.round(box.width)}x${Math.round(box.height)}`,
                over: Object.fromEntries(Object.entries(over).filter(([, v]) => v > tol)),
              });
            }
          }
        }
      }
      return out;
    },
    { selectors: MARKS, tol: TOLERANCE },
  );
  surfaces += result.surfaces;
  marks += result.marks;
  for (const b of result.bad) {
    findings.push(
      `${label}  —  ${b.sel}\n      surface ${b.surface}, drawn outside by ${JSON.stringify(b.over)}px`,
    );
  }
}

await browser.close();

if (findings.length === 0) {
  console.log(`check:chart-geometry — clean (${surfaces} chart surface(s), ${marks} mark(s) across ${ROUTES.length} routes)`);
  process.exit(0);
}

console.log(`\ncheck:chart-geometry — ${findings.length} mark(s) drawn outside their chart\n`);
// One line per distinct surface+selector; a clipped donut reports every sector.
for (const f of [...new Set(findings)]) console.log("  " + f + "\n");
console.log(
  "A mark outside its surface is clipped on screen. The usual cause is\n" +
  "absolute pixel geometry in a responsive box — innerRadius={60} demands a\n" +
  "180px box whatever box it is given. Use relative radii and sizes so the\n" +
  "chart fits what it is placed in.\n",
);
process.exit(1);
