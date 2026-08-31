// ─── check:accessible-names ───────────────────────────────────────────
//
// OPERATOR CHECK, not a .replit validation: it needs a running dev server,
// same class as check:seed-fixture-drift.
//
//   cd artifacts/metrix-iap && PORT=5178 BASE_PATH=/ pnpm exec vite \
//     --config vite.config.ts --port 5178 --strictPort
//   node scripts/src/check-accessible-names.mjs        (from the repo root)
//
// WHY IT EXISTS
//
// check:ui-inventory's A11Y signal asks whether a FILE literally writes
// `aria-…` or `role=`. That is a weak proxy in both directions, and both
// were measured on 2026-08-31:
//
//   Under-reports — Radix supplies role and labelling wiring on the
//   primitive, so a file rendering <DialogContent> is announced correctly
//   while scoring absent. Fourteen files are in exactly that position.
//   A static sweep for the real defect (an icon-only control with no
//   label) is no better: JSX puts most button labels inside {expressions},
//   so a regex that strips them flags 25 controls of which every sampled
//   one was a false positive.
//
//   Over-reports — a file can carry aria-hidden and nothing else and still
//   score present.
//
// Only the rendered accessibility tree settles it. This walks the six
// spine views with the route-mocked seed fixture and reports, per view,
// how many visible interactive controls resolve to an accessible name by
// the same precedence a screen reader uses: aria-label → aria-labelledby →
// text content → title → <label>/placeholder → nested img[alt].
//
// SCOPE, STATED HONESTLY: this measures NAMES. It is not a full audit.
// Contrast has its own three gates; target size and hover-only affordances
// belong to check:interaction; focus order, live regions and keyboard
// traps are not measured anywhere yet.
//
// Baseline at first run (2026-08-31): 595 controls, 0 unnamed, across
// account overview, ad performance, IAP library, strategy map, creative
// library and action queue.

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:5178";
const SEED = fs.readFileSync(path.resolve(import.meta.dirname, "../../artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"), "utf8");
const ROUTES = [
  ["Account overview", "/app/account?account=bookster"],
  ["Ad performance",   "/app/analysis/performance?account=bookster"],
  ["IAP library",      "/app/analysis/library?account=bookster"],
  ["Strategy map",     "/app/strategy/map?account=bookster"],
  ["Creative library", "/app/creative/library?account=bookster"],
  ["Action queue",     "/app/act/queue?account=bookster"],
];

const PROBE = `(() => {
  const SEL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], input, select, textarea';
  const els = Array.from(document.querySelectorAll(SEL));
  const visible = els.filter(e => { const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
  const nameOf = e => {
    const al = e.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    const lb = e.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\\s+/).map(id => (document.getElementById(id)||{}).textContent || '').join(' ').trim(); if (t) return t; }
    const t = (e.innerText || e.textContent || '').trim(); if (t) return t;
    const ti = e.getAttribute('title'); if (ti && ti.trim()) return ti.trim();
    if (e.labels && e.labels.length && e.labels[0].textContent && e.labels[0].textContent.trim()) return e.labels[0].textContent.trim();
    if (e.placeholder && e.placeholder.trim()) return e.placeholder.trim();
    const img = e.querySelector('img[alt]'); if (img && img.alt.trim()) return img.alt.trim();
    return '';
  };
  const bad = visible.filter(e => !nameOf(e)).map(e => {
    const cls = (e.className || '').toString().split(/\\s+/).slice(0,3).join('.');
    const tid = e.getAttribute('data-testid');
    return '<' + e.tagName.toLowerCase() + (tid ? ' testid=' + tid : '') + (cls ? ' .' + cls : '') + '>';
  });
  return { total: visible.length, bad };
})()`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
await page.route("**/api/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.route("**/api/metrix/auth/me", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "t", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } }) }));
await page.route("**/api/metrix/seed", r => r.fulfill({ status: 200, contentType: "application/json", body: SEED }));
await page.route("**/api/metrix/workspaces/*/reports", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }));

let grand = 0, grandBad = 0;
for (const [label, url] of ROUTES) {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const res = await page.evaluate(PROBE);
  grand += res.total; grandBad += res.bad.length;
  const pct = res.total ? Math.round(((res.total - res.bad.length) / res.total) * 100) : 100;
  console.log(label.padEnd(18) + String(res.total).padStart(4) + " controls  " + pct + "% named" + (res.bad.length ? "  — " + res.bad.length + " UNNAMED" : ""));
  for (const b of [...new Set(res.bad)].slice(0, 6)) console.log("     " + b);
}
console.log("\nTOTAL " + grand + " interactive controls, " + grandBad + " without an accessible name (" + (grand ? Math.round(((grand - grandBad) / grand) * 100) : 100) + "% named)");
await browser.close();
