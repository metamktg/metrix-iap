// End-to-end Playwright tests for Avatars page (Strategy · 04) tooltips,
// plus the avatar-tile detail drawer that now lives on MST Command Center
// (/app/mst — the matrix-avatar tile grid moved there; see
// MstCommandCenter.tsx's top-of-file note).
//
// Covers:
//   1. Audience segment "low signal / signal ✓" badge — hover shows the
//      rationale tooltip, sr-only rationale text is present in the DOM, and
//      the badge is a plain <span> (no nested-interactive violation).
//   2. ICP card "Profile detail" toggle reveals placements; the
//      "Account placements" label inside carries a hover-tooltip disclosure
//      (this data is account-wide, not scoped to the individual profile)
//      with sr-only text for screen readers.
//   3. MST Command Center avatar-tile detail drawer matched-ads cell-code
//      chips — chips are plain <span>s with sr-only "matrix cell" text,
//      hover shows the tooltip, and chips contain no interactive
//      descendants.
//
// A regression (broken Tooltip wiring, badge turned into a button, sr-only
// text removed) would silently hide the signal rationale — this catches it.
//
// Keyboard-focus coverage & decision (task: keyboard tooltips):
//   4. The "Profile detail" toggle button is reachable via Tab, and
//      Enter/Space still opens and closes it.
//   5. DECISION: the signal badge and cell-code chips stay plain,
//      NON-focusable <span>s (no tabindex=0). They are static/informational
//      content, not interactive controls; adding tab stops to static text
//      degrades keyboard navigation (WAI-ARIA: don't put tabindex on
//      non-interactive elements), and screen-reader users already get the
//      full rationale via the always-present sr-only text. A test asserts
//      the spans have no tabindex so a future change is deliberate. The
//      "Account placements" disclosure label follows the same decision.
//
// Run: tsx tests/e2e/metrix-iap-avatars-tooltips.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-avatars-tooltips

import { chromium } from "playwright-core";
import type { BrowserContext, Page } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname_local, "../..");

const BASE = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

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

  await page.route("**/api/metrix/ad-accounts/*/analysis/summary*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );

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

async function newAvatarsPage(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  account: string,
  waitText: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await mockApis(ctx);
  await page.goto(`${BASE}/app/strategy/avatars?account=${account}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator("h3, h2, span, p")
    .filter({ hasText: new RegExp(waitText, "i") })
    .first()
    .waitFor({ state: "visible", timeout: 25_000 });
  return { ctx, page };
}

/** Hover an element and assert `expectedText` appears in the body afterwards. */
async function hoverAndExpect(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  expectedText: string,
  description: string,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator.hover({ force: true });
  // Radix delayDuration is 150 ms on this page; allow render time too.
  await page.waitForTimeout(700);
  // Assert specifically on the rendered tooltip portal ([role=tooltip]) so
  // permanently-present sr-only text cannot mask broken tooltip wiring.
  const tooltips = page.locator('[role="tooltip"]');
  const count = await tooltips.count();
  assert(
    count > 0,
    `No [role="tooltip"] element appeared after hovering ${description}. ` +
      `The Tooltip wiring (Provider/Trigger/Content) may be broken.`,
  );
  let tooltipText = "";
  for (let i = 0; i < count; i++) {
    tooltipText += (await tooltips.nth(i).textContent()) ?? "";
  }
  assert(
    tooltipText.includes(expectedText),
    `Tooltip appeared after hovering ${description}, but its text "${tooltipText}" ` +
      `did not contain the expected "${expectedText}".`,
  );
  // Dismiss before further interactions.
  await page.mouse.move(10, 10);
  await page.waitForTimeout(200);
}

// ── main ───────────────────────────────────────────────────────────────────

const ACCOUNT = "bookster";

async function main() {
  console.log(`\nMetrix IAP Avatars tooltips e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // Test 1: segment signal badge — tooltip on hover + sr-only rationale + plain span.
    await test(
      "Audience segment signal badge: hover tooltip, sr-only rationale, plain <span>",
      async () => {
        const { ctx, page } = await newAvatarsPage(
          browser,
          ACCOUNT,
          "Audience segments",
        );
        try {
          const badge = page
            .locator("span")
            .filter({ hasText: /^(low signal|signal ✓)/ })
            .first();
          await badge.waitFor({ state: "visible", timeout: 10_000 });

          // Structural checks: plain span, not inside/containing a button.
          const info = await badge.evaluate((el) => ({
            tag: el.tagName,
            insideInteractive: !!el.closest("button, a, [role='button']"),
            containsInteractive: !!el.querySelector(
              "button, a, [role='button'], input",
            ),
            srOnlyText:
              el.querySelector(".sr-only")?.textContent?.trim() ?? null,
          }));
          assert(info.tag === "SPAN", `badge must be a <span>, got <${info.tag}>`);
          assert(
            !info.insideInteractive,
            "badge must not be nested inside an interactive element",
          );
          assert(
            !info.containsInteractive,
            "badge must not contain interactive elements",
          );
          assert(
            info.srOnlyText != null && info.srOnlyText.length > 0,
            "badge must contain non-empty sr-only rationale text",
          );

          // Hover tooltip: text depends on signal state.
          const badgeText = (await badge.textContent()) ?? "";
          const expected = badgeText.includes("low signal")
            ? "" // low-signal reasons are data-dependent; fall through below
            : "Sufficient spend and impressions for a reliable read.";
          if (expected) {
            await hoverAndExpect(page, badge, expected, "signal badge");
          } else {
            // For low-signal badges, tooltip must show the same rationale as
            // the sr-only text (minus the " — " prefix).
            const rationale = info.srOnlyText!.replace(/^—\s*/, "").trim();
            assert(
              rationale.length > 0,
              "low-signal badge sr-only rationale is empty",
            );
            await hoverAndExpect(
              page,
              badge,
              rationale.slice(0, 40),
              "low-signal badge",
            );
          }
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 2: "Profile detail" toggle reveals placements; the "Account
    // placements" label inside carries a hover-tooltip disclosure.
    await test(
      "Profile detail toggle reveals placements; Account placements label discloses account-wide scope",
      async () => {
        const { ctx, page } = await newAvatarsPage(
          browser,
          ACCOUNT,
          "Audience segments",
        );
        try {
          const label = () =>
            page.locator("span").filter({ hasText: /^Account placements/ });

          // Closed by default: the placements section (inside the fold)
          // hasn't rendered yet.
          const closedCount = await label().count();
          assert(
            closedCount === 0,
            `expected the Account placements label to be absent before opening Profile detail, found ${closedCount}`,
          );

          const toggle = page.getByRole("button", { name: /Profile detail/ }).first();
          await toggle.waitFor({ state: "visible", timeout: 10_000 });
          await toggle.click();

          const openLabel = label().first();
          await openLabel.waitFor({ state: "visible", timeout: 10_000 });

          // Structural checks: plain span, not inside/containing a button.
          const info = await openLabel.evaluate((el) => ({
            tag: el.tagName,
            insideInteractive: !!el.closest("button, a, [role='button']"),
            containsInteractive: !!el.querySelector(
              "button, a, [role='button'], input",
            ),
            srOnlyText:
              el.querySelector(".sr-only")?.textContent?.trim() ?? null,
          }));
          assert(info.tag === "SPAN", `label must be a <span>, got <${info.tag}>`);
          assert(
            !info.insideInteractive,
            "label must not be nested inside an interactive element",
          );
          assert(
            !info.containsInteractive,
            "label must not contain interactive elements",
          );
          assert(
            info.srOnlyText != null && info.srOnlyText.length > 0,
            "label must contain non-empty sr-only disclosure text",
          );

          await hoverAndExpect(
            page,
            openLabel,
            "Account-level placement signal — no per-profile breakdown available.",
            "Account placements label",
          );

          // Toggle closed again — the label (and the rest of the fold)
          // disappears.
          await toggle.click();
          await page.waitForTimeout(300);
          const closedAgainCount = await label().count();
          assert(
            closedAgainCount === 0,
            `clicking Profile detail again did not collapse the placements section (${closedAgainCount} labels remain)`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 3: drawer matched-ads cell-code chips — plain spans + sr-only + hover tooltip.
    // The avatar tile + its detail drawer live on MST Command Center now.
    await test(
      "Drawer matched-ads cell-code chips: plain spans, sr-only text, hover tooltip",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await ctx.newPage();
        try {
          await mockApis(ctx);
          await page.goto(`${BASE}/app/mst?account=${ACCOUNT}`, {
            waitUntil: "domcontentloaded",
          });
          await page
            .locator("h3, h2, span, p")
            .filter({ hasText: /Matrix avatars/i })
            .first()
            .waitFor({ state: "visible", timeout: 25_000 });

          // Open the first avatar tile's detail drawer.
          await page.locator("button.group.w-full").first().click();
          await page
            .locator("text=/Matched ads/")
            .first()
            .waitFor({ state: "visible", timeout: 10_000 });

          // Cell-code chips: font-mono spans whose sr-only mentions "matrix cell".
          const chip = page
            .locator("span.font-mono", {
              has: page.locator(".sr-only", { hasText: /matrix cell/i }),
            })
            .first();
          await chip.waitFor({ state: "visible", timeout: 10_000 });

          const info = await chip.evaluate((el) => ({
            tag: el.tagName,
            role: el.getAttribute("role"),
            insideInteractive: !!el.closest("button, a, [role='button']"),
            containsInteractive: !!el.querySelector(
              "button, a, [role='button'], input",
            ),
          }));
          assert(info.tag === "SPAN", `chip must be a <span>, got <${info.tag}>`);
          assert(
            info.role !== "button",
            "chip must not have role=button (nested-interactive risk)",
          );
          assert(
            !info.insideInteractive,
            "chip must not be nested inside an interactive element",
          );
          assert(
            !info.containsInteractive,
            "chip must not contain interactive elements",
          );

          await hoverAndExpect(
            page,
            chip,
            "Matrix cell",
            "drawer cell-code chip",
          );

          // DECISION check: chips are static info, must NOT be focusable.
          const chipTabindex = await chip.evaluate((el) =>
            el.getAttribute("tabindex"),
          );
          assert(
            chipTabindex === null,
            `cell-code chip must not have tabindex (got "${chipTabindex}") — ` +
              "chips are static/informational; sr-only text covers screen readers",
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 4: keyboard focus — Tab reaches the "Profile detail" toggle
    // button, and Enter opens/closes it (no mouse involved).
    await test(
      "Profile detail toggle: reachable via Tab, Enter opens and closes it",
      async () => {
        const { ctx, page } = await newAvatarsPage(
          browser,
          ACCOUNT,
          "Audience segments",
        );
        try {
          const toggle = page.getByRole("button", { name: /Profile detail/ }).first();
          await toggle.waitFor({ state: "visible", timeout: 10_000 });
          await toggle.scrollIntoViewIfNeeded();

          // The page has a long tab order, so instead of tabbing from the top
          // of the document, focus the focusable element immediately BEFORE
          // the toggle in DOM/tab order, then press Tab once. This still
          // verifies the toggle is reachable via a real keyboard Tab.
          const hasPrev = await toggle.evaluate((el) => {
            const focusables = Array.from(
              document.querySelectorAll<HTMLElement>(
                "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
              ),
            ).filter((f) => !f.hasAttribute("disabled"));
            const idx = focusables.indexOf(el as HTMLElement);
            if (idx <= 0) return false;
            focusables[idx - 1]!.focus();
            return true;
          });
          assert(hasPrev, "could not find a focusable element before the Profile detail toggle");
          await page.keyboard.press("Tab");
          const reached = await toggle.evaluate(
            (el) => el === document.activeElement,
          );
          assert(
            reached,
            "pressing Tab from the preceding focusable did not land on the Profile detail toggle",
          );

          const label = () =>
            page.locator("span").filter({ hasText: /^Account placements/ });

          // Enter opens the fold while focused.
          await page.keyboard.press("Enter");
          await page.waitForTimeout(300);
          const openCount = await label().count();
          assert(
            openCount > 0,
            "pressing Enter on the focused Profile detail toggle did not open it",
          );

          // Enter again closes it.
          await page.keyboard.press("Enter");
          await page.waitForTimeout(300);
          const closedCount = await label().count();
          assert(
            closedCount === 0,
            `pressing Enter again did not collapse the Profile detail toggle (${closedCount} labels remain)`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 5: DECISION — signal badge span stays non-focusable (no tabindex).
    await test(
      "Signal badge: non-focusable plain span (no tabindex) by decision",
      async () => {
        const { ctx, page } = await newAvatarsPage(
          browser,
          ACCOUNT,
          "Audience segments",
        );
        try {
          const badge = page
            .locator("span")
            .filter({ hasText: /^(low signal|signal ✓)/ })
            .first();
          await badge.waitFor({ state: "visible", timeout: 10_000 });
          const tabindex = await badge.evaluate((el) =>
            el.getAttribute("tabindex"),
          );
          assert(
            tabindex === null,
            `signal badge must not have tabindex (got "${tabindex}") — ` +
              "static info; sr-only rationale covers screen readers. " +
              "If making badges focusable, do it deliberately and update this test.",
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
  console.error("\nFatal error running Avatars tooltips e2e tests:", err);
  process.exit(1);
});
