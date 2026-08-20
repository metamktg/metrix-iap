// Smoke check: manual CSV import flow end-to-end (Playwright).
//
// Boots the metrix-iap Vite dev server on a private port, waits for it
// to be ready, runs the Playwright spec at
// tests/e2e/metrix-iap-manual-import.spec.ts, then tears the server down.
// API responses (auth/me, seed, reports, and the full manual-imports /
// analysis-runs surface) are mocked inside the spec itself so no running
// API server or Supabase is required.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-manual-import

import { spawn, type ChildProcess } from "node:child_process";
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

const DEV_PORT = "15194"; // private port; won't collide with any other workflow

async function startDevServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(
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
      // Vite prints "Local:" or "ready in" when the dev server is up.
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

    setTimeout(() => {
      if (!ready) {
        child.kill();
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
      "tests/e2e/metrix-iap-manual-import.spec.ts",
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
            `Manual-import e2e tests failed (exit ${code})\n--- output ---\n${output || "(no output)"}`,
          ),
        );
      }
    });
  });
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    "Starting @workspace/metrix-iap dev server for manual-import e2e tests...",
  );
  const server = await startDevServer().catch((err) => {
    fail(
      "Failed to start metrix-iap dev server",
      String(err?.message ?? err),
    );
  });

  try {
    // Brief pause so Vite finishes HMR setup.
    await new Promise((r) => setTimeout(r, 2000));

    console.log("\nRunning manual-import e2e tests...\n");
    await runTests().catch((err) => {
      fail("Manual-import e2e tests failed", String(err?.message ?? err));
    });
  } finally {
    server.kill();
  }

  console.log("\nPASS  Manual-import e2e tests passed.");
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
