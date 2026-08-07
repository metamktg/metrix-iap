// Smoke check: IAP Library review queue e2e — deconstruction review tab,
// empty state, below-gate item rendering, and bypass confirmation.
//
// Boots the metrix-iap Vite dev server on an isolated port, waits for it to
// be ready, runs the Playwright spec at
// tests/e2e/metrix-iap-review-queue.spec.ts, then tears the server down.
// API responses are mocked inside the spec so no running API server is needed.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-review-queue

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

// Use a port that is unlikely to collide with other smoke-test workflows.
const DEV_PORT = "15189";

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

async function runTests(): Promise<void> {
  return new Promise((resolve, reject) => {
    const specPath = path.join(
      repoRoot,
      "tests/e2e/metrix-iap-review-queue.spec.ts",
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
            `Review queues e2e tests failed (exit ${code})\n--- output ---\n${output || "(no output)"}`,
          ),
        );
      }
    });
  });
}

async function main() {
  console.log(
    "Starting @workspace/metrix-iap dev server for Review queue e2e tests...",
  );
  const server = await startDevServer().catch((err) => {
    fail("Failed to start metrix-iap dev server", String(err?.message ?? err));
  });

  try {
    await new Promise((r) => setTimeout(r, 2000));

    console.log("\nRunning Review queue e2e tests...\n");
    await runTests().catch((err) => {
      fail("Review queue e2e tests failed", String(err?.message ?? err));
    });
  } finally {
    server.kill();
  }

  console.log("\nPASS  Review queue e2e tests passed.");
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
