// End-to-end Playwright tests: SectionInfoIcon tooltips on Analysis sub-pages.
//
// Verifies that at least one SectionInfoIcon tooltip is openable and readable
// on each Analysis sub-page that ships one. Each test locates the info icon
// within the specific named SectionCard so a different icon on the same page
// cannot produce a false positive if the intended tooltip is removed.
//
// Assertions:
//   1. Audience / "Segment performance" card (Ranked tab) — hover the ⓘ and
//      assert [role="tooltip"] shows the exact expected tip text.
//   2. Placements / "Spend by placement" card — same pattern.
//   3. Budget / "Efficiency by result event" card — same pattern.
//
// Catches silent regressions if the tooltip library (Radix UI) or the
// SectionInfoIcon CSS/markup changes such that the tooltip stops appearing.
//
// API calls are intercepted so no live API server is required.
// The seed fixture is the checked-in snapshot at:
//   artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json
//
// Run: tsx tests/e2e/metrix-iap-section-info-tooltips.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-section-info-tooltips

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

  await page.route("**/api/metrix/seed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: SEED_FIXTURE_BODY,
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
        totals: {
          total_spend_usd: 0,
          total_impressions: 0,
          total_link_clicks: 0,
          overall_link_ctr_pct: 0,
          bottom_line_totals: {},
        },
        concept_rows: [],
        placement_rows: [],
        demographic_rows: [],
        available_window: null,
      }),
    }),
  );
}

/**
 * Locate the SectionInfoIcon trigger within the named SectionCard, hover it,
 * and assert that a [role="tooltip"] with the exact expected text appears.
 *
 * Scoping to the section heading prevents a different icon elsewhere on the
 * page from producing a false positive.
 */
async function assertSectionTooltip(
  page: Page,
  cardTitle: string,
  expectedTip: string,
  timeoutMs = 8_000,
): Promise<void> {
  // The SectionCard renders as <section> containing an <h3> with the title.
  const card = page
    .locator("section")
    .filter({ has: page.locator("h3", { hasText: cardTitle }) })
    .first();

  await card.waitFor({ state: "visible", timeout: timeoutMs });

  // The SectionInfoIcon trigger is a span[aria-label="Section info"] inside
  // the card header's right slot.
  const trigger = card.locator('span[aria-label="Section info"]').first();
  await trigger.waitFor({ state: "visible", timeout: timeoutMs });

  // Hover to open the Radix Tooltip.
  await trigger.hover();

  // Radix renders the tooltip in a portal with role="tooltip".
  const tooltip = page.locator('[role="tooltip"]');
  await tooltip.waitFor({ state: "visible", timeout: timeoutMs });

  const text = (await tooltip.textContent()) ?? "";
  assert(
    text.trim() === expectedTip,
    `Tooltip text mismatch in "${cardTitle}" card.\n` +
      `  Expected: "${expectedTip}"\n` +
      `  Got:      "${text.trim()}"`,
  );
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP SectionInfoIcon tooltip e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: Audience — "Segment performance" card (Ranked tab) ─────────
    await test(
      'Audience / Ranked tab — "Segment performance" SectionInfoIcon shows correct tip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);

          await page.goto(`${BASE}/app/analysis/audience?account=bookster`, {
            waitUntil: "domcontentloaded",
          });

          // Switch to Ranked mode — SectionInfoIcon lives in RankedListTab.
          const rankedBtn = page.getByRole("button", { name: "Ranked" });
          await rankedBtn.waitFor({ state: "visible", timeout: 30_000 });
          await rankedBtn.click();

          await assertSectionTooltip(
            page,
            "Segment performance",
            "Ranks each age\u2013gender pocket by the active KPI so you can spot which segments are driving results and which need attention.",
          );
          console.log('       "Segment performance" tooltip verified ✓');

          assert(
            jsErrors.length === 0,
            `Expected no JS errors, got: ${jsErrors.join("; ")}`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 2: Placements — "Spend by placement" card ─────────────────────
    await test(
      'Placements — "Spend by placement" SectionInfoIcon shows correct tip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);

          await page.goto(`${BASE}/app/analysis/placements?account=bookster`, {
            waitUntil: "domcontentloaded",
          });

          await assertSectionTooltip(
            page,
            "Spend by placement",
            "Ranks each placement by spend, results, or CPA so you can see where delivery is concentrated and spot efficiency mismatches.",
          );
          console.log('       "Spend by placement" tooltip verified ✓');

          assert(
            jsErrors.length === 0,
            `Expected no JS errors, got: ${jsErrors.join("; ")}`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 3: Budget — "Efficiency by result event" card ─────────────────
    await test(
      'Budget — "Efficiency by result event" SectionInfoIcon shows correct tip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        const jsErrors: string[] = [];
        page.on("pageerror", (err) => jsErrors.push(err.message));
        try {
          await mockApis(ctx);

          await page.goto(`${BASE}/app/analysis/budget?account=bookster`, {
            waitUntil: "domcontentloaded",
          });

          await assertSectionTooltip(
            page,
            "Efficiency by result event",
            "Breaks down spend, results, and CPA by each tracked result event so you can see which conversion goals are running efficiently.",
          );
          console.log('       "Efficiency by result event" tooltip verified ✓');

          assert(
            jsErrors.length === 0,
            `Expected no JS errors, got: ${jsErrors.join("; ")}`,
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
  console.error("\nFatal error running section-info-tooltips e2e:", err);
  process.exit(1);
});
