// End-to-end Playwright tests for MetricHoverPopover on AdAccountOverview.
//
// Covers:
//   1. Each of the four default metric tiles (spend, impressions, link_clicks,
//      link_ctr) — hover opens a popover containing a bar chart ("Top concepts")
//      or the stat-fallback text when fewer than two concept rows exist.
//   2. The "Diagnose full breakdown" footer link inside the popover opens the
//      MetricDiagnosticModal dialog.
//
// API calls are intercepted with page.route() so no live API server is needed.
// The seed fixture comes from the checked-in test snapshot.
//
// Run: tsx tests/e2e/metrix-iap-hover-popover.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-hover-popover

import { chromium } from "playwright-core";
import type { BrowserContext } from "playwright-core";
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
 * Register page.route() intercepts for the three API endpoints that
 * AdAccountOverview calls at startup.  Must be called before page.goto().
 */
async function mockApis(ctx: BrowserContext): Promise<void> {
  const page = await ctx.pages()[0]!;

  // Auth/me — return a valid logged-in user so AuthGate renders the shell.
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

  // Seed — return the fixture bundle so all metric tiles have real data.
  await page.route("**/api/metrix/seed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: SEED_FIXTURE_BODY,
    }),
  );

  // Reports — empty list; only needed by the loop-checklist step count.
  await page.route("**/api/metrix/workspaces/*/reports", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [] }),
    }),
  );
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP hover-popover e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // The "bookster" account is configured in the fixture and has campaign_summary
  // data, so metric tiles render with real values.
  const ACCOUNT = "bookster";

  // Default metric tiles that AdAccountOverview renders out-of-the-box.
  // Labels come from buildMetricCatalog() in metricsCatalog.ts.
  const DEFAULT_METRIC_LABELS = [
    "Total spend",   // id: spend       — standard bar chart
    "Impressions",   // id: impressions  — standard bar chart
    "Link clicks",   // id: link_clicks  — standard bar chart
    "Link CTR",      // id: link_ctr     — bar chart + account-level reference line
  ];

  try {
    // ── Tests 1–4: hover each default metric tile ─────────────────────────
    for (const label of DEFAULT_METRIC_LABELS) {
      await test(
        `"${label}" tile: hover opens a popover with chart or stat summary`,
        async () => {
          const ctx = await browser.newContext({
            viewport: { width: 1440, height: 900 },
          });
          const page = await ctx.newPage();
          try {
            await mockApis(ctx);
            await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
              waitUntil: "domcontentloaded",
            });

            // Wait for the Account Totals grid heading to confirm the page
            // has rendered past the loading state.
            await page
              .getByText("Account Totals", { exact: false })
              .waitFor({ state: "visible", timeout: 20_000 });

            // Find the tile button that contains this metric label.
            // Using a button locator avoids matching the same text that later
            // appears in the popover header.
            const tileBtn = page
              .locator("button")
              .filter({ hasText: label })
              .first();
            await tileBtn.waitFor({ state: "visible", timeout: 8_000 });

            // Hover to open the HoverCard (openDelay = 220 ms).
            await tileBtn.hover();

            // Wait for the popover footer link — present in every popover
            // regardless of whether a chart or the stat fallback is shown.
            const diagnoseBtn = page.getByText("Diagnose full breakdown");
            await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });

            // Assert the popover body shows either the chart section or the
            // stat fallback, covering both branches of MetricHoverPopover.
            const bodyText = await page.locator("body").textContent() ?? "";
            const hasChart = bodyText.includes("Top concepts");
            const hasFallback =
              bodyText.includes("No concept rows available") ||
              bodyText.includes("Only one concept found");

            assert(
              hasChart || hasFallback,
              `Popover for "${label}" must contain "Top concepts" or a fallback message. ` +
                `Found neither in the page text.`,
            );
          } finally {
            await ctx.close();
          }
        },
      );
    }

    // ── Test 5: footer link opens MetricDiagnosticModal ───────────────────
    await test(
      '"Diagnose full breakdown" opens the MetricDiagnosticModal',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Wait for the metric grid.
          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Hover the "Total spend" tile to open its popover.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Total spend" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Wait for the footer link inside the popover.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });

          // Click the footer link — triggers onDiagnose() → MetricDiagnosticModal.
          await diagnoseBtn.click();

          // The MetricDiagnosticModal renders a Radix Dialog with the header
          // text "Metric diagnostic".  Wait for it to appear.
          const dialogHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await dialogHeader.waitFor({ state: "visible", timeout: 5_000 });

          const headerText = await dialogHeader.first().textContent();
          assert(
            headerText?.includes("Metric diagnostic") ?? false,
            `Expected "Metric diagnostic" in the modal header, got: "${headerText}"`,
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
  console.error("\nFatal error running metrix-iap hover-popover e2e tests:", err);
  process.exit(1);
});
