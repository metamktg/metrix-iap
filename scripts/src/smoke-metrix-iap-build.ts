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
// The artifact's vite.config.ts uses the registered service's port/base-path
// as defaults, so this smoke deliberately builds once without either runtime
// variable. That is the same clean-shell condition that previously failed
// before Vite could start.

import { spawn, type ChildProcess } from "node:child_process";
import { spawnGroup, killGroup } from "./lib/process-group.js";
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
// The managed composite router (Replit) serves "/" and "/api" on port 80. Set
// METRIX_IAP_COMPOSITE_BASE_URL to point the check elsewhere, and setting it
// also makes the check mandatory: a router you named must answer. Left unset,
// the check runs when something listens on the default and is skipped with a
// NOTE when nothing does (GitHub Actions runs this smoke with no router at all,
// and "fetch failed" there is not a routing verdict).
const COMPOSITE_BASE_URL_EXPLICIT = process.env["METRIX_IAP_COMPOSITE_BASE_URL"];
const COMPOSITE_BASE_URL = COMPOSITE_BASE_URL_EXPLICIT ?? "http://localhost:80";

const PUBLISHED_BASE_URL_EXPLICIT = process.env["METRIX_IAP_PUBLISHED_URL"];

// This is deliberately small: the boot smoke is checking the auth → seed →
// authenticated-shell contract, not the completeness of the live seed. The
// shape mirrors the minimum bundle already used by the session persistence
// smoke, and is enough for the manager landing view to mount all providers.
const AUTHENTICATED_SMOKE_USER = {
  id: "smoke-user-id",
  email: "smoke@example.com",
  role: "member",
  must_change_password: false,
  manage_team: false,
  view_agency_rollups: false,
  export_data: false,
};

const AUTHENTICATED_SMOKE_SEED = {
  schema_version: "1.0",
  generated_at: "2024-01-01T00:00:00.000Z",
  integrity_note: "authenticated-boot-smoke",
  app_defaults: {
    initial_view: "manager",
    active_manager_account_id: "smoke-manager",
    selected_ad_account_id: null,
    navigation: [],
    forbidden_ui_terms: [],
    data_isolation_rule: "",
  },
  manager_account: {
    id: "smoke-manager",
    name: "Smoke Test Agency",
    type: "agency",
    overview_mode: "manager",
    configured_ad_accounts: 0,
    unconfigured_ad_accounts: 1,
    bottom_line_totals: {
      spend_usd: 0,
      impressions: 0,
      link_clicks: 0,
      link_ctr_pct: null,
      result_totals_by_event: {},
    },
    recommendation_cards: [],
  },
  ad_accounts: [
    {
      id: "smoke-ad-account",
      name: "Smoke Test Account",
      status: "unconfigured",
      platform: "Meta Ads",
    },
  ],
};

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
    const child = spawnGroup("pnpm", args, {
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
  if (PUBLISHED_CHECK_REQUESTED && !PUBLISHED_BASE_URL) {
    fail(
      "Published routing check requires METRIX_IAP_PUBLISHED_URL",
      "Pass the current published URL, for example: " +
        "METRIX_IAP_PUBLISHED_URL=https://example.replit.app " +
        "pnpm --filter @workspace/scripts run smoke:metrix-iap-build -- --published",
    );
  }

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

  const buildEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
  delete buildEnv["PORT"];
  delete buildEnv["BASE_PATH"];

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
  // 15195 is deliberately OUTSIDE the 15175–15192 range the e2e smoke scripts
  // use for their dev servers. In CI all smoke steps share one runner and the
  // e2e dev servers can outlive their step (the job-end cleanup reaps them as
  // orphans) — this port previously collided with the register-session dev
  // server (15178), and vite preview inherits server.strictPort=true, so the
  // preview hard-failed instead of auto-incrementing.
  const PREVIEW_PORT = "15195";
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

    await assertForgotPasswordFormVisible(PREVIEW_PORT).catch((err) => {
      fail(
        "Forgot Password page render check failed on production build",
        String(err?.message ?? err),
      );
    });

    await assertResetPasswordFormVisible(PREVIEW_PORT).catch((err) => {
      fail(
        "Reset Password page render check failed on production build",
        String(err?.message ?? err),
      );
    });

    await assertChangePasswordFormVisible(PREVIEW_PORT).catch((err) => {
      fail(
        "Change Password page render check failed on production build",
        String(err?.message ?? err),
      );
    });

    await assertAuthenticatedBoot(PREVIEW_PORT).catch((err) => {
      fail(
        "Authenticated dashboard boot check failed on production build",
        String(err?.message ?? err),
      );
    });
  } finally {
    killGroup(previewServer);
  }

  let routingChecked = false;
  if (COMPOSITE_BASE_URL_EXPLICIT || (await compositeRouterListens())) {
    await assertCompositeRouting().catch((err) => {
      fail(
        `Managed composite routing check failed at ${COMPOSITE_BASE_URL}`,
        String(err?.message ?? err),
      );
    });
    routingChecked = true;
  } else {
    console.log(
      `\nNOTE  No managed composite router listening at ${COMPOSITE_BASE_URL}; ` +
        `routing check skipped (set METRIX_IAP_COMPOSITE_BASE_URL to require it).`,
    );
  }

  let publishedRoutingChecked = false;
  if (PUBLISHED_BASE_URL) {
    await assertPublishedRouting(PUBLISHED_BASE_URL).catch((err) => {
      fail(
        `Published Metrix IAP routing check failed at ${PUBLISHED_BASE_URL}`,
        String(err?.message ?? err),
      );
    });
    publishedRoutingChecked = true;
  } else {
    console.log(
      "\nNOTE  Published routing not checked; set " +
        "METRIX_IAP_PUBLISHED_URL to verify the live deployment.",
    );
  }

  console.log(
    publishedRoutingChecked
      ? `\nPASS  Metrix IAP production build, managed routing, and published routing checks passed`
      : routingChecked
        ? `\nPASS  Metrix IAP production build and managed routing checks passed: pre-auth forms, deep links, and /api responses verified`
        : `\nPASS  Metrix IAP production build checks passed: pre-auth forms and deep links verified (managed routing not checked, no router listening)`,
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
    const child = spawnGroup(
      "pnpm",
      ["--filter", "@workspace/metrix-iap", "run", "serve"],
      {
        cwd: repoRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let ready = false;
    let output = "";

    const onData = (chunk: Buffer) => {
      const line = chunk.toString();
      output += line;
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
        // Include the child's own output — "exited prematurely" alone hid the
        // real cause (e.g. "Port … is already in use") behind a generic code 1.
        reject(
          new Error(
            `vite preview exited prematurely with code ${code}\n--- output ---\n${output || "(no output)"}`,
          ),
        );
      }
    });

    setTimeout(() => {
      if (!ready) {
        killGroup(child);
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

async function assertForgotPasswordFormVisible(port: string): Promise<void> {
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

    // Return 401 so the app stays in the pre-login shell.
    await ctx.route("**/api/metrix/auth/me", (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    const page = await ctx.newPage();

    console.log(
      `Navigating to http://localhost:${port}/forgot-password to check forgot-password form...`,
    );
    await page.goto(`http://localhost:${port}/forgot-password`, {
      waitUntil: "domcontentloaded",
    });

    await page
      .locator('[data-testid="form-forgot-password"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log(
      "  ✓  [data-testid=\"form-forgot-password\"] is visible in production build",
    );

    await ctx.close();
  } finally {
    await browser.close();
  }
}

async function assertResetPasswordFormVisible(port: string): Promise<void> {
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

    // The reset-password page is shown regardless of auth state. Intercept
    // auth/me so the app settles immediately without a real API server.
    await ctx.route("**/api/metrix/auth/me", (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });

    // Intercept the reset-password API call so the form stays in "idle" state
    // rather than firing a real network request with the fake token.
    await ctx.route("**/api/metrix/auth/reset-password", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    const page = await ctx.newPage();

    // Pass a fake token so the page renders the form rather than the
    // "invalid or expired link" message.
    console.log(
      `Navigating to http://localhost:${port}/reset-password?token=smoke-test-token to check reset-password form...`,
    );
    await page.goto(
      `http://localhost:${port}/reset-password?token=smoke-test-token`,
      { waitUntil: "domcontentloaded" },
    );

    await page
      .locator('[data-testid="form-reset-password"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log(
      "  ✓  [data-testid=\"form-reset-password\"] is visible in production build",
    );

    await ctx.close();
  } finally {
    await browser.close();
  }
}

async function assertChangePasswordFormVisible(port: string): Promise<void> {
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

    // Return a logged-in user with must_change_password: true so the app
    // renders ChangePasswordPage instead of the login form.
    // The API contract wraps the user under { user: { ... } }.
    await ctx.route("**/api/metrix/auth/me", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "smoke-user-id",
            email: "smoke@example.com",
            must_change_password: true,
            role: "member",
          },
        }),
      });
    });

    const page = await ctx.newPage();

    console.log(
      `Navigating to http://localhost:${port}/ to check change-password form...`,
    );
    await page.goto(`http://localhost:${port}/`, {
      waitUntil: "domcontentloaded",
    });

    await page
      .locator('[data-testid="form-change-password"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log(
      "  ✓  [data-testid=\"form-change-password\"] is visible in production build",
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
    const rootResponse = await page.goto(`http://localhost:${port}/`, {
      waitUntil: "domcontentloaded",
    });
    if (rootResponse?.status() !== 200) {
      throw new Error(`Root URL returned HTTP ${rootResponse?.status() ?? "no response"}`);
    }

    await page
      .locator('[data-testid="form-login"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log("  ✓  [data-testid=\"form-login\"] is visible in production build");

    const deepLinkResponse = await page.goto(`http://localhost:${port}/app/analysis`, {
      waitUntil: "domcontentloaded",
    });
    if (deepLinkResponse?.status() !== 200) {
      throw new Error(
        `Direct SPA route /app/analysis returned HTTP ${deepLinkResponse?.status() ?? "no response"}`,
      );
    }

    await page
      .locator('[data-testid="form-login"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log("  ✓  direct /app/analysis URL returned the SPA entry point");

    await ctx.close();
  } finally {
    await browser.close();
  }
}

// ── authenticated dashboard boot assertion ───────────────────────────────────

interface ApiObservation {
  method: string;
  url: string;
  status: number;
  body: string;
}

/**
 * Exercises the first authenticated render without depending on a mutable
 * database account or a real password. The browser still follows the same
 * client path as a logged-in user:
 *
 *   GET /api/metrix/auth/me → authenticated user
 *   GET /api/metrix/seed    → seed bundle envelope
 *   authenticated manager landing view
 *
 * Keeping the route interception at the `/api` boundary catches regressions
 * where a caller accidentally drops the API prefix or changes the endpoint.
 */
async function assertAuthenticatedBoot(port: string): Promise<void> {
  const { chromium } = await import("playwright-core");

  const executablePath = process.env["REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const browserConsoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const apiObservations: ApiObservation[] = [];
  let seedRequestCount = 0;

  const recordApi = (
    request: { method(): string; url(): string },
    status: number,
    body: string,
  ) => {
    apiObservations.push({
      method: request.method(),
      url: request.url(),
      status,
      body,
    });
  };

  const diagnostics = () => {
    const consoleText =
      browserConsoleErrors.length > 0
        ? browserConsoleErrors.map((entry) => `  • ${entry}`).join("\n")
        : "  (none)";
    const pageErrorText =
      pageErrors.length > 0
        ? pageErrors.map((entry) => `  • ${entry}`).join("\n")
        : "  (none)";
    const apiText =
      apiObservations.length > 0
        ? apiObservations
            .map(
              (entry) =>
                `  • ${entry.method} ${entry.url} → HTTP ${entry.status}: ` +
                `${entry.body.slice(0, 1_000)}${entry.body.length > 1_000 ? "…" : ""}`,
            )
            .join("\n")
        : "  (no intercepted API responses)";

    return (
      "\n--- browser console errors ---\n" +
      consoleText +
      "\n--- uncaught page errors ---\n" +
      pageErrorText +
      "\n--- API response details ---\n" +
      apiText
    );
  };

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        browserConsoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    // Keep a fallback handler behind the expected deterministic fixtures.
    // Playwright checks routes in reverse registration order, so the two
    // handlers below win for the happy path. If a client changes an endpoint,
    // this handler records the real response (often the Vite SPA HTML or a
    // 404), which makes the failure actionable instead of looking like a
    // missing request.
    await ctx.route("**/api/**", async (route) => {
      try {
        const response = await route.fetch();
        const body = await response.text();
        recordApi(route.request(), response.status(), body);
        await route.fulfill({ response, body });
      } catch (err) {
        recordApi(
          route.request(),
          0,
          `request failed: ${String(err instanceof Error ? err.message : err)}`,
        );
        await route.abort();
      }
    });

    await ctx.route("**/api/metrix/auth/me", (route) => {
      const body = JSON.stringify({ user: AUTHENTICATED_SMOKE_USER });
      recordApi(route.request(), 200, body);
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      });
    });

    await ctx.route("**/api/metrix/seed", (route) => {
      seedRequestCount += 1;
      const body = JSON.stringify(AUTHENTICATED_SMOKE_SEED);
      recordApi(route.request(), 200, body);
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      });
    });

    console.log(
      `Navigating to http://localhost:${port}/ to check authenticated dashboard boot...`,
    );
    const rootResponse = await page.goto(`http://localhost:${port}/`, {
      waitUntil: "domcontentloaded",
    });
    if (rootResponse?.status() !== 200) {
      throw new Error(
        `Authenticated boot root URL returned HTTP ${rootResponse?.status() ?? "no response"}`,
      );
    }

    await page
      .getByText("Bottom-line totals", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await page
      .getByText("Smoke Test Agency", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 5_000 });

    if (seedRequestCount !== 1) {
      throw new Error(
        `Expected exactly one first seed request through /api/metrix/seed, observed ${seedRequestCount}`,
      );
    }

    const seedObservation = apiObservations.find((entry) =>
      entry.url.endsWith("/api/metrix/seed"),
    );
    if (!seedObservation || seedObservation.status !== 200) {
      throw new Error(
        "The first /api/metrix/seed response did not return HTTP 200 JSON",
      );
    }

    let seedEnvelope: unknown;
    try {
      seedEnvelope = JSON.parse(seedObservation.body);
    } catch {
      throw new Error("The first /api/metrix/seed response was not valid JSON");
    }
    if (
      !seedEnvelope ||
      typeof seedEnvelope !== "object" ||
      typeof (seedEnvelope as Record<string, unknown>).schema_version !== "string" ||
      !(
        (seedEnvelope as Record<string, unknown>).manager_account &&
        typeof (seedEnvelope as Record<string, unknown>).manager_account === "object"
      ) ||
      !Array.isArray((seedEnvelope as Record<string, unknown>).ad_accounts)
    ) {
      throw new Error(
        "The first /api/metrix/seed response did not contain the expected " +
          "schema_version, manager_account, and ad_accounts envelope",
      );
    }

    if (browserConsoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        "Authenticated landing view rendered, but the browser reported an error",
      );
    }

    console.log(
      '  ✓  authenticated landing view rendered after /api/metrix/seed returned the expected JSON envelope',
    );
    await ctx.close();
  } catch (err) {
    throw new Error(`${String(err instanceof Error ? err.message : err)}${diagnostics()}`);
  } finally {
    await browser.close();
  }
}

// The web artifact owns "/" while the separately registered API artifact owns
// "/api". This check runs through the application router (not either service's
// local port), which catches a route-ordering regression that would otherwise
// return the SPA HTML for API requests.
// True when a TCP connection to the composite router's origin is accepted at
// all. Only "nothing listens" skips the check; a listener that then answers
// wrongly is still a failure, which is the regression the check exists for.
async function compositeRouterListens(): Promise<boolean> {
  try {
    await fetch(new URL("/api/healthz", COMPOSITE_BASE_URL), {
      signal: AbortSignal.timeout(3_000),
      headers: { accept: "application/json" },
    });
    return true;
  } catch (err: any) {
    const cause = err?.cause ?? err;
    const code = String(cause?.code ?? "");
    const refusedCode = (c: string) =>
      c === "ECONNREFUSED" || c === "ENOTFOUND" || c === "EHOSTUNREACH";
    const refused =
      refusedCode(code) ||
      /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/.test(String(cause?.message ?? "")) ||
      (Array.isArray(cause?.errors) &&
        cause.errors.length > 0 &&
        cause.errors.every((e: any) => refusedCode(String(e?.code ?? ""))));
    if (refused) return false;
    // A timeout or a reset means something is there but unhealthy: let the
    // real check report it.
    return true;
  }
}

async function assertCompositeRouting(): Promise<void> {
  const healthUrl = new URL("/api/healthz", COMPOSITE_BASE_URL);
  const authUrl = new URL("/api/metrix/auth/me", COMPOSITE_BASE_URL);

  const healthResponse = await fetch(healthUrl, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  const healthContentType = healthResponse.headers.get("content-type") ?? "";
  const healthBody = await healthResponse.text();

  if (healthResponse.status !== 200 || !healthContentType.includes("json")) {
    throw new Error(
      `GET ${healthUrl.pathname} returned HTTP ${healthResponse.status} ` +
        `${healthContentType || "without content type"}: ${healthBody.slice(0, 300)}`,
    );
  }

  let health: unknown;
  try {
    health = JSON.parse(healthBody);
  } catch {
    throw new Error(`GET ${healthUrl.pathname} returned invalid JSON: ${healthBody.slice(0, 300)}`);
  }

  if (
    !health ||
    typeof health !== "object" ||
    !("status" in health) ||
    health.status !== "ok"
  ) {
    throw new Error(`GET ${healthUrl.pathname} returned unexpected JSON: ${healthBody.slice(0, 300)}`);
  }

  const authResponse = await fetch(authUrl, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  const authContentType = authResponse.headers.get("content-type") ?? "";
  const authBody = await authResponse.text();

  if (authResponse.status !== 401 || !authContentType.includes("json")) {
    throw new Error(
      `GET ${authUrl.pathname} returned HTTP ${authResponse.status} ` +
        `${authContentType || "without content type"}: ${authBody.slice(0, 300)}`,
    );
  }

  console.log(`  ✓  ${healthUrl.pathname} → 200 JSON {"status":"ok"}`);
  console.log(`  ✓  ${authUrl.pathname} → 401 JSON unauthenticated response`);
}

type PublishedHtmlProbe = {
  path: string;
  status: number;
  contentType: string;
  body: string;
};

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});

const PUBLISHED_CHECK_REQUESTED = process.argv.includes("--published");

function assertJsonContentType(
  path: string,
  status: number,
  contentType: string,
  expectedStatus: number,
) {
  if (status !== expectedStatus || !contentType.toLowerCase().includes("json")) {
    throw new Error(
      `GET ${path} returned HTTP ${status} ${
        contentType || "without content type"
      }`,
    );
  }
}

async function fetchPublished(
  baseUrl: URL,
  pathname: string,
): Promise<{ status: number; contentType: string; body: string }> {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "text/html, application/json, application/javascript" },
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}

async function assertPublishedRouting(publishedBaseUrl: string): Promise<void> {
  const baseUrl = normalizePublishedBaseUrl(publishedBaseUrl);
  const displayedBaseUrl = baseUrl.origin + (baseUrl.pathname === "/" ? "" : baseUrl.pathname);
  console.log(`\nPUBLISHED  ${displayedBaseUrl}`);

  const htmlProbes = await Promise.all(
    ["/", "/app/analysis", "/login"].map(async (path) => ({
      path,
      ...(await fetchPublished(baseUrl, path)),
    })),
  );

  const scriptAssets = new Set<string>();
  for (const probe of htmlProbes) {
    const scriptSrc = assertSpaHtmlProbe(probe);
    scriptAssets.add(new URL(scriptSrc, baseUrl).pathname);
    console.log(
      `  ✓  GET ${probe.path} → ${probe.status} ${probe.contentType} SPA entry point`,
    );
  }

  for (const assetPath of scriptAssets) {
    const asset = await fetchPublished(baseUrl, assetPath);
    if (
      asset.status !== 200 ||
      !/(javascript|ecmascript)/i.test(asset.contentType)
    ) {
      throw new Error(
        `GET ${assetPath} returned HTTP ${asset.status} ${
          asset.contentType || "without content type"
        }, not a JavaScript asset`,
      );
    }
    console.log(`  ✓  GET ${assetPath} → ${asset.status} ${asset.contentType}`);
  }

  const health = await fetchPublished(baseUrl, "/api/healthz");
  assertJsonContentType(
    "/api/healthz",
    health.status,
    health.contentType,
    200,
  );
  let healthJson: unknown;
  try {
    healthJson = JSON.parse(health.body);
  } catch {
    throw new Error(`GET /api/healthz returned invalid JSON`);
  }
  if (
    !healthJson ||
    typeof healthJson !== "object" ||
    !("status" in healthJson) ||
    healthJson.status !== "ok"
  ) {
    throw new Error(`GET /api/healthz returned unexpected JSON`);
  }
  console.log(`  ✓  GET /api/healthz → ${health.status} ${health.contentType}`);

  const auth = await fetchPublished(baseUrl, "/api/metrix/auth/me");
  assertJsonContentType(
    "/api/metrix/auth/me",
    auth.status,
    auth.contentType,
    401,
  );
  let authJson: unknown;
  try {
    authJson = JSON.parse(auth.body);
  } catch {
    throw new Error(`GET /api/metrix/auth/me returned invalid JSON`);
  }
  if (
    !authJson ||
    typeof authJson !== "object" ||
    !("message" in authJson) ||
    authJson.message !== "You must be logged in."
  ) {
    throw new Error(`GET /api/metrix/auth/me returned unexpected JSON`);
  }
  console.log(
    `  ✓  GET /api/metrix/auth/me → ${auth.status} ${auth.contentType} unauthenticated response`,
  );
}

function normalizePublishedBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("METRIX_IAP_PUBLISHED_URL is not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `METRIX_IAP_PUBLISHED_URL must use http:// or https://, got ${url.protocol}`,
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "METRIX_IAP_PUBLISHED_URL must contain only an origin and optional path",
    );
  }
  return url;
}

function assertSpaHtmlProbe(probe: PublishedHtmlProbe): string {
  if (
    probe.status !== 200 ||
    !probe.contentType.toLowerCase().includes("text/html") ||
    !/<title>\s*Metrix IAP\b/i.test(probe.body)
  ) {
    throw new Error(
      `GET ${probe.path} returned HTTP ${probe.status} ${
        probe.contentType || "without content type"
      }, not the Metrix IAP SPA entry point`,
    );
  }

  const scriptMatch = probe.body.match(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i,
  );
  if (!scriptMatch?.[1]) {
    throw new Error(`GET ${probe.path} returned SPA HTML without a script asset`);
  }
  return scriptMatch[1];
}

const PUBLISHED_BASE_URL = PUBLISHED_BASE_URL_EXPLICIT?.trim();
