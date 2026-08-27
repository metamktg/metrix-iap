// Smoke check: session cookie set at registration persists across a hard page
// reload (Playwright).
//
// Boots the metrix-iap Vite dev server on an isolated port, waits for it to
// be ready, runs the Playwright spec at
// tests/e2e/register-session-persistence.spec.ts, then tears the server down.
//
// API calls (auth/me, register, seed, workspace reports) are mocked inside
// the spec itself, so no running API server is required.
//
// Assertions in the spec:
//   1. Submitting the Create Account form transitions to the authenticated
//      app shell (login form disappears).
//   2. After page.reload(), the session cookie is still present in the
//      browser's cookie jar and auth/me returns the user — the login form
//      never reappears.
//   3. Control group: without a cookie, reload correctly shows the login page.
//
// Run: pnpm --filter @workspace/scripts run smoke:register-session-persistence

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

// Isolated port — does not collide with other smoke-check workflows (15174–15177).
const DEV_PORT = "15178";

async function startDevServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawnGroup(
      "pnpm",
      ["--filter", "@workspace/metrix-iap", "run", "dev"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PORT:      DEV_PORT,
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
    const specPath = path.join(
      repoRoot,
      "tests/e2e/register-session-persistence.spec.ts",
    );
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
            `Register session-persistence e2e tests failed (exit ${code})\n--- output ---\n${output || "(no output)"}`,
          ),
        );
      }
    });
  });
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    "Starting @workspace/metrix-iap dev server for register-session-persistence e2e tests...",
  );
  const server = await startDevServer().catch((err) => {
    fail(
      "Failed to start metrix-iap dev server",
      String(err?.message ?? err),
    );
  });

  try {
    // Brief pause so Vite finishes HMR setup before Playwright navigates.
    await new Promise((r) => setTimeout(r, 1500));

    console.log("\nRunning register session-persistence e2e tests...\n");
    await runTests().catch((err) => {
      fail(
        "Register session-persistence e2e tests failed",
        String(err?.message ?? err),
      );
    });
  } finally {
    killGroup(server);
  }

  console.log("\nPASS  Register session-persistence e2e tests passed.");
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
