// End-to-end Playwright smoke for the IAP Library "Review queue" tab
// (creative deconstruction review surface).
//
// Covers:
//   1. The Review queue tab renders in the IAP Library and shows its
//      explanatory copy + empty state when no classification needs review.
//   2. With a mocked below-gate classification, the queue lists the item
//      with detected variable chips, overall confidence, the brief
//      comparison hidden (brief-less/historical creative), and the three
//      review actions (Correct / Accept anyway / Discard).
//   3. "Accept anyway" opens the explicit bypass confirmation (recorded as
//      a user override server-side) — the confirm copy must mention the
//      80% gate.
//
// API responses are mocked; no running API server is needed.
//
// Run: tsx tests/e2e/metrix-iap-review-queue.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-review-queue

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
  path.resolve(REPO_ROOT, "artifacts/metrix-iap/src/test-fixtures/metrix_seed_bundle.json"),
  "utf-8",
);

const ACCOUNT = "bookster";

const NEEDS_REVIEW_ITEM = {
  id: "dec-e2e-1",
  manual_import_id: "imp-e2e-1",
  filename: "ugc_hook_test.png",
  ad_names: ["ad_ugc_hook_1"],
  status: "needs_review",
  variables: [
    { family: "concept", code: "CN_UGC", confidence: 0.7, evidence: "Selfie-style creator shot" },
    { family: "tonality", code: "TN_Warm", confidence: 0.65, evidence: "Soft palette, friendly copy" },
  ],
  overall_confidence: 0.675,
  detected_copy: { primary_message: "Real readers, real results", cta: "Try it" },
  brief_ref: null,
  brief_variables: null,
  cell_id: null,
  overridden_by: null,
  overridden_at: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

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

async function mockApis(ctx: BrowserContext, deconstructions: unknown[]): Promise<void> {
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
    route.fulfill({ status: 200, contentType: "application/json", body: SEED_FIXTURE_BODY }),
  );

  await page.route("**/api/metrix/workspaces/*/reports", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: [] }) }),
  );

  await page.route("**/api/metrix/ad-accounts/*/analysis/summary*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await page.route("**/api/metrix/ad-accounts/*/analysis/data-windows*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ windows: [] }) }),
  );

  await page.route("**/api/metrix/accounts/*/analysis-runs*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runs: [] }) }),
  );

  await page.route("**/api/metrix/accounts/*/generation-runs/*/latest", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: null }) }),
  );

  await page.route("**/api/metrix/accounts/*/creative-deconstructions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ deconstructions }),
    }),
  );

  await page.route("**/api/metrix/accounts/*/manual-imports*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ imports: [] }) }),
  );
}

async function openReviewTab(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  deconstructions: unknown[],
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await mockApis(ctx, deconstructions);
  await page.goto(`${BASE}/app/analysis/library?account=${ACCOUNT}`, {
    waitUntil: "domcontentloaded",
  });
  // role="tab", not "button": the library's section rail is ModuleTabs.
  // Asking for the looser role would also match the SectionCard header
  // ("Collapse section: …") — Playwright matches name by substring.
  const tab = page.getByRole("tab", { name: /review queue/i }).first();
  await tab.waitFor({ state: "visible", timeout: 25_000 });
  await tab.click();
  await page
    .locator('[data-testid="deconstruction-review-queue"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  return { ctx, page };
}

async function main() {
  // CHROMIUM_EXE may be undefined outside Replit (e.g. GitHub Actions, where
  // ci.yml installs the matching Playwright browsers): playwright-core then
  // resolves its own default browser, same as every sibling spec. This spec
  // used to hard-exit when the env var was unset, which made it the only
  // spec that could never run in CI.
  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  await test("Review queue tab renders with empty state when nothing needs review", async () => {
    const { ctx, page } = await openReviewTab(browser, []);
    try {
      const empty = page.locator('[data-testid="review-queue-empty"]');
      await empty.waitFor({ state: "visible", timeout: 10_000 });
      const body = (await page.locator("body").innerText()).toLowerCase();
      assert(body.includes("80%"), "queue copy explains the 80% confidence gate");
    } finally {
      await ctx.close();
    }
  });

  await test("Below-gate creative lists variables, confidence, and review actions (no brief comparison for brief-less upload)", async () => {
    const { ctx, page } = await openReviewTab(browser, [NEEDS_REVIEW_ITEM]);
    try {
      const item = page.locator(`[data-testid="review-item-${NEEDS_REVIEW_ITEM.id}"]`);
      await item.waitFor({ state: "visible", timeout: 10_000 });
      const text = await item.innerText();
      assert(text.includes("ugc_hook_test.png"), "shows filename");
      assert(text.includes("CN_UGC") && text.includes("TN_Warm"), "shows detected variable chips");
      assert(/68\s*%/.test(text), "shows overall confidence (68%)");
      assert(/no linked brief/i.test(text), "brief-less upload labeled as historical");
      assert(!/brief intended/i.test(text), "brief comparison hidden without a linked brief");
      for (const action of [/correct/i, /accept anyway/i, /discard/i]) {
        assert((await item.getByRole("button", { name: action }).count()) > 0, `action ${action} present`);
      }
    } finally {
      await ctx.close();
    }
  });

  await test("Bypass action requires explicit confirmation mentioning the gate override", async () => {
    const { ctx, page } = await openReviewTab(browser, [NEEDS_REVIEW_ITEM]);
    try {
      const item = page.locator(`[data-testid="review-item-${NEEDS_REVIEW_ITEM.id}"]`);
      await item.getByRole("button", { name: /accept anyway/i }).click();
      await page.waitForTimeout(300);
      const text = await item.innerText();
      assert(/80% gate/i.test(text), "confirmation mentions the 80% gate");
      assert(/user override/i.test(text), "confirmation states it is recorded as a user override");
      assert(
        (await item.getByRole("button", { name: /yes, accept anyway/i }).count()) > 0,
        "explicit confirm button present",
      );
    } finally {
      await ctx.close();
    }
  });

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
