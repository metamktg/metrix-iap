// End-to-end Playwright tests for the manual CSV import flow — the sole
// entry point for getting data into Metrix now that live Meta OAuth is
// gated behind "Coming soon". Drives the real AddAccountDialog /
// ManualUploadPanel / AnalysisControls / ImportConfidenceReport components
// end to end; every API call is intercepted with page.route() against an
// in-memory mock account so no running API server or Supabase is needed.
//
// Covers:
//   1. Happy path: create manual account -> upload both required CSVs
//      (auto-detected from headers) -> stage a creative asset -> correct
//      its ad-name mapping (free-text, no ads registry yet) -> Review ->
//      pick a date range -> Run analysis -> success state with a real,
//      computed Import Confidence Report grade.
//   2. A malformed/wrong-format CSV produces a specific, actionable error
//      message — not a silent failure or a generic "something went wrong".
//   3. The Review-before-close gate: closing (Esc) while files are staged
//      but not yet reviewed shows "Leave without completing?"; "Keep
//      staging" cancels back into the flow, "Leave anyway" closes.
//
// Run: tsx tests/e2e/metrix-iap-manual-import.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-manual-import

import { chromium } from "playwright-core";
import type { BrowserContext, Page, Route } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname_local, "../..");

const BASE = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const SEED_FIXTURE_BODY = fs.readFileSync(
  path.resolve(REPO_ROOT, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"),
  "utf-8",
);

// ── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${(err as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── CSV fixtures ─────────────────────────────────────────────────────────

const DEMO_CSV_HEADER =
  "Day,Campaign ID,Campaign name,Ad set ID,Ad set name,Ad ID,Ad name,Gender,Age,Text," +
  "Amount spent (USD),Reach,Impressions,Frequency,CPM (cost per 1,000 impressions),Result type,Results," +
  "Result value type,Results value,Views,Clicks (all),CTR (all),Link clicks,CTR (link click-through rate)," +
  "Unique clicks (all),Outbound clicks,Unique outbound clicks,Landing page views,Page engagement," +
  "Post engagements,Post comments,Post reactions,Post saves,Post shares,Instagram profile visits," +
  "Video average play time,Video plays,3-second video plays,Unique 2-second continuous video plays," +
  "Video plays at 25%,Video plays at 50%,Video plays at 75%,Video plays at 95%,Video plays at 100%,ThruPlays";
const DEMO_CSV_ROW =
  "2026-06-01,6001,Prospecting - Broad,7001,Prospecting - Broad - AS1,8001,UGC_Testimonial_v1,female,25-34,," +
  "42.50,4800,5100,1,5,Purchases,3,,,,,205,,180,,,,,,,,,,,,,,,,,,,,,";
const VALID_DEMO_CSV = `${DEMO_CSV_HEADER}\n${DEMO_CSV_ROW}`;

const PLACEMENT_CSV_HEADER =
  "Day,Campaign ID,Campaign name,Ad set ID,Ad set name,Ad ID,Ad name,Impression device,Platform,Placement," +
  "Amount spent (USD),Reach,Impressions,Frequency,CPM (cost per 1,000 impressions),Result type,Results," +
  "Result value type,Results value,Views,Clicks (all),CTR (all),Link clicks,CTR (link click-through rate)," +
  "Unique clicks (all),Outbound clicks,Unique outbound clicks,Landing page views,Page engagement," +
  "Post engagements,Post comments,Post reactions,Post saves,Post shares,Instagram profile visits," +
  "Video average play time,Video plays,3-second video plays,Unique 2-second continuous video plays," +
  "Video plays at 25%,Video plays at 50%,Video plays at 75%,Video plays at 95%,Video plays at 100%,ThruPlays";
const PLACEMENT_CSV_ROW =
  "2026-06-01,6001,Prospecting - Broad,7001,Prospecting - Broad - AS1,8001,UGC_Testimonial_v1,iphone,facebook,feed," +
  "42.50,4800,5100,1,5,Purchases,3,,,,,205,,180,,,,,,,,,,,,,,,,,,,,,";
const VALID_PLACEMENT_CSV = `${PLACEMENT_CSV_HEADER}\n${PLACEMENT_CSV_ROW}`;

// Deliberately wrong: no Day/Date column at all, no recognisable breakdown —
// exercises the parser's hard-fail path (critical column unresolvable).
const MALFORMED_CSV = "Name,Value\nfoo,1\nbar,2";

// A deterministic mapping_summary that scores exactly Grade B (80% weighted
// coverage) in ImportConfidenceReport's real client-side grade computation —
// proves the grade is actually computed from the summary, not fabricated.
// Weighted columns (iapCsvSpec.ts SIGNAL_WEIGHTS) sum to 1.00; marking only
// "Amount spent" (weight 0.20) as missing and every other weighted column as
// exact yields presentWeight = 0.80 -> Grade B (>=0.75, <0.90).
const WEIGHTED_CANONICALS: { canonical: string; required: boolean }[] = [
  { canonical: "Amount spent (USD)", required: false },
  { canonical: "Results", required: false },
  { canonical: "Impressions", required: false },
  { canonical: "CTR (link click-through rate)", required: false },
  { canonical: "Link clicks", required: false },
  { canonical: "Reach", required: false },
  { canonical: "CPM (cost per 1,000 impressions)", required: false },
  { canonical: "Video average play time", required: false },
  { canonical: "ThruPlays", required: false },
  { canonical: "Landing page views", required: false },
  { canonical: "Clicks (all)", required: false },
  { canonical: "CTR (all)", required: false },
  { canonical: "Frequency", required: false },
  { canonical: "Result type", required: false },
  { canonical: "Ad creative body text", required: false },
  { canonical: "Ad creative headline", required: false },
  { canonical: "Conversion device", required: false },
];

function buildMappingSummary(missing: string[]) {
  return WEIGHTED_CANONICALS.map(({ canonical, required }) => ({
    canonical,
    found_as: missing.includes(canonical) ? null : canonical,
    confidence: missing.includes(canonical) ? 0 : 1,
    method: missing.includes(canonical) ? "Not found" : "Exact match",
    tier: missing.includes(canonical) ? "missing" : "exact",
    is_required: required,
  }));
}

// ── mock server state ───────────────────────────────────────────────────

type MockImport = {
  id: string;
  account_id: string;
  kind: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  ad_names: string[];
  match_method: string | null;
  status: "staged" | "processed";
  manual_analysis_run_id: string | null;
  created_at: string;
  mapping_summary: unknown[] | null;
};

const MANUAL_FORMAT_STUB = {
  demographic: { report_name: "IAP_DEMOGRAPHIC_TEXT_SIGNAL", breakdown_columns: ["Day", "Ad name", "Gender", "Age"], metric_groups: [{ name: "Base", required: true, columns: ["Amount spent (USD)"] }], sample_csv: VALID_DEMO_CSV },
  device_placement: { report_name: "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL", breakdown_columns: ["Day", "Ad name", "Placement"], metric_groups: [{ name: "Base", required: true, columns: ["Amount spent (USD)"] }], sample_csv: VALID_PLACEMENT_CSV },
  ad_summary: { report_name: "IAP_AD_SUMMARY", breakdown_columns: ["Day", "Ad name"], metric_groups: [{ name: "Base", required: true, columns: ["Amount spent (USD)"] }], sample_csv: "" },
  conversion_device: { report_name: "IAP_CONVERSION_DEVICE_SIGNAL", breakdown_columns: ["Day", "Ad name", "Conversion device"], metric_groups: [{ name: "Conversion Metrics", required: true, columns: ["Results"] }], sample_csv: "" },
  column_aliases: [],
};

/**
 * Registers a full mock backend for one isolated test account against the
 * given browser context. Every route the manual-import flow touches is
 * intercepted; state (staged imports, run status) lives in closures so each
 * test gets a clean slate.
 */
async function mockApis(
  ctx: BrowserContext,
  opts: { rejectDemoCsv?: boolean } = {},
): Promise<{ imports: MockImport[] }> {
  const page = ctx.pages()[0]!;
  const ACCOUNT_ID = "manual-test-acct";
  let importCounter = 0;
  const imports: MockImport[] = [];
  // No run exists until the client explicitly POSTs analysis-runs — GET
  // .../latest must report `run: null` until then, exactly like the real
  // server, so a stray query-on-mount can never be mistaken for a run the
  // user started. Once started, the first poll reports "running" and every
  // poll after that reports "success" (simulating one in-flight tick).
  let runState: "none" | "running" | "success" = "none";
  let pollsSinceStart = 0;

  await page.route("**/api/metrix/auth/me", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "test-user", email: "demo@metrix.app", role: "admin", must_change_password: false, workspace_id: "metrix_manager" },
      }),
    }),
  );
  await page.route("**/api/metrix/seed", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: SEED_FIXTURE_BODY }),
  );
  await page.route("**/api/metrix/workspaces/*/reports", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }),
  );
  await page.route("**/api/metrix/manual-performance-csv-format", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MANUAL_FORMAT_STUB) }),
  );

  await page.route("**/api/metrix/accounts", (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ account_id: ACCOUNT_ID, name: "Manual Import E2E Co" }),
    });
  });

  await page.route(`**/api/metrix/accounts/${ACCOUNT_ID}/manual-imports`, (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ imports }) });
    }
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}") as {
        kind: string;
        filename: string;
        content_base64: string;
        ad_names?: string[];
        match_method?: string;
      };
      const raw = Buffer.from(body.content_base64, "base64").toString("utf8");
      const firstLine = raw.split(/\r?\n/)[0] ?? "";

      if (body.kind === "performance_demo_csv" && opts.rejectDemoCsv && /^Name,Value/.test(firstLine)) {
        return route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            message:
              'The following required columns could not be found: "Day". The date breakdown column should be "Day" (as Meta Ads Manager exports it; "Date" is also accepted) — check that you are using the correct report template.',
          }),
        });
      }
      // Any of the 4 CSV slots reached with the malformed header fails with
      // the same "Day" missing message regardless of which slot the client
      // retries against — matches the real parser (every class requires Day).
      if (opts.rejectDemoCsv && /^Name,Value/.test(firstLine) && body.kind !== "creative_asset") {
        return route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            message:
              'The following required columns could not be found: "Day". The date breakdown column should be "Day" (as Meta Ads Manager exports it; "Date" is also accepted) — check that you are using the correct report template.',
          }),
        });
      }

      importCounter += 1;
      const id = `import-${importCounter}`;
      const isCsv = body.kind.startsWith("performance_");
      const rec: MockImport = {
        id,
        account_id: ACCOUNT_ID,
        kind: body.kind,
        filename: body.filename,
        content_type: null,
        size_bytes: raw.length,
        ad_names: body.ad_names ?? [],
        match_method: body.match_method ?? null,
        status: "staged",
        manual_analysis_run_id: null,
        created_at: new Date().toISOString(),
        mapping_summary: isCsv
          ? buildMappingSummary(body.kind === "performance_demo_csv" ? ["Amount spent (USD)"] : [])
          : null,
      };
      imports.push(rec);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "staged",
          import_id: id,
          filename: body.filename,
          size_bytes: rec.size_bytes,
          note: "staged",
          ...(rec.mapping_summary ? { mapping_summary: rec.mapping_summary } : {}),
        }),
      });
    }
    return route.continue();
  });

  await page.route(`**/api/metrix/accounts/${ACCOUNT_ID}/manual-imports/*`, (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const importId = url.pathname.split("/").pop()!;
    if (req.method() === "PATCH") {
      const body = JSON.parse(req.postData() || "{}") as { ad_names: string[]; match_method?: string };
      const rec = imports.find((i) => i.id === importId);
      if (rec) {
        rec.ad_names = body.ad_names;
        rec.match_method = body.match_method ?? null;
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: importId,
          account_id: ACCOUNT_ID,
          kind: rec?.kind ?? "creative_asset",
          filename: rec?.filename ?? "creative.png",
          content_type: rec?.content_type ?? null,
          size_bytes: rec?.size_bytes ?? 0,
          ad_names: body.ad_names,
          match_method: body.match_method ?? null,
          status: "staged",
          created_at: rec?.created_at ?? new Date().toISOString(),
          link_result: { matched: body.ad_names, unmatched: [] },
        }),
      });
    }
    if (req.method() === "DELETE") {
      const idx = imports.findIndex((i) => i.id === importId);
      if (idx !== -1) imports.splice(idx, 1);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  await page.route(`**/api/metrix/accounts/${ACCOUNT_ID}/analysis-runs`, (route: Route) => {
    if (route.request().method() !== "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runs: [] }) });
    }
    runState = "running";
    pollsSinceStart = 0;
    for (const imp of imports) {
      if (imp.kind.startsWith("performance_")) {
        imp.status = "processed";
        imp.manual_analysis_run_id = "run-1";
      }
    }
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ run_id: "run-1" }) });
  });

  await page.route(`**/api/metrix/accounts/${ACCOUNT_ID}/analysis-runs/latest`, (route: Route) => {
    if (runState === "none") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: null }) });
    }
    pollsSinceStart += 1;
    if (runState === "running" && pollsSinceStart >= 2) runState = "success";
    const isRunning = runState === "running";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          id: "run-1",
          account_id: ACCOUNT_ID,
          status: isRunning ? "running" : "success",
          date_range: "30d",
          date_start: isRunning ? null : "2026-06-01",
          date_end: isRunning ? null : "2026-06-01",
          rows_ingested: isRunning ? null : 2,
          imports_used: isRunning ? null : 2,
          started_at: new Date().toISOString(),
          finished_at: isRunning ? null : new Date().toISOString(),
          progress_pct: isRunning ? 40 : 100,
          progress_stage: isRunning ? "Parsing demographics export" : null,
          error_message: null,
          csv_warnings: null,
          objective_flags: null,
          creatives_linked: isRunning ? null : 1,
          creatives_total: isRunning ? null : 1,
          creatives_unlinked_names: [],
        },
      }),
    });
  });

  await page.route(`**/api/metrix/accounts/${ACCOUNT_ID}/analysis-completeness`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run_id: "run-1",
        run_status: "success",
        complete: true,
        checked_at: new Date().toISOString(),
        surfaces: [
          { key: "ad_performance", label: "Metric tiles", rows: 1, required: true, ok: true, note: null },
          { key: "demographic_performance", label: "Demographics", rows: 1, required: true, ok: true, note: null },
          { key: "placement_performance", label: "Placements", rows: 1, required: true, ok: true, note: null },
        ],
      }),
    }),
  );

  await page.route(`**/api/metrix/accounts/${ACCOUNT_ID}/sync-creative-links`, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ linked: 1, total: 1, unlinked_names: [] }) }),
  );

  return { imports };
}

/**
 * Below 1024px the sidebar is a drawer, not a rail (AppShell). The account
 * switcher lives inside it, so at these viewports it is rendered but
 * translated off-canvas — visible and enabled to Playwright, permanently
 * "outside of the viewport" to a click, which retries for the full timeout
 * and then fails. Opening the drawer first is what a person does here, so it
 * is what the spec does. These contexts run at 480px, so this is the live
 * path, not a fallback.
 */
async function openNavIfCompact(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 1440;
  if (width >= 1024) return;
  const toggle = page.getByRole("button", { name: "Open navigation" });
  await toggle.waitFor({ state: "visible", timeout: 20_000 });
  await toggle.click();
}

async function openAddAccountDialog(page: Page): Promise<void> {
  await page.goto(`${BASE}/app/account?account=bookster`, { waitUntil: "domcontentloaded" });
  await openNavIfCompact(page);
  await page.locator('[aria-label^="Switch account"], [aria-label^="Current account"]').first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('[aria-label^="Switch account"], [aria-label^="Current account"]').first().click();
  await page.locator("text=Connect Ad Account").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.locator("text=Connect Ad Account").first().click();
  await page.locator("text=Add Ad Account").first().waitFor({ state: "visible", timeout: 10_000 });
}

async function createManualAccount(page: Page, name = "Manual Import E2E Co"): Promise<void> {
  await openAddAccountDialog(page);
  await page.locator('button:has-text("Upload manual reports")').click();
  const nameInput = page.locator('input[placeholder*="Acme"]');
  await nameInput.waitFor({ state: "visible" });
  await nameInput.fill(name);
  await page.locator('button:has-text("Create account")').click();
  await page.locator("text=created").first().waitFor({ state: "visible", timeout: 10_000 });
}

function writeTempCsv(name: string, contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrix-manual-import-e2e-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents, "utf-8");
  return p;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP manual-import e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: happy path end to end ─────────────────────────────────────
    await test("happy path: create -> upload both CSVs -> stage+map creative -> review -> run -> real confidence grade", async () => {
      const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 } });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await createManualAccount(page);

        // Stage the Demographics CSV first. One delivery export is enough to
        // review, but the panel never auto-advances on a file staged in this
        // session — the reader stays on Step 1 for the second export and the
        // creatives, and moves on by pressing Review.
        const demoPath = writeTempCsv("demo.csv", VALID_DEMO_CSV);
        await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles([demoPath]);
        await page.locator("text=Demographics").first().waitFor({ state: "visible" });
        // Slot auto-detected purely from the file's own headers (Gender/Age) —
        // its remove control appears without the user picking a slot. (The
        // old wait read the "Placements *" required marker, which now clears
        // the moment any one delivery export is staged — a race that passed
        // locally and timed out on CI.)
        await page.locator('[aria-label="Remove Demographics file"]').waitFor({ state: "visible", timeout: 15_000 });

        // Stage a creative asset and correct its ad-name mapping via free text
        // (no ads registry exists yet on a brand-new manual account).
        const creativePath = writeTempCsv("creative.png", "not-a-real-image-but-fine-for-mock");
        const creativeInput = page.locator('input[type="file"][accept="image/*,video/*"]');
        await creativeInput.setInputFiles(creativePath);
        await page.locator("text=No ad name mapped yet").waitFor({ state: "visible", timeout: 10_000 });

        await page.locator('button[aria-label="Edit ad name mapping"]').click();
        const mapInput = page.locator('input[placeholder="Ad name(s), comma-separated"]');
        await mapInput.fill("UGC_Testimonial_v1");
        await page.locator('button[aria-label="Save"]').click();
        await page.locator("text=Mapped to: UGC_Testimonial_v1").waitFor({ state: "visible", timeout: 10_000 });

        // Stage the Placements CSV — auto-detected from Placement/Impression
        // device headers — then press Review: the panel stays on Step 1 until
        // the reader says they are done staging.
        const placementPath = writeTempCsv("placement.csv", VALID_PLACEMENT_CSV);
        await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles([placementPath]);
        // The slot's own remove control is the staged signal (same as the
        // XLSX test): it exists only once the file is staged in that slot.
        await page.locator('[aria-label="Remove Placements file"]').waitFor({ state: "visible", timeout: 15_000 });
        const reviewBtn = page.getByRole("button", { name: "Review", exact: true });
        await reviewBtn.waitFor({ state: "visible", timeout: 10_000 });
        await reviewBtn.click();

        await page.locator("text=STEP 2 OF 2 — REVIEW").waitFor({ state: "visible", timeout: 10_000 });
        await page.locator("text=Demographics — demo.csv").waitFor({ state: "visible" });
        await page.locator("text=Placements — placement.csv").waitFor({ state: "visible" });
        await page.locator("text=All mapped").waitFor({ state: "visible" });

        // Pick a date range and run analysis.
        await page.locator('button:has-text("Last 7 days")').click();
        // getByRole+exact, not `button:has-text(...)`. AnalysisCommandCenter
        // wraps this control in <SectionCard title="Run analysis">, whose
        // header is itself a <button> containing an <h2> with that same text —
        // so a text-content match resolves to two elements. The header's
        // accessible name is "Collapse section: Run analysis", so matching the
        // accessible name exactly picks out the real control.
        await page.getByRole("button", { name: "Run analysis", exact: true }).click();

        // Poll through running -> success.
        await page.locator("text=Analysis complete").first().waitFor({ state: "visible", timeout: 15_000 });
        await page.locator("text=Analysis validated").first().waitFor({ state: "visible", timeout: 10_000 });

        // Import Confidence Report: grade must be the REAL computed grade
        // (Amount spent marked missing, weight 0.20, over a 1.00 weighted
        // total -> 80% coverage -> Grade B), not a fabricated/static value.
        await page.locator("text=Import Confidence Report").waitFor({ state: "visible", timeout: 10_000 });
        const gradeBadges = page.locator("text=Import Confidence Report").locator("xpath=following::span[contains(text(),'B')]").first();
        await gradeBadges.waitFor({ state: "visible", timeout: 5_000 });
        const bodyText = await page.locator('[role="dialog"]').innerText();
        assert(/80% signal coverage/.test(bodyText), `Expected the real computed "80% signal coverage" text, got:\n${bodyText}`);

        console.log("       full happy path completed with a real, computed confidence grade");
      } finally {
        await ctx.close();
      }
    });

    // ── Test 2: malformed CSV -> specific, actionable error ───────────────
    await test("malformed CSV produces a specific, actionable error (not generic/silent)", async () => {
      const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 } });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx, { rejectDemoCsv: true });
        await createManualAccount(page);

        const junkPath = writeTempCsv("junk.csv", MALFORMED_CSV);
        await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles([junkPath]);

        await page.locator("text=needs a closer look").waitFor({ state: "visible", timeout: 15_000 });
        const bodyText = await page.locator('[role="dialog"]').innerText();
        assert(
          /could not be found: "Day"/.test(bodyText) && /correct report template/.test(bodyText),
          `Expected the specific server-provided "Day column not found" message, got:\n${bodyText}`,
        );
        assert(
          !/something went wrong/i.test(bodyText),
          "Error must not degrade into a generic message",
        );
        // Neither required slot should show as staged — the bad file must not
        // silently occupy a slot.
        assert(
          (await page.locator('button:has-text("Review"):not([disabled])').count()) === 0,
          "Review must stay disabled — a malformed file must not silently satisfy a required slot",
        );

        console.log("       malformed CSV surfaced a specific, actionable error and left Review disabled");
      } finally {
        await ctx.close();
      }
    });

    // ── Test 3: Review-before-close gate blocks closing on incomplete state ─
    await test("closing with staged-but-unreviewed files shows the Leave-without-completing gate", async () => {
      const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 } });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await createManualAccount(page);

        // Stage only ONE of the two required CSVs — deliberately incomplete,
        // never reaches the internal Review step.
        const demoPath = writeTempCsv("demo.csv", VALID_DEMO_CSV);
        await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles([demoPath]);
        await page.locator("text=Mapped to:").first().waitFor({ state: "hidden", timeout: 1 }).catch(() => {});
        await page.waitForTimeout(500);

        // Esc must NOT close the dialog outright — it must show the confirm gate.
        await page.keyboard.press("Escape");
        await page.locator("text=Leave without completing?").waitFor({ state: "visible", timeout: 10_000 });
        assert(
          (await page.locator('[role="dialog"]').count()) > 0,
          "Outer dialog must remain mounted behind the confirm gate",
        );

        // "Keep staging" cancels back into the upload flow — dialog stays open.
        await page.locator('button:has-text("Keep staging")').click();
        await page.locator("text=Leave without completing?").waitFor({ state: "hidden", timeout: 5_000 });
        await page.locator('input[type="file"][accept=".csv,.xlsx"]').waitFor({ state: "attached" });

        // Esc again, then "Leave anyway" actually closes it.
        await page.keyboard.press("Escape");
        await page.locator('button:has-text("Leave anyway")').waitFor({ state: "visible", timeout: 5_000 });
        await page.locator('button:has-text("Leave anyway")').click();
        await page.locator("text=Add Ad Account").waitFor({ state: "hidden", timeout: 5_000 });

        console.log("       Review-before-close gate correctly blocked, then honored an explicit Leave");
      } finally {
        await ctx.close();
      }
    });

    // ── Test 4: XLSX is accepted alongside CSV ─────────────────────────────
    // Server-side XLSX→CSV conversion is covered by DB-free unit tests
    // (xlsxToCsv.test.ts) — constructing a byte-accurate XLSX workbook isn't
    // practical to drive through this fully page.route()-mocked flow (the
    // mock backend never touches real file bytes, and the exceljs dependency
    // that builds a real workbook lives only inside @workspace/api-server's
    // own node_modules, not resolvable from a repo-root-executed spec). This
    // test instead proves the CLIENT half of XLSX support end to end: the
    // file input accepts .xlsx, the updated "CSV or XLSX" copy is shown, and
    // an .xlsx-named file dropped into the smart upload zone stages
    // successfully through the real upload flow (client-side header sniffing
    // short-circuits for .xlsx per ConnectAccountDialogs.tsx's sniffCsvKind,
    // falling through to the same slot-guessing + server-correction retry
    // the CSV path already relies on).
    await test("XLSX files are accepted: input allows .xlsx, copy reflects both formats, and an .xlsx upload stages", async () => {
      const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 } });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await createManualAccount(page);

        const fileInput = page.locator('input[type="file"][accept=".csv,.xlsx"]');
        await fileInput.waitFor({ state: "attached", timeout: 10_000 });
        await page.locator("text=CSV or XLSX").first().waitFor({ state: "visible", timeout: 10_000 });

        // An .xlsx-named file dropped alone (no Gender/Age/Placement text
        // signal — the point is the CLIENT never tries to text-sniff it)
        // stages via the same smart-slot flow a CSV would.
        const summaryPath = writeTempCsv("ad-summary.xlsx", VALID_DEMO_CSV);
        await fileInput.setInputFiles([summaryPath]);
        await page.locator('[aria-label="Remove Ad Summary file"]').waitFor({ state: "visible", timeout: 10_000 });

        console.log("       .xlsx accepted by the input, reflected in copy, and staged via the real upload flow");
      } finally {
        await ctx.close();
      }
    });
  } finally {
    await browser.close();
  }

  console.log(`\n${passed + failed} test(s): ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal error running manual-import e2e tests:", err);
  process.exit(1);
});
