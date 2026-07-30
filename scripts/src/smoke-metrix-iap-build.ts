// Smoke check for the Metrix IAP web app: runs its typecheck and a full
// production Vite build, then asserts the build actually produced an
// index.html entry point.
//
// After the build succeeds the script starts `vite preview` on the built
// output and uses Playwright to navigate to the root URL, asserting that the
// login form ([data-testid="form-login"]) is visible.  This catches the class
// of regression where a broken LoginPage import compiles TypeScript cleanly
// but produces a React render error that leaves users with a blank screen.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-build
//
// The artifact's vite.config.ts requires PORT and BASE_PATH at config-load
// time (they are normally supplied by the workflow). This script supplies
// safe values so the build runs from a clean shell. PORT is only used for
// dev/preview server config and does not affect build output; BASE_PATH is
// set to "/" to match the artifact's registered preview path.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withValidationLock } from "./lib/validation-lock.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const appDir = path.join(repoRoot, "artifacts/metrix-iap");
const indexHtml = path.join(appDir, "dist/public/index.html");

const BASE_PATH = "/";

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
  await withValidationLock("metrix-iap-build", runSmoke);
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

  await runStep("Typechecking @workspace/metrix-iap", [
    "--filter",
    "@workspace/metrix-iap",
    "run",
    "typecheck",
  ]).catch((err) => {
    fail("Metrix IAP typecheck failed", String(err?.message ?? err));
  });

  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: process.env["PORT"] ?? "5173",
    BASE_PATH,
  };

  await runStep(
    "Building @workspace/metrix-iap for production",
    ["--filter", "@workspace/metrix-iap", "run", "build"],
    buildEnv,
  ).catch((err) => {
    fail("Metrix IAP production build failed", String(err?.message ?? err));
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
    `\nBUILD OK  ${path.relative(repoRoot, indexHtml)} present with bundle script`,
  );

  // ── Step 4: boot vite preview and assert the login form renders ──────────
  const PREVIEW_PORT = "15178";
  const previewEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: PREVIEW_PORT,
    BASE_PATH,
  };

  let previewServer: ChildProcess | null = null;

  try {
    previewServer = await startPreviewServer(PREVIEW_PORT, previewEnv).catch(
      (err) => {
        fail("Failed to start vite preview server", String(err?.message ?? err));
      },
    );

    await assertLoginFormVisible(PREVIEW_PORT).catch((err) => {
      fail(
        "Login page render check failed on production build",
        String(err?.message ?? err),
      );
    });

    await assertCreateAccountFormVisible(PREVIEW_PORT).catch((err) => {
      fail(
        "Create Account page render check failed on production build",
        String(err?.message ?? err),
      );
    });
  } finally {
    previewServer?.kill();
  }

  console.log(
    `\nPASS  Metrix IAP production build succeeded — login form and create-account form visible in preview`,
  );
  process.exit(0);
}

// ── vite preview ──────────────────────────────────────────────────────────────

function startPreviewServer(
  port: string,
  env: NodeJS.ProcessEnv,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    console.log("Starting vite preview server...");
    const child = spawn(
      "pnpm",
      ["--filter", "@workspace/metrix-iap", "run", "serve"],
      {
        cwd: repoRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let ready = false;

    const onData = (chunk: Buffer) => {
      const line = chunk.toString();
      // Vite preview prints "Local:" or "localhost" when it is ready.
      if (!ready && /Local:|localhost/i.test(line)) {
        ready = true;
        resolve(child);
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("error", reject);
    child.on("exit", (code) => {
      if (!ready) {
        reject(new Error(`vite preview exited prematurely with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!ready) {
        child.kill();
        reject(new Error("vite preview did not become ready within 30 s"));
      }
    }, 30_000);
  });
}

// ── Playwright login form assertion ──────────────────────────────────────────

// ── Playwright create-account form assertion ──────────────────────────────────

async function assertCreateAccountFormVisible(port: string): Promise<void> {
  const { chromium } = await import("playwright-core");

  const executablePath = process.env["REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    // Return 401 so the app stays in the pre-login shell (same as login check).
    await ctx.route("**/api/metrix/auth/me", (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    const page = await ctx.newPage();

    console.log(
      `Navigating to http://localhost:${port}/create-account to check create-account form...`,
    );
    await page.goto(`http://localhost:${port}/create-account`, {
      waitUntil: "domcontentloaded",
    });

    await page
      .locator('[data-testid="form-create-account"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log(
      "  ✓  [data-testid=\"form-create-account\"] is visible in production build",
    );

    await ctx.close();
  } finally {
    await browser.close();
  }
}

async function assertLoginFormVisible(port: string): Promise<void> {
  // playwright-core is available in the Replit environment via the env var.
  const { chromium } = await import("playwright-core");

  const executablePath = process.env["REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    // Intercept the auth/me endpoint so the app renders the login page
    // immediately without needing a real API server.
    await ctx.route("**/api/metrix/auth/me", (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    const page = await ctx.newPage();

    console.log(
      `Navigating to http://localhost:${port}/ to check login form...`,
    );
    await page.goto(`http://localhost:${port}/`, {
      waitUntil: "domcontentloaded",
    });

    await page
      .locator('[data-testid="form-login"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log("  ✓  [data-testid=\"form-login\"] is visible in production build");

    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
