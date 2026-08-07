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

    // ── Test 5: Tab switches are error-free when cycled repeatedly ──────────
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
