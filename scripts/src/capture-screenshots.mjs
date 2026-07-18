// Playwright screenshot capture — Metrix IAP UI/UX Pass Summary.
// Uses element-based waits (not fixed delays) to stay under time limits.
//
// Run: node scripts/src/capture-screenshots.mjs

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
const UNCFG = "manual_OO2Jaeb2PBfu";

if (!PASSWORD) { console.error("DEMO_ACCOUNT_PASSWORD not set"); process.exit(1); }

const save = (label) => path.join(OUT_DIR, `${label}.jpg`);

// Wait for the Metrix topbar (present on all authenticated pages)
async function waitForApp(page, timeout = 12000) {
  await page.waitForSelector("header, nav, .topbar, [class*='topbar'], aside", { timeout });
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // ── Keyboard screenshots on unauthenticated login page ────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.waitForSelector('input[type="email"]', { timeout: 10000 });
    await p.keyboard.press("Tab"); // focus email
    await p.waitForTimeout(200);
    await p.screenshot({ path: save("kbd-tab1-email-focus"), type: "jpeg", quality: 90 });
    await p.keyboard.press("Tab"); // password
    await p.waitForTimeout(200);
    await p.screenshot({ path: save("kbd-tab2-password-focus"), type: "jpeg", quality: 90 });
    await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); // checkbox → sign in
    await p.waitForTimeout(200);
    await p.screenshot({ path: save("kbd-tab4-signin-focus"), type: "jpeg", quality: 90 });
    console.log("✓ keyboard focus screenshots");
    await ctx.close();
  }

  // ── Login ─────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/app/**`, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // ── Manager Overview (agency scope) ───────────────────────────────────
  await page.goto(`${BASE}/app/overview`);
  await waitForApp(page);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: save("scene-manager-overview-1440"), type: "jpeg", quality: 90 });
  console.log("✓ scene-manager-overview-1440");

  // ── Scene (a): Ad Account Overview with Loop Stepper ─────────────────
  for (const [w, h, label] of [[1440, 900, "1440"], [768, 1024, "768"], [375, 812, "375"]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/app/account?account=${ACCT}`);
    await waitForApp(page);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: save(`scene-a-account-overview-${label}`), type: "jpeg", quality: 90 });
    console.log(`✓ scene-a-account-overview-${label}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── Scene (b): Unconfigured / first-run account ───────────────────────
  await page.goto(`${BASE}/app/account?account=${UNCFG}`);
  await waitForApp(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: save("scene-b-unconfigured-1440"), type: "jpeg", quality: 90 });
  console.log("✓ scene-b-unconfigured-1440");

  // ── Scene (c): Audience (L1 view + optional drill) ───────────────────
  await page.goto(`${BASE}/app/analysis/audience?account=${ACCT}`);
  await waitForApp(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: save("scene-c-audience-l1-1440"), type: "jpeg", quality: 90 });
  console.log("✓ scene-c-audience-l1-1440");

  // 768px responsive
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${BASE}/app/analysis/audience?account=${ACCT}`);
  await waitForApp(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: save("scene-c-audience-768"), type: "jpeg", quality: 90 });
  console.log("✓ scene-c-audience-768");
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── Scene (d): Strategy / Generation ─────────────────────────────────
  await page.goto(`${BASE}/app/strategy/overview?account=${ACCT}`);
  await waitForApp(page);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: save("scene-d-strategy-1440"), type: "jpeg", quality: 90 });
  console.log("✓ scene-d-strategy-1440");

  await page.goto(`${BASE}/app/briefs/builder?account=${ACCT}`);
  await waitForApp(page);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: save("scene-d-briefs-1440"), type: "jpeg", quality: 90 });
  console.log("✓ scene-d-briefs-1440");

  await browser.close();
  console.log("\nDone —", OUT_DIR);
}

main().catch((err) => { console.error("Failed:", err.message); process.exit(1); });
