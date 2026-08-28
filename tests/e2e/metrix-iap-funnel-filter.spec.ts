// End-to-end Playwright tests: funnel selector, creative filter panel, funnel tab.
//
// Verifies the funnel filter system in the IAP Library view (/app/analysis/library):
//
//   1. "Upper Funnel" button switches the KPI tile row to the UPPER FUNNEL preset
//      and the stage badge "UPPER FUNNEL" becomes visible.
//   2. "Lower Funnel" button switches the KPI tile row to the LOWER FUNNEL preset
//      and the badge reads "LOWER FUNNEL".
//   3. Setting a spend floor in the CreativeFilterPanel changes the
//      "Showing X of Y cells" counter (filter is applied).
//   4. Opening a creative cell's expand dialog and clicking the "Funnel" tab
//      renders the FunnelStepsChart without any JS error.
//
// API calls are intercepted so no live API server is needed.
// The seed fixture is the checked-in snapshot at:
//   artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json
//
// Run: tsx tests/e2e/metrix-iap-funnel-filter.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-funnel-filter

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

  // Seed — real fixture so the library has creative cells to render.
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
 * Navigate to the IAP Library for the bookster demo account and wait until the
 * funnel stage selector buttons are visible (page has rendered past loading states).
 */
async function gotoLibrary(page: Page): Promise<void> {
  await page.goto(`${BASE}/app/analysis/library?account=bookster`, {
    waitUntil: "domcontentloaded",
  });
  // Wait for the "Upper Funnel" button — presence means the funnel selector rendered.
  await page
    .getByRole("button", { name: "Upper Funnel" })
    .waitFor({ state: "visible", timeout: 30_000 });
}

/**
 * Open the creative filter panel.
 *
 * The filter row used to be permanent furniture at the top of the grid. It is
 * now collapsed behind a "Filters" trigger, because most sessions never touch
 * it and it sat between the reader and the data on every visit — so reaching
 * any filter control is one deliberate click, and these tests take that click
 * exactly as a user would.
 *
 * Idempotent: if the panel is already open (a later test in the same page, a
 * view that arrives pre-filtered) this leaves it open rather than toggling it
 * shut, which would be a very confusing way to fail.
 */
async function openFilters(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: /^Filters/ });
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  // The panel springs open; wait for a control inside it rather than a timeout.
  await page.getByLabel("Minimum spend filter").waitFor({ state: "visible", timeout: 15_000 });
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP funnel filter e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: "Upper Funnel" button activates the UPPER FUNNEL preset ───
    await test(
      '"Upper Funnel" button shows UPPER FUNNEL badge',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoLibrary(page);

          // Click the "Upper Funnel" button.
          await page.getByRole("button", { name: "Upper Funnel" }).click();
          await page.waitForTimeout(500);

          // The UPPER FUNNEL badge (a <span> with exact text "UPPER FUNNEL") should
          // become visible. Use a span-scoped locator to avoid matching the
          // "Upper Funnel" button itself (Playwright text matching is case-insensitive).
          const badge = page.locator("span").filter({ hasText: /^UPPER FUNNEL$/ });
          await badge.waitFor({ state: "visible", timeout: 8_000 });
          const badgeVisible = await badge.isVisible();
          assert(
            badgeVisible,
            'Expected "UPPER FUNNEL" badge to be visible after clicking "Upper Funnel" button',
          );
          console.log('       "UPPER FUNNEL" badge visible ✓');
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 2: "Lower Funnel" button activates the LOWER FUNNEL preset ───
    await test(
      '"Lower Funnel" button shows LOWER FUNNEL badge',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoLibrary(page);

          // Click "Upper Funnel" first (to confirm it switches from a named stage),
          // then click "Lower Funnel".
          await page.getByRole("button", { name: "Upper Funnel" }).click();
          await page.waitForTimeout(300);
          await page.getByRole("button", { name: "Lower Funnel" }).click();
          await page.waitForTimeout(500);

          // The LOWER FUNNEL badge (a <span> with exact text) should be visible.
          // Use span-scoped locators to avoid matching the stage selector buttons.
          const lowerBadge = page.locator("span").filter({ hasText: /^LOWER FUNNEL$/ });
          await lowerBadge.waitFor({ state: "visible", timeout: 8_000 });
          const lowerVisible = await lowerBadge.isVisible();
          assert(
            lowerVisible,
            'Expected "LOWER FUNNEL" badge to be visible after clicking "Lower Funnel" button',
          );

          // The UPPER FUNNEL badge must not be present at the same time.
          const upperBadgeCount = await page
            .locator("span")
            .filter({ hasText: /^UPPER FUNNEL$/ })
            .count();
          assert(
            upperBadgeCount === 0,
            'Expected "UPPER FUNNEL" badge span to be gone when "Lower Funnel" is active',
          );
          console.log('       "LOWER FUNNEL" badge visible, "UPPER FUNNEL" gone ✓');
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 3: Spend floor filter changes the "Showing X of Y cells" count ─
    await test(
      "Spend floor filter changes the Showing X of Y cells counter",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoLibrary(page);

          // The filter panel's spend floor input has aria-label "Minimum spend filter".
          // We need cards to be rendered first — wait for any creative card in the grid.
          // The grid renders cards with data-concept-cell attributes.
          await page.locator("[data-concept-cell]").first().waitFor({
            state: "visible",
            timeout: 20_000,
          });

          // Capture initial count of visible cells.
          const initialCells = await page.locator("[data-concept-cell]").count();
          assert(
            initialCells > 0,
            `Expected at least one creative cell in the grid before filtering, got ${initialCells}`,
          );
          console.log(`       Initial visible cells: ${initialCells}`);

          // Type a very high spend floor so most (or all) cells get filtered out.
          // Use 999999 as the ceiling — guaranteed to filter in a test fixture.
          await openFilters(page);
          const spendInput = page.getByLabel("Minimum spend filter");
          await spendInput.fill("999999");
          // Debounce is 400 ms; wait a bit longer for the filter to apply.
          await page.waitForTimeout(800);

          // Now either: "Showing X of Y cells" counter is visible,
          // OR the "No cells match filters" empty state is visible.
          // Either means the filter ran.
          const showingText = page.locator("text=/Showing \\d+ of \\d+ cells/");
          const noMatchState = page.locator("text=No cells match filters");

          const showingVisible = await showingText.isVisible().catch(() => false);
          const noMatchVisible = await noMatchState.isVisible().catch(() => false);

          assert(
            showingVisible || noMatchVisible,
            'Expected "Showing X of Y cells" counter or "No cells match filters" empty state to appear after applying a spend floor filter',
          );

          if (showingVisible) {
            // Parse "Showing X of Y cells" and assert X < Y — a broken filter
            // that applies no change would show X === Y and must not pass.
            const counterText = (await showingText.textContent()) ?? "";
            const match = /Showing\s+(\d+)\s+of\s+(\d+)\s+cells/.exec(counterText);
            assert(
              match !== null,
              `Expected counter text to match "Showing X of Y cells" pattern, got: "${counterText}"`,
            );
            const shown = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            assert(
              shown < total,
              `Expected spend floor to reduce the visible cell count (shown < total), but got: shown=${shown}, total=${total}. The filter may not be applying.`,
            );
            console.log(`       Filter counter: "${counterText}" (${shown} < ${total}) ✓`);
          } else {
            console.log('       "No cells match filters" empty state visible ✓');
          }

          // Clear the filter and confirm cells come back.
          await page
            .getByRole("button", { name: "Clear spend floor" })
            .click()
            .catch(async () => {
              // Fallback: use "Clear filters" button.
              await page.getByRole("button", { name: /Clear filters/i }).click();
            });
          await page.waitForTimeout(600);

          const afterClear = await page.locator("[data-concept-cell]").count();
          assert(
            afterClear > 0,
            `Expected cells to reappear after clearing the spend floor, got ${afterClear}`,
          );
          console.log(`       Cells after clear: ${afterClear} ✓`);
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 5: Performance tier pills filter cells by percentile ─────────
    await test(
      'Performance tier pills: Top 25% and Bottom 25% bound cell count; All restores it',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoLibrary(page);

          // Wait for creative cards to render.
          await page.locator("[data-concept-cell]").first().waitFor({
            state: "visible",
            timeout: 20_000,
          });

          await openFilters(page);
          const totalCells = await page.locator("[data-concept-cell]").count();
          assert(
            totalCells > 0,
            `Expected at least one creative cell before tier filtering, got ${totalCells}`,
          );
          console.log(`       Total cells (unfiltered): ${totalCells}`);

          // ── Top 25% ────────────────────────────────────────────────────────
          // Click the pill, retrying if needed: right after first paint the
          // library view can still re-render as late data settles, which
          // discards a too-early tier click (filter state resets to default).
          // A user clicking again succeeds, so retry mirrors real behaviour
          // while still failing loudly if the tier filter is actually broken.
          const topCounter = page.locator("text=/Showing \\d+ of \\d+ cells/");
          for (let attempt = 0; attempt < 3; attempt++) {
            await page.getByRole("button", { name: "Top 25%" }).click();
            const appeared = await topCounter
              .waitFor({ state: "visible", timeout: 4_000 })
              .then(() => true)
              .catch(async () => {
                // may have filtered to zero — accept "No cells match filters" too
                return page
                  .locator("text=No cells match filters")
                  .waitFor({ state: "visible", timeout: 2_000 })
                  .then(() => true)
                  .catch(() => false);
              });
            if (appeared) break;
          }

          // Verify the filter counter is visible — proves tier state is active and
          // the filter ran, regardless of how many cells the fixture happens to have.
          const topCounterVisible = await topCounter.isVisible().catch(() => false);
          assert(
            topCounterVisible,
            'Expected "Showing X of Y cells" counter to appear after clicking "Top 25%", but it was not visible',
          );

          const topCells = await page.locator("[data-concept-cell]").count();
          // Top 25% must reduce the count — if it equals total, the filter did nothing.
          assert(
            topCells < totalCells,
            `Top 25% should show fewer cells than the unfiltered total (${totalCells}), but got ${topCells}`,
          );
          // Cells shown must be within the 25-percentile bound (ceiling for small n).
          const topLimit = Math.ceil(totalCells * 0.25);
          assert(
            topCells <= topLimit,
            `Top 25% should show ≤ ${topLimit} cells (25% of ${totalCells}), but got ${topCells}`,
          );
          console.log(`       Top 25%: ${topCells} cells shown (< ${totalCells}, ≤ ${topLimit}) ✓`);

          // ── Bottom 25% ─────────────────────────────────────────────────────
          // Navigate back to the library to start from a clean filter state
          // (tier="all") before testing Bottom 25% in isolation.  Testing from
          // a clean slate avoids any top25→bottom25 state-transition quirk
          // where the React filter state briefly resets between two tier clicks.
          await gotoLibrary(page);
          // Re-navigating resets the page, which closes the filter panel with
          // it — so it has to be reopened before reaching for a tier pill.
          await openFilters(page);
          await page.locator("[data-concept-cell]").first().waitFor({
            state: "visible",
            timeout: 20_000,
          });

          // Same early-render race as Top 25% above: retry the click if the
          // counter doesn't appear (a too-early click can be discarded).
          const anyCounter = page.locator("text=/Showing \\d+ of \\d+ cells/");
          for (let attempt = 0; attempt < 3; attempt++) {
            await page.getByRole("button", { name: "Bottom 25%" }).click();
            const appeared = await anyCounter
              .first()
              .waitFor({ state: "visible", timeout: 4_000 })
              .then(() => true)
              .catch(() => false);
            if (appeared) break;
          }

          // Wait for the fixture-deterministic bottom-25 counter to appear.
          // Fixture (bookster, custom stage → effectiveSortKey="spend"):
          //   4 cells sorted ascending by spend: [5.46, 7.47, 14.58, 675.81]
          //   p25 = sortedValues[floor(4×0.25)] = sortedValues[1] = 7.47
          //   bottom25 (desc=higher-is-better): v ≤ p25
          //   C2F (5.46) and C4E (7.47, boundary tie at p25) both qualify → 2 cells.
          // If the tier filter regresses (tier ignored entirely), all 4 cells show
          // and the counter never says "Showing 2 of 4 cells"; this waitFor then
          // times out, failing the test.
          const bottom25Counter = page.locator("text=/Showing 2 of 4 cells/").first();
          await bottom25Counter.waitFor({ state: "visible", timeout: 10_000 });
          const bottom25Visible = await bottom25Counter.isVisible().catch(() => false);
          assert(
            bottom25Visible,
            `Bottom 25% should surface "Showing 2 of 4 cells" (C2F spend=5.46 + C4E spend=7.47 ≤ p25=7.47; boundary tie at p25 includes C4E). Tier filter may not be applying.`,
          );
          console.log(`       Bottom 25%: "Showing 2 of 4 cells" ✓ (boundary tie at p25=7.47)`);

          // ── All ────────────────────────────────────────────────────────────
          // Use exact:true to match only the "All" tier pill, not any other button
          // whose accessible name contains "All" as a substring (e.g. metric selects).
          await page.getByRole("button", { name: "All", exact: true }).first().click();

          // Counter disappears when isFiltered = false (no tier, no spend, no concept).
          await bottom25Counter.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});

          const restoredCells = await page.locator("[data-concept-cell]").count();
          assert(
            restoredCells === totalCells,
            `Clicking "All" should restore all ${totalCells} cells, but got ${restoredCells}`,
          );
          console.log(`       All: ${restoredCells} cells restored ✓`);
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 4: "Funnel" tab in the expand dialog renders without error ────
    await test(
      '"Funnel" tab in the creative expand dialog renders the conversion funnel',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();

        // Collect browser-side JS errors so we can fail if the Funnel tab throws.
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));

        try {
          await mockApis(ctx);
          await gotoLibrary(page);

          // Wait for the first creative card to render.
          const firstCard = page.locator("[data-concept-cell]").first();
          await firstCard.waitFor({ state: "visible", timeout: 20_000 });

          // Click the card to open the CreativeExpandDialog (card root has onClick).
          await firstCard.click();

          // Wait for the "Funnel" tab to appear inside the dialog. role="tab",
          // not "button": the dialog's tab bar is TabRail, which announces
          // itself as a tablist — the more specific role, not a looser one.
          const funnelTabButton = page.getByRole("tab", { name: /Funnel/i }).first();
          await funnelTabButton.waitFor({ state: "visible", timeout: 10_000 });

          // Click the Funnel tab.
          await funnelTabButton.click();
          await page.waitForTimeout(500);

          // "Conversion funnel" heading should now be visible inside the dialog.
          const heading = page.getByText(/Conversion funnel/i);
          await heading.waitFor({ state: "visible", timeout: 8_000 });
          const headingVisible = await heading.isVisible();
          assert(
            headingVisible,
            'Expected "Conversion funnel" heading to be visible after clicking the Funnel tab',
          );
          console.log('       "Conversion funnel" heading visible ✓');

          // FunnelStepsChart: at least "Impressions" step row should render.
          const impressionsStep = page.getByText("Impressions").first();
          const impressionsVisible = await impressionsStep
            .isVisible()
            .catch(() => false);
          assert(
            impressionsVisible,
            'Expected "Impressions" funnel step to be visible in the Funnel tab',
          );
          console.log('       "Impressions" funnel step visible ✓');

          // No JS errors during the Funnel tab render.
          assert(
            jsErrors.length === 0,
            `Expected no JS errors while rendering the Funnel tab, got: ${jsErrors.join("; ")}`,
          );
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
  console.error("\nFatal error running funnel filter e2e:", err);
  process.exit(1);
});
