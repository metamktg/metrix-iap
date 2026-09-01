// End-to-end failure injection: what the app does when the data service breaks.
//
// Every other spec in this directory mocks the API to SUCCEED and then checks
// a feature. This one does the opposite: it holds the feature fixed and breaks
// the transport, because the states a user hits when something is down are the
// ones that have never been exercised in a browser.
//
// Four failures, each a real production shape rather than an invented one:
//
//   1. The seed is unreachable at boot (503) — Supabase down, which
//      replit.md documents as an explicit 503 with no static fallback.
//   2. The seed comes back as a truncated body — a connection cut mid-response.
//   3. A REFRESH fails after a good load. Sixteen mutation handlers invalidate
//      the seed query, so this is what a user gets when an upload, a rename, or
//      an analysis run settles against a service that has since gone away. It
//      is driven here through the real rename mutation, not a synthetic one.
//   4. Recovery: both the boot error's Retry and the staleness strip's Refresh
//      must actually bring the app back. Neither had ever been clicked in a test.
//
// Run: tsx tests/e2e/metrix-iap-failure-injection.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-failure-injection

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

const SETTINGS_URL = `${BASE}/app/settings/general?account=bookster`;
const BOOT_ERROR_TEXT = "Couldn't load Metrix data";

// ── harness ────────────────────────────────────────────────────────────────

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

type SeedMode = "ok" | "down" | "truncated" | "expired";

interface Harness {
  ctx: BrowserContext;
  page: Page;
  /** Change what the seed endpoint does from here on. */
  setSeed: (mode: SeedMode) => void;
  /** Make the session cookie stop being accepted, as a revoke would. */
  expireSession: () => void;
  /** How many times the app has asked for the seed. */
  seedCalls: () => number;
  /** Uncaught page errors seen so far — a blank screen usually leaves one. */
  jsErrors: string[];
  close: () => Promise<void>;
}

/**
 * A signed-in browser whose seed endpoint can be broken on demand.
 *
 * The seed route is registered ONCE and reads a mutable mode, rather than
 * being re-registered per phase: Playwright resolves overlapping routes by
 * registration order, and a test that depends on that ordering is a test that
 * breaks for reasons unrelated to the app.
 */
async function openApp(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<Harness> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));

  let mode: SeedMode = "ok";
  let sessionValid = true;
  let calls = 0;

  await ctx.route("**/api/metrix/auth/me", (route) => {
    if (!sessionValid) {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Not logged in" }),
      });
    }
    return route.fulfill({
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
    });
  });

  await ctx.route("**/api/metrix/seed", (route) => {
    calls += 1;
    if (mode === "down") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Metrix data service unavailable" }),
      });
    }
    if (mode === "expired") {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Not logged in" }),
      });
    }
    if (mode === "truncated") {
      // A connection cut mid-body: valid JSON prefix, no closing brace.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: SEED_FIXTURE_BODY.slice(0, 4096),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: SEED_FIXTURE_BODY,
    });
  });

  // The rename mutation itself always succeeds — the failure under test is the
  // seed refresh it triggers, not the write.
  await ctx.route("**/api/metrix/accounts/*/name", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ account_id: "bookster", name: "Renamed in a smoke" }),
    }),
  );

  await ctx.route("**/api/metrix/workspaces/*/reports", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }),
  );
  await ctx.route("**/analysis/data-windows**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ windows: [] }) }),
  );
  await ctx.route("**/analysis/summary**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ totals: {}, concept_rows: [], placement_rows: [], demographic_rows: [] }),
    }),
  );

  return {
    ctx,
    page,
    setSeed: (next) => {
      mode = next;
    },
    expireSession: () => {
      sessionValid = false;
    },
    seedCalls: () => calls,
    jsErrors,
    close: () => ctx.close(),
  };
}

/** Wait for the settings page to have rendered its account-name card. */
async function waitForSettings(page: Page): Promise<void> {
  await page
    .getByTestId("input-account-name")
    .waitFor({ state: "visible", timeout: 30_000 });
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP failure injection e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── 1. Data service down at boot ─────────────────────────────────────
    await test("a 503 at boot shows the error screen, not a blank page", async () => {
      const h = await openApp(browser);
      try {
        h.setSeed("down");
        await h.page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
        await h.page.getByText(BOOT_ERROR_TEXT).waitFor({ state: "visible", timeout: 30_000 });

        const retry = h.page.getByRole("button", { name: /retry/i });
        assert(await retry.isVisible(), "expected a Retry button on the boot error screen");
        assert(
          !(await h.page.getByTestId("input-account-name").isVisible().catch(() => false)),
          "the app rendered its content on top of a failed boot",
        );
      } finally {
        await h.close();
      }
    });

    // ── 2. Retry after the service comes back ────────────────────────────
    await test("Retry on the boot error screen recovers the app", async () => {
      const h = await openApp(browser);
      try {
        h.setSeed("down");
        await h.page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
        await h.page.getByText(BOOT_ERROR_TEXT).waitFor({ state: "visible", timeout: 30_000 });
        const before = h.seedCalls();

        h.setSeed("ok");
        await h.page.getByRole("button", { name: /retry/i }).click();

        await waitForSettings(h.page);
        assert(
          h.seedCalls() > before,
          "Retry did not re-request the seed — the button is decorative",
        );
        assert(
          !(await h.page.getByText(BOOT_ERROR_TEXT).isVisible().catch(() => false)),
          "the error screen stayed up after a successful retry",
        );
      } finally {
        await h.close();
      }
    });

    // ── 3. Truncated response body ───────────────────────────────────────
    await test("a truncated seed body fails to the error screen without crashing", async () => {
      const h = await openApp(browser);
      try {
        h.setSeed("truncated");
        await h.page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
        await h.page.getByText(BOOT_ERROR_TEXT).waitFor({ state: "visible", timeout: 30_000 });
        // A parse failure must be handled as a failed request, not surface as
        // an uncaught exception with a white screen behind it.
        assert(
          h.jsErrors.length === 0,
          `uncaught page errors on a truncated body: ${h.jsErrors.join("; ")}`,
        );
      } finally {
        await h.close();
      }
    });

    // ── 4. A refresh fails after a good load ─────────────────────────────
    await test("a failed refresh keeps the dashboard and says the data is stale", async () => {
      const h = await openApp(browser);
      try {
        await h.page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
        await waitForSettings(h.page);

        // Break the service, then perform a real mutation. Its onSuccess
        // invalidates the seed query, which is what makes the app refetch.
        h.setSeed("down");
        const input = h.page.getByTestId("input-account-name");
        await input.fill("Renamed in a smoke");
        await h.page.getByTestId("button-save-account-name").click();

        const strip = h.page.getByTestId("seed-refresh-failed");
        await strip.waitFor({ state: "visible", timeout: 15_000 });

        assert(
          (await strip.textContent())?.includes("Showing the last data that loaded") === true,
          "the staleness strip does not say what it means",
        );
        assert(
          await h.page.getByTestId("input-account-name").isVisible(),
          "the page was thrown away even though the app still had a bundle to render",
        );
        assert(
          !(await h.page.getByText(BOOT_ERROR_TEXT).isVisible().catch(() => false)),
          "a failed REFRESH took over the screen with the boot error",
        );
      } finally {
        await h.close();
      }
    });

    // ── 5. Recovering from the stale state ───────────────────────────────
    await test("Refresh on the staleness strip clears it once the service returns", async () => {
      const h = await openApp(browser);
      try {
        await h.page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
        await waitForSettings(h.page);

        h.setSeed("down");
        await h.page.getByTestId("input-account-name").fill("Renamed in a smoke");
        await h.page.getByTestId("button-save-account-name").click();

        const strip = h.page.getByTestId("seed-refresh-failed");
        await strip.waitFor({ state: "visible", timeout: 15_000 });

        h.setSeed("ok");
        await strip.getByRole("button").click();
        await strip.waitFor({ state: "detached", timeout: 15_000 });

        assert(
          await h.page.getByTestId("input-account-name").isVisible(),
          "the page did not survive the recovery",
        );
      } finally {
        await h.close();
      }
    });
    // ── 6. The session is revoked while the tab is open ──────────────────
    await test("a revoked session sends the user to the login page, not the stale strip", async () => {
      // Changing a password revokes every other session, so a second tab keeps
      // looking signed in until its next seed request comes back 401. That is
      // neither a data outage nor stale data: the only screen that resolves it
      // is the login page.
      const h = await openApp(browser);
      try {
        await h.page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
        await waitForSettings(h.page);

        h.setSeed("expired");
        h.expireSession();
        await h.page.getByTestId("input-account-name").fill("Renamed in a smoke");
        await h.page.getByTestId("button-save-account-name").click();

        await h.page.getByTestId("form-login").waitFor({ state: "visible", timeout: 20_000 });
        assert(
          !(await h.page.getByTestId("seed-refresh-failed").isVisible().catch(() => false)),
          "the user was left on a staleness strip they can never clear",
        );
      } finally {
        await h.close();
      }
    });
  } finally {
    await browser.close();
  }

  console.log(`\n${passed + failed} test(s): ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal error running failure injection e2e:", err);
  process.exit(1);
});
