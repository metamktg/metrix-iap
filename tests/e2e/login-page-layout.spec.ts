// End-to-end Playwright tests for the Metrix IAP login page split-panel layout.
//
// Covers:
//   1. All required data-testids are present in the DOM at both viewports.
//   2. Mobile (375 × 812): left value-prop panel is not visible; mobile brand
//      strip is visible; link-marketing-site is not visible (desktop-only).
//   3. Desktop (1280 × 800): left value-prop panel is visible; mobile brand
//      strip is not visible; link-marketing-site is visible.
//   4. The "Create Account" button is present and enabled (interactive) at
//      both viewports — the Create Account flow was enabled for beta launch.
//
// The /api/metrix/auth/me call is intercepted so no real API server is needed
// — a 401 response causes the app to render the login page immediately.
//
// Run: tsx tests/e2e/login-page-layout.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:login-page-layout

import { chromium, type Page, type BrowserContext } from "playwright-core";

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

// Intercept the auth/me endpoint so the app resolves to "not logged in"
// without needing a real API server running.
async function setupAuthInterception(ctx: BrowserContext): Promise<void> {
  await ctx.route("**/api/metrix/auth/me", (route) => {
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    });
  });
}

// Wait for the login form to be visible (guards against the loading spinner).
async function waitForLoginPage(page: Page): Promise<void> {
  await page.locator('[data-testid="form-login"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });
}

// All testids that must be in the DOM regardless of viewport.
const REQUIRED_TESTIDS = [
  "form-login",
  "input-login-email",
  "input-login-password",
  "checkbox-remember-me",
  "button-login",
  "link-forgot-password",
  "link-request-access",
  "link-marketing-site",
  "button-create-account",
] as const;

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMetrix IAP login page layout e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test group: mobile viewport (375 × 812) ─────────────────────────
    console.log("  [mobile 375px]");

    await test("all required data-testids are present in the DOM", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 812 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        for (const testid of REQUIRED_TESTIDS) {
          const el = page.locator(`[data-testid="${testid}"]`);
          const count = await el.count();
          assert(count > 0, `[data-testid="${testid}"] not found in DOM`);
        }
      } finally {
        await ctx.close();
      }
    });

    await test("left value-prop panel is not visible on mobile", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 812 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        // The left panel has `hidden lg:flex` — CSS display:none on mobile.
        // We detect it by its unique inner text; there is no data-testid on it.
        const leftPanel = page
          .locator(".hidden.lg\\:flex")
          .filter({ hasText: "Performance intelligence" })
          .first();
        const visible = await leftPanel.isVisible();
        assert(!visible, "Left value-prop panel should be hidden on mobile");
      } finally {
        await ctx.close();
      }
    });

    await test("mobile brand strip is visible on mobile", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 812 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        // The mobile strip is `lg:hidden` — visible only on mobile.
        const mobileStrip = page
          .locator(".lg\\:hidden")
          .filter({ hasText: "Performance intelligence for marketers" })
          .first();
        const visible = await mobileStrip.isVisible();
        assert(visible, "Mobile brand strip should be visible on mobile");
      } finally {
        await ctx.close();
      }
    });

    await test("link-marketing-site is not visible on mobile", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 812 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        // link-marketing-site lives inside `hidden lg:block` wrapper.
        const link = page.locator('[data-testid="link-marketing-site"]');
        const visible = await link.isVisible();
        assert(!visible, "link-marketing-site should be hidden on mobile (desktop-only)");
      } finally {
        await ctx.close();
      }
    });

    await test("Create Account button is present and enabled on mobile", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 812 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        const btn = page.locator('[data-testid="button-create-account"]');
        await btn.waitFor({ state: "visible", timeout: 5_000 });

        const isDisabled = await btn.isDisabled();
        assert(!isDisabled, "Create Account button should be enabled (Create Account flow is active)");

        const ariaDisabled = await btn.getAttribute("aria-disabled");
        assert(
          ariaDisabled === null || ariaDisabled === "false",
          `Create Account button should not carry aria-disabled="true", got "${ariaDisabled}"`,
        );
      } finally {
        await ctx.close();
      }
    });

    // ── Test group: desktop viewport (1280 × 800) ───────────────────────
    console.log("\n  [desktop 1280px]");

    await test("all required data-testids are present in the DOM", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        for (const testid of REQUIRED_TESTIDS) {
          const el = page.locator(`[data-testid="${testid}"]`);
          const count = await el.count();
          assert(count > 0, `[data-testid="${testid}"] not found in DOM`);
        }
      } finally {
        await ctx.close();
      }
    });

    await test("left value-prop panel is visible on desktop", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        // At 1280px (≥ lg 1024px threshold) the panel becomes display:flex.
        const leftPanel = page
          .locator(".hidden.lg\\:flex")
          .filter({ hasText: "Performance intelligence" })
          .first();
        const visible = await leftPanel.isVisible();
        assert(visible, "Left value-prop panel should be visible on desktop (lg+)");
      } finally {
        await ctx.close();
      }
    });

    await test("mobile brand strip is not visible on desktop", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        const mobileStrip = page
          .locator(".lg\\:hidden")
          .filter({ hasText: "Performance intelligence for marketers" })
          .first();
        const visible = await mobileStrip.isVisible();
        assert(!visible, "Mobile brand strip should be hidden on desktop");
      } finally {
        await ctx.close();
      }
    });

    await test("link-marketing-site is visible on desktop", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        const link = page.locator('[data-testid="link-marketing-site"]');
        const visible = await link.isVisible();
        assert(visible, "link-marketing-site should be visible on desktop");

        const href = await link.getAttribute("href");
        assert(href === "/www/", `Expected href="/www/", got "${href}"`);
      } finally {
        await ctx.close();
      }
    });

    await test("Create Account button is present and enabled on desktop", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      try {
        await setupAuthInterception(ctx);
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await waitForLoginPage(page);

        const btn = page.locator('[data-testid="button-create-account"]');
        await btn.waitFor({ state: "visible", timeout: 5_000 });

        const isDisabled = await btn.isDisabled();
        assert(!isDisabled, "Create Account button should be enabled (Create Account flow is active)");

        const ariaDisabled = await btn.getAttribute("aria-disabled");
        assert(
          ariaDisabled === null || ariaDisabled === "false",
          `Create Account button should not carry aria-disabled="true", got "${ariaDisabled}"`,
        );
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
  console.error("\nFatal error running login page layout e2e tests:", err);
  process.exit(1);
});
