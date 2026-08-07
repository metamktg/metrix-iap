// End-to-end Playwright tests: Top-N and Goal-CPA slider persistence.
//
// Verifies that slider values set on the Analysis Overview page survive
// in-session SPA navigation (route change away → route change back) via
// AnalysisViewContext, which lives above the Router and is never unmounted.
//
// Test matrix:
//   1. Top-N slider: set to 20, navigate to IAP Library, back to Overview,
//      assert aria-valuenow still reads 20.
//   2. Goal-CPA slider: move it one step, navigate away and back, assert the
//      new value is still reported (value is data-dependent so we compare
//      before/after rather than asserting a fixed number).
//
// API calls are intercepted so no live API server is needed.
// The seed fixture is the checked-in snapshot at:
//   artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json
//
// Run: tsx tests/e2e/metrix-iap-slider-persistence.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-slider-persistence

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
 * Register page.route() intercepts for the API endpoints the app calls at
 * startup. Returns data for the bookster demo account.
 */
async function mockApis(ctx: BrowserContext): Promise<void> {
  const page = ctx.pages()[0]!;

  // Auth/me — logged-in demo user.
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

  // Seed — real fixture so AnalysisOverview has concept rows + demographic data.
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

  // Analysis data-windows — empty so the DataWindowBar renders without
  // waiting for real ad_performance data.
  await page.route("**/analysis/data-windows**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ windows: [] }),
    }),
  );

  // Analysis summary by date-range — not needed when no window is selected,
  // but intercept to prevent any accidental network errors.
  await page.route("**/analysis/summary**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ totals: {}, concept_rows: [], placement_rows: [], demographic_rows: [] }),
    }),
  );
}

/**
 * Navigate to the Analysis Overview for the bookster demo account, then wait
 * for the Top-N slider to become visible (guards against loading spinners and
 * unconfigured-account empty states).
 *
 * NOTE on Radix UI Slider structure:
 *   <span aria-label="Number of top concepts to display">  ← SliderPrimitive.Root
 *     <span role="slider" aria-valuenow="10" …/>            ← SliderPrimitive.Thumb
 *   </span>
 * The aria-label lives on the Root, not the Thumb, so selectors must use a
 * CSS descendant combinator: [aria-label="…"] [role="slider"].
 */
async function gotoOverview(page: Page): Promise<void> {
  await page.goto(`${BASE}/app/analysis/overview?account=bookster`, {
    waitUntil: "domcontentloaded",
  });
  // Wait for the Top-N slider thumb — descendant of its aria-labelled root.
  await page
    .locator('[aria-label="Number of top concepts to display"] [role="slider"]')
    .waitFor({ state: "visible", timeout: 25_000 });
}

/** Convenience: locate the Top-N slider thumb element. */
function topNSlider(page: Page) {
  return page.locator(
    '[aria-label="Number of top concepts to display"] [role="slider"]',
  );
}

/** Convenience: locate the Goal-CPA slider thumb element. */
function goalCpaSlider(page: Page) {
  return page.locator(
    '[aria-label="Goal CPA threshold for heatmap coloring"] [role="slider"]',
  );
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\nMetrix IAP slider persistence e2e (${BASE})\n`,
  );

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: Top-N slider value persists after SPA navigation ──────────
    await test(
      "Top-N slider value persists after navigating away and back",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoOverview(page);

          const slider = topNSlider(page);

          // Confirm the default is 10.
          const defaultVal = await slider.getAttribute("aria-valuenow");
          assert(
            defaultVal === "10",
            `Expected default topN=10 before interaction, got: "${defaultVal}"`,
          );

          // Move slider from 10 → 15 → 20 (step=5, so two ArrowRight presses).
          await slider.focus();
          await slider.press("ArrowRight");
          await slider.press("ArrowRight");

          const afterSet = await slider.getAttribute("aria-valuenow");
          assert(
            afterSet === "20",
            `Expected topN=20 after two ArrowRight presses, got: "${afterSet}"`,
          );
          console.log(`       topN set to: ${afterSet}`);

          // ── SPA navigation away: click "IAP Library" tab ──────────────
          // The SectionTabBar rendered by ModuleHeader has <a> elements for
          // each analysis sub-page including "IAP Library".
          const libTab = page.locator('a[href*="analysis/library"]').first();
          await libTab.waitFor({ state: "visible", timeout: 20_000 });
          await libTab.click();
          await page.waitForTimeout(800);

          const urlAfterNav = page.url();
          assert(
            urlAfterNav.includes("analysis/library"),
            `Expected URL to include "analysis/library" after clicking IAP Library tab, got: "${urlAfterNav}"`,
          );

          // ── SPA navigation back: click "Overview" tab ─────────────────
          // The SectionTabBar on IAP Library also shows the "Overview" tab
          // linking back to /app/analysis/overview.
          const overviewTab = page
            .locator('a[href*="analysis/overview"]')
            .first();
          await overviewTab.waitFor({ state: "visible", timeout: 20_000 });
          await overviewTab.click();

          // Wait for the slider to re-appear on the restored overview.
          const sliderBack = topNSlider(page);
          await sliderBack.waitFor({ state: "visible", timeout: 20_000 });

          const persistedVal = await sliderBack.getAttribute("aria-valuenow");
          assert(
            persistedVal === "20",
            `Expected topN=20 to persist after SPA navigation, got: "${persistedVal}". ` +
              `AnalysisViewProvider may not be mounted above the Router.`,
          );
          console.log(`       topN after navigation: ${persistedVal} ✓`);
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 2: Goal-CPA slider value persists after SPA navigation ───────
    await test(
      "Goal-CPA slider value persists after navigating away and back",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoOverview(page);

          const goalSlider = goalCpaSlider(page);

          // Goal-CPA slider only renders when the fixture has demographic
          // CPA data (medianCpa != null). Skip gracefully if absent.
          const isVisible = await goalSlider.isVisible();
          if (!isVisible) {
            console.log(
              "       Goal-CPA slider not visible (no demographic CPA data in fixture) — skipping",
            );
            return;
          }

          const initialVal = await goalSlider.getAttribute("aria-valuenow");
          assert(
            initialVal != null,
            "Expected Goal-CPA slider to have aria-valuenow attribute",
          );
          console.log(`       Goal-CPA initial: ${initialVal}`);

          // Move slider one step up.
          await goalSlider.focus();
          await goalSlider.press("ArrowRight");
          await page.waitForTimeout(100);

          const afterSet = await goalSlider.getAttribute("aria-valuenow");
          assert(
            afterSet !== initialVal,
            `Expected Goal-CPA to change after ArrowRight, but got the same value: "${afterSet}"`,
          );
          console.log(`       Goal-CPA set to: ${afterSet}`);

          // ── SPA navigation away: IAP Library tab ──────────────────────
          const libTab = page
            .locator('a[href*="analysis/library"]')
            .first();
          await libTab.waitFor({ state: "visible", timeout: 20_000 });
          await libTab.click();
          await page.waitForTimeout(800);

          // ── SPA navigation back: Overview tab ─────────────────────────
          const overviewTab = page
            .locator('a[href*="analysis/overview"]')
            .first();
          await overviewTab.waitFor({ state: "visible", timeout: 20_000 });
          await overviewTab.click();

          const goalSliderBack = goalCpaSlider(page);
          await goalSliderBack.waitFor({ state: "visible", timeout: 20_000 });

          const persistedVal = await goalSliderBack.getAttribute("aria-valuenow");
          assert(
            persistedVal === afterSet,
            `Expected Goal-CPA=${afterSet} to persist after SPA navigation, got: "${persistedVal}". ` +
              `AnalysisViewProvider may not be mounted above the Router.`,
          );
          console.log(`       Goal-CPA after navigation: ${persistedVal} ✓`);
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
  console.error("\nFatal error running slider persistence e2e:", err);
  process.exit(1);
});
