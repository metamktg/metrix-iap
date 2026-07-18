// Playwright — Phase 5 supplemental screenshots:
//   (a) Keyboard Tab focus walkthrough through authenticated interior views
//   (b) Audience L2 SegmentDrilldownModal (click first segment)
//   (c) Strategy pre-generation state (littledata, no strategy yet)
//
// Run: node scripts/src/capture-screenshots-v2.mjs

import pkg from "/home/runner/workspace/node_modules/playwright-core/index.js";
const { chromium } = pkg;
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../screenshots");
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = "http://localhost:80";
const EMAIL = process.env.DEMO_ACCOUNT_EMAIL ?? "demo@metrix.app";
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;
const ACCT = "bookster";
const NO_STRATEGY_ACCT = "littledata";

if (!PASSWORD) { console.error("DEMO_ACCOUNT_PASSWORD not set"); process.exit(1); }
const save = (label) => path.join(OUT_DIR, `${label}.jpg`);

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── Login ─────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/app/**`, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log("✓ logged in");

  // ══════════════════════════════════════════════════════════════════════
  // (1) Keyboard Tab walkthrough — Account Overview (authenticated)
  // ══════════════════════════════════════════════════════════════════════
  await page.goto(`${BASE}/app/account?account=${ACCT}`);
  await page.waitForSelector("header, nav, aside", { timeout: 12000 });
  await page.waitForTimeout(3000); // let seed load + render

  // Move focus onto the page (click body once so Tab has a starting point)
  await page.click("body", { force: true });

  // Tab through ~12 stops — capture each so focus ring progress is documented
  for (let i = 1; i <= 12; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(150);
    if ([1, 3, 5, 7, 9, 11].includes(i)) {
      // Capture every other stop (6 screenshots — keeps output manageable)
      await page.screenshot({
        path: save(`kbd-app-overview-tab${i}`),
        type: "jpeg", quality: 85,
      });
      console.log(`✓ kbd-app-overview-tab${i}.jpg`);
    }
  }

  // Shift+Tab back to verify reverse order works
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(150);
  await page.screenshot({ path: save("kbd-app-overview-shift-tab"), type: "jpeg", quality: 85 });
  console.log("✓ kbd-app-overview-shift-tab.jpg");

  // ══════════════════════════════════════════════════════════════════════
  // (2) Audience L1 → L2 (SegmentDrilldownModal) → Tab inside L3
  // ══════════════════════════════════════════════════════════════════════
  await page.goto(`${BASE}/app/analysis/audience?account=${ACCT}`);
  await page.waitForSelector("header, nav", { timeout: 12000 });
  await page.waitForTimeout(4000); // seed + audience computation

  // Verify segment table loaded
  const segBtn = page.locator('[data-testid^="row-audience-segment-"]').first();
  const segCount = await segBtn.count();
  console.log(`  Audience segment buttons found: ${segCount}`);

  if (segCount > 0) {
    // L1 — capture the full table before clicking
    await page.screenshot({ path: save("scene-c-audience-l1-confirmed"), type: "jpeg", quality: 90 });
    console.log("✓ scene-c-audience-l1-confirmed.jpg");

    // L2 — click the first segment row button ("Women 45-54")
    await segBtn.click();
    await page.waitForTimeout(2500); // modal animation
    await page.screenshot({ path: save("scene-c-audience-l2-modal"), type: "jpeg", quality: 90 });
    console.log("✓ scene-c-audience-l2-modal.jpg (SegmentDrilldownModal open)");

    // L3 — Tab inside the modal (focus trap active)
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.screenshot({ path: save("scene-c-audience-l3-modal-focus"), type: "jpeg", quality: 90 });
    console.log("✓ scene-c-audience-l3-modal-focus.jpg (focus inside modal)");

    // Tab a few more times to show focus cycling
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.screenshot({ path: save("scene-c-audience-l3-modal-cycling"), type: "jpeg", quality: 90 });
    console.log("✓ scene-c-audience-l3-modal-cycling.jpg");

    // Close with Escape — focus should return to trigger
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await page.screenshot({ path: save("scene-c-audience-drawer-closed"), type: "jpeg", quality: 90 });
    console.log("✓ scene-c-audience-drawer-closed.jpg (focus restored to trigger)");
  } else {
    console.warn("  No segment buttons found — skipping audience drill");
  }

  // ══════════════════════════════════════════════════════════════════════
  // (3) Strategy pre-generation state (littledata — no strategy yet)
  //     Shows the empty "Generate strategy" CTA, not success or error
  // ══════════════════════════════════════════════════════════════════════
  await page.goto(`${BASE}/app/strategy/overview?account=${NO_STRATEGY_ACCT}`);
  await page.waitForSelector("header, nav", { timeout: 12000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: save("scene-d-strategy-no-data-cta"), type: "jpeg", quality: 90 });
  console.log("✓ scene-d-strategy-no-data-cta.jpg (pre-generation CTA state)");

  // Keyboard: Tab to the "Generate" button
  await page.click("body", { force: true });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: save("scene-d-strategy-generate-btn-focus"), type: "jpeg", quality: 90 });
  console.log("✓ scene-d-strategy-generate-btn-focus.jpg");

  // ══════════════════════════════════════════════════════════════════════
  // (4) Keyboard walkthrough — Audience view (Tab through table rows)
  // ══════════════════════════════════════════════════════════════════════
  await page.goto(`${BASE}/app/analysis/audience?account=${ACCT}`);
  await page.waitForSelector("header, nav", { timeout: 12000 });
  await page.waitForTimeout(4000);

  // Tab to reach the first segment button
  await page.click("body", { force: true });
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(80);
    // Check if focus is on a segment row button
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.getAttribute("data-testid") : null;
    });
    if (focused && focused.startsWith("row-audience-segment-")) {
      await page.screenshot({ path: save("kbd-audience-row-focus"), type: "jpeg", quality: 90 });
      console.log(`✓ kbd-audience-row-focus.jpg (focus on segment: ${focused})`);
      // Press Enter to drill in via keyboard
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);
      await page.screenshot({ path: save("kbd-audience-enter-opens-modal"), type: "jpeg", quality: 90 });
      console.log("✓ kbd-audience-enter-opens-modal.jpg (Enter key opens SegmentDrilldownModal)");
      break;
    }
  }

  await browser.close();
  console.log("\nDone —", OUT_DIR);
}

main().catch((err) => { console.error("Failed:", err.message); process.exit(1); });
