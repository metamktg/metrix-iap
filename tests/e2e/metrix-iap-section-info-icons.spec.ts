// End-to-end Playwright tests for SectionInfoIcon tooltips.
//
// Covers:
//   1. AnalysisOverview — "Analysis modules" section: hover its SectionInfoIcon
//      and assert the expected tooltip text appears.
//   2. AnalysisOverview — "Top concepts by spend" section: hover its
//      SectionInfoIcon and assert the expected tooltip text appears.
//      (Conditional on having performance_by_cell data; bookster fixture has it.)
//   3. StrategyOverview — "Go deeper" section: hover its SectionInfoIcon
//      and assert the expected tooltip text appears.
//   4. StrategyOverview — "Pillar coverage" section: hover its SectionInfoIcon
//      and assert the expected tooltip text appears.
//      (Conditional on having message_pillars; bookster fixture has them.)
//
// A regression (missing import, bad JSX fragment, broken tooltip wiring) would
// cause the hover to not produce any tooltip — this test catches that.
//
// Run: tsx tests/e2e/metrix-iap-section-info-icons.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-section-info-icons

import { chromium } from "playwright-core";
import type { BrowserContext, Page } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname_local, "../..");

const BASE = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

// Load the checked-in seed fixture once (≈1 MB).
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
 * startup. Must be called before page.goto().
 */
async function mockApis(ctx: BrowserContext): Promise<void> {
  const page = ctx.pages()[0]!;

  // Auth/me — logged-in demo user so AuthGate renders the app shell.
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

  // Seed — return the fixture so all analysis/strategy data renders.
  await page.route("**/api/metrix/seed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: SEED_FIXTURE_BODY,
    }),
  );

  // Reports — empty list; needed by the loop-checklist step count.
  await page.route("**/api/metrix/workspaces/*/reports", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [] }),
    }),
  );

  // Analysis summary by date range — return empty so the overview uses seed data.
  await page.route(
    "**/api/metrix/ad-accounts/*/analysis/summary*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      }),
  );

  // Analysis data windows — return empty list.
  await page.route(
    "**/api/metrix/ad-accounts/*/analysis/data-windows*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ windows: [] }),
      }),
  );

  // Analysis runs — empty list. MST Command Center calls useListAnalysisRuns;
  // without this mock the Vite dev server answers the unmatched request with
  // index.html and the page crashes reading `.runs`.
  await page.route("**/api/metrix/accounts/*/analysis-runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ runs: [] }),
    }),
  );

  // Stage status — the loop-gating source of truth every command center
  // reads (Analysis -> Strategy -> Creative -> MST). Without this mocked,
  // useStageStatus's query has no data and mst.unlocked defaults to false,
  // so MST Command Center renders its "Generate briefs first" gate instead
  // of the real page content.
  await page.route("**/api/metrix/accounts/*/stage-status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        analysis: { status: "success", last_run_at: null, date_range: "all", validated: true, progress_pct: 100, progress_stage: "" },
        strategy: { status: "success", last_run_at: null },
        briefs: { status: "success", last_run_at: null, count: 10 },
        mst: { unlocked: true },
      }),
    }),
  );
}

/**
 * Navigate to a page and wait for a section card heading to confirm the
 * overview has rendered past the loading state.
 */
async function gotoAndWait(
  page: Page,
  url: string,
  waitText: string,
): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Wait for a stable section card heading (h3) to confirm the page rendered.
  // SectionCard renders its title inside an <h3>.
  //
  // Scoped to <main> (AppShell.tsx), not the whole document: the sidebar nav
  // (a sibling of <main>, present on every route) renders its own permanent
  // labels — e.g. "Hypothesis Queue" — which can match this same
  // case-insensitive text search. An unscoped locator resolves as soon as
  // the sidebar mounts, before the route's own (code-split, per PR #121)
  // content has loaded, so assertTooltip then finds zero SectionInfoIcon
  // elements on a page that hasn't actually rendered yet.
  await page
    .locator("main")
    .locator("h3, h2, span, p")
    .filter({ hasText: new RegExp(waitText, "i") })
    .first()
    .waitFor({ state: "visible", timeout: 25_000 });
}

/**
 * Hover each SectionInfoIcon on the page in order until the expected tooltip
 * text appears anywhere in the document body (Radix renders tooltips into a
 * portal so they are always in the body, not necessarily inside role=tooltip).
 * Asserts at least one icon produces the expected text.
 */
async function assertTooltip(
  page: Page,
  expectedText: string,
  description: string,
): Promise<void> {
  // All SectionInfoIcon triggers have aria-label="Section info".
  const icons = page.locator('[aria-label="Section info"]');
  const count = await icons.count();
  assert(
    count > 0,
    `No SectionInfoIcon elements found on the page. The component may be missing or unmounted. (checking for: "${description}")`,
  );

  // Try hovering each icon in order; stop as soon as the expected text
  // appears anywhere in the body (covers both role=tooltip portals and
  // any inline tooltip implementations).
  let found = false;
  for (let i = 0; i < count; i++) {
    const icon = icons.nth(i);
    // Scroll into view before hovering.
    await icon.scrollIntoViewIfNeeded();
    await icon.hover({ force: true });

    // Wait for the Radix tooltip open-delay (default 700 ms) plus render time.
    await page.waitForTimeout(900);

    const bodyText = (await page.locator("body").textContent()) ?? "";
    if (bodyText.includes(expectedText)) {
      found = true;
      break;
    }

    // Move away to dismiss the tooltip before the next hover.
    await page.mouse.move(200, 200);
    await page.waitForTimeout(200);
  }

  assert(
    found,
    `Tooltip with text "${expectedText}" never appeared after hovering all ${count} SectionInfoIcon(s). ` +
      `(${description}) — the icon may be rendering without its TooltipProvider/TooltipContent, ` +
      `or the tip prop may have changed.`,
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

  const ACCOUNT = "bookster";

  try {
    // ── AnalysisOverview tests ─────────────────────────────────────────────

    // Test 1: "Analysis modules" section — always rendered (not conditional on data).
    await test(
      'AnalysisOverview · "Analysis modules" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/analysis/overview?account=${ACCOUNT}`,
            "Analysis modules",
          );
          await assertTooltip(
            page,
            "Deeper views of the same data sliced by library, audience, placements, and budget.",
            "Analysis modules · SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 2: "Top concepts by spend" section — conditional on having performance_by_cell
    // data; bookster fixture has it so this section renders.
    await test(
      'AnalysisOverview · "Top concepts by spend" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/analysis/overview?account=${ACCOUNT}`,
            "Top concepts by spend",
          );
          await assertTooltip(
            page,
            "Ranks creative concepts by spend or CPA so you can quickly see which ideas are carrying the account.",
            "Top concepts by spend · SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── StrategyOverview tests ─────────────────────────────────────────────

    // Test 3: "Go deeper" section (formerly "Strategy modules") — always rendered when strategy data exists.
    await test(
      'StrategyOverview · "Go deeper" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/strategy/overview?account=${ACCOUNT}`,
            "Go deeper",
          );
          await assertTooltip(
            page,
            "Deeper views of the same strategy from different angles. Map, avatars, and hypothesis queue.",
            "Go deeper · SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 4: "Pillar coverage" section — rendered when message_pillars is non-empty;
    // bookster fixture has pillars.
    await test(
      'StrategyOverview · "Pillar coverage" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/strategy/overview?account=${ACCOUNT}`,
            "Pillar coverage",
          );
          await assertTooltip(
            page,
            "Shows how many source cells back each message pillar, indicating which directions have the strongest evidence.",
            "Pillar coverage · SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Strategy sub-page tests ────────────────────────────────────────────

    // Test 5: Strategy Map — "Pillars" column header SectionInfoIcon.
    await test(
      'StrategyMap · "Pillars" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/strategy/map?account=${ACCOUNT}`,
            "Pillars",
          );
          await assertTooltip(
            page,
            "Validated message pillars from analysis. Select one to trace its source cells and the hypotheses it feeds.",
            "Strategy Map · Pillars SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 6: MST Command Center — "Matrix avatars" SectionInfoIcon.
    // This section moved from the Avatars/ICP page to MST Command Center
    // (see MstCommandCenter.tsx's top-of-file note); route/heading updated
    // to match.
    await test(
      'MstCommandCenter · "Matrix avatars" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/mst?account=${ACCOUNT}`,
            "Matrix avatars",
          );
          await assertTooltip(
            page,
            "Audience avatars from the MST matrix, each with its measured performance, creative DNA, and linked ICP profiles.",
            "MST Command Center · Matrix avatars SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 7: Hypothesis Queue — "Hypothesis queue" SectionInfoIcon (default tab).
    await test(
      'HypothesisQueueView · "Hypothesis queue" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/strategy/hypotheses?account=${ACCOUNT}`,
            "Hypothesis queue",
          );
          await assertTooltip(
            page,
            "Active hypotheses derived from analysis, ordered as queued. Chips show the variable codes each hypothesis mentions; the drawer holds the full test design.",
            "Hypothesis Queue · SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // Test 8: Communications — "Message pillars" SectionInfoIcon.
    await test(
      'CommunicationsView · "Message pillars" SectionInfoIcon shows correct tooltip',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await gotoAndWait(
            page,
            `${BASE}/app/strategy/communications?account=${ACCOUNT}`,
            "Message pillars",
          );
          await assertTooltip(
            page,
            "Each pillar is a validated message direction backed by source cells. Showing what creative angles work, who responds, and the strategic rationale behind them.",
            "Communications · Message pillars SectionInfoIcon",
          );
        } finally {
          await ctx.close();
        }
      },
    );
  } finally {
    await browser.close();
  }

  console.log(`\n${passed + failed} test(s): ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal error running SectionInfoIcon tooltip e2e tests:", err);
  process.exit(1);
});
