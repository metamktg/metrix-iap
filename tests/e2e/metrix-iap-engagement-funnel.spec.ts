// End-to-end Playwright tests: Engagement Funnel view (/app/analysis/funnel).
//
// Verifies that all three view modes render correctly:
//
//   1. Page heading "Engagement Funnel" and the Funnel/Breakdown/Scatter toggle
//      tabs are visible after navigation.
//   2. "Funnel" mode (default) — the "Conversion funnel" section card and at
//      least one funnel stage label ("Impressions") are visible.
//   3. "Breakdown" mode — clicking the tab shows the breakdown table with a
//      "Segment" column header.
//   4. "Scatter" mode — clicking the tab shows the scatter section card title
//      containing "Frequency × Link CTR".
//   5. Breakdown dimension switch — Audience → Placement keeps rows present.
//   6. Column sort — a sort chosen in Audience mode stays active after
//      switching to Placement, and clicking another column reorders rows.
//   No JS errors are emitted during any tab switch.
//
// API calls are intercepted so no live API server is required.
// The seed fixture is the checked-in snapshot at:
//   artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json
//
// Run: tsx tests/e2e/metrix-iap-engagement-funnel.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-engagement-funnel

import { chromium } from "playwright-core";
import type { BrowserContext, Page } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname_local, "../..");

const BASE = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

// Load the checked-in seed fixture once.
const SEED_FIXTURE_BODY = fs.readFileSync(
  path.resolve(
    REPO_ROOT,
    "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json",
  ),
  "utf-8",
);

// A variant of the fixture with all demographic_registration_signal arrays
// zeroed out. Used to verify the PendingState branch in EngagementFunnelView.
const SEED_FIXTURE_EMPTY_DEMO = (() => {
  const seed = JSON.parse(SEED_FIXTURE_BODY);
  for (const acct of seed.ad_accounts ?? []) {
    const analysis = acct?.iap?.analysis;
    if (analysis) {
      analysis.demographic_registration_signal = [];
    }
  }
  return JSON.stringify(seed);
})();

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

/**
 * Register route intercepts for all API endpoints the app calls at startup.
 * Uses the full fixture (accounts have demographic data → funnel renders).
 */
async function mockApis(ctx: BrowserContext): Promise<void> {
  const page = ctx.pages()[0]!;

  // Auth/me — logged-in admin user.
  await page.route("**/api/metrix/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user",
          email: "demo@metrix.app",
          role: "admin",
          must_change_password: false,
          workspace_id: "metrix_manager",
        },
      }),
    }),
  );

  // Seed — real fixture so the funnel has demographic data to render.
  await page.route("**/api/metrix/seed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: SEED_FIXTURE_BODY,
    }),
  );

  // Reports — empty list (needed by loop-checklist step count).
  await page.route("**/api/metrix/workspaces/*/reports", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [] }),
    }),
  );

  // Analysis data-windows — empty so DataWindowBar renders without a real DB.
  await page.route("**/analysis/data-windows**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ windows: [] }),
    }),
  );

  // Analysis summary — intercept to prevent network errors.
  await page.route("**/analysis/summary**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totals: {},
        concept_rows: [],
        placement_rows: [],
        demographic_rows: [],
      }),
    }),
  );
}

/**
 * Same as mockApis but serves the empty-demographic seed so the funnel renders
 * the PendingState branch instead of the full funnel content.
 */
async function mockApisWithEmptyDemographic(ctx: BrowserContext): Promise<void> {
  const page = ctx.pages()[0]!;

  await page.route("**/api/metrix/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user",
          email: "demo@metrix.app",
          role: "admin",
          must_change_password: false,
          workspace_id: "metrix_manager",
        },
      }),
    }),
  );

  // Seed with all demographic_registration_signal arrays emptied.
  await page.route("**/api/metrix/seed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: SEED_FIXTURE_EMPTY_DEMO,
    }),
  );

  await page.route("**/api/metrix/workspaces/*/reports", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [] }),
    }),
  );

  await page.route("**/analysis/data-windows**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ windows: [] }),
    }),
  );

  await page.route("**/analysis/summary**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totals: {},
        concept_rows: [],
        placement_rows: [],
        demographic_rows: [],
      }),
    }),
  );
}

/**
 * Navigate to the Engagement Funnel page for the bookster demo account and
 * wait until the view mode toggle buttons are visible (page has rendered past
 * loading / pending states).
 */
async function gotoFunnel(page: Page): Promise<void> {
  await page.goto(`${BASE}/app/analysis/funnel?account=bookster`, {
    waitUntil: "domcontentloaded",
  });
  // The Funnel/Breakdown/Scatter toggle buttons are present once the main
  // content area has rendered (past the ModuleScopeGate loading state).
  await page
    .getByRole("button", { name: "Funnel" })
    .waitFor({ state: "visible", timeout: 30_000 });
}

/**
 * Navigate to the Engagement Funnel page with the empty-demographic seed.
 * The PendingState branch does not render the Funnel/Breakdown/Scatter toggle,
 * so we wait for the "Engagement Funnel" heading from ModuleHeader instead.
 */
async function gotoFunnelEmpty(page: Page): Promise<void> {
  await page.goto(`${BASE}/app/analysis/funnel?account=bookster`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByText("Engagement Funnel")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP engagement funnel e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: heading and all three tab buttons are visible ───────────────
    await test(
      "Engagement Funnel heading and Funnel/Breakdown/Scatter tabs are visible",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoFunnel(page);

          // Page title in ModuleHeader.
          const heading = page.getByText("Engagement Funnel").first();
          await heading.waitFor({ state: "visible", timeout: 10_000 });
          assert(await heading.isVisible(), 'Expected "Engagement Funnel" heading to be visible');
          console.log('       "Engagement Funnel" heading visible ✓');

          // All three mode toggle buttons must be present.
          for (const label of ["Funnel", "Breakdown", "Scatter"]) {
            const btn = page.getByRole("button", { name: label });
            assert(
              await btn.isVisible(),
              `Expected "${label}" tab button to be visible`,
            );
          }
          console.log("       Funnel / Breakdown / Scatter toggle buttons visible ✓");
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 2: Funnel mode renders funnel bars ─────────────────────────────
    await test(
      "Funnel mode renders the Conversion funnel section and stage labels",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);
          await gotoFunnel(page);

          // "Funnel" is the default mode — click it explicitly to be sure.
          await page.getByRole("button", { name: "Funnel" }).click();
          await page.waitForTimeout(400);

          // The SectionCard title for the waterfall.
          const conversionFunnel = page.getByText("Conversion funnel").first();
          await conversionFunnel.waitFor({ state: "visible", timeout: 8_000 });
          assert(
            await conversionFunnel.isVisible(),
            'Expected "Conversion funnel" section card title to be visible in Funnel mode',
          );
          console.log('       "Conversion funnel" section card visible ✓');

          // At least the "Impressions" stage label from FunnelWaterfall.
          const impressionsLabel = page.getByText("Impressions").first();
          const impressionsVisible = await impressionsLabel
            .isVisible()
            .catch(() => false);
          assert(
            impressionsVisible,
            'Expected "Impressions" funnel stage label to be visible in the waterfall',
          );
          console.log('       "Impressions" funnel stage visible ✓');

          assert(
            jsErrors.length === 0,
            `Expected no JS errors in Funnel mode, got: ${jsErrors.join("; ")}`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 3: Breakdown mode renders the sortable table ──────────────────
    await test(
      "Breakdown mode renders the breakdown table with Segment column",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);
          await gotoFunnel(page);

          // Switch to Breakdown mode.
          await page.getByRole("button", { name: "Breakdown" }).click();
          await page.waitForTimeout(400);

          // The BreakdownTable thead has a "Segment" column header (th element).
          const segmentHeader = page.locator("th").filter({ hasText: /^Segment$/ });
          await segmentHeader.waitFor({ state: "visible", timeout: 8_000 });
          assert(
            await segmentHeader.isVisible(),
            'Expected "Segment" column header to be visible in Breakdown mode table',
          );
          console.log('       "Segment" column header visible ✓');

          // The SectionCard title contains "breakdown".
          const breakdownCard = page
            .getByText(/breakdown/i)
            .first();
          assert(
            await breakdownCard.isVisible(),
            'Expected a "breakdown" section card title to be visible in Breakdown mode',
          );
          console.log('       Breakdown section card title visible ✓');

          assert(
            jsErrors.length === 0,
            `Expected no JS errors in Breakdown mode, got: ${jsErrors.join("; ")}`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 4: Scatter mode renders the scatter section ───────────────────
    await test(
      "Scatter mode renders the Frequency × Link CTR section",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);
          await gotoFunnel(page);

          // Switch to Scatter mode.
          await page.getByRole("button", { name: "Scatter" }).click();
          await page.waitForTimeout(400);

          // The SectionCard title for scatter.
          const scatterCard = page
            .getByText(/Frequency × Link CTR/i)
            .first();
          await scatterCard.waitFor({ state: "visible", timeout: 8_000 });
          assert(
            await scatterCard.isVisible(),
            'Expected "Frequency × Link CTR" section card title to be visible in Scatter mode',
          );
          console.log('       "Frequency × Link CTR" section card visible ✓');

          assert(
            jsErrors.length === 0,
            `Expected no JS errors in Scatter mode, got: ${jsErrors.join("; ")}`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 5: Breakdown dimension switch preserves row presence ──────────
    await test(
      "Breakdown Audience → Placement switch shows at least one data row each time",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);
          await gotoFunnel(page);

          // Enter Breakdown mode.
          await page.getByRole("button", { name: "Breakdown" }).click();

          // The "Audience" dimension button appears once Breakdown mode is active.
          const audienceBtn = page.getByRole("button", { name: "Audience" });
          await audienceBtn.waitFor({ state: "visible", timeout: 8_000 });

          // ── Audience dimension ──
          // Click Audience and wait for the section card title to confirm the
          // dimension has actually rendered (not just that rows exist).
          await audienceBtn.click();
          const audienceCardTitle = page.getByText("Audience segment breakdown").first();
          await audienceCardTitle.waitFor({ state: "visible", timeout: 8_000 });
          assert(
            await audienceCardTitle.isVisible(),
            'Expected "Audience segment breakdown" section card title after clicking Audience',
          );
          console.log('       "Audience segment breakdown" section card title visible ✓');

          // Assert at least one data row in the tbody.
          const audienceRows = page.locator("tbody tr");
          const audienceCount = await audienceRows.count();
          assert(
            audienceCount > 0,
            `Expected at least one data row in Audience breakdown, got ${audienceCount}`,
          );
          console.log(`       Audience breakdown: ${audienceCount} row(s) visible ✓`);

          assert(
            jsErrors.length === 0,
            `Expected no JS errors after switching to Audience, got: ${jsErrors.join("; ")}`,
          );

          // ── Placement dimension ──
          // Click Placement and wait for its distinct section card title.
          const placementBtn = page.getByRole("button", { name: "Placement" });
          await placementBtn.waitFor({ state: "visible", timeout: 8_000 });
          await placementBtn.click();

          // "Placement breakdown" title confirms the dimension actually switched.
          const placementCardTitle = page.getByText("Placement breakdown").first();
          await placementCardTitle.waitFor({ state: "visible", timeout: 8_000 });
          assert(
            await placementCardTitle.isVisible(),
            'Expected "Placement breakdown" section card title after clicking Placement',
          );
          console.log('       "Placement breakdown" section card title visible ✓');

          const placementRows = page.locator("tbody tr");
          const placementCount = await placementRows.count();
          assert(
            placementCount > 0,
            `Expected at least one data row in Placement breakdown, got ${placementCount}`,
          );
          console.log(`       Placement breakdown: ${placementCount} row(s) visible ✓`);

          assert(
            jsErrors.length === 0,
            `Expected no JS errors after switching to Placement, got: ${jsErrors.join("; ")}`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 6: column sort survives a Breakdown dimension switch ───────────
    await test(
      "Column sort stays active across Audience → Placement switch and re-sorting reorders rows",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);
          await gotoFunnel(page);

          // Enter Breakdown mode (defaults to Audience dimension).
          await page.getByRole("button", { name: "Breakdown" }).click();
          const segmentHeader = page.locator("th").filter({ hasText: /^Segment$/ });
          await segmentHeader.waitFor({ state: "visible", timeout: 8_000 });

          // Helper: read the first-column segment labels in current row order.
          const rowLabels = () =>
            page.locator("tbody tr td:first-child").allInnerTexts();

          // Reveal secondary columns so "Spend" is clickable. Spend is chosen
          // because it has values in BOTH dimensions (Frequency/CTR All are
          // audience-only and their columns disappear in Placement mode).
          await page
            .getByRole("button", { name: /Show \d+ more column/ })
            .click();
          await page.waitForTimeout(200);

          // Sort by "Spend" in Audience mode.
          const spendHeader = page
            .locator("th button")
            .filter({ hasText: /^Spend$/ });
          await spendHeader.waitFor({ state: "visible", timeout: 8_000 });
          await spendHeader.click();
          await page.waitForTimeout(300);

          // The active sort header is highlighted with the text-interactive class.
          const spendClass = (await spendHeader.getAttribute("class")) ?? "";
          assert(
            spendClass.includes("text-interactive"),
            `Expected "Spend" header to be active (text-interactive) after clicking it, class="${spendClass}"`,
          );
          console.log('       "Spend" sort active in Audience mode ✓');

          // Switch dimension Audience → Placement.
          await page.getByRole("button", { name: "Placement" }).click();
          const placementCardTitle = page.getByText("Placement breakdown").first();
          await placementCardTitle.waitFor({ state: "visible", timeout: 8_000 });

          // Rows must still be present after the dimension switch.
          const placementLabels = await rowLabels();
          assert(
            placementLabels.length > 0,
            `Expected data rows after switching to Placement, got ${placementLabels.length}`,
          );
          console.log(`       ${placementLabels.length} row(s) present after switch ✓`);

          // The "Spend" sort column must still be the active (highlighted) one.
          // (The active sort column is always rendered, even when secondary
          // columns are collapsed after the dimension switch remounts the table.)
          const spendHeaderAfter = page
            .locator("th button")
            .filter({ hasText: /^Spend$/ });
          await spendHeaderAfter.waitFor({ state: "visible", timeout: 8_000 });
          const spendClassAfter = (await spendHeaderAfter.getAttribute("class")) ?? "";
          assert(
            spendClassAfter.includes("text-interactive"),
            `Expected "Spend" header to remain active after dimension switch, class="${spendClassAfter}"`,
          );
          console.log('       "Spend" sort still active after dimension switch ✓');

          // Click a second sort column in Placement mode and assert the row
          // order actually changes.
          const ctrHeader = page
            .locator("th button")
            .filter({ hasText: /^CTR Link$/ });
          await ctrHeader.waitFor({ state: "visible", timeout: 8_000 });
          await ctrHeader.click();
          await page.waitForTimeout(300);

          const ctrClass = (await ctrHeader.getAttribute("class")) ?? "";
          assert(
            ctrClass.includes("text-interactive"),
            `Expected "CTR Link" header to be active after clicking it, class="${ctrClass}"`,
          );

          const resortedLabels = await rowLabels();
          assert(
            resortedLabels.length === placementLabels.length,
            `Expected same row count after re-sort (${placementLabels.length}), got ${resortedLabels.length}`,
          );
          assert(
            JSON.stringify(resortedLabels) !== JSON.stringify(placementLabels),
            `Expected row order to change after sorting by "CTR Link", but it stayed: ${placementLabels.join(", ")}`,
          );
          console.log('       Row order changed after sorting by "CTR Link" ✓');

          assert(
            jsErrors.length === 0,
            `Expected no JS errors during sort/dimension interactions, got: ${jsErrors.join("; ")}`,
          );
          console.log("       No JS errors ✓");
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 7: PendingState renders when demographic data is absent ─────────
    await test(
      'PendingState shows "No engagement data" when demographic rows are empty',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApisWithEmptyDemographic(ctx);
          await gotoFunnelEmpty(page);

          // The PendingState title must be visible.
          const pendingTitle = page.getByText("No engagement data").first();
          await pendingTitle.waitFor({ state: "visible", timeout: 10_000 });
          assert(
            await pendingTitle.isVisible(),
            'Expected "No engagement data" pending state title to be visible when demographic rows are empty',
          );
          console.log('       "No engagement data" pending state visible ✓');

          // The funnel tab toggle must NOT be present (we are in the pending branch).
          const funnelTab = page.getByRole("button", { name: "Funnel" });
          const funnelTabVisible = await funnelTab.isVisible().catch(() => false);
          assert(
            !funnelTabVisible,
            'Expected Funnel tab toggle to be hidden in the pending state, but it was visible',
          );
          console.log("       Funnel/Breakdown/Scatter tabs are absent ✓");

          assert(
            jsErrors.length === 0,
            `Expected no JS errors in PendingState, got: ${jsErrors.join("; ")}`,
          );
          console.log("       No JS errors ✓");
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 8: Tab switches are error-free when cycled repeatedly ──────────
    await test(
      "Cycling through all three tabs produces no JS errors",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);
          await gotoFunnel(page);

          // Cycle: Funnel → Breakdown → Scatter → Funnel
          for (const label of ["Funnel", "Breakdown", "Scatter", "Funnel"]) {
            await page.getByRole("button", { name: label }).click();
            await page.waitForTimeout(300);
          }

          assert(
            jsErrors.length === 0,
            `Expected no JS errors while cycling tabs, got: ${jsErrors.join("; ")}`,
          );
          console.log("       No JS errors during tab cycling ✓");
        } finally {
          await ctx.close();
        }
      },
    );
  } finally {
    await browser.close();
  }

  console.log(
    `\n${passed + failed} test(s): ${passed} passed, ${failed} failed`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal error running engagement funnel e2e:", err);
  process.exit(1);
});
