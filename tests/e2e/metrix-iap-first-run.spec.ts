// ─── First-run journey: a manual account before its first successful run ──
//
// WHAT THIS GUARDS (owner screenshots, 2026-09-04)
// A manual account is created with platform "Meta Ads" and source_status
// "manual_reports". Two surfaces read "manual versus live" off the platform
// string, so the setup checklist asked a manual account to "Connect data
// source" while its exports were already staged, and the Analysis command
// centre hid staging, the run control and the run history behind that
// checklist, whose "Run analysis" step linked straight back to it.
//
// The fixture has no unconfigured account, so one is synthesised from it:
// status unconfigured, iap null, source_status manual_reports, with two
// staged imports and one failed run stubbed on the API. Both widths.

import { chromium } from "playwright-core";
import type { BrowserContext, Page } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname_local, "../..");
const BASE = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const ACCOUNT = "manual_firstrun";
const seed = JSON.parse(
  fs.readFileSync(path.resolve(REPO_ROOT, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"), "utf-8"),
) as { ad_accounts: Record<string, unknown>[] };
const template = seed.ad_accounts.find((a) => a["id"] === "bookster")!;
seed.ad_accounts.push({
  id: ACCOUNT,
  name: "First Run (test)",
  status: "unconfigured",
  platform: "Meta Ads",
  source_status: "manual_reports",
  objectives: [],
  overview_state: {
    title: "Analysis not run yet",
    description:
      "This ad account was created for manual report uploads. Upload exported Meta reports; performance and strategy data appears after the first analysis run processes them.",
    primary_action: "Upload Reports",
    secondary_action: "Connect Meta",
  },
  iap: null,
  mst: (template["mst"] as Record<string, unknown> | undefined) ?? { status: "not_available" },
});
const SEED_BODY = JSON.stringify(seed);

const WATCHDOG_ERROR =
  "The analysis run stopped reporting progress for 48 minute(s) and was marked failed. Last reported stage: \"Parsing ad summary export\". (36% complete) This means the process running it died (a restart or deploy), or the step it was on hung. Any partial output it wrote has been removed, so nothing half-finished is shown as real. Try again.";

const IMPORTS = {
  imports: [
    { id: "imp-1", account_id: ACCOUNT, kind: "performance_ad_summary_csv", filename: "Pure-Path-Ad-Summary.csv", content_type: "text/csv", size_bytes: 120000, ad_names: [], match_method: null, status: "staged", manual_analysis_run_id: null, created_at: "2026-09-04T02:10:00Z" },
    { id: "imp-2", account_id: ACCOUNT, kind: "creative_asset", filename: "yomi rip 1 - 26.mp4", content_type: "video/mp4", size_bytes: 26000000, ad_names: [], match_method: null, status: "staged", manual_analysis_run_id: null, created_at: "2026-09-04T02:12:00Z" },
  ],
};
const RUNS = {
  runs: [
    { id: "run-1", account_id: ACCOUNT, status: "error", date_range: "all", date_start: null, date_end: null, rows_ingested: null, imports_used: 1, error_message: WATCHDOG_ERROR, started_at: "2026-09-04T02:59:00Z", finished_at: "2026-09-04T03:47:00Z", progress_pct: 36, progress_stage: "Parsing ad summary export" },
  ],
};

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓  ${name}`); passed++; }
  catch (err) { console.error(`  ✗  ${name}`); console.error(`       ${(err as Error).message}`); failed++; }
}
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function mockApis(ctx: BrowserContext): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  // Newest-registered handler wins, so the catch-all goes first.
  await ctx.route("**/api/metrix/**", (r) => r.fulfill(json({})));
  await ctx.route("**/api/metrix/auth/me", (r) =>
    r.fulfill(json({ user: { id: "test-user", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" } })));
  await ctx.route("**/api/metrix/seed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: SEED_BODY }));
  await ctx.route("**/api/metrix/workspaces/*/reports", (r) => r.fulfill(json({ reports: [] })));
  await ctx.route(`**/api/metrix/accounts/${ACCOUNT}/manual-imports`, (r) => r.fulfill(json(IMPORTS)));
  await ctx.route(`**/api/metrix/accounts/${ACCOUNT}/analysis-runs`, (r) => r.fulfill(json(RUNS)));
  await ctx.route(`**/api/metrix/accounts/${ACCOUNT}/analysis-runs/latest**`, (r) => r.fulfill(json({ run: RUNS.runs[0] })));
  await ctx.route(`**/api/metrix/accounts/${ACCOUNT}/stage-status**`, (r) =>
    r.fulfill(json({ analysis: { status: "error", last_run_at: "2026-09-04T03:47:00Z" }, strategy: { status: "none", last_run_at: null }, briefs: { status: "none", last_run_at: null, count: 0 } })));
}

async function open(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE}${route}?account=${ACCOUNT}`, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const len = await page.evaluate(() => (document.querySelector("main")?.innerText ?? "").trim().length);
    if (len > 40) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(600);
}

async function main() {
  console.log(`\nMetrix IAP first-run journey e2e (${BASE})\n`);
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXE, headless: true });
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, hasTouch: width < 500 });
      const page = await ctx.newPage();
      await mockApis(ctx);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/vite|net::ERR|Failed to load resource/i.test(m.text())) errors.push(m.text()); });

      await test(`Analysis centre at ${width}px surfaces staging, the run control and the history before the first run`, async () => {
        await open(page, "/app/analysis");
        const text = await page.locator("main").innerText();
        assert(!/Connect data source/.test(text), "a manual account is asked to connect a data source");
        assert(!/Switch ad account/.test(text), "the centre still shows the full-page setup state instead of its modules");
        assert(/Run analysis/.test(text), "the run card is missing");
        assert(/Pure-Path-Ad-Summary\.csv/.test(text), "the staged export is not listed");
        assert(/Run history/.test(text), "the run history card is missing");
        assert((await page.locator('[data-testid="first-run-checklist"]').count()) === 1, "the setup strip is missing");
        const checklist = await page.locator('[data-testid="first-run-checklist"]').innerText();
        assert(/Stage a performance export/.test(checklist), "the export step is missing from the checklist");
        // The staged export ticks its step; the run step is the next one.
        const stepDone = await page.locator('[data-testid="first-run-checklist"] .line-through').allInnerTexts();
        assert(stepDone.some((t) => /Stage a performance export/.test(t)), `the staged export did not tick its step (done: ${stepDone.join(" | ")})`);
        // The failed run's error is readable in full, not as a truncated span.
        const err = page.locator('[data-testid="analysis-run-error"]');
        assert((await err.count()) === 1, "the failed run's error is not shown");
        assert((await err.innerText()).includes("Parsing ad summary export"), "the error is not shown whole");
        // A real run control exists (a button or the slide-to-run track).
        // Anchored: the SectionCard header is named "Collapse section: Run analysis"
        // and a substring match would sweep it in (check:locator-ambiguity).
        const controls = await page.getByRole("button", { name: /^Run (analysis|anyway)$/ }).count();
        const slider = await page.locator('[role="slider"], [data-testid*="run-analysis"]').count();
        assert(controls + slider > 0, "no run control on the page");
        // The checklist's run step is on the same page as the run card, so it
        // brings the card into view and hands it focus rather than linking here.
        await page.locator('[data-testid="first-run-checklist"]').getByRole("button", { name: /^Run analysis$/ }).click();
        const focusedRunCard = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "analysis-run-card");
        assert(focusedRunCard, "the checklist's run step did not hand focus to the run card");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        assert(!overflow, "horizontal overflow");
        // Staging happens on the centre: Add import opens the dialog here,
        // without a trip to Settings.
        await page.locator('[data-testid="button-add-import"]').click();
        await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 });
        assert(/Pure-Path-Ad-Summary\.csv/.test(await page.getByRole("dialog").innerText()), "the import dialog does not list the staged export");
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5_000 });
      });

      await test(`History at ${width}px lists the failed run for an account that has not run successfully`, async () => {
        await open(page, "/app/analysis/history");
        const text = await page.locator("main").innerText();
        assert(!/Stage a performance export/.test(text), "the history page sent the reader back to the setup checklist");
        assert(/1 run\b/.test(text), `the run list is missing (${text.slice(0, 120)})`);
        assert(/Failed/.test(text), "the failed run's status is not shown");
        assert(text.includes("Parsing ad summary export"), "the failed run's error is not shown on the history page");
      });

      await test(`Overview at ${width}px reads the staged export in its checklist and never asks to connect`, async () => {
        await open(page, "/app/account");
        const text = await page.locator("main").innerText();
        assert(!/Connect data source/.test(text), "a manual account is asked to connect a data source");
        assert(/Stage a performance export/.test(text), "the checklist does not carry the export step");
        assert(/Run analysis/.test(text), "the checklist does not carry the run step");
      });

      assert(errors.length === 0, `console/page errors at ${width}px: ${errors.slice(0, 3).join(" | ")}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${passed + failed} test(s): ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
