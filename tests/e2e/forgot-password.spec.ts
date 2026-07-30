// End-to-end Playwright tests for the forgot-password flow.
//
// Covers:
//   1. Clicking "Forgot password?" on the login page navigates to /forgot-password
//      and renders the ForgotPasswordPage with the reset form.
//   2. The form accepts an email address; submitting it (with the API intercepted)
//      transitions to the success/confirmation state.
//   3. The "Back to sign in" button navigates back to the login page.
//
// The /api/metrix/auth/me call is intercepted so the app renders the login page
// without a real API server. The password-reset endpoint is also intercepted so
// no email is actually sent.
//
// Run: tsx tests/e2e/forgot-password.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:forgot-password

import { chromium, type BrowserContext, type Page } from "playwright-core";

const BASE = process.env.METRIX_IAP_BASE_URL ?? "http://localhost:80";
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

/** Intercept auth/me so the app resolves to "not logged in". */
async function setupAuthInterception(ctx: BrowserContext): Promise<void> {
  await ctx.route("**/api/metrix/auth/me", (route) => {
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    });
  });
}

/** Intercept the password-reset request so no email is sent. */
async function setupPasswordResetInterception(ctx: BrowserContext): Promise<void> {
  await ctx.route("**/metrix/auth/request-password-reset", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "sent" }),
    });
  });
}

/** Wait for the login form to be visible (guards against the loading spinner). */
async function waitForLoginPage(page: Page): Promise<void> {
  await page.locator('[data-testid="form-login"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP forgot-password flow e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: clicking "Forgot password?" navigates to /forgot-password ──
    await test(
      'clicking "Forgot password?" from login page renders ForgotPasswordPage',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        const page = await ctx.newPage();
        try {
          await setupAuthInterception(ctx);
          await page.goto(BASE, { waitUntil: "domcontentloaded" });
          await waitForLoginPage(page);

          // The link-forgot-password button navigates to /forgot-password.
          const forgotBtn = page.locator('[data-testid="link-forgot-password"]');
          await forgotBtn.waitFor({ state: "visible", timeout: 5_000 });
          await forgotBtn.click();

          // The forgot-password form should now be visible.
          const form = page.locator('[data-testid="form-forgot-password"]');
          await form.waitFor({ state: "visible", timeout: 10_000 });

          // Confirm essential elements are present.
          const emailInput = page.locator('[data-testid="input-forgot-email"]');
          assert(await emailInput.count() > 0, '[data-testid="input-forgot-email"] not found');

          const sendBtn = page.locator('[data-testid="button-send-reset-link"]');
          assert(await sendBtn.count() > 0, '[data-testid="button-send-reset-link"] not found');

          const backBtn = page.locator('[data-testid="button-back-to-login"]');
          assert(await backBtn.count() > 0, '[data-testid="button-back-to-login"] not found');

          // Login form must no longer be visible (we are on /forgot-password now).
          const loginForm = page.locator('[data-testid="form-login"]');
          const loginVisible = await loginForm.isVisible();
          assert(!loginVisible, 'Login form should not be visible on /forgot-password');
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 2: entering an email and submitting shows success state ────────
    await test(
      "submitting a valid email shows the success confirmation state",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        const page = await ctx.newPage();
        try {
          await setupAuthInterception(ctx);
          await setupPasswordResetInterception(ctx);

          // Navigate directly to /forgot-password (reachable without being logged in).
          await page.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded" });

          const form = page.locator('[data-testid="form-forgot-password"]');
          await form.waitFor({ state: "visible", timeout: 15_000 });

          // Fill in the email field.
          const emailInput = page.locator('[data-testid="input-forgot-email"]');
          await emailInput.fill("test@example.com");

          // The send button should now be enabled.
          const sendBtn = page.locator('[data-testid="button-send-reset-link"]');
          const disabled = await sendBtn.isDisabled();
          assert(!disabled, '"Send reset link" button should be enabled after a valid email is typed');

          // Submit the form.
          await sendBtn.click();

          // Success banner should appear.
          const successEl = page.locator('[data-testid="text-reset-request-success"]');
          await successEl.waitFor({ state: "visible", timeout: 10_000 });

          // Form should no longer be visible once in the "sent" state.
          const formVisible = await form.isVisible();
          assert(!formVisible, 'The reset form should disappear after a successful submission');
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 3: "Back to sign in" returns to the login page ─────────────────
    await test(
      '"Back to sign in" navigates back to the login page',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        const page = await ctx.newPage();
        try {
          await setupAuthInterception(ctx);

          await page.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded" });

          const form = page.locator('[data-testid="form-forgot-password"]');
          await form.waitFor({ state: "visible", timeout: 15_000 });

          const backBtn = page.locator('[data-testid="button-back-to-login"]');
          await backBtn.waitFor({ state: "visible", timeout: 5_000 });
          await backBtn.click();

          // The login form should now be visible.
          const loginForm = page.locator('[data-testid="form-login"]');
          await loginForm.waitFor({ state: "visible", timeout: 10_000 });
        } finally {
          await ctx.close();
        }
      },
    );

    // ── Test 4: navigate directly to /forgot-password (no referrer) ─────────
    await test(
      "navigating directly to /forgot-password renders the ForgotPasswordPage",
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 375, height: 812 },
        });
        const page = await ctx.newPage();
        try {
          await setupAuthInterception(ctx);

          await page.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded" });

          const form = page.locator('[data-testid="form-forgot-password"]');
          await form.waitFor({ state: "visible", timeout: 15_000 });

          // Confirm the email input and submit button are present on mobile too.
          assert(
            await page.locator('[data-testid="input-forgot-email"]').count() > 0,
            '[data-testid="input-forgot-email"] not found on mobile viewport',
          );
          assert(
            await page.locator('[data-testid="button-send-reset-link"]').count() > 0,
            '[data-testid="button-send-reset-link"] not found on mobile viewport',
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
  console.error("\nFatal error running forgot-password e2e tests:", err);
  process.exit(1);
});
