// Does the creative actually TRAVEL from its tile into the expanded panel?
//
// WHY THIS NEEDS A BROWSER
// The morph is a framer-motion shared-layout animation: the tile's media and
// the dialog's media pane carry the same `layoutId`, so the browser
// interpolates one rectangle into the other. Nothing about that is visible to
// a type checker, a unit test or a static scan — jsdom has no layout, so a
// component test cannot tell a working morph from a broken one.
//
// And it breaks SILENTLY. Delete one of the two `layoutId`s, or make them
// disagree by a character, and everything still renders: the tile is there,
// the dialog opens, every existing test passes. The only thing lost is the
// continuity, and the only way to notice is to watch it.
//
// So this measures the pane's bounding box on every animation frame right
// after the click, and asserts three things:
//
//   1. The FIRST frame is at the tile's rectangle, not the dialog's. That is
//      what proves the animation started from the tile — without a shared
//      layout the pane simply appears at its final size on frame one.
//   2. The LAST frame is at the dialog's rectangle. It arrives.
//   3. There are several distinct widths in between. A morph that snaps
//      would show exactly two.
//
// Run: tsx tests/e2e/metrix-iap-shared-layout.spec.ts
//   or via: pnpm --filter @workspace/scripts run smoke:metrix-iap-shared-layout

import { chromium } from "playwright-core";
import type { Page } from "playwright-core";
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

async function mockApis(page: Page): Promise<void> {
  await page.route("**/api/metrix/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reports: [], runs: [], windows: [], imports: [], deconstructions: [] }),
    }),
  );
  await page.route("**/api/metrix/seed", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: SEED_FIXTURE_BODY }),
  );
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
}

async function main(): Promise<void> {
  const browser = await chromium.launch(CHROMIUM_EXE ? { executablePath: CHROMIUM_EXE } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await mockApis(page);
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "metrix_active_account_v1",
      JSON.stringify({ type: "ad_account", adAccountId: "bookster" }),
    );
  });

  await page.goto(`${BASE}/app/creative/library`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // No named helpers inside page.evaluate — tsx/esbuild wraps named functions
  // in a `__name(...)` call that does not exist in the page.
  const m = await page.evaluate(async () => {
    const card = document.querySelector('[role="group"][aria-label^="Creative"]');
    if (!card) return { error: "no creative card rendered" as const };
    const tileEl = card.querySelector("div.relative.overflow-hidden");
    const tile = tileEl ? tileEl.getBoundingClientRect() : null;
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const samples: { w: number; h: number; y: number }[] = [];
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) continue;
      const pane = dialog.querySelector("div.relative.overflow-hidden > div.absolute.inset-0");
      if (!pane) continue;
      const r2 = pane.getBoundingClientRect();
      samples.push({ w: Math.round(r2.width), h: Math.round(r2.height), y: Math.round(r2.y) });
    }
    return {
      tile: tile ? { w: Math.round(tile.width), h: Math.round(tile.height), y: Math.round(tile.y) } : null,
      samples,
    };
  });

  if ("error" in m) {
    console.error(`\nFAIL  ${m.error}`);
    await browser.close();
    process.exit(1);
  }

  const { tile, samples } = m;

  await test("the expand starts from the tile's own rectangle", async () => {
    assert(tile != null, "tile rect measured");
    assert(samples.length > 0, "the dialog's media pane was found during the transition");
    const first = samples[0]!;
    // Within 8px: the tile has a 1px border and the pane sits inside it.
    assert(
      Math.abs(first.h - tile!.h) <= 8,
      `first frame height ${first.h} should match the tile's ${tile!.h} — the pane appeared at ` +
        `its final size, which means the shared layout is NOT running (a layoutId is missing ` +
        `or the two no longer match)`,
    );
  });

  await test("it arrives at the expanded panel's rectangle", async () => {
    const last = samples[samples.length - 1]!;
    assert(
      last.h > tile!.h * 1.5,
      `last frame height ${last.h} should be well above the tile's ${tile!.h}`,
    );
  });

  await test("it interpolates rather than snapping", async () => {
    const widths = new Set(samples.map((s) => s.w));
    assert(
      widths.size >= 4,
      `only ${widths.size} distinct width(s) across ${samples.length} frames — a real morph ` +
        `passes through many intermediate sizes; two means it jumped`,
    );
  });

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("PASS  Shared-layout morph e2e tests passed.");
}

main().catch((err) => {
  console.error(`\nFAIL  Shared-layout scan could not run: ${String(err?.message ?? err)}`);
  process.exit(1);
});
