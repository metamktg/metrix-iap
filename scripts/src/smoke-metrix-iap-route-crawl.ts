// Smoke check: visit every navigable route and watch for breakage.
//
// Boots the metrix-iap Vite dev server on an isolated port, waits for it to
// be ready, runs the Playwright spec at tests/e2e/metrix-iap-route-crawl.spec.ts,
// then tears the server down. API responses are mocked inside the spec, so no
// running API server is required.
//
// Assertions (in the spec):
//   Per visit: no uncaught exception, no console error, and the page rendered
//   its own content rather than the seed error screen, the route-level 404,
//   or nothing. Routes come from navTree AND App.tsx, and each is walked
//   against a configured account, an iap-is-null account, and the mixed
//   unconfigured-with-data account.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-route-crawl

import { spawn, type ChildProcess } from "node:child_process";
import { spawnGroup, killGroup } from "./lib/process-group.js";
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

// ── dev server ──────────────────────────────────────────────────────────────

// Port 15196: unique to this smoke so it never collides with concurrent runs.
const DEV_PORT = "15196";

async function startDevServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawnGroup(
      "pnpm",
      ["--filter", "@workspace/metrix-iap", "run", "dev"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PORT: DEV_PORT,
          BASE_PATH: "/",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let ready = false;

    const onData = (chunk: Buffer) => {
      const line = chunk.toString();
      process.stdout.write(line);
      // Vite prints "Local:" or "ready in" when the server is listening.
      if (!ready && /Local:|ready in|localhost/i.test(line)) {
        ready = true;
        resolve(child);
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("error", reject);
    child.on("exit", (code) => {
      if (!ready) {
        reject(new Error(`Dev server exited prematurely with code ${code}`));
      }
    });

    // Hard timeout.
    setTimeout(() => {
      if (!ready) {
        killGroup(child);
        reject(new Error("Dev server did not become ready within 60 s"));
      }
    }, 60_000);
  });
}

// ── test runner ─────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  return new Promise((resolve, reject) => {
    const specPath = path.join(repoRoot, "tests/e2e/metrix-iap-route-crawl.spec.ts");
    const child = spawn("pnpm", ["exec", "tsx", specPath], {
      cwd: repoRoot,
      env: { ...process.env, METRIX_IAP_BASE_URL: `http://localhost:${DEV_PORT}` },
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
      if (code === 0) resolve();
      else reject(new Error(`Route crawl failed (exit ${code})\n--- output ---\n${output || "(no output)"}`));
    });
  });
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting @workspace/metrix-iap dev server...");
  const server = await startDevServer().catch((err) => {
    fail("Failed to start metrix-iap dev server", String(err?.message ?? err));
  });

  try {
    // Vite prints "ready" as soon as the HTTP server binds, but the first
    // request triggers module transforms that can take several seconds under
    // load — poll until it actually answers before handing off to Playwright.
    const warmupDeadline = Date.now() + 45_000;
    let warmedUp = false;
    while (Date.now() < warmupDeadline) {
      try {
        const res = await fetch(`http://localhost:${DEV_PORT}/`, { signal: AbortSignal.timeout(4_000) });
        if (res.status < 500) {
          warmedUp = true;
          break;
        }
      } catch {
        // server not yet responding — keep polling
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!warmedUp) {
      killGroup(server);
      fail("Dev server did not respond within 45 s after signalling ready");
    }

    console.log("\nRunning route crawl...\n");
    await runTests().catch((err) => {
      fail("Route crawl failed", String(err?.message ?? err));
    });
  } finally {
    killGroup(server);
  }

  console.log("\nPASS  Route crawl");
}

main().catch((err) => {
  fail("Unexpected error", String(err?.stack ?? err));
});
