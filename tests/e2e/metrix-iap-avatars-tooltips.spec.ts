// End-to-end Playwright tests for Avatars page (Strategy · 04) tooltips.
//
// Covers:
//   1. Audience segment "low signal / signal ✓" badge — hover shows the
//      rationale tooltip, sr-only rationale text is present in the DOM, and
//      the badge is a plain <span> (no nested-interactive violation).
//   2. ICP card "Account placements" accordion button — hover shows its
//      tooltip AND clicking still toggles the placement rows open/closed.
//   3. Avatar detail drawer matched-ads cell-code chips — chips are plain
//      <span>s with sr-only "matrix cell" text, hover shows the tooltip,
//      and chips contain no interactive descendants.
//
// A regression (broken Tooltip wiring, badge turned into a button, sr-only
// text removed) would silently hide the signal rationale — this catches it.
//
// Keyboard-focus coverage & decision (task: keyboard tooltips):
//   4. The placements accordion button is reached via Tab and its tooltip
//      opens on keyboard focus (Radix opens tooltips on focus for focusable
//      triggers).
//   5. DECISION: the signal badge and cell-code chips stay plain,
//      NON-focusable <span>s (no tabindex=0). They are static/informational
//      content, not interactive controls; adding tab stops to static text
//      degrades keyboard navigation (WAI-ARIA: don't put tabindex on
//      non-interactive elements), and screen-reader users already get the
//      full rationale via the always-present sr-only text. A test asserts
//      the spans have no tabindex so a future change is deliberate.
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

    // Test 2: placements accordion — tooltip on hover AND still toggles.
    await test(
      "Account placements accordion: hover tooltip + toggle still works",
      async () => {
        const { ctx, page } = await newAvatarsPage(
          browser,
          ACCOUNT,
          "Audience segments",
        );
        try {
          // Switch to Profiles view where ICP cards (and the accordion) live.
          await page.getByRole("button", { name: "Profiles" }).click();
          const accordion = page
            .getByRole("button", { name: /Account placements/ })
            .first();
          await accordion.waitFor({ state: "visible", timeout: 10_000 });

          await hoverAndExpect(
            page,
            accordion,
            "Account-level placement signal — no per-profile breakdown available.",
            "placements accordion button",
          );

          // Toggle open: placement rows appear inside the accordion's
          // wrapper (the bookster fixture's top placement rows include a
          // "facebook"/"instagram" Platform label).
          const rowCount = () =>
            accordion.evaluate((el) => {
              // Radix Tooltip renders no wrapper element with asChild, so the
              // accordion's container is the button's direct parent <div>;
              // the row list renders as a sibling `.mt-2` div inside it.
              const wrapper = el.parentElement;
              return wrapper
                ? wrapper.querySelectorAll(":scope > .mt-2 > div").length
                : -1;
            });

          const before = await rowCount();
          assert(before === 0, `expected 0 placement rows before opening, got ${before}`);

          await accordion.click();
          await page.waitForTimeout(300);
          const after = await rowCount();
          assert(
            after > 0,
            "clicking the placements accordion did not reveal any placement rows",
          );

          // Toggle closed again.
          await accordion.click();
          await page.waitForTimeout(300);
          const closed = await rowCount();
          assert(
            closed === 0,
            `clicking the placements accordion again did not collapse it (${closed} rows remain)`,
          );
        } finally {
          await ctx.close();
        }
      },
    );

    // Test 3: drawer matched-ads cell-code chips — plain spans + sr-only + hover tooltip.
    await test(
      "Drawer matched-ads cell-code chips: plain spans, sr-only text, hover tooltip",
      async () => {
        const { ctx, page } = await newAvatarsPage(
          browser,
          ACCOUNT,
          "Audience segments",
        );
        try {
          // Open the first avatar card's detail drawer.
          await page
            .getByRole("button", { name: /tap for detail/ })
            .first()
            .click();
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

    // Test 4: keyboard focus — Tab reaches the placements accordion button
    // and its tooltip opens on focus (no mouse involved).
    await test(
      "Account placements accordion: tooltip opens on keyboard focus (Tab)",
      async () => {
        const { ctx, page } = await newAvatarsPage(
          browser,
          ACCOUNT,
          "Audience segments",
        );
        try {
          await page.getByRole("button", { name: "Profiles" }).click();
          const accordion = page
            .getByRole("button", { name: /Account placements/ })
            .first();
          await accordion.waitFor({ state: "visible", timeout: 10_000 });
          await accordion.scrollIntoViewIfNeeded();

          // The page has a long tab order, so instead of tabbing from the top
          // of the document, focus the focusable element immediately BEFORE
          // the accordion in DOM/tab order, then press Tab once. This still
          // verifies the accordion is reachable via a real keyboard Tab.
          const hasPrev = await accordion.evaluate((el) => {
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
          assert(hasPrev, "could not find a focusable element before the accordion");
          await page.keyboard.press("Tab");
          const reached = await accordion.evaluate(
            (el) => el === document.activeElement,
          );
          assert(
            reached,
            "pressing Tab from the preceding focusable did not land on the placements accordion button",
          );

          // Radix opens tooltips immediately on keyboard focus.
          await page.waitForTimeout(400);
          const tooltips = page.locator('[role="tooltip"]');
          const count = await tooltips.count();
          assert(
            count > 0,
            "no [role=tooltip] appeared after keyboard-focusing the placements accordion",
          );
          let text = "";
          for (let i = 0; i < count; i++) {
            text += (await tooltips.nth(i).textContent()) ?? "";
          }
          assert(
            text.includes(
              "Account-level placement signal — no per-profile breakdown available.",
            ),
            `focus tooltip text "${text}" did not contain the expected placements copy`,
          );

          // Enter still toggles the accordion open while focused.
          await page.keyboard.press("Enter");
          await page.waitForTimeout(300);
          const rows = await accordion.evaluate((el) => {
            const wrapper = el.parentElement;
            return wrapper
              ? wrapper.querySelectorAll(":scope > .mt-2 > div").length
              : -1;
          });
          assert(
            rows > 0,
            "pressing Enter on the focused placements accordion did not open it",
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
