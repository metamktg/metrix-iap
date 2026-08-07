// Smoke check orchestrator for the Metrix IAP suite.
//
// 1. Runs `vitest run` for the metrix-iap package and asserts all tests pass.
//    Catches the class of regression where a jsdom environment bug (missing
//    polyfill, broken mock, etc.) causes test failures that would otherwise
//    only be noticed manually.
//
// 2. Runs every Playwright smoke step declared in
//    src/lib/metrix-iap-smoke-steps.ts. That list is the single source of
//    truth: the guard test metrix-iap-smoke-coverage.test.ts (scripts-tests
//    workflow) fails when a smoke:metrix-iap-* script exists in package.json
//    but is neither listed as a step nor explicitly excluded.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-tests

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IAP_SMOKE_STEPS } from "./lib/metrix-iap-smoke-steps.js";

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

  // ── Remaining steps: declarative Playwright smoke list ───────────────────
  for (const [i, step] of IAP_SMOKE_STEPS.entries()) {
    console.log(
      `\nRunning ${step.label} (step ${i + 2}/${IAP_SMOKE_STEPS.length + 1})...`,
    );
    await spawnScript(step.script, [
      "--filter",
      "@workspace/scripts",
      "run",
      step.script,
    ]).catch((err) => {
      fail(`${step.label} failed`, String(err?.message ?? err));
    });
  }

  console.log("\nPASS  All Metrix IAP smoke checks passed");
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
