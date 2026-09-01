// Smoke check: what the IAP does when the data service fails.
//
// Boots the metrix-iap Vite dev server on an isolated port, waits for it to
// be ready, runs the Playwright spec at tests/e2e/metrix-iap-failure-injection.spec.ts,
// then tears the server down. API responses are mocked inside the spec, so no
// running API server is required.
//
// Assertions (in the spec):
//   A 503 at boot renders the error screen with a Retry, not a blank page.
//   Retry re-requests the seed and brings the app back.
//   A truncated response body fails to the error screen with no uncaught exception.
//   A refresh that fails AFTER a good load (driven through the real rename
//   mutation, which invalidates the seed) keeps the dashboard rendered and
//   shows the staleness strip instead of taking over the screen.
//   The strip's Refresh clears it once the service returns.
//   A revoked session lands on the login page, not the strip.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-failure-injection

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

// Port 15195: unique to this smoke so it never collides with concurrent runs.
const DEV_PORT = "15195";

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
    const specPath = path.join(repoRoot, "tests/e2e/metrix-iap-failure-injection.spec.ts");
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
      else reject(new Error(`Failure injection e2e failed (exit ${code})\n--- output ---\n${output || "(no output)"}`));
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

    console.log("\nRunning failure injection e2e...\n");
    await runTests().catch((err) => {
      fail("Failure injection e2e failed", String(err?.message ?? err));
    });
  } finally {
    killGroup(server);
  }

  console.log("\nPASS  Failure injection e2e");
}

main().catch((err) => {
  fail("Unexpected error", String(err?.stack ?? err));
});
