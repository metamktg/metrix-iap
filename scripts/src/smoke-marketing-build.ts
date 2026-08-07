// Smoke check for the Metrix marketing site: runs its typecheck and a full
// production Vite build, then asserts the build actually produced an
// index.html entry point with a bundle script.
//
// Catches the class of regression where a broken production build (Vite/Babel
// parse errors, bad imports, plugin failures) would otherwise only surface
// when a visitor loads a blank page.
//
// Run: pnpm --filter @workspace/scripts run smoke:marketing-build
//
// The artifact's vite.config.ts requires PORT and BASE_PATH at config-load
// time (they are normally supplied by the workflow). This script supplies
// safe values so the build runs from a clean shell. PORT is only used for
// dev/preview server config and does not affect build output; BASE_PATH is
// set to "/waitlist/" to match the artifact's registered preview path.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withValidationLock } from "./lib/validation-lock.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const appDir = path.join(repoRoot, "artifacts/marketing");
const indexHtml = path.join(appDir, "dist/public/index.html");

const BASE_PATH = "/waitlist/";

function fail(message: string, extra?: string): never {
  console.error(`\nFAIL  ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

function runStep(
  label: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`${label}...`);
    const child = spawn("pnpm", args, {
      cwd: repoRoot,
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
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
  // The whole sequence (typecheck:libs, app typecheck, Vite build) reads the
  // shared generated API libs, which the api-codegen-drift check deletes and
  // rewrites mid-run. Hold the shared validation lock so concurrent batches
  // never race (spurious TS6053 "file not found" errors otherwise).
  await withValidationLock("marketing-build", runSmoke);
}

async function runSmoke() {
  // Build composite lib declarations first — the app typecheck depends on
  // fresh .d.ts output from lib/* (stale declarations cause bogus TS2305s).
  await runStep("Building lib declarations (typecheck:libs)", [
    "run",
    "typecheck:libs",
  ]).catch((err) => {
    fail("Lib declaration build failed", String(err?.message ?? err));
  });

  await runStep("Typechecking @workspace/marketing", [
    "--filter",
    "@workspace/marketing",
    "run",
    "typecheck",
  ]).catch((err) => {
    fail("Marketing typecheck failed", String(err?.message ?? err));
  });

  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: process.env["PORT"] ?? "5173",
    BASE_PATH,
  };

  await runStep(
    "Building @workspace/marketing for production",
    ["--filter", "@workspace/marketing", "run", "build"],
    buildEnv,
  ).catch((err) => {
    fail("Marketing production build failed", String(err?.message ?? err));
  });

  if (!fs.existsSync(indexHtml)) {
    fail(
      `Build reported success but ${path.relative(repoRoot, indexHtml)} was not produced`,
    );
  }

  const html = fs.readFileSync(indexHtml, "utf8");
  if (!/<script[^>]+src=/.test(html)) {
    fail(
      "Built index.html contains no script tag — bundle output looks broken",
      html.slice(0, 2000),
    );
  }

  console.log(
    `\nPASS  Marketing production build succeeded (${path.relative(repoRoot, indexHtml)} present with bundle script)`,
  );
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
