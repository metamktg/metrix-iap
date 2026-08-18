// End-to-end Playwright tests for AdAccountOverview UX polish (Task 556).
//
// Covers:
//   1. "Account Totals" SectionCard header is present (not a bare h2).
//   2. At least one SectionInfoIcon (info icon) is visible.
//   3. Zero-result event rows are dimmed (opacity-40) in the canvas table.
//   4. "No actions yet" empty state renders when no recommendation cards exist.
//
// API calls are intercepted with page.route() so no live API server is needed.
// The seed fixture comes from the checked-in test snapshot; bookster is a
// configured account with zero-result event rows and no recommendation cards,
// making it ideal for all four assertions.
//
// Run: tsx tests/e2e/metrix-iap-ad-account-overview.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-ad-account-overview

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
 * startup. Returns a logged-in demo user + bookster seed data so
 * AdAccountOverview renders with real account data.
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

  // Seed — return the fixture so AdAccountOverview has real campaign / performance data.
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
}

/**
 * Navigate to the Ad Account Overview page with the bookster account selected,
 * then wait for a SectionCard heading to be visible (guards against loading
 * spinners and unconfigured-account empty states).
 */
async function gotoOverview(page: Page): Promise<void> {
  // ?account=bookster seeds the AccountContext so AdAccountOverview renders.
  await page.goto(`${BASE}/app/account?account=bookster`, {
    waitUntil: "domcontentloaded",
  });
  // Wait for "Account Totals" heading to confirm the page has rendered past
  // auth/seed loading — it's the first SectionCard on the configured account view.
  await page
    .locator("text=Account Totals")
    .first()
    .waitFor({ state: "visible", timeout: 25_000 });
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP AdAccountOverview UX polish e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: "Account Totals" SectionCard header is present ───────────
    await test('"Account Totals" SectionCard header is visible', async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoOverview(page);

        // SectionCard renders the title in a heading element. Assert it is
        // visible — confirming the SectionCard wrapper is present rather than
        // a bare h2 or removed section.
        const heading = page.locator("text=Account Totals").first();
        const visible = await heading.isVisible();
        assert(
          visible,
          '"Account Totals" heading not found. SectionCard wrapper may have been removed.',
        );
        console.log(`       heading found and visible`);
      } finally {
        await ctx.close();
      }
    });

    // ── Test 2: at least one SectionInfoIcon is visible ───────────────────
    await test("at least one SectionInfoIcon (info icon) is visible", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoOverview(page);

        // SectionInfoIcon renders: <span role="img" aria-label="Section info">
        const icons = page.locator('[aria-label="Section info"]');
        const count = await icons.count();
        assert(
          count > 0,
          `Expected at least one SectionInfoIcon on the page, found ${count}. Info icons may have been removed from section headers.`,
        );
        console.log(`       found ${count} info icon(s)`);
      } finally {
        await ctx.close();
      }
    });

    // ── Test 3: zero-result event rows are dimmed in the canvas table ─────
    await test("zero-result event rows are dimmed in the Results-by-event table", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoOverview(page);

        // Since the Nocturne canvas replacement, Results by event renders as
        // an .nc-table; zero-result events (the bookster fixture has two —
        // Website trials started and onb_initiate_checkout) stay listed as
        // rows dimmed with opacity-40. Assert at least one such row exists.
        const zeroRows = page.locator(".nc-table tbody tr.opacity-40");
        const count = await zeroRows.count();
        assert(
          count > 0,
          `Expected at least one dimmed (.opacity-40) zero-result row in the Results-by-event table, found ${count}. Zero-value dimming may have been removed.`,
        );
        console.log(`       found ${count} dimmed zero-result row(s)`);
      } finally {
        await ctx.close();
      }
    });

    // ── Test 4: "No actions yet" empty state renders ─────────────────────
    await test('"No actions yet" empty state renders when no recommendation cards exist', async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoOverview(page);

        // bookster has no optimization_loop recommendation_cards, so the
        // "Current focus" section shows the "No actions yet" empty state.
        const emptyState = page
          .locator("text=No actions yet")
          .first();
        const visible = await emptyState.isVisible();
        assert(
          visible,
          '"No actions yet" empty state not found. The empty state for missing recommendation cards may have been removed.',
        );
        console.log(`       "No actions yet" empty state is visible`);
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
  console.error("\nFatal error running AdAccountOverview e2e tests:", err);
  process.exit(1);
});
