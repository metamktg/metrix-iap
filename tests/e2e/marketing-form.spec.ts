// End-to-end Playwright tests for the marketing site demo-application form.
//
// Covers:
//   1. Happy path – fill form → submit → /thanks shows "Application Received"
//      and the 2-business-day message.
//   2. Anchor scroll – navigating to /?#request-access scrolls the form card
//      into the viewport.
//   3. Already-requested variant – /thanks?status=already_requested shows the
//      alternate "already have your application on file" headline.
//
// The form submission is intercepted with page.route() so no real Supabase
// row is written during tests.
//
// Run: tsx tests/e2e/marketing-form.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:marketing-e2e

import { chromium } from "playwright-core";

const BASE = process.env.MARKETING_BASE_URL ?? "http://localhost:80/www";
const CHROMIUM_EXE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

// ── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
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

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMarketing form e2e (${BASE})\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Test 1: happy-path form submission ──────────────────────────────
    await test("happy path: form submit → /thanks shows Application Received", async () => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        // Intercept the API call so no real data is written.
        await page.route("**/api/metrix/request-access", (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "received", email: "tester@example.com" }),
          });
        });

        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

        // Scroll the form into view (it's in the hero on desktop).
        await page.locator("#request-access").scrollIntoViewIfNeeded();

        // Fill required fields.
        await page.getByLabel("Full Name").fill("Test User");
        await page.getByLabel("Work Email").fill("tester@example.com");
        await page.getByLabel("Phone").fill("+1 555 000 1234");

        // Business Type select (Radix Select — click trigger, then item).
        await page.getByRole("combobox", { name: /Business Type/i }).click();
        await page.getByRole("option", { name: "Agency" }).click();

        await page.getByLabel("Industry").fill("E-commerce");

        // Ad Spend select.
        await page.getByRole("combobox", { name: /Avg\. Monthly Ad Spend/i }).click();
        await page.getByRole("option", { name: "$10k–$50k/mo" }).click();

        // Submit.
        await page.getByRole("button", { name: /Request Demo Access/i }).click();

        // Wait for navigation to /thanks.
        await page.waitForURL(/\/thanks/, { timeout: 8000 });

        const url = page.url();
        assert(url.includes("/thanks"), `Expected /thanks in URL, got ${url}`);
        assert(url.includes("status=received"), `Expected status=received in URL, got ${url}`);

        // Check the headline.
        const h1 = await page.locator("h1").first().textContent();
        assert(
          h1?.includes("Application Received") ?? false,
          `Expected "Application Received" in <h1>, got: "${h1}"`,
        );

        // Check the 2-business-day message.
        const bodyText = await page.locator("main").textContent();
        assert(
          bodyText?.includes("2 business days") ?? false,
          `Expected "2 business days" on /thanks page`,
        );
      } finally {
        await ctx.close();
      }
    });

    // ── Test 2: anchor scroll ───────────────────────────────────────────
    await test("anchor scroll: /?#request-access brings form card into viewport", async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/#request-access`, { waitUntil: "domcontentloaded" });

        // Give the requestAnimationFrame scroll a moment to settle.
        await page.waitForTimeout(600);

        // The form card's container has id="request-access".
        const formContainer = page.locator("#request-access");
        await formContainer.waitFor({ state: "visible", timeout: 5000 });

        const box = await formContainer.boundingBox();
        assert(box !== null, "Could not get bounding box of #request-access");

        // The element should be at or near the top of the viewport (within 200 px
        // of the top edge) after scrolling, confirming smooth-scroll landed correctly.
        assert(
          box.y >= 0 && box.y < 300,
          `#request-access top edge at ${box.y}px — expected within first 300px of viewport after scroll`,
        );
      } finally {
        await ctx.close();
      }
    });

    // ── Test 3: already_requested variant ──────────────────────────────
    await test("already_requested: /thanks?status=already_requested shows alternate headline", async () => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/thanks?status=already_requested`, { waitUntil: "domcontentloaded" });

        await page.locator("h1").waitFor({ state: "visible", timeout: 5000 });
        const h1 = await page.locator("h1").first().textContent();

        assert(
          h1?.includes("already have your application on file") ?? false,
          `Expected "already have your application on file" in <h1>, got: "${h1}"`,
        );

        // The "Application Received" headline must NOT appear.
        assert(
          !h1?.includes("Application Received"),
          `"Application Received" should not appear when status=already_requested`,
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
  console.error("\nFatal error running marketing form e2e tests:", err);
  process.exit(1);
});
