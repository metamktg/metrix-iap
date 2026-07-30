// End-to-end Playwright tests for the Metrix IAP Home screen and 5-section nav.
//
// Covers:
//   1. Verdict headline (h1) is present and non-empty on /app/home.
//   2. Loop strip renders exactly 4 stage labels: Listen, Analyze, Act, Learn.
//   3. KPI tiles row renders 4 tiles (Spend / Best CPA / Results / Concepts).
//   4. "Next best actions" section heading is visible.
//   5. Clicking "Analyze" in the sidebar nav navigates to /app/analyze.
//   6. Clicking "Settings" in the sidebar nav navigates to /app/settings/account.
//
// API calls are intercepted with page.route() so no live API server is needed.
// The seed fixture comes from the checked-in test snapshot.
//
// Run: tsx tests/e2e/metrix-iap-home-screen.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-home-screen

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
 * Register page.route() intercepts for the three API endpoints the app calls
 * at startup. Returns a logged-in demo user + seed fixture data so HomeView
 * renders with real account data (bookster account).
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

  // Seed — return the fixture so HomeView has real campaign / performance data.
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
 * Navigate to the Home screen with the bookster account selected, then wait
 * for the verdict headline h1 to be visible (guards against loading spinners
 * and unconfigured-account empty states).
 */
async function gotoHome(page: Page): Promise<void> {
  // ?account=bookster seeds the AccountContext so HomeView renders real data.
  await page.goto(`${BASE}/app/home?account=bookster`, {
    waitUntil: "domcontentloaded",
  });
  // Wait for the verdict h1 to confirm the page has rendered past auth/seed load.
  await page
    .locator("h1")
    .first()
    .waitFor({ state: "visible", timeout: 25_000 });
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP Home screen + 5-section nav e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: verdict headline is present and non-empty ─────────────────
    await test("verdict headline (h1) is visible and non-empty", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoHome(page);

        const h1 = page.locator("h1").first();
        const text = (await h1.textContent())?.trim() ?? "";
        assert(text.length > 0, `Expected a non-empty h1 verdict headline, got: "${text}"`);
        console.log(`       headline: "${text}"`);
      } finally {
        await ctx.close();
      }
    });

    // ── Test 2: loop strip shows all 4 stage labels ───────────────────────
    await test("loop strip renders Listen, Analyze, Act, and Learn stages", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoHome(page);

        const STAGES = ["Listen", "Analyze", "Act", "Learn"] as const;
        for (const stage of STAGES) {
          // Each stage is rendered as a span with the label text inside an <a>.
          const el = page
            .locator("span")
            .filter({ hasText: new RegExp(`^${stage}$`, "i") })
            .first();
          const visible = await el.isVisible();
          assert(
            visible,
            `Loop strip stage "${stage}" is not visible. Loop strip may have regressed.`,
          );
        }
      } finally {
        await ctx.close();
      }
    });

    // ── Test 3: KPI tiles row shows 4 tiles ───────────────────────────────
    await test("KPI tiles row renders 4 tiles (Spend / Best CPA / Results / Concepts)", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoHome(page);

        const KPI_LABELS = ["Spend", "Best CPA", "Results", "Concepts"] as const;
        for (const label of KPI_LABELS) {
          // Each KpiTile has a <span> with the uppercase label text.
          const el = page
            .locator("span")
            .filter({ hasText: new RegExp(`^${label}$`, "i") })
            .first();
          const visible = await el.isVisible();
          assert(
            visible,
            `KPI tile label "${label}" is not visible. KPI row may have regressed.`,
          );
        }
      } finally {
        await ctx.close();
      }
    });

    // ── Test 4: Next best actions section heading is visible ───────────────
    await test('"Next best actions" section heading is visible', async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoHome(page);

        const heading = page
          .locator("span")
          .filter({ hasText: /next best actions/i })
          .first();
        const visible = await heading.isVisible();
        assert(
          visible,
          '"Next best actions" section heading not found. Section may have been removed or renamed.',
        );
      } finally {
        await ctx.close();
      }
    });

    // ── Test 5: clicking Analysis in the sidebar nav navigates to /app/analysis ──
    await test('clicking "Analysis" in the sidebar nav navigates to /app/analysis', async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoHome(page);

        // The Analysis section header in the expanded sidebar renders an <a>
        // whose text content is "Analysis" (navTree section label).
        // It navigates to section.landing = "/app/analysis".
        const analyzeLink = page
          .locator("a")
          .filter({ hasText: /^Analysis$/i })
          .first();
        await analyzeLink.waitFor({ state: "visible", timeout: 8_000 });
        await analyzeLink.click();

        // Wait briefly for the SPA navigation to settle.
        await page.waitForTimeout(600);

        const url = page.url();
        assert(
          url.includes("/app/analysis"),
          `Expected URL to contain "/app/analysis" after clicking Analysis nav item, got: "${url}"`,
        );
        console.log(`       navigated to: ${url}`);
      } finally {
        await ctx.close();
      }
    });

    // ── Test 6: clicking Settings navigates to /app/settings/account ──────
    await test('clicking "Settings" in the sidebar nav navigates to /app/settings/account', async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      try {
        await mockApis(ctx);
        await gotoHome(page);

        // The Settings section header renders an <a> whose text content is "Settings".
        // sectionLandingRoute falls back to children[0].to = "/app/settings/account"
        // because no `landing` is set on the settings section.
        const settingsLink = page
          .locator("a")
          .filter({ hasText: /^Settings$/i })
          .first();
        await settingsLink.waitFor({ state: "visible", timeout: 8_000 });
        await settingsLink.click();

        await page.waitForTimeout(600);

        const url = page.url();
        assert(
          url.includes("/app/settings"),
          `Expected URL to contain "/app/settings" after clicking Settings nav item, got: "${url}"`,
        );
        console.log(`       navigated to: ${url}`);
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
  console.error("\nFatal error running home screen e2e tests:", err);
  process.exit(1);
});
