// Smoke check for the Metrix IAP vitest suite + login page layout e2e.
//
// 1. Runs `vitest run` for the metrix-iap package and asserts all tests pass.
//    Catches the class of regression where a jsdom environment bug (missing
//    polyfill, broken mock, etc.) causes test failures that would otherwise
//    only be noticed manually.
//
// 2. Runs the Playwright login page layout spec (smoke:login-page-layout)
//    which boots the metrix-iap dev server and verifies the split-panel
//    layout at mobile (375 px) and desktop (1280 px) widths.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-tests

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function fail(message: string, extra?: string): never {
  console.error(`\nFAIL  ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

function spawnScript(label: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d: Buffer) => {
      output += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      output += d;
      process.stderr.write(d);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${label} exited with code ${code}\n--- output ---\n${output || "(no output)"}`,
          ),
        );
      }
    });
  });
}

async function main() {
  // ── Step 1: vitest unit/component tests ──────────────────────────────────
  console.log("Running @workspace/metrix-iap vitest suite...");
  await spawnScript("vitest", [
    "--filter",
    "@workspace/metrix-iap",
    "run",
    "test",
  ]).catch((err) => {
    fail("Metrix IAP test suite failed", String(err?.message ?? err));
  });
  console.log("\nPASS  Metrix IAP vitest suite passed");

  // ── Step 2: Playwright login page layout e2e ─────────────────────────────
  console.log("\nRunning login page layout e2e...");
  await spawnScript("smoke:login-page-layout", [
    "--filter",
    "@workspace/scripts",
    "run",
    "smoke:login-page-layout",
  ]).catch((err) => {
    fail("Login page layout e2e failed", String(err?.message ?? err));
  });

  // ── Step 3: Playwright Home screen + 5-section nav e2e ───────────────────
  console.log("\nRunning Home screen + 5-section nav e2e...");
  await spawnScript("smoke:metrix-iap-home-screen", [
    "--filter",
    "@workspace/scripts",
    "run",
    "smoke:metrix-iap-home-screen",
  ]).catch((err) => {
    fail("Home screen e2e failed", String(err?.message ?? err));
  });

  // ── Step 4: Playwright forgot-password flow e2e ───────────────────────────
  console.log("\nRunning forgot-password flow e2e...");
  await spawnScript("smoke:forgot-password", [
    "--filter",
    "@workspace/scripts",
    "run",
    "smoke:forgot-password",
  ]).catch((err) => {
    fail("Forgot-password e2e failed", String(err?.message ?? err));
  });

  // ── Step 5: Playwright slider persistence e2e ────────────────────────────
  console.log("\nRunning slider persistence e2e...");
  await spawnScript("smoke:metrix-iap-slider-persistence", [
    "--filter",
    "@workspace/scripts",
    "run",
    "smoke:metrix-iap-slider-persistence",
  ]).catch((err) => {
    fail("Slider persistence e2e failed", String(err?.message ?? err));
  });

  console.log("\nPASS  All Metrix IAP smoke checks passed");
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
