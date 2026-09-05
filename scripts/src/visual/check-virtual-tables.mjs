// READ-ONLY browser check: the virtualized tables render rows.
//
// jsdom has no layout, so a virtualizer that never subscribes to its scroll
// container passes every unit test and renders a header with no rows in a
// browser. That is what the IAP Library's Variables tab did for every
// account past 50 variables (Pure Path, 2026-09-05: 764 counted, none
// shown): the virtualizer was created in a child of the scroll div, whose
// ref React attaches after that child's layout effect has already asked
// for it. This opens the Library on the fixture's 606-variable account
// against a running dev server (PORT=5178 BASE_PATH=/), walks to the
// Variables tab at 1440 and 390 px, and FAILS unless the table body
// carries rows and the scroll container is taller than its header.
//
// Exit 0 rows rendered / 1 a table rendered no rows / 2 could not reach the
// server (nothing checked, not a verdict). No credentials: the API is
// stubbed with the checked-in fixture, the same stubs shoot:routes uses.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const BASE = process.env.SHOOT_BASE ?? "http://localhost:5178";
const ACCOUNT = process.env.CHECK_ACCOUNT ?? "manual_9JGXU_AQJjxJ";
const SEED = fs.readFileSync(path.join(REPO, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"), "utf8");

async function mock(ctx) {
  await ctx.route("**/api/metrix/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/metrix/auth/me", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "test-user", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } }) }));
  await ctx.route("**/api/metrix/seed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: SEED }));
  await ctx.route("**/api/metrix/workspaces/*/reports", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }));
  await ctx.route("**/analysis/data-windows**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ windows: [] }) }));
  await ctx.route("**/analysis/summary**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totals: {}, concept_rows: [], placement_rows: [], demographic_rows: [] }) }));
}

try {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`status ${res.status}`);
} catch (err) {
  console.error(`check:virtual-tables: could not reach ${BASE} (${err instanceof Error ? err.message : err}). Start the dev server: PORT=5178 BASE_PATH=/ pnpm --filter @workspace/metrix-iap run dev`);
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
let failures = 0;
for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: 1, hasTouch: width < 500 });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/app/analysis/library?account=${ACCOUNT}`, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("tab", { name: /Variable performance/ }).click();
  await page.waitForTimeout(1200);
  const tables = await page.evaluate(() =>
    [...document.querySelectorAll("table.nc-table")].map((t) => {
      const scroller = t.parentElement;
      const rows = [...t.querySelectorAll("tbody tr")].filter((r) => r.getAttribute("aria-hidden") !== "true").length;
      return { rows, scrollerH: Math.round(scroller.getBoundingClientRect().height), theadH: Math.round(t.querySelector("thead")?.getBoundingClientRect().height ?? 0) };
    }),
  );
  const count = await page.getByRole("tab", { name: /Variable performance/ }).innerText();
  for (const t of tables) {
    const ok = t.rows > 0 && t.scrollerH > t.theadH;
    if (!ok) failures++;
    console.log(`${ok ? "OK  " : "FAIL"} [${width}] variable table: ${t.rows} rows rendered, scroller ${t.scrollerH}px, header ${t.theadH}px (tab: ${count.replace(/\s+/g, " ")})`);
  }
  if (tables.length === 0) { failures++; console.log(`FAIL [${width}] no table found on the Variables tab`); }
  if (errors.length) { failures++; console.log(`FAIL [${width}] page errors: ${errors.join(" | ")}`); }
  await ctx.close();
}
await browser.close();
process.exit(failures > 0 ? 1 : 0);
