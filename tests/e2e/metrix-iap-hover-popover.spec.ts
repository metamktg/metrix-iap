// End-to-end Playwright tests for MetricHoverPopover on AdAccountOverview.
//
// Covers:
//   1. Each of the four default metric tiles (spend, impressions, link_clicks,
//      link_ctr) — hover opens a popover containing a bar chart ("Top concepts")
//      or the stat-fallback text when fewer than two concept rows exist.
//   2. The "Diagnose full breakdown" footer link inside the popover opens the
//      KpiDrilldownModal dialog (data-testid="kpi-drilldown-modal", header
//      eyebrow "Metric breakdown").
//   3. The CPA (blended) tile — popover header shows the correct metric label.
//   4. A result-event tile (Mobile app installs) — popover header shows the
//      event label.
//   5. KpiDrilldownModal concept breakdown — standard metric (spend): the
//      default breakdown is "concept"; Table view shows ≥2 concept rows.
//   6. KpiDrilldownModal concept breakdown — result-event metric (Mobile app
//      installs): Table view shows ≥2 concept rows scoped to the event type.
//   7. KpiDrilldownModal avatar breakdown: selecting the "avatar" dimension and
//      Table view renders ≥1 age-group segment row — catches silent empty
//      breakdown regressions.
//   8. Result-event × avatar restriction: selecting the "avatar" breakdown for
//      a result-event metric renders the restriction notice and no table.
//   13a. KpiDrilldownModal placement breakdown — spend metric: the metric column
//      shows dollar values ("$"), never "n/a".
//   13b. KpiDrilldownModal placement breakdown — link_ctr metric: the metric
//      column shows percentage values ("%"), never "n/a".
//   14. KpiDrilldownModal: when demographic_registration_signal is [], the
//      Breakdown <select> offers no "avatar" option — catches the missing-
//      dimension regression.
//   15a. KpiDrilldownModal avatar breakdown — impressions metric: the metric
//      column shows a numeric value, not "n/a".
//   15b. KpiDrilldownModal avatar breakdown — link_clicks metric: the metric
//      column shows a numeric value, not "n/a".
//   15c. KpiDrilldownModal avatar breakdown — cpa_blended metric: the metric
//      column starts with "$" (usd() dollar format), not "n/a".
//   15d. KpiDrilldownModal — reach metric: avatar breakdown shows a numeric
//      value; placement breakdown shows the restriction notice ("don't carry
//      reach or clicks (all)") and no table.
//   15e. KpiDrilldownModal — clicks_all metric: same pattern as 15d for
//      "Clicks (all)".
//   16. SegmentGridModal with cellIds: opening via a concept-row drilldown
//      (TilePerformanceModal → cellIds=["C2B"]) renders ≥1 avatar segment row
//      and the description says "scoped to C2B" — catches silent empty-grid
//      regressions in the non-null cellIds branch of buildAvatarSegments().
//   17. KpiDrilldownModal empty state: when the chosen metric has no data
//      (total_spend_usd = null, empty performance_by_cell), opening the modal
//      renders the empty state (data-testid="kpi-drilldown-empty") and no table.
//   18. SegmentDrilldownModal via VariableDrilldownModal: opening from the
//      Creative DNA "hook" family card (HK_Problem carrier cell C2E) renders ≥1 segment row
//      inside VariableDrilldownModal and the SegmentDrilldownModal description
//      includes "scoped to" — catches regressions where cellIds is silently
//      dropped to null at VariableDrilldownModal.tsx line 266.
//   19. KpiDrilldownModal cell breakdown: selecting the "cell" dimension and
//      Table view lists cell ids (a known cell_id from the seed appears).
//   20. DNA family card → VariableDrilldownModal: navigating to
//      /app/analysis/library?account=bookster, switching to the "Creative DNA"
//      tab, and clicking the "concept" DNA family card (data-testid=
//      "dna-family-concept") opens VariableDrilldownModal
//      (data-testid="title-variable-drilldown" is visible). Catches regressions
//      in the family-card onClick handler or in the modal's open-state logic.
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

  // Analysis runs — empty list. Pages like the MST Cross-Map call
  // useListAnalysisRuns; without this mock the Vite dev server answers the
  // unmatched request with index.html and the page crashes reading `.runs`.
  await page.route("**/api/metrix/accounts/*/analysis-runs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ runs: [] }),
    }),
  );
}

/**
 * Open the KpiDrilldownModal for a metric tile.  The open path is unchanged
 * from the old MetricDiagnosticModal flow: hover the tile, click the
 * "Diagnose full breakdown" footer link inside the hover popover.  Only the
 * dialog that opens changed — it is now KpiDrilldownModal
 * (data-testid="kpi-drilldown-modal", header eyebrow "Metric breakdown").
 * Returns a locator for the open modal.
 */
async function openDrilldown(
  page: import("playwright-core").Page,
  tileLabel: string,
) {
  await page
    .getByText("Account Totals", { exact: false })
    .waitFor({ state: "visible", timeout: 20_000 });

  const tileBtn = page
    .locator("button")
    .filter({ hasText: tileLabel })
    .first();
  await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
  await tileBtn.hover();

  const diagnoseBtn = page.getByText("Diagnose full breakdown");
  await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
  await diagnoseBtn.click();

  const modal = page.locator('[data-testid="kpi-drilldown-modal"]');
  await modal.waitFor({ state: "visible", timeout: 8_000 });
  return modal;
}

/** Switch the KpiDrilldownModal into table view (default view is chart). */
async function toTableView(page: import("playwright-core").Page) {
  await page.getByRole("button", { name: "Table view" }).click();
  await page
    .locator('[data-testid="kpi-drilldown-table"]')
    .waitFor({ state: "visible", timeout: 5_000 });
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

    // ── Test 5: footer link opens KpiDrilldownModal ───────────────────────
    await test(
      '"Diagnose full breakdown" opens the KpiDrilldownModal',
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

          // Open the drill-down for the "Total spend" tile (hover → footer link).
          const modal = await openDrilldown(page, "Total spend");

          // KpiDrilldownModal renders the "Metric breakdown" eyebrow in its
          // header.  Wait for it to appear inside the modal.
          const eyebrow = modal.getByText("Metric breakdown", { exact: false });
          await eyebrow.waitFor({ state: "visible", timeout: 5_000 });

          const eyebrowText = await eyebrow.first().textContent();
          assert(
            eyebrowText?.includes("Metric breakdown") ?? false,
            `Expected "Metric breakdown" in the modal header, got: "${eyebrowText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 6: CPA (blended) tile popover ────────────────────────────────
    // CPA uses amber bar colour and sorts ascending (lower is better).
    // This test confirms the popover renders for the CPA metric and that the
    // header shows the correct label.  The bookster fixture has no
    // cell_performance_rows so the fallback path is exercised.
    await test(
      '"CPA (blended)" tile: hover popover shows correct metric label',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Pre-seed localStorage so the CPA tile is selected before the app
          // initialises — useMetricSelection reads this key on first render.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["cpa_blended"]),
            );
          });

          await mockApis(ctx);
          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Find the CPA tile button.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "CPA (blended)" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Wait for the popover footer link — present regardless of chart vs
          // fallback branch.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });

          // The popover header label element must show the correct metric label.
          // Using the data-testid scopes this assertion to the popover header,
          // not the tile button which also contains the label text.
          const headerLabel = page.locator(
            '[data-testid="metric-popover-header-label"]',
          );
          await headerLabel.waitFor({ state: "visible", timeout: 3_000 });
          const headerText = (await headerLabel.textContent()) ?? "";
          assert(
            headerText.includes("CPA (blended)"),
            `Popover header must show "CPA (blended)", got: "${headerText}"`,
          );

          // Chart or stat fallback must be present.
          const bodyText = (await page.locator("body").textContent()) ?? "";
          const hasChart = bodyText.includes("Top concepts");
          const hasFallback =
            bodyText.includes("No concept rows available") ||
            bodyText.includes("Only one concept found");
          assert(
            hasChart || hasFallback,
            `CPA popover must contain "Top concepts" or a fallback message.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 7: result-event tile popover ─────────────────────────────────
    // Result-event metrics filter cellRows by their eventKey.  This test
    // confirms the popover renders for a result-event tile and that the
    // event label appears in the popover header.
    //
    // "Mobile app installs" is the highest-result event for the bookster
    // fixture (453 results).  Its eventLabel() returns the key as-is because
    // it is not in the EVENT_LABEL map.
    await test(
      '"Mobile app installs" result-event tile: hover popover shows event label',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Pre-seed localStorage so the result-event tile is selected before
          // the app initialises.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["result:Mobile app installs"]),
            );
          });

          await mockApis(ctx);
          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Find the result-event tile button.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Mobile app installs" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Wait for the popover footer link.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });

          // The popover header label element must show the event label.
          // Scoped to data-testid so we don't accidentally match the tile
          // button text (which also contains the same label string).
          const headerLabel = page.locator(
            '[data-testid="metric-popover-header-label"]',
          );
          await headerLabel.waitFor({ state: "visible", timeout: 3_000 });
          const headerText = (await headerLabel.textContent()) ?? "";
          assert(
            headerText.includes("Mobile app installs"),
            `Popover header must show "Mobile app installs", got: "${headerText}"`,
          );

          // Chart or stat fallback must be present.
          const bodyText = (await page.locator("body").textContent()) ?? "";
          const hasChart = bodyText.includes("Top concepts");
          const hasFallback =
            bodyText.includes("No concept rows available") ||
            bodyText.includes("Only one concept found");
          assert(
            hasChart || hasFallback,
            `Result-event popover must contain "Top concepts" or a fallback message.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 8: Link CTR 'avg' reference line appears with ≥2 concept rows ──
    // The bookster fixture ships with an empty performance_by_cell, so all
    // previous tests hit only the stat-fallback branch.  This test injects
    // three synthetic concept rows into a modified copy of the seed so that
    // concepts.length >= 2 (hasChart = true) and the ReferenceLine with the
    // "avg" label is rendered.  The bookster campaign_summary already carries
    // a non-null overall_link_ctr_pct so refValue will be non-null too.
    await test(
      '"Link CTR" tile: avg reference line appears in chart when ≥2 concept rows exist',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Build a modified seed: inject 3 concept rows into bookster's
          // performance_by_cell so concepts.length >= 2 and hasChart = true.
          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          // Patch overall_link_ctr_pct to a realistic value that falls inside
          // the chart domain for our injected rows (which have CTR ~1.6–2.0%).
          // The fixture carries 154250 (a data-quality artefact) which puts the
          // ReferenceLine completely outside the auto-scaled XAxis domain, so
          // Recharts omits the label SVG node entirely.
          bookster.iap.campaign_summary.overall_link_ctr_pct = 1.83;
          bookster.iap.analysis.performance_by_cell = [
            {
              cell_id: "c_alpha",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 1200,
              Reach: 40000,
              Impressions: 80000,
              Results: 120,
              "Clicks (all)": 2000,
              "Link clicks": 1600,
              CPA_result: 10.0,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 7.5,
              book2_concept_name: "Concept Alpha",
            },
            {
              cell_id: "c_beta",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 900,
              Reach: 30000,
              Impressions: 60000,
              Results: 80,
              "Clicks (all)": 1500,
              "Link clicks": 1200,
              CPA_result: 11.25,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 6.7,
              book2_concept_name: "Concept Beta",
            },
            {
              cell_id: "c_gamma",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 700,
              Reach: 22000,
              Impressions: 44000,
              Results: 55,
              "Clicks (all)": 900,
              "Link clicks": 720,
              CPA_result: 12.73,
              CTR_link_pct: 1.64,
              Result_per_link_click_pct: 7.6,
              book2_concept_name: "Concept Gamma",
            },
          ];

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // "Link CTR" is a default tile — no localStorage override needed.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Link CTR" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });

          const bodyText = (await page.locator("body").textContent()) ?? "";

          // Chart branch must render ("Top concepts" heading).
          assert(
            bodyText.includes("Top concepts"),
            `Link CTR popover must render the chart ("Top concepts") when ≥2 concept rows ` +
              `exist. Body text did not contain "Top concepts".`,
          );

          // ReferenceLine label "avg" must be present (SVG text nodes are
          // included in element.textContent).
          assert(
            bodyText.includes("avg"),
            `Link CTR chart must render the "avg" reference line when metric.value is ` +
              `non-null. Body text did not contain "avg".`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 9: CPA 'avg' reference line appears with ≥2 concept rows ────────
    // Same injection strategy as Test 8 but for the CPA (blended) tile.
    // cpaBlended = total_spend / total_results — bookster's campaign_summary
    // already has both so the tile value is non-null; refValue is non-null too.
    await test(
      '"CPA (blended)" tile: avg reference line appears in chart when ≥2 concept rows exist',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Select the CPA tile before the app initialises.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["cpa_blended"]),
            );
          });

          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster.iap.analysis.performance_by_cell = [
            {
              cell_id: "c_alpha",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 1200,
              Reach: 40000,
              Impressions: 80000,
              Results: 120,
              "Clicks (all)": 2000,
              "Link clicks": 1600,
              CPA_result: 10.0,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 7.5,
              book2_concept_name: "Concept Alpha",
            },
            {
              cell_id: "c_beta",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 900,
              Reach: 30000,
              Impressions: 60000,
              Results: 80,
              "Clicks (all)": 1500,
              "Link clicks": 1200,
              CPA_result: 11.25,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 6.7,
              book2_concept_name: "Concept Beta",
            },
            {
              cell_id: "c_gamma",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 700,
              Reach: 22000,
              Impressions: 44000,
              Results: 55,
              "Clicks (all)": 900,
              "Link clicks": 720,
              CPA_result: 12.73,
              CTR_link_pct: 1.64,
              Result_per_link_click_pct: 7.6,
              book2_concept_name: "Concept Gamma",
            },
          ];

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          const tileBtn = page
            .locator("button")
            .filter({ hasText: "CPA (blended)" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });

          const bodyText = (await page.locator("body").textContent()) ?? "";

          // Chart branch must render ("Top concepts" heading).
          assert(
            bodyText.includes("Top concepts"),
            `CPA popover must render the chart ("Top concepts") when ≥2 concept rows exist. ` +
              `Body text did not contain "Top concepts".`,
          );

          // ReferenceLine label "avg" must be present.
          assert(
            bodyText.includes("avg"),
            `CPA chart must render the "avg" reference line when metric.value is non-null. ` +
              `Body text did not contain "avg".`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 10: KpiDrilldownModal concept breakdown — standard metric ───────
    // Opens the modal via "Diagnose full breakdown" on the "Total spend" tile
    // with 3 synthetic concept rows injected.  The default breakdown dimension
    // is "concept", so switching to Table view must list at least two concept
    // rows — catching regressions in data mapping or the empty-concepts path.
    await test(
      'KpiDrilldownModal: standard metric (spend) shows ≥2 concept rows',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Inject 3 concept rows so the modal renders the concept list branch.
          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster.iap.analysis.performance_by_cell = [
            {
              cell_id: "c_alpha",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 1200,
              Reach: 40000,
              Impressions: 80000,
              Results: 120,
              "Clicks (all)": 2000,
              "Link clicks": 1600,
              CPA_result: 10.0,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 7.5,
              book2_concept_name: "Concept Alpha",
            },
            {
              cell_id: "c_beta",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 900,
              Reach: 30000,
              Impressions: 60000,
              Results: 80,
              "Clicks (all)": 1500,
              "Link clicks": 1200,
              CPA_result: 11.25,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 6.7,
              book2_concept_name: "Concept Beta",
            },
            {
              cell_id: "c_gamma",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 700,
              Reach: 22000,
              Impressions: 44000,
              Results: 55,
              "Clicks (all)": 900,
              "Link clicks": 720,
              CPA_result: 12.73,
              CTR_link_pct: 1.64,
              Result_per_link_click_pct: 7.6,
              book2_concept_name: "Concept Gamma",
            },
          ];

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the "Total spend" tile.
          const modal = await openDrilldown(page, "Total spend");

          // Default breakdown is "concept". Switch to Table view.
          await toTableView(page);

          // Both injected concept names must appear as rows in the table.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const bodyText = (await table.textContent()) ?? "";
          assert(
            bodyText.includes("Concept Alpha"),
            `KpiDrilldownModal (spend) must show "Concept Alpha" in the concept table. ` +
              `Table text did not contain it.`,
          );
          assert(
            bodyText.includes("Concept Beta"),
            `KpiDrilldownModal (spend) must show "Concept Beta" in the concept table. ` +
              `Table text did not contain it.`,
          );

          // Confirm ≥2 data rows are rendered in the table body.
          const rowCount = await table.locator("tbody tr").count();
          assert(
            rowCount >= 2,
            `KpiDrilldownModal (spend) must render ≥2 concept rows, got ${rowCount}.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 11: KpiDrilldownModal concept breakdown — result-event metric ───
    // Same flow as Test 10 but uses the "Mobile app installs" result-event tile.
    // buildAccountBreakdown filters cell rows by the event key for result:*
    // metrics — a different code path from standard metrics.
    await test(
      'KpiDrilldownModal: result-event metric (Mobile app installs) shows ≥2 concept rows',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Select the result-event tile before the app initialises.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["result:Mobile app installs"]),
            );
          });

          // Inject 3 concept rows for "Mobile app installs" so the result-event
          // filtering path returns ≥2 concepts.
          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster.iap.analysis.performance_by_cell = [
            {
              cell_id: "c_alpha",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 1200,
              Reach: 40000,
              Impressions: 80000,
              Results: 120,
              "Clicks (all)": 2000,
              "Link clicks": 1600,
              CPA_result: 10.0,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 7.5,
              book2_concept_name: "Concept Alpha",
            },
            {
              cell_id: "c_beta",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 900,
              Reach: 30000,
              Impressions: 60000,
              Results: 80,
              "Clicks (all)": 1500,
              "Link clicks": 1200,
              CPA_result: 11.25,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 6.7,
              book2_concept_name: "Concept Beta",
            },
            {
              cell_id: "c_gamma",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 700,
              Reach: 22000,
              Impressions: 44000,
              Results: 55,
              "Clicks (all)": 900,
              "Link clicks": 720,
              CPA_result: 12.73,
              CTR_link_pct: 1.64,
              Result_per_link_click_pct: 7.6,
              book2_concept_name: "Concept Gamma",
            },
          ];

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the result-event tile.
          const modal = await openDrilldown(page, "Mobile app installs");

          // Default breakdown is "concept". Switch to Table view.
          await toTableView(page);

          // Both injected concept names must appear.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const bodyText = (await table.textContent()) ?? "";
          assert(
            bodyText.includes("Concept Alpha"),
            `KpiDrilldownModal (result-event) must show "Concept Alpha" in the concept table. ` +
              `Table text did not contain it.`,
          );
          assert(
            bodyText.includes("Concept Beta"),
            `KpiDrilldownModal (result-event) must show "Concept Beta" in the concept table. ` +
              `Table text did not contain it.`,
          );

          // Confirm ≥2 data rows are rendered in the table body.
          const rowCount = await table.locator("tbody tr").count();
          assert(
            rowCount >= 2,
            `KpiDrilldownModal (result-event) must render ≥2 concept rows, got ${rowCount}.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 12: KpiDrilldownModal avatar breakdown renders ≥1 segment row ────
    // Opens KpiDrilldownModal for the "Total spend" standard metric, selects the
    // "avatar" breakdown dimension (avatar segments are now a dimension inside
    // the modal, not a separate SegmentGridModal), switches to Table view, and
    // asserts at least one age-group label appears.  The bookster fixture ships
    // with 62 demographic rows (18 unique age×gender combos) so the avatar
    // dimension is offered and produces rows.  Catches regressions in the
    // avatar row builder that would otherwise render silently empty.
    await test(
      "KpiDrilldownModal: avatar breakdown renders ≥1 segment row",
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

          // Open the drill-down for the "Total spend" tile.
          const modal = await openDrilldown(page, "Total spend");

          // Select the "avatar" breakdown dimension, then switch to Table view.
          await modal.getByLabel("Breakdown").selectOption("avatar");
          await toTableView(page);

          // The bookster fixture has 18 unique avatar segments (age × gender).
          // Confirm at least one age-group label appears in the table.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const bodyText = (await table.textContent()) ?? "";
          const hasSegmentRows =
            bodyText.includes("25-34") ||
            bodyText.includes("18-24") ||
            bodyText.includes("35-44") ||
            bodyText.includes("45-54");
          assert(
            hasSegmentRows,
            "KpiDrilldownModal avatar breakdown must render at least one segment row " +
              "(age-group label not found in the table — breakdown may be empty).",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 13a: KpiDrilldownModal placement breakdown — spend metric ────────
    // Opens KpiDrilldownModal via the "Total spend" tile (default tile, no
    // localStorage override needed), selects the "placement" breakdown, switches
    // to Table view, and asserts the metric column shows dollar values ("$")
    // rather than "n/a".  The bookster fixture ships 19 v3 + 19 c4e placement
    // rows so the placement breakdown always produces rows with real spend.
    await test(
      "KpiDrilldownModal placement breakdown — spend metric shows dollar values",
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

          // Open the drill-down for the "Total spend" tile.
          const modal = await openDrilldown(page, "Total spend");

          // Select the "placement" breakdown, then switch to Table view.
          await modal.getByLabel("Breakdown").selectOption("placement");
          await toTableView(page);

          // For the spend metric the metric column formats as "$X" / "$X,XXX".
          // The table must include at least one dollar sign — a missing "$"
          // would mean every placement row rendered "n/a".
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const tableText = (await table.textContent()) ?? "";
          assert(
            tableText.includes("$"),
            `Placement breakdown for the spend metric must contain at least one dollar ` +
              `value in the metric column. Table text: "${tableText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 13b: KpiDrilldownModal placement breakdown — link_ctr metric ─────
    // Same flow as 13a but uses the "Link CTR" tile (another default tile so no
    // localStorage override needed).  Selects the "placement" breakdown, Table
    // view, and asserts the metric column shows percentage values ("%") rather
    // than "n/a".  The fixture placement rows carry both Link clicks and
    // Impressions so the link_ctr ratio produces real percentages.
    await test(
      "KpiDrilldownModal placement breakdown — link_ctr metric shows percentage values",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // "Link CTR" is one of the four default metric tiles — no localStorage
          // override needed.
          await mockApis(ctx);
          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the "Link CTR" tile.
          const modal = await openDrilldown(page, "Link CTR");

          // Select the "placement" breakdown, then switch to Table view.
          await modal.getByLabel("Breakdown").selectOption("placement");
          await toTableView(page);

          // For the link_ctr metric the ratio (linkClicks / impressions) * 100
          // formats as "X.XX%".  At least one row must show a "%" — an all-"n/a"
          // table would indicate a broken ratio computation.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const tableText = (await table.textContent()) ?? "";
          assert(
            tableText.includes("%"),
            `Placement breakdown for the link_ctr metric must contain at least one ` +
              `percentage value in the metric column. Table text: "${tableText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 13: result-event × avatar restriction notice ─────────────────────
    // result:* metrics can't be honestly scoped to the avatar dimension (the
    // demographic export carries no result-type column — see
    // dimensionMetricRestriction in kpiBreakdown.ts).  Selecting the "avatar"
    // breakdown for a result-event metric must render the restriction notice
    // and NO table.
    await test(
      "KpiDrilldownModal: result-event metric + avatar breakdown shows restriction notice and no table",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Select the result-event tile before the app initialises.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["result:Mobile app installs"]),
            );
          });

          // Inject concept rows so the modal has data (metric.value != null)
          // and renders the full account-scope body, not the "no data" fallback.
          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster.iap.analysis.performance_by_cell = [
            {
              cell_id: "c_alpha",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 1200,
              Reach: 40000,
              Impressions: 80000,
              Results: 120,
              "Clicks (all)": 2000,
              "Link clicks": 1600,
              CPA_result: 10.0,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 7.5,
              book2_concept_name: "Concept Alpha",
            },
            {
              cell_id: "c_beta",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 900,
              Reach: 30000,
              Impressions: 60000,
              Results: 80,
              "Clicks (all)": 1500,
              "Link clicks": 1200,
              CPA_result: 11.25,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 6.7,
              book2_concept_name: "Concept Beta",
            },
          ];

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the result-event tile.
          const modal = await openDrilldown(page, "Mobile app installs");

          // Select the "avatar" breakdown — result:* metrics can't be scoped to
          // the demographic dimension, so a restriction notice must render.
          await modal.getByLabel("Breakdown").selectOption("avatar");

          // The restriction notice must appear (dimensionMetricRestriction copy).
          const bodyText = (await modal.textContent()) ?? "";
          assert(
            bodyText.includes("can't be honestly scoped to this dimension"),
            'The restriction notice ("can\'t be honestly scoped to this dimension") ' +
              "must appear for a result-event metric under the avatar breakdown. " +
              `Got modal text: "${bodyText.slice(0, 300)}"`,
          );

          // No table must render while the restriction is active.
          const tableCount = await modal
            .locator('[data-testid="kpi-drilldown-table"]')
            .count();
          assert(
            tableCount === 0,
            `No kpi-drilldown-table must render for a result-event metric under the ` +
              `avatar breakdown, but found ${tableCount}.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 14: KpiDrilldownModal — avatar dimension absent when no demo rows ─
    // Builds a seed where demographic_registration_signal is an empty array so
    // listBreakdownDimensions() does NOT offer the "avatar" dimension.  The
    // Breakdown <select> must therefore have no "avatar" option — the new-modal
    // equivalent of the old empty-grid state.
    await test(
      "KpiDrilldownModal: Breakdown select has no avatar option when no demographic rows exist",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Build a seed with:
          //   • 3 concept rows so the modal has a populated concept breakdown.
          //   • demographic_registration_signal: [] so listBreakdownDimensions()
          //     omits the "avatar" dimension entirely.
          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster.iap.analysis.performance_by_cell = [
            {
              cell_id: "c_alpha",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 1200,
              Reach: 40000,
              Impressions: 80000,
              Results: 120,
              "Clicks (all)": 2000,
              "Link clicks": 1600,
              CPA_result: 10.0,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 7.5,
              book2_concept_name: "Concept Alpha",
            },
            {
              cell_id: "c_beta",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 900,
              Reach: 30000,
              Impressions: 60000,
              Results: 80,
              "Clicks (all)": 1500,
              "Link clicks": 1200,
              CPA_result: 11.25,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 6.7,
              book2_concept_name: "Concept Beta",
            },
            {
              cell_id: "c_gamma",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 700,
              Reach: 22000,
              Impressions: 44000,
              Results: 55,
              "Clicks (all)": 900,
              "Link clicks": 720,
              CPA_result: 12.73,
              CTR_link_pct: 1.64,
              Result_per_link_click_pct: 7.6,
              book2_concept_name: "Concept Gamma",
            },
          ];
          // Clear the demographic signal so avatars.length === 0.
          bookster.iap.analysis.demographic_registration_signal = [];

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the "Total spend" tile.
          const modal = await openDrilldown(page, "Total spend");

          // The Breakdown <select> must not offer an "avatar" option, since the
          // account has no demographic rows.
          const breakdownSelect = modal.getByLabel("Breakdown");
          await breakdownSelect.waitFor({ state: "visible", timeout: 5_000 });
          const optionValues = await breakdownSelect
            .locator("option")
            .evaluateAll((opts) =>
              opts.map((o) => (o as HTMLOptionElement).value),
            );
          assert(
            !optionValues.includes("avatar"),
            `Breakdown select must not include an "avatar" option when there are no ` +
              `demographic rows. Got option values: ${JSON.stringify(optionValues)}`,
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 15a: KpiDrilldownModal avatar breakdown — impressions metric ─────
    // Opens KpiDrilldownModal for the "Impressions" default tile, selects the
    // "avatar" breakdown, switches to Table view, and asserts the metric column
    // shows a numeric value (not "n/a") for the impressions metric.  The
    // bookster fixture has 62 demographic rows so the avatar dimension exists.
    await test(
      "KpiDrilldownModal avatar breakdown — impressions metric shows a numeric value",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // "Impressions" is one of the four default metric tiles — no
          // localStorage override needed.
          await mockApis(ctx);
          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Open the drill-down for the "Impressions" tile.
          const modal = await openDrilldown(page, "Impressions");

          // Select the "avatar" breakdown, then switch to Table view.
          await modal.getByLabel("Breakdown").selectOption("avatar");
          await toTableView(page);

          // The metric column of the first row must show a numeric value, not
          // "n/a" — impressions sum honestly across demographic rows.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const metricCell = table.locator("tbody tr").first().locator("td").nth(1);
          const cellText = ((await metricCell.textContent()) ?? "").trim();
          assert(
            cellText.length > 0 && cellText !== "n/a" && /\d/.test(cellText),
            `First avatar row's impressions value must be numeric, not "n/a". ` +
              `Got: "${cellText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 15b: KpiDrilldownModal avatar breakdown — link_clicks metric ─────
    // Same as 15a but for the "Link clicks" default tile — exercises the
    // link_clicks sum in the avatar row builder.
    await test(
      "KpiDrilldownModal avatar breakdown — link_clicks metric shows a numeric value",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // "Link clicks" is one of the four default metric tiles — no
          // localStorage override needed.
          await mockApis(ctx);
          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Open the drill-down for the "Link clicks" tile.
          const modal = await openDrilldown(page, "Link clicks");

          // Select the "avatar" breakdown, then switch to Table view.
          await modal.getByLabel("Breakdown").selectOption("avatar");
          await toTableView(page);

          // The metric column of the first row must show a numeric value.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const metricCell = table.locator("tbody tr").first().locator("td").nth(1);
          const cellText = ((await metricCell.textContent()) ?? "").trim();
          assert(
            cellText.length > 0 && cellText !== "n/a" && /\d/.test(cellText),
            `First avatar row's link_clicks value must be numeric, not "n/a". ` +
              `Got: "${cellText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 15c: KpiDrilldownModal avatar breakdown — cpa_blended metric ─────
    // Opens KpiDrilldownModal for the "CPA (blended)" tile, selects the "avatar"
    // breakdown, and asserts the metric column shows a dollar value ("$").  The
    // bookster demographic rows carry Results > 0 so spend ÷ results yields a
    // real CPA for every avatar segment.
    await test(
      "KpiDrilldownModal avatar breakdown — cpa_blended metric shows a dollar value",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // "CPA (blended)" is not a default tile — inject via localStorage
          // so the tile is selected before the app initialises.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["cpa_blended"]),
            );
          });

          await mockApis(ctx);
          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Open the drill-down for the "CPA (blended)" tile.
          const modal = await openDrilldown(page, "CPA (blended)");

          // Select the "avatar" breakdown, then switch to Table view.
          await modal.getByLabel("Breakdown").selectOption("avatar");
          await toTableView(page);

          // The metric column of the first row must start with "$" (usd()
          // format) — spend ÷ results yields a real CPA for every segment.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const metricCell = table.locator("tbody tr").first().locator("td").nth(1);
          const cellText = ((await metricCell.textContent()) ?? "").trim();
          assert(
            cellText.startsWith("$"),
            `First avatar row's cpa_blended value must start with "$" (usd() format). ` +
              `Got: "${cellText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 16: SegmentGridModal with cellIds — concept-row drilldown ────────
    // Opens CrossmapResultsView for the bookster account, clicks the C2B matrix
    // cell row (C2B has demographic_registration_signal rows in the fixture),
    // which triggers TilePerformanceModal with cellIds=["C2B"].  Then clicks
    // "Avatar × placement" to open SegmentGridModal scoped to C2B.
    //
    // Catches a regression in buildAvatarSegments() where cellIds filtering
    // silently empties the grid when opened from a concept row rather than the
    // account-level diagnostic (where cellIds is null).  The account-level path
    // is already covered by Test 7; this test exercises the non-null cellIds
    // branch for the first time.
    //
    // Assertions:
    //   • At least one avatar-segment row appears in the grid <tbody> — confirms
    //     buildAvatarSegments() did not over-filter the C2B demographic rows.
    //   • The dialog description text includes "scoped to C2B" — confirms that
    //     cellIds was threaded through from TilePerformanceModal into the modal.
    await test(
      "SegmentGridModal with cellIds: concept-row drilldown renders ≥1 segment row and 'scoped to C2B' description",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);

          // Navigate to CrossmapResultsView for the bookster account.
          // C2B is the only cell_id that appears in both historical_matrix_4x4
          // and demographic_registration_signal for this account (62 demo rows,
          // 4 distinct cell_ids: C2B, C2E, C2F, C4E; matrix cells: C1A–C4D).
          // NOTE: use the canonical /app/mst/cross-map path directly — the
          // legacy /app/mst/crossmap route redirects but drops the ?account=
          // query param, which leaves the page in the unconfigured state.
          await page.goto(`${BASE}/app/mst/cross-map?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // The Cross-Map surface defaults to the "Concept Map" tab —
          // switch to the "Crossmap Results" tab to mount CrossmapResultsView.
          const crossmapTab = page.getByRole("button", { name: /Crossmap Results/i }).first();
          await crossmapTab.waitFor({ state: "visible", timeout: 20_000 });
          await crossmapTab.click();

          // Wait for the crossmap table to render — the "Matrix cell" column
          // header confirms the table is mounted and data has loaded.
          await page
            .getByRole("columnheader", { name: "Matrix cell" })
            .waitFor({ state: "visible", timeout: 20_000 });

          // The table folds beyond the first few rows — expand it so the
          // C2B row is guaranteed to be in the DOM regardless of sort order.
          const showAllBtn = page.getByRole("button", { name: /Show all .* matrix cells/i });
          if (await showAllBtn.isVisible().catch(() => false)) {
            await showAllBtn.click();
          }

          // Click the C2B row to open TilePerformanceModal scoped to that cell.
          // The table rows include a <span> with the font-mono cell_id text.
          const c2bRow = page.locator("tbody tr").filter({ hasText: "C2B" }).first();
          await c2bRow.waitFor({ state: "visible", timeout: 8_000 });
          await c2bRow.click();

          // TilePerformanceModal should open — wait for the "Avatar × placement"
          // button which only appears inside TilePerformanceModal (not in the table).
          // Click "Avatar × placement" to open SegmentGridModal with cellIds=["C2B"].
          const segmentBtn = page.getByRole("button", { name: "Avatar × placement" });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });
          await segmentBtn.click();

          // SegmentGridModal title contains the cell name / kicker.
          // Wait for the grid dialog to open by looking for the avatar segment
          // table body — the grid always renders a <tbody> with avatar rows when
          // buildAvatarSegments() returns a non-empty array.
          const dialog = page.locator('[role="dialog"]').last();
          const firstAvatarRow = dialog.locator("tbody tr").first();
          await firstAvatarRow.waitFor({ state: "visible", timeout: 10_000 });

          // Assertion 1: ≥1 avatar segment row rendered — confirms the cellIds
          // filter did not drop all C2B demographic rows.
          const rowCount = await dialog.locator("tbody tr").count();
          assert(
            rowCount >= 1,
            `SegmentGridModal with cellIds=["C2B"] must render ≥1 avatar segment ` +
              `row, but tbody had ${rowCount} rows. buildAvatarSegments() may have ` +
              `over-filtered the C2B demographic rows.`,
          );

          // Assertion 2: description text includes "scoped to C2B" — confirms
          // cellIds was passed through from TilePerformanceModal into the modal
          // (line 251 of SegmentGridModal.tsx).
          const dialogText = (await dialog.textContent()) ?? "";
          assert(
            dialogText.includes("scoped to C2B"),
            `SegmentGridModal description must include "scoped to C2B" when ` +
              `opened with cellIds=["C2B"]. Got dialog text snippet: ` +
              `"${dialogText.slice(0, 300)}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 15d: KpiDrilldownModal — reach metric across avatar / placement ──
    // The demographic rows carry Reach, so the "avatar" breakdown must show a
    // numeric reach value.  Placement rows don't carry reach in this import, so
    // the "placement" breakdown must instead show the restriction notice
    // ("don't carry reach or clicks (all)") and NO table — the new-modal
    // equivalent of the old unavailableOnPlacements warning.
    await test(
      "KpiDrilldownModal: reach metric shows a value under avatar and restriction notice under placement",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // "Reach" is not a default tile — inject via localStorage so the tile
          // is present before the app initialises.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["reach"]),
            );
          });

          // Reduce bottom_line_totals to a single event so
          // accountLevelDeliveryTotal() returns a real reach value rather than
          // null (the null branch fires when events.length > 1).
          const modifiedSeed15d = JSON.parse(SEED_FIXTURE_BODY);
          const bookster15d = modifiedSeed15d.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster15d.iap.campaign_summary.bottom_line_totals = {
            "Mobile app installs": {
              results: 120,
              reach: 52000,
              clicks_all: 6500,
              impressions: 180000,
              link_clicks: 4200,
              spend: 8001.1,
            },
          };

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
              body: JSON.stringify(modifiedSeed15d),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the "Reach" tile.
          const modal = await openDrilldown(page, "Reach");

          // Avatar breakdown: demographic rows carry Reach, so the metric column
          // must show a numeric value.
          await modal.getByLabel("Breakdown").selectOption("avatar");
          await toTableView(page);
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const avatarCell = table.locator("tbody tr").first().locator("td").nth(1);
          const avatarText = ((await avatarCell.textContent()) ?? "").trim();
          assert(
            avatarText.length > 0 && avatarText !== "n/a" && /\d/.test(avatarText),
            `First avatar row's reach value must be numeric, not "n/a". Got: "${avatarText}"`,
          );

          // Placement breakdown: placement rows don't carry reach, so the modal
          // must render the restriction notice and NO table.
          await modal.getByLabel("Breakdown").selectOption("placement");
          const modalText = (await modal.textContent()) ?? "";
          assert(
            modalText.includes("don't carry reach or clicks (all)"),
            `Placement breakdown for the reach metric must render the restriction notice ` +
              `("don't carry reach or clicks (all)"). Got modal text: "${modalText.slice(0, 300)}"`,
          );
          const tableCount = await modal
            .locator('[data-testid="kpi-drilldown-table"]')
            .count();
          assert(
            tableCount === 0,
            `No kpi-drilldown-table must render for the reach metric under the placement ` +
              `breakdown, but found ${tableCount}.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 15e: KpiDrilldownModal — clicks_all across avatar / placement ────
    // Same pattern as 15d: demographic rows carry Clicks (all) so the avatar
    // breakdown shows a numeric value; placement rows don't carry it so the
    // placement breakdown renders the restriction notice and no table.
    await test(
      "KpiDrilldownModal: clicks_all shows a value under avatar and restriction notice under placement",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // "Clicks (all)" is not a default tile — inject via localStorage.
          await page.addInitScript(() => {
            localStorage.setItem(
              "metrix.overview.metric_tiles.v1",
              JSON.stringify(["clicks_all"]),
            );
          });

          // Single-event seed so accountLevelDeliveryTotal() returns
          // a real clicks_all figure rather than null.
          const modifiedSeed15e = JSON.parse(SEED_FIXTURE_BODY);
          const bookster15e = modifiedSeed15e.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster15e.iap.campaign_summary.bottom_line_totals = {
            "Mobile app installs": {
              results: 120,
              reach: 52000,
              clicks_all: 6500,
              impressions: 180000,
              link_clicks: 4200,
              spend: 8001.1,
            },
          };

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
              body: JSON.stringify(modifiedSeed15e),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the "Clicks (all)" tile.
          const modal = await openDrilldown(page, "Clicks (all)");

          // Avatar breakdown: demographic rows carry Clicks (all), so the metric
          // column must show a numeric value.
          await modal.getByLabel("Breakdown").selectOption("avatar");
          await toTableView(page);
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const avatarCell = table.locator("tbody tr").first().locator("td").nth(1);
          const avatarText = ((await avatarCell.textContent()) ?? "").trim();
          assert(
            avatarText.length > 0 && avatarText !== "n/a" && /\d/.test(avatarText),
            `First avatar row's clicks_all value must be numeric, not "n/a". ` +
              `Got: "${avatarText}"`,
          );

          // Placement breakdown: placement rows don't carry clicks (all), so the
          // modal must render the restriction notice and NO table.
          await modal.getByLabel("Breakdown").selectOption("placement");
          const modalText = (await modal.textContent()) ?? "";
          assert(
            modalText.includes("don't carry reach or clicks (all)"),
            `Placement breakdown for the clicks_all metric must render the restriction ` +
              `notice ("don't carry reach or clicks (all)"). ` +
              `Got modal text: "${modalText.slice(0, 300)}"`,
          );
          const tableCount = await modal
            .locator('[data-testid="kpi-drilldown-table"]')
            .count();
          assert(
            tableCount === 0,
            `No kpi-drilldown-table must render for the clicks_all metric under the ` +
              `placement breakdown, but found ${tableCount}.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 17: KpiDrilldownModal empty state (no data for metric) ───────
    // Injects a seed where total_spend_usd is null and performance_by_cell is
    // empty, so the "Total spend" metric can't be honestly computed for any
    // segment.  Opening KpiDrilldownModal via "Diagnose full breakdown" must
    // render the honest empty state (data-testid="kpi-drilldown-empty") and no
    // breakdown table — catches regressions in the empty-state branch.
    await test(
      'KpiDrilldownModal: no data for metric shows the empty state',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Build a seed where the "Total spend" metric has no data.
          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          // Null out total_spend_usd and empty every delivery-source array so
          // no breakdown dimension backs the "spend" metric with real rows →
          // KpiDrilldownModal renders the honest empty state.
          bookster.iap.campaign_summary.total_spend_usd = null;
          bookster.iap.analysis.performance_by_cell = [];
          bookster.iap.analysis.demographic_registration_signal = [];
          bookster.iap.analysis.v3_variable_performance = [];
          bookster.iap.analysis.v3_placement_signal = [];
          bookster.iap.analysis.c4e_placement_signal = [];
          bookster.iap.analysis.conversion_tracking_signal = null;

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the "Total spend" tile — the HoverCard and
          // footer link are present even when the metric value is null.
          const modal = await openDrilldown(page, "Total spend");

          // ── Assert 1: the empty state is visible ──────────────────────
          const empty = modal.locator('[data-testid="kpi-drilldown-empty"]');
          await empty.waitFor({ state: "visible", timeout: 5_000 });

          // ── Assert 2: no breakdown table renders in the empty state ───
          const tableCount = await modal
            .locator('[data-testid="kpi-drilldown-table"]')
            .count();
          assert(
            tableCount === 0,
            `KpiDrilldownModal must not render a breakdown table when the metric ` +
              `has no data. Got ${tableCount} table(s).`,
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 18: SegmentGridModal via VariableDrilldownModal concept path ────
    // Opens VariableDrilldownModal via the IAP Library's Creative DNA tab:
    // clicking the "hook" family card opens the drill-down for the family's
    // top variable HK_Problem (lowest CPA in the fixture's hook family).
    // HK_Problem's carrier cell is C2E, which has demographic rows in the
    // fixture, so the modal shows "Segment performance — scoped to this
    // variable's cells" rows computed by computeVariableDrilldown() using
    // only carrier-cell demo rows (cellIds = ["C2E"]).  Clicking one of those
    // rows opens SegmentDrilldownModal with cellIds threaded through from
    // VariableDrilldownModal.
    //
    // This is the third non-null cellIds entry point into the segment drill-down
    // chain — the other two being Test 7 (account-level, cellIds=null) and
    // Test 16 (concept row → TilePerformanceModal, cellIds=["C2B"]).  A
    // regression in computeVariableDrilldown() carrier-cell filtering or in
    // the cellIds prop threading would silently empty the segment
    // section without any existing test catching it.
    //
    // Assertions:
    //   1. ≥1 segment row (data-testid="row-variable-segment-*") renders inside
    //      VariableDrilldownModal — confirms computeVariableDrilldown found
    //      carrier cells and the demo-grain scoping produced non-empty segments.
    //   2. After clicking a segment row, SegmentDrilldownModal's description
    //      contains "scoped to" — confirms cellIds was threaded through from
    //      VariableDrilldownModal into SegmentDrilldownModal (not silently
    //      dropped to null, which would widen the scope to the whole account).
    await test(
      "SegmentGridModal via VariableDrilldownModal: HK_Problem carrier cells render ≥1 segment row and 'scoped to' description",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);

          // Navigate to the IAP Library — the Creative DNA tab renders family
          // cards from rollupDnaFamilies(); the "hook" family card's top
          // variable is HK_Problem whose carrier cell C2E has demographic rows.
          await page.goto(`${BASE}/app/analysis/library?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Wait for the library shell to render past the loading state.
          await page
            .getByText("Creative DNA", { exact: false })
            .first()
            .waitFor({ state: "visible", timeout: 20_000 });

          // Click the "Creative DNA" tab to activate the variables panel.
          await page
            .getByRole("button", { name: /Creative DNA/i })
            .first()
            .click();

          // Click the hook family card — opens VariableDrilldownModal for
          // its top variable (HK_Problem).
          const hookCard = page.locator('[data-testid="dna-family-hook"]');
          await hookCard.waitFor({ state: "visible", timeout: 8_000 });
          await hookCard.click();

          // VariableDrilldownModal opens — its title includes the human-readable
          // label for "HK_Problem" via readableVariables() and also renders the raw
          // code in a <span> inside the DialogTitle (data-testid="title-variable-drilldown").
          const drilldownTitle = page.locator(
            '[data-testid="title-variable-drilldown"]',
          );
          await drilldownTitle.waitFor({ state: "visible", timeout: 8_000 });

          // ── Assertion 1: ≥1 segment row renders ───────────────────────────
          // computeVariableDrilldown scopes demographic rows to HK_Problem's carrier
          // cells (C2E), then groups by age×gender into segment rows rendered as
          // <button data-testid="row-variable-segment-{age}-{gender}">.
          // A count of 0 would mean carrier-cell filtering silently discarded
          // all demo rows or computeVariableDrilldown returned segments.available=false.
          const segmentRows = page.locator(
            '[data-testid^="row-variable-segment-"]',
          );
          await segmentRows.first().waitFor({ state: "visible", timeout: 8_000 });
          const segRowCount = await segmentRows.count();
          assert(
            segRowCount >= 1,
            `VariableDrilldownModal must render ≥1 segment row for HK_Problem ` +
              `(carrier cell C2E has demographic data), but found ${segRowCount} rows. ` +
              `computeVariableDrilldown() may have over-filtered the carrier-cell ` +
              `demographic rows, or segments.available is incorrectly false.`,
          );

          // ── Assertion 2: 'scoped to' appears after opening SegmentDrilldownModal ─
          // Click the first segment row to open SegmentDrilldownModal.
          // VariableDrilldownModal passes cellIds=data.carrierCellIds (["C2E"]).
          // If cellIds is silently dropped to null the description reads
          // "…from their own demographic rows" without the "(scoped to C2E)"
          // suffix; if cellIds is correctly threaded, the description
          // contains "(scoped to C2E)".
          const firstSegmentRow = segmentRows.first();
          await firstSegmentRow.click();

          // SegmentDrilldownModal opens as a new Dialog.  Use .last() because
          // VariableDrilldownModal's Dialog is still mounted underneath.
          const segmentDialog = page.locator('[role="dialog"]').last();
          await segmentDialog.waitFor({ state: "visible", timeout: 8_000 });

          const dialogText = (await segmentDialog.textContent()) ?? "";
          assert(
            dialogText.includes("scoped to"),
            `SegmentDrilldownModal description must include "scoped to" when ` +
              `opened from VariableDrilldownModal with cellIds=["C2E"]. ` +
              `This confirms the cellIds prop was threaded through from ` +
              `VariableDrilldownModal rather than silently dropped to null. ` +
              `Got dialog text snippet: "${dialogText.slice(0, 400)}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 19: KpiDrilldownModal cell breakdown lists cell ids ──────────────
    // The new modal no longer navigates to the library. Instead it exposes a
    // "cell" breakdown dimension whose rows are labeled "{cell_id} · {concept}".
    // Opens KpiDrilldownModal for the "Total spend" tile with 1 injected cell
    // row (cell id "c_alpha"), selects the "cell" breakdown, switches to Table
    // view, and asserts the known cell id appears in the table.
    await test(
      'KpiDrilldownModal: cell breakdown lists cell ids in the table',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Inject 1 concept row so the modal renders the concept list branch.
          const modifiedSeed = JSON.parse(SEED_FIXTURE_BODY);
          const bookster = modifiedSeed.ad_accounts.find(
            (a: { id: string }) => a.id === ACCOUNT,
          );
          bookster.iap.analysis.performance_by_cell = [
            {
              cell_id: "c_alpha",
              "Result type": "Mobile app installs",
              "Amount spent (USD)": 1200,
              Reach: 40000,
              Impressions: 80000,
              Results: 120,
              "Clicks (all)": 2000,
              "Link clicks": 1600,
              CPA_result: 10.0,
              CTR_link_pct: 2.0,
              Result_per_link_click_pct: 7.5,
              book2_concept_name: "Concept Alpha",
            },
          ];

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
              body: JSON.stringify(modifiedSeed),
            }),
          );
          await page.route("**/api/metrix/workspaces/*/reports", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ reports: [] }),
            }),
          );

          await page.goto(`${BASE}/app/account?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Open the drill-down for the "Total spend" tile.
          const modal = await openDrilldown(page, "Total spend");

          // Select the "cell" breakdown, then switch to Table view.
          await modal.getByLabel("Breakdown").selectOption("cell");
          await toTableView(page);

          // The cell breakdown labels each row "{cell_id} · {concept}", so the
          // known cell id "c_alpha" must appear in the table.
          const table = modal.locator('[data-testid="kpi-drilldown-table"]');
          const tableText = (await table.textContent()) ?? "";
          assert(
            tableText.includes("c_alpha"),
            `KpiDrilldownModal cell breakdown must list the known cell id "c_alpha" ` +
              `in the table. Table text: "${tableText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 20: DNA family card opens VariableDrilldownModal ─────────────
    // The bookster fixture's v3_variable_performance rows span seven
    // variable families (hook, framework, cta, concept, pain_proof, proof,
    // tone).  rollupDnaFamilies() produces one card per family; the
    // "concept" family card (data-testid="dna-family-concept") has top
    // variable "CN_BehaviorShift" (lowest CPA in that family).  The card's
    // onClick calls setVariableCode, which should open VariableDrilldownModal.
    //
    // Regression guard: a broken onClick handler or a setVariableCode/
    // open-state wiring regression would leave the modal unmounted;
    // title-variable-drilldown would never appear.
    await test(
      "DNA family card (Creative DNA tab) opens VariableDrilldownModal when clicked",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);

          // Navigate directly to the IAP Library for the bookster account.
          await page.goto(
            `${BASE}/app/analysis/library?account=${ACCOUNT}`,
            { waitUntil: "domcontentloaded" },
          );

          // Wait for the library shell to render past the loading state.
          await page
            .getByText("Creative DNA", { exact: false })
            .first()
            .waitFor({ state: "visible", timeout: 20_000 });

          // Click the "Creative DNA" tab to activate the variables panel.
          await page
            .getByRole("button", { name: /Creative DNA/i })
            .first()
            .click();

          // Wait for the DNA family card for the "concept" family to appear.
          const dnaCard = page.locator('[data-testid="dna-family-concept"]');
          await dnaCard.waitFor({ state: "visible", timeout: 8_000 });

          // Confirm the card is interactive (role="button" is set only when
          // f.top is non-null).
          const role = await dnaCard.getAttribute("role");
          assert(
            role === "button",
            `dna-family-concept must have role="button" when the family has ` +
              `a top variable (CN_BehaviorShift), but got role="${role}". ` +
              `Check that rollupDnaFamilies() returns a non-null top entry for ` +
              `the concept family in the bookster fixture.`,
          );

          // Click the card — calls setVariableCode(f.top.variableId).
          await dnaCard.click();

          // VariableDrilldownModal renders a DialogTitle with
          // data-testid="title-variable-drilldown".
          const drilldownTitle = page.locator(
            '[data-testid="title-variable-drilldown"]',
          );
          await drilldownTitle.waitFor({ state: "visible", timeout: 8_000 });

          const titleText = (await drilldownTitle.textContent()) ?? "";
          assert(
            titleText.trim().length > 0,
            `VariableDrilldownModal title must be non-empty for variable "CN_BehaviorShift". ` +
              `Check readableVariables() / VariableDrilldownModal header rendering.`,
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
// (duplicate "theirs" main function removed — test 20 merged above)

main().catch((err) => {
  console.error("\nFatal error running metrix-iap hover-popover e2e tests:", err);
  process.exit(1);
});
