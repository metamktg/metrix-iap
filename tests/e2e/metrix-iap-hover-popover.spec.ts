// End-to-end Playwright tests for MetricHoverPopover on AdAccountOverview.
//
// Covers:
//   1. Each of the four default metric tiles (spend, impressions, link_clicks,
//      link_ctr) — hover opens a popover containing a bar chart ("Top concepts")
//      or the stat-fallback text when fewer than two concept rows exist.
//   2. The "Diagnose full breakdown" footer link inside the popover opens the
//      MetricDiagnosticModal dialog.
//   3. The CPA (blended) tile — popover header shows the correct metric label.
//   4. A result-event tile (Mobile app installs) — popover header shows the
//      event label.
//   5. MetricDiagnosticModal concept list — standard metric (spend): modal shows
//      ≥2 concept rows under "Top IAP library concepts" when performance_by_cell
//      is populated.
//   6. MetricDiagnosticModal concept list — result-event metric (Mobile app
//      installs): modal shows ≥2 concept rows scoped to the event type.
//   7. SegmentGridModal: clicking "Avatar × placement breakdown" from
//      MetricDiagnosticModal (non-result-event) opens the grid and renders ≥1
//      avatar segment row — catches silent empty-grid regressions.
//   8. Result-event guard: "Avatar × placement breakdown" button is absent for
//      result-event metrics; the info notice renders in its place.
//   13a. SegmentGridModal placement marginals — spend metric: "All avatars" row
//      shows dollar values (not "—") in placement cells, catching silent regressions
//      in the spend case of metricValueForSegment().
//   13b. SegmentGridModal placement marginals — link_ctr metric: "All avatars" row
//      shows percentage values (not "—") in placement cells, catching regressions
//      in the link_ctr case of metricValueForSegment().
//   14. SegmentGridModal empty-state: when demographic_registration_signal is [],
//      the modal renders "No demographic rows for this selection" and omits the
//      grid table — catches regressions in the zero-row branch.
//   15a. SegmentGridModal avatar blended column — impressions metric: "Blended"
//      header is present and the first avatar row's blended cell shows a non-empty
//      integer value (num(t.impressions)), not "—".
//   15b. SegmentGridModal avatar blended column — link_clicks metric: "Blended"
//      header is present and the first avatar row's blended cell shows a non-empty
//      integer value (num(t.linkClicks)), not "—".
//   15c. SegmentGridModal avatar blended column — cpa_blended metric: "Blended"
//      header is present and the first avatar row's blended cell starts with "$"
//      (usd() dollar format), not "—".
//   16. SegmentGridModal with cellIds: opening via a concept-row drilldown
//      (TilePerformanceModal → cellIds=["C2B"]) renders ≥1 avatar segment row
//      and the description says "scoped to C2B" — catches silent empty-grid
//      regressions in the non-null cellIds branch of buildAvatarSegments().
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

    // ── Test 10: MetricDiagnosticModal concept list — standard metric ────────
    // Opens the modal via "Diagnose full breakdown" on the "Total spend" tile
    // with 3 synthetic concept rows injected.  Asserts the modal's concept list
    // section ("Top IAP library concepts driving this metric") is visible and
    // at least two concept-name rows appear — catching regressions in data
    // mapping, empty-concepts path, or missing refValue inside the modal.
    await test(
      'MetricDiagnosticModal: standard metric (spend) shows ≥2 concept rows',
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

          // Click the "Diagnose full breakdown" footer link.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          // Wait for the MetricDiagnosticModal to appear.
          const dialogHeader = page.getByText("Metric diagnostic", { exact: false });
          await dialogHeader.waitFor({ state: "visible", timeout: 8_000 });

          // The concept-list section heading must be present — this confirms the
          // modal took the concepts.length >= 1 branch (not the empty-state path).
          const conceptHeading = page.getByText(
            "Top IAP library concepts driving this metric",
            { exact: false },
          );
          await conceptHeading.waitFor({ state: "visible", timeout: 5_000 });

          // Both injected concept names must appear as rows in the list.
          const bodyText = (await page.locator("body").textContent()) ?? "";
          assert(
            bodyText.includes("Concept Alpha"),
            `MetricDiagnosticModal (spend) must show "Concept Alpha" in concept list. ` +
              `Body text did not contain it.`,
          );
          assert(
            bodyText.includes("Concept Beta"),
            `MetricDiagnosticModal (spend) must show "Concept Beta" in concept list. ` +
              `Body text did not contain it.`,
          );

          // Confirm ≥2 concept-row buttons are rendered inside the modal dialog.
          const dialog = page.locator('[role="dialog"]');
          const conceptRows = dialog.locator('button').filter({ hasText: /Concept/ });
          const rowCount = await conceptRows.count();
          assert(
            rowCount >= 2,
            `MetricDiagnosticModal (spend) must render ≥2 concept rows, got ${rowCount}.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 11: MetricDiagnosticModal concept list — result-event metric ────
    // Same flow as Test 10 but uses the "Mobile app installs" result-event tile.
    // The modal scopes concepts via topConceptsForMetric() with isResultEvent=true,
    // filtering by eventKey — a different code path from standard metrics.
    await test(
      'MetricDiagnosticModal: result-event metric (Mobile app installs) shows ≥2 concept rows',
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

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Hover the result-event tile.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Mobile app installs" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Click "Diagnose full breakdown" to open the modal.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          // Wait for the modal to open.
          const dialogHeader = page.getByText("Metric diagnostic", { exact: false });
          await dialogHeader.waitFor({ state: "visible", timeout: 8_000 });

          // The concept-list heading must be present.
          const conceptHeading = page.getByText(
            "Top IAP library concepts driving this metric",
            { exact: false },
          );
          await conceptHeading.waitFor({ state: "visible", timeout: 5_000 });

          // Both injected concept names must appear.
          const bodyText = (await page.locator("body").textContent()) ?? "";
          assert(
            bodyText.includes("Concept Alpha"),
            `MetricDiagnosticModal (result-event) must show "Concept Alpha" in concept list. ` +
              `Body text did not contain it.`,
          );
          assert(
            bodyText.includes("Concept Beta"),
            `MetricDiagnosticModal (result-event) must show "Concept Beta" in concept list. ` +
              `Body text did not contain it.`,
          );

          // Confirm ≥2 concept-row buttons are rendered inside the modal dialog.
          const dialog = page.locator('[role="dialog"]');
          const conceptRows = dialog.locator('button').filter({ hasText: /Concept/ });
          const rowCount = await conceptRows.count();
          assert(
            rowCount >= 2,
            `MetricDiagnosticModal (result-event) must render ≥2 concept rows, got ${rowCount}.`,
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 12: SegmentGridModal opens and renders ≥1 segment row ────────────
    // Opens MetricDiagnosticModal for the "Total spend" standard metric and
    // then clicks the "Avatar × placement breakdown" drilldown button. Asserts
    // that SegmentGridModal opens and renders at least one avatar segment row.
    // The bookster fixture ships with 62 demographic rows (18 unique age×gender
    // combos) so avatars.length will be > 0 without any synthetic injection.
    // Catches regressions in SegmentGridModal's data-mapping, empty-cell
    // handling, or the avatar-segment pivot that would otherwise render silently
    // empty.
    await test(
      "SegmentGridModal: 'Avatar × placement breakdown' opens and renders ≥1 segment row",
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

          // Hover the "Total spend" tile to open the hover popover.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Total spend" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Click "Diagnose full breakdown" to open MetricDiagnosticModal.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          // Wait for MetricDiagnosticModal to open.
          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // The "Avatar × placement breakdown" button must be present for a
          // non-result-event metric (scope="account", analysis present,
          // !metric.isResultEvent branch in MetricDiagnosticModal.tsx).
          // Use getByRole("button") to avoid matching the dialog description
          // text which also contains "avatar × placement breakdown" as a phrase.
          const segmentBtn = page.getByRole("button", {
            name: "Avatar × placement breakdown",
          });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });

          // Click the drilldown button to open SegmentGridModal.
          await segmentBtn.click();

          // SegmentGridModal renders a Dialog whose title is
          // "{metric.label} — avatar × placement".
          const segmentTitle = page.getByText(
            "Total spend — avatar × placement",
            { exact: false },
          );
          await segmentTitle.waitFor({ state: "visible", timeout: 8_000 });

          // The bookster fixture has 18 unique avatar segments
          // (age × gender combos).  Confirm at least one segment row is
          // rendered — any age-group label is a reliable DOM signal.
          // SegmentGridModal renders each row's age in a <div> inside <td>.
          const bodyText = (await page.locator("body").textContent()) ?? "";
          const hasSegmentRows =
            bodyText.includes("25-34") ||
            bodyText.includes("18-24") ||
            bodyText.includes("35-44") ||
            bodyText.includes("45-54");
          assert(
            hasSegmentRows,
            "SegmentGridModal must render at least one avatar segment row " +
              "(age-group label not found in page text — grid may be empty).",
          );

          // Confirm the "All avatars" placement-marginal footer row is also
          // present — it renders whenever avatars.length > 0.
          assert(
            bodyText.includes("All avatars"),
            'SegmentGridModal must render the "All avatars" placement-marginal ' +
              "footer row when avatar segments exist.",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 13a: SegmentGridModal placement marginals — spend metric ─────────
    // Opens SegmentGridModal via the "Total spend" tile (default tile, no
    // localStorage override needed).  Asserts:
    //   • "All avatars" placement-marginal row is present (sub-label visible)
    //   • Placement cells show dollar values (spend = usd(t.spend, 0)) rather
    //     than the "—" sentinel that would appear if metricValueForSegment()
    //     hit an unhandled branch.
    // The bookster fixture ships 19 v3 + 19 c4e placement rows so topPlacements()
    // will always return columns with non-zero spend.
    await test(
      "SegmentGridModal placement marginals — spend metric shows dollar values in 'All avatars' row",
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

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Hover the "Total spend" tile.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Total spend" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Open MetricDiagnosticModal via the footer link.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // Open SegmentGridModal via the drilldown button.
          const segmentBtn = page.getByRole("button", {
            name: "Avatar × placement breakdown",
          });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });
          await segmentBtn.click();

          // Wait for SegmentGridModal to open.
          const segmentTitle = page.getByText(
            "Total spend — avatar × placement",
            { exact: false },
          );
          await segmentTitle.waitFor({ state: "visible", timeout: 8_000 });

          // Locate the "All avatars" placement-marginal footer row inside the
          // dialog and read its full text content.
          const dialog = page.locator('[role="dialog"]').last();
          const allAvatarsRow = dialog
            .locator("tr")
            .filter({ hasText: "All avatars" });
          await allAvatarsRow.waitFor({ state: "visible", timeout: 5_000 });

          const rowText = (await allAvatarsRow.textContent()) ?? "";

          // Sub-label confirms we found the right row.
          assert(
            rowText.includes("placement marginals"),
            `"All avatars" row must contain the "placement marginals" sub-label. ` +
              `Row text: "${rowText}"`,
          );

          // For the spend metric, metricValueForSegment() returns usd(t.spend, 0)
          // which formats as "$X" or "$X,XXX".  The row must include at least one
          // dollar sign — a missing "$" means all placement cells rendered "—",
          // signalling a broken metricValueForSegment() branch.
          assert(
            rowText.includes("$"),
            `"All avatars" row for the spend metric must contain at least one dollar ` +
              `value in the placement cells. Row text: "${rowText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 13b: SegmentGridModal placement marginals — link_ctr metric ──────
    // Same flow as 13a but uses the "Link CTR" tile (another default tile so no
    // localStorage override needed).  Asserts:
    //   • "All avatars" placement-marginal row is present
    //   • Placement cells show percentage values (link_ctr = "X.XX%") rather than
    //     "—", which would indicate an unhandled switch case in metricValueForSegment().
    // The fixture placement rows carry both Link clicks and Impressions so the
    // link_ctr branch (impressions > 0 → percentage) should produce real values.
    await test(
      "SegmentGridModal placement marginals — link_ctr metric shows percentage values in 'All avatars' row",
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

          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Hover the "Link CTR" tile.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Link CTR" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Open MetricDiagnosticModal.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // Open SegmentGridModal via the drilldown button.
          const segmentBtn = page.getByRole("button", {
            name: "Avatar × placement breakdown",
          });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });
          await segmentBtn.click();

          // Wait for SegmentGridModal to open — title will include the metric label.
          const segmentTitle = page.getByText(
            "Link CTR — avatar × placement",
            { exact: false },
          );
          await segmentTitle.waitFor({ state: "visible", timeout: 8_000 });

          // Locate the "All avatars" placement-marginal footer row inside the
          // SegmentGridModal dialog (use `.last()` because MetricDiagnosticModal
          // may still be stacked behind it as a second dialog).
          const dialog = page.locator('[role="dialog"]').last();
          const allAvatarsRow = dialog
            .locator("tr")
            .filter({ hasText: "All avatars" });
          await allAvatarsRow.waitFor({ state: "visible", timeout: 5_000 });

          const rowText = (await allAvatarsRow.textContent()) ?? "";

          // Sub-label confirms we found the right row.
          assert(
            rowText.includes("placement marginals"),
            `"All avatars" row must contain the "placement marginals" sub-label. ` +
              `Row text: "${rowText}"`,
          );

          // For the link_ctr metric, metricValueForSegment() computes
          // (linkClicks / impressions) * 100 and formats as "X.XX%".  At least
          // one placement cell must show a "%" — if all cells show "—" the
          // switch case is broken or the arithmetic produced null unexpectedly.
          assert(
            rowText.includes("%"),
            `"All avatars" row for the link_ctr metric must contain at least one ` +
              `percentage value in the placement cells. Row text: "${rowText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 13: result-event guard — drilldown button absent ─────────────────
    // For result-event metrics (isResultEvent=true) MetricDiagnosticModal
    // replaces the "Avatar × placement breakdown" button with an info notice
    // explaining why the breakdown is unavailable.  This test confirms the
    // guard works: the button must not appear, and the info notice must.
    await test(
      "MetricDiagnosticModal: 'Avatar × placement breakdown' button absent for result-event metric",
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

          // Wait for the metric grid.
          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Hover the result-event tile.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Mobile app installs" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Click "Diagnose full breakdown" to open MetricDiagnosticModal.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          // Wait for the modal.
          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // The drilldown button must NOT be present for a result-event metric.
          // Use getByRole("button") to target only the interactive button, not
          // any dialog description text that mentions the same phrase.
          const segmentBtnCount = await page
            .getByRole("button", { name: "Avatar × placement breakdown" })
            .count();
          assert(
            segmentBtnCount === 0,
            `"Avatar × placement breakdown" button must be absent for a result-event metric, ` +
              `but ${segmentBtnCount} instance(s) were found.`,
          );

          // The result-event info notice must be shown instead.
          const bodyText = (await page.locator("body").textContent()) ?? "";
          assert(
            bodyText.includes(
              "Avatar × placement breakdown isn't available for",
            ),
            'The result-event info notice ("Avatar × placement breakdown isn\'t available for") ' +
              "must appear in place of the drilldown button.",
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 14: SegmentGridModal empty-state when demographic_registration_signal is [] ──
    // Builds a seed where demographic_registration_signal is an empty array so
    // buildAvatarSegments() returns [] and avatars.length === 0.  The modal must
    // render the "No demographic rows for this selection" message and must NOT
    // render the grid table.  Catches regressions in the empty-state branch
    // (wrong message text, missing container, or a JS crash on zero rows).
    await test(
      "SegmentGridModal: empty-state renders when no demographic rows exist",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          // Build a seed with:
          //   • 3 concept rows so MetricDiagnosticModal shows the full body
          //     (metric.value non-null) and renders the "Avatar × placement
          //     breakdown" drilldown button.
          //   • demographic_registration_signal: [] so SegmentGridModal takes
          //     the empty-state branch (avatars.length === 0).
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

          // Wait for the metric grid.
          await page
            .getByText("Account Totals", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

          // Hover the "Total spend" tile to open the hover popover.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Total spend" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Click "Diagnose full breakdown" to open MetricDiagnosticModal.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          // Wait for MetricDiagnosticModal to open.
          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // Click the "Avatar × placement breakdown" drilldown button to open
          // SegmentGridModal with the empty demographic signal.
          const segmentBtn = page.getByRole("button", {
            name: "Avatar × placement breakdown",
          });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });
          await segmentBtn.click();

          // SegmentGridModal's dialog title must appear — confirms the modal
          // opened and did not crash on zero rows.
          const segmentTitle = page.getByText(
            "Total spend — avatar × placement",
            { exact: false },
          );
          await segmentTitle.waitFor({ state: "visible", timeout: 8_000 });

          // The empty-state message must be visible.
          const emptyMsg = page.getByText(
            "No demographic rows for this selection",
            { exact: false },
          );
          await emptyMsg.waitFor({ state: "visible", timeout: 5_000 });

          const bodyText = (await page.locator("body").textContent()) ?? "";
          assert(
            bodyText.includes("No demographic rows for this selection"),
            'SegmentGridModal empty-state must show "No demographic rows for this selection".',
          );

          // The grid table must NOT be rendered in the empty-state branch.
          // SegmentGridModal's table contains the "Avatar segment" column header.
          assert(
            !bodyText.includes("Avatar segment"),
            'SegmentGridModal must not render the grid table ("Avatar segment" header) ' +
              "when avatars.length === 0.",
          );
        } finally {
          await ctx.close();
        }
      },
    );
    // ── Test 15a: SegmentGridModal avatar blended column — impressions metric ──
    // Opens SegmentGridModal for the "Impressions" default tile and asserts:
    //   • The "Blended" column header is visible in the dialog.
    //   • The first avatar-segment row's blended cell shows a non-empty
    //     formatted integer (num(t.impressions)) rather than "—", catching
    //     any silent regression in the impressions case of metricValueForSegment().
    // The bookster fixture has 62 demographic rows so at least one avatar
    // segment exists and the grid table is rendered.
    await test(
      "SegmentGridModal avatar blended column — impressions metric shows a numeric value",
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

          // Hover the "Impressions" tile to open the hover popover.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Impressions" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Open MetricDiagnosticModal via the footer link.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // Click "Avatar × placement breakdown" to open SegmentGridModal.
          const segmentBtn = page.getByRole("button", {
            name: "Avatar × placement breakdown",
          });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });
          await segmentBtn.click();

          // Wait for SegmentGridModal — title includes the metric label.
          const segmentTitle = page.getByText(
            "Impressions — avatar × placement",
            { exact: false },
          );
          await segmentTitle.waitFor({ state: "visible", timeout: 8_000 });

          const dialog = page.locator('[role="dialog"]').last();

          // "Blended" column header must be visible in the modal.
          const blendedHeader = dialog.locator("th").filter({ hasText: "Blended" });
          await blendedHeader.waitFor({ state: "visible", timeout: 5_000 });
          const blendedHeaderText = (await blendedHeader.textContent()) ?? "";
          assert(
            blendedHeaderText.includes("Blended"),
            `SegmentGridModal must render a "Blended" column header for the ` +
              `impressions metric. Got: "${blendedHeaderText}"`,
          );

          // First avatar-segment row (not the "All avatars" footer) — its last
          // <td> is the blended cell.  metricValueForSegment(impressions) calls
          // num(t.impressions), which returns a formatted integer.  The cell's
          // textContent is "{display} {metricLabel}\n{spend} · {results} res",
          // so "Impressions" (the metric label) must appear AND the display must
          // not be the "—" sentinel value.
          const firstAvatarRow = dialog.locator("tbody tr").first();
          await firstAvatarRow.waitFor({ state: "visible", timeout: 5_000 });
          const blendedCell = firstAvatarRow.locator("td").last();
          const cellText = (await blendedCell.textContent()) ?? "";

          assert(
            cellText.includes("Impressions"),
            `First avatar row's blended cell must contain the metric label ` +
              `"Impressions". Got: "${cellText}"`,
          );
          // The blended display value must not be the "—" sentinel — that would
          // indicate metricValueForSegment() returned null for a non-null segment.
          assert(
            !cellText.startsWith("—"),
            `First avatar row's blended cell must not show "—" for the ` +
              `impressions metric (impressions > 0 should yield a real number). ` +
              `Got: "${cellText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 15b: SegmentGridModal avatar blended column — link_clicks metric ──
    // Same as 15a but for the "Link clicks" default tile, which exercises the
    // link_clicks case of metricValueForSegment() (num(t.linkClicks)).
    await test(
      "SegmentGridModal avatar blended column — link_clicks metric shows a numeric value",
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

          // Hover the "Link clicks" tile.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "Link clicks" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Open MetricDiagnosticModal.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // Open SegmentGridModal.
          const segmentBtn = page.getByRole("button", {
            name: "Avatar × placement breakdown",
          });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });
          await segmentBtn.click();

          const segmentTitle = page.getByText(
            "Link clicks — avatar × placement",
            { exact: false },
          );
          await segmentTitle.waitFor({ state: "visible", timeout: 8_000 });

          const dialog = page.locator('[role="dialog"]').last();

          // "Blended" column header must be visible.
          const blendedHeader = dialog.locator("th").filter({ hasText: "Blended" });
          await blendedHeader.waitFor({ state: "visible", timeout: 5_000 });
          const blendedHeaderText = (await blendedHeader.textContent()) ?? "";
          assert(
            blendedHeaderText.includes("Blended"),
            `SegmentGridModal must render a "Blended" column header for the ` +
              `link_clicks metric. Got: "${blendedHeaderText}"`,
          );

          // First avatar-segment row — blended cell must contain the metric
          // label "Link clicks" and must not show the "—" sentinel value.
          // metricValueForSegment(link_clicks) calls num(t.linkClicks) which
          // produces a positive integer for any row with link click data.
          const firstAvatarRow = dialog.locator("tbody tr").first();
          await firstAvatarRow.waitFor({ state: "visible", timeout: 5_000 });
          const blendedCell = firstAvatarRow.locator("td").last();
          const cellText = (await blendedCell.textContent()) ?? "";

          assert(
            cellText.includes("Link clicks"),
            `First avatar row's blended cell must contain the metric label ` +
              `"Link clicks". Got: "${cellText}"`,
          );
          assert(
            !cellText.startsWith("—"),
            `First avatar row's blended cell must not show "—" for the ` +
              `link_clicks metric (linkClicks > 0 should yield a real number). ` +
              `Got: "${cellText}"`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 15c: SegmentGridModal avatar blended column — cpa_blended metric ──
    // Opens SegmentGridModal for the "CPA (blended)" tile.  The blended column
    // for each avatar segment runs metricValueForSegment(cpa_blended) which
    // computes spend / results and formats as a dollar value (usd(v)).
    // Asserts:
    //   • "Blended" column header is present.
    //   • The first avatar-segment row's blended cell starts with "$" (a dollar-
    //     formatted value), not "—" (which would signal null results or a bug).
    await test(
      "SegmentGridModal avatar blended column — cpa_blended metric shows a dollar value",
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

          // Hover the "CPA (blended)" tile.
          const tileBtn = page
            .locator("button")
            .filter({ hasText: "CPA (blended)" })
            .first();
          await tileBtn.waitFor({ state: "visible", timeout: 8_000 });
          await tileBtn.hover();

          // Open MetricDiagnosticModal.
          const diagnoseBtn = page.getByText("Diagnose full breakdown");
          await diagnoseBtn.waitFor({ state: "visible", timeout: 5_000 });
          await diagnoseBtn.click();

          const diagnosticHeader = page.getByText("Metric diagnostic", {
            exact: false,
          });
          await diagnosticHeader.waitFor({ state: "visible", timeout: 8_000 });

          // Open SegmentGridModal.
          const segmentBtn = page.getByRole("button", {
            name: "Avatar × placement breakdown",
          });
          await segmentBtn.waitFor({ state: "visible", timeout: 5_000 });
          await segmentBtn.click();

          const segmentTitle = page.getByText(
            "CPA (blended) — avatar × placement",
            { exact: false },
          );
          await segmentTitle.waitFor({ state: "visible", timeout: 8_000 });

          const dialog = page.locator('[role="dialog"]').last();

          // "Blended" column header must be visible.
          const blendedHeader = dialog.locator("th").filter({ hasText: "Blended" });
          await blendedHeader.waitFor({ state: "visible", timeout: 5_000 });
          const blendedHeaderText = (await blendedHeader.textContent()) ?? "";
          assert(
            blendedHeaderText.includes("Blended"),
            `SegmentGridModal must render a "Blended" column header for the ` +
              `cpa_blended metric. Got: "${blendedHeaderText}"`,
          );

          // First avatar-segment row — blended cell must contain the metric
          // label "CPA (blended)" and the display value must start with "$".
          // metricValueForSegment(cpa_blended) computes spend / results via
          // usd(v).  The bookster demographic rows have Results > 0 so the
          // CPA formula yields a real dollar value for every avatar segment.
          const firstAvatarRow = dialog.locator("tbody tr").first();
          await firstAvatarRow.waitFor({ state: "visible", timeout: 5_000 });
          const blendedCell = firstAvatarRow.locator("td").last();
          const cellText = (await blendedCell.textContent()) ?? "";

          assert(
            cellText.includes("CPA (blended)"),
            `First avatar row's blended cell must contain the metric label ` +
              `"CPA (blended)". Got: "${cellText}"`,
          );
          // The dollar sign "$" must appear as the first character of the
          // blended display value (usd() output) — if "$" is absent at the
          // start, blended.display is either "—" (null results) or a wrong format.
          assert(
            cellText.startsWith("$"),
            `First avatar row's blended cell must start with "$" for the ` +
              `cpa_blended metric (usd() format). Got: "${cellText}"`,
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
          await page.goto(`${BASE}/app/mst/crossmap?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });

          // Wait for the crossmap table to render — the "Matrix cell" column
          // header confirms the table is mounted and data has loaded.
          await page
            .getByText("Matrix cell", { exact: false })
            .waitFor({ state: "visible", timeout: 20_000 });

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
