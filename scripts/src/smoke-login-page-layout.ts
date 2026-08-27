// Smoke check: Metrix IAP login page split-panel layout (Playwright).
//
// Boots the metrix-iap Vite dev server on an isolated port, waits for it to
// be ready, runs the Playwright layout spec from
// tests/e2e/login-page-layout.spec.ts, then tears the server down.
//
// Run: pnpm --filter @workspace/scripts run smoke:login-page-layout

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

// Use a port that is unlikely to collide with the real metrix-iap workflow.
const DEV_PORT = "15176";

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
    const specPath = path.join(repoRoot, "tests/e2e/login-page-layout.spec.ts");
    const child = spawn("pnpm", ["exec", "tsx", specPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        METRIX_IAP_BASE_URL: `http://localhost:${DEV_PORT}`,
      },
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
            `Login page layout e2e tests failed (exit ${code})\n--- output ---\n${output || "(no output)"}`,
          ),
        );
      }
    });
  });
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting @workspace/metrix-iap dev server for login layout e2e tests...");
  const server = await startDevServer().catch((err) => {
    fail("Failed to start metrix-iap dev server", String(err?.message ?? err));
  });

  try {
    // Poll the dev server until it actually serves a response before handing
    // off to Playwright.  Vite prints "ready" as soon as the HTTP server
    // binds, but the first request triggers module transforms that can take
    // several seconds under load — if Playwright hits the page before those
    // transforms finish it gets a 30 s timeout.  Polling here absorbs that
    // warm-up time so the first Playwright goto always finds a live server.
    const warmupUrl = `http://localhost:${DEV_PORT}/`;
    const warmupDeadline = Date.now() + 45_000;
    let warmedUp = false;
    while (Date.now() < warmupDeadline) {
      try {
        const res = await fetch(warmupUrl, { signal: AbortSignal.timeout(4_000) });
        if (res.status < 500) { warmedUp = true; break; }
      } catch {
        // server not yet responding — keep polling
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!warmedUp) {
      killGroup(server);
      fail("Dev server did not respond within 45 s after signalling ready");
    }

    console.log("\nRunning login page layout e2e tests...\n");
    await runTests().catch((err) => {
      fail("Login page layout e2e tests failed", String(err?.message ?? err));
    });
  } finally {
    killGroup(server);
  }

  console.log("\nPASS  Login page layout e2e tests passed.");
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
