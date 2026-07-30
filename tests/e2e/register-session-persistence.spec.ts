// End-to-end Playwright test: session cookie set at registration persists
// across a hard page reload.
//
// Covers:
//   1. Registering a new account transitions the UI from the Create Account
//      form into the authenticated app shell (the login form disappears and
//      the authenticated "Page not found" shell is visible at /create-account).
//   2. After a hard page.reload() the app re-calls GET /api/metrix/auth/me
//      with the session cookie and still shows the authenticated shell — the
//      user is NOT redirected back to the login page.
//   3. Control group: without a cookie, reload keeps the login page visible.
//
// Cookie persistence is exercised end-to-end inside Playwright's real browser
// cookie jar.  The register endpoint mock returns a genuine Set-Cookie header;
// the auth/me mock inspects the Cookie request header on every call — exactly
// what the browser sends after a reload — making this a true behavioural test
// of browser cookie retention.
//
// The spec fails immediately if the page emits any uncaught runtime error,
// preventing a false-pass caused by a crashed (but login-form-absent) app.
//
// Run: tsx tests/e2e/register-session-persistence.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:register-session-persistence

import { chromium, type BrowserContext, type Page } from "playwright-core";

const BASE       = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

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

// ── mock setup ─────────────────────────────────────────────────────────────

// Unique token minted per test run — prevents cross-test cookie bleed.
const SESSION_TOKEN = `smoke-session-${Math.random().toString(36).slice(2, 10)}`;
const COOKIE_NAME   = "metrix_session";

const MOCK_USER = {
  email:                "e2e-register-test@example.com",
  role:                 "member",
  must_change_password: false,
  manage_team:          false,
  view_agency_rollups:  false,
  export_data:          false,
};

/**
 * Minimal valid seed payload.  AccountContext calls getManagerOverview(seed)
 * which reads seed.manager_account — it must not be undefined or the provider
 * throws "Cannot read properties of undefined (reading 'id')".  AdAccounts can
 * be an empty array; every other provider either guards on null or is not
 * reached on the /create-account → NotFound path.
 */
const MINIMAL_SEED = JSON.stringify({
  schema_version: "1.0",
  generated_at:   "2024-01-01T00:00:00.000Z",
  integrity_note: "smoke-test-seed",
  app_defaults: {
    initial_view:              "manager",
    active_manager_account_id: "smoke-manager",
    selected_ad_account_id:    null,
    navigation:                [],
    forbidden_ui_terms:        [],
    data_isolation_rule:       "",
  },
  manager_account: {
    id:                       "smoke-manager",
    name:                     "Smoke Test Agency",
    type:                     "agency",
    overview_mode:            "manager",
    configured_ad_accounts:   0,
    unconfigured_ad_accounts: 0,
    bottom_line_totals: {
      spend_usd:               0,
      impressions:             0,
      link_clicks:             0,
      link_ctr_pct:            null,
      result_totals_by_event:  {},
    },
    recommendation_cards: [],
  },
  ad_accounts: [],
});

/**
 * Wire up route intercepts for a fresh browser context:
 *
 *  POST /api/metrix/auth/register
 *    → 200 { user } + Set-Cookie: metrix_session=<token>; Path=/; HttpOnly; SameSite=Lax
 *      The Set-Cookie causes Playwright's browser to store the cookie in its
 *      jar so subsequent same-origin requests include it automatically.
 *
 *  GET  /api/metrix/auth/me
 *    → 200 { user }   when the request Cookie header carries the session token
 *    → 401            otherwise (app renders the login / pre-auth UI)
 *
 *  GET  /api/metrix/seed
 *    → 200 minimal valid seed bundle so AccountContext providers mount cleanly.
 *
 *  GET  /api/metrix/workspaces/**
 *    → 200 { reports: [] } — prevents report-list fetches from hanging.
 */
async function wireMocks(ctx: BrowserContext): Promise<void> {
  // auth/me — stateful: return user only when the session cookie is present.
  await ctx.route("**/api/metrix/auth/me", (route) => {
    const cookieHeader = route.request().headers()["cookie"] ?? "";
    const hasSession   = cookieHeader.includes(`${COOKIE_NAME}=${SESSION_TOKEN}`);
    if (hasSession) {
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ user: MOCK_USER }),
      });
    } else {
      route.fulfill({
        status:      401,
        contentType: "application/json",
        body:        JSON.stringify({ error: "Unauthorized" }),
      });
    }
  });

  // register — set the real session cookie in the browser's cookie jar.
  await ctx.route("**/api/metrix/auth/register", (route) => {
    route.fulfill({
      status:      200,
      contentType: "application/json",
      headers: {
        "Set-Cookie": `${COOKIE_NAME}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax`,
      },
      body: JSON.stringify({ user: MOCK_USER }),
    });
  });

  // seed — return a minimal valid bundle so MetrixDataProvider / AccountContext
  // mount without runtime errors (manager_account.id must not be undefined).
  await ctx.route("**/api/metrix/seed", (route) =>
    route.fulfill({
      status:      200,
      contentType: "application/json",
      body:        MINIMAL_SEED,
    }),
  );

  // workspace routes — empty responses prevent loader hangs.
  await ctx.route("**/api/metrix/workspaces/**", (route) =>
    route.fulfill({
      status:      200,
      contentType: "application/json",
      body:        JSON.stringify({ reports: [] }),
    }),
  );
}

/**
 * Attach a listener that throws (failing the test) on any uncaught runtime
 * error emitted by the page.  This prevents false-passes where a crashed app
 * tree has no login form but is also not rendering a healthy authenticated UI.
 */
function attachRuntimeErrorGuard(page: Page, errors: string[]): void {
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
}

/** Wait for the Create Account form (guards against the loading spinner). */
async function waitForCreateAccountPage(page: Page): Promise<void> {
  await page.locator('[data-testid="form-create-account"]').waitFor({
    state:   "visible",
    timeout: 15_000,
  });
}

/**
 * Asserts the user is in the authenticated app shell by checking:
 *  1. No login form is visible.
 *  2. No create-account form is visible.
 *  3. The authenticated route rendered a visible element — specifically the
 *     "Page not found" shell that Router renders for /create-account (a route
 *     that only exists inside the authenticated tree).  This is a POSITIVE
 *     signal that the authenticated shell is active: it is impossible to see
 *     this text on the login/create-account pre-auth screens.
 *  4. No uncaught runtime errors fired (checked via the pageerror guard).
 */
async function assertAuthenticatedShell(
  page: Page,
  errors: string[],
  label: string,
): Promise<void> {
  // Allow React a moment to finish any pending state flush.
  await page.waitForTimeout(800);

  // Fail immediately on any page-level exception — a crashed app tree
  // should not count as "authenticated".
  if (errors.length > 0) {
    throw new Error(
      `${label}: page threw ${errors.length} runtime error(s) — app may have crashed.\n` +
      errors.map((e) => `  • ${e}`).join("\n"),
    );
  }

  // ── Negative checks ──────────────────────────────────────────────────────
  const loginFormCount = await page.locator('[data-testid="form-login"]').count();
  assert(
    loginFormCount === 0,
    `${label}: login form is still in the DOM — user appears to have been signed out`,
  );

  const createAccountFormCount = await page
    .locator('[data-testid="form-create-account"]')
    .count();
  assert(
    createAccountFormCount === 0,
    `${label}: create-account form is still in the DOM — auth state was not updated`,
  );

  // ── Positive check ───────────────────────────────────────────────────────
  // After authentication the Router receives control of /create-account and
  // renders the NotFound component ("Page not found" / "This route does not
  // exist.").  This text can ONLY appear when the authenticated shell is
  // rendering — it is gated behind AuthGate → MetrixDataProvider → AppShell.
  const notFoundEl = page
    .locator("text=/page not found/i")
    .first();
  const notFoundVisible = await notFoundEl.isVisible();
  assert(
    notFoundVisible,
    `${label}: expected the authenticated app shell's "Page not found" to be visible ` +
    `at /create-account, but it was not — authenticated UI did not render`,
  );
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP register → session-cookie persistence e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless:       true,
    args:           ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: session cookie persists across a hard page reload ──────────
    await test(
      "session cookie set at registration persists across a hard page reload",
      async () => {
        const ctx    = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page   = await ctx.newPage();
        const errors: string[] = [];

        try {
          attachRuntimeErrorGuard(page, errors);
          await wireMocks(ctx);

          // 1. Navigate to /create-account.  auth/me returns 401 (no cookie yet)
          //    so AuthGate renders the Create Account pre-auth form.
          await page.goto(`${BASE}/create-account`, { waitUntil: "domcontentloaded" });
          await waitForCreateAccountPage(page);

          // 2. Fill in the registration form with a valid email + password.
          await page
            .locator('[data-testid="input-register-email"]')
            .fill(MOCK_USER.email);
          await page
            .locator('[data-testid="input-register-password"]')
            .fill("SecurePass123!");
          await page
            .locator('[data-testid="input-register-confirm"]')
            .fill("SecurePass123!");

          // 3. Submit — the mocked register endpoint fires Set-Cookie and returns
          //    the user object.  The frontend calls setUser(result.user), which
          //    updates the auth/me query cache and causes AuthGate to render the
          //    authenticated app shell.
          await page.locator('[data-testid="button-create-account-submit"]').click();

          // 4. Immediately post-registration: authenticated shell must be visible.
          await assertAuthenticatedShell(page, errors, "immediately after registration");

          // 5. Hard reload — simulates the user pressing F5 / Cmd-R after signing up.
          //    The browser must send the session cookie in the auth/me request;
          //    if cookie flags (path, SameSite, HttpOnly) were wrong the browser
          //    would silently omit the cookie and auth/me would return 401.
          errors.length = 0; // reset before reload
          await page.reload({ waitUntil: "domcontentloaded" });

          // Wait for the auth/me query to settle (AuthGate isLoading → false).
          await page.waitForTimeout(2_500);

          // 6. Authenticated shell must still be visible after the reload.
          await assertAuthenticatedShell(page, errors, "after hard page reload");

          console.log("       session cookie correctly survived the page reload");
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 2: control group — reload without a cookie lands on login page ─
    //
    // Validates the inverse: without a session cookie a reload keeps the login
    // page visible.  This confirms the positive test above cannot false-pass
    // because of the mock always returning a user regardless of cookie state.
    await test(
      "without a session cookie, reload correctly keeps the login page visible",
      async () => {
        const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();

        try {
          await wireMocks(ctx);

          // Navigate to root — auth/me returns 401 (no cookie) → login page.
          await page.goto(BASE, { waitUntil: "domcontentloaded" });
          const loginForm = page.locator('[data-testid="form-login"]');
          await loginForm.waitFor({ state: "visible", timeout: 15_000 });

          // Reload — still no cookie, so auth/me still returns 401.
          await page.reload({ waitUntil: "domcontentloaded" });
          await loginForm.waitFor({ state: "visible", timeout: 10_000 });

          console.log("       login page correctly shown after reload with no cookie");
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
  console.error("\nFatal error running register-session-persistence e2e tests:", err);
  process.exit(1);
});
