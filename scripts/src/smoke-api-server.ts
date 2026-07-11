// Smoke check for the API server: builds the bundle, boots it, and asserts
// GET /api/healthz responds with 200 {"status":"ok"}.
//
// Catches the class of regression where the server crashes at module
// evaluation (leftover imports, missing symbols, bad env handling) that
// typecheck alone does not surface.
//
// Run: pnpm --filter @workspace/scripts run smoke:api-server
//
// Deliberately runs WITHOUT Supabase env vars so we also verify that the
// health endpoint does not depend on external services being reachable.

import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withValidationLock } from "./lib/validation-lock.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const serverDir = path.join(repoRoot, "artifacts/api-server");
const entry = path.join(serverDir, "dist/index.mjs");

const BOOT_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;

function fail(message: string, extra?: string): never {
  console.error(`\nFAIL  ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not determine free port")));
      }
    });
    srv.on("error", reject);
  });
}

function runBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("Building API server bundle...");
    const build = spawn(
      "pnpm",
      ["--filter", "@workspace/api-server", "run", "build"],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    build.stdout.on("data", (d) => (output += d));
    build.stderr.on("data", (d) => (output += d));
    build.on("error", reject);
    build.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build exited with code ${code}\n${output}`));
      }
    });
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // The esbuild bundle step imports the shared generated API libs, which the
  // api-codegen-drift check deletes and rewrites mid-run. Hold the shared
  // validation lock while building so concurrent batches never race; the
  // boot + health check afterwards doesn't touch the libs.
  await withValidationLock("api-smoke", () =>
    runBuild().catch((err) => {
      fail("API server build failed", String(err?.message ?? err));
    }),
  );

  const port = await getFreePort();
  console.log(`Booting server from ${path.relative(repoRoot, entry)} on port ${port}...`);

  // Strip Supabase env so the smoke check proves the health endpoint works
  // without Supabase being configured or reachable. DATABASE_URL must be
  // present (the server fails fast without it by design), but the pg pool is
  // lazy — no connection is made at boot — so a dummy value suffices when the
  // real one is absent.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["NEXT_PUBLIC_SUPABASE_URL"];
  delete env["SUPABASE_SERVICE_ROLE_KEY"];
  delete env["SUPABASE_DB_URL"];
  if (!env["DATABASE_URL"]) {
    env["DATABASE_URL"] =
      "postgresql://smoke:smoke@127.0.0.1:1/smoke_unreachable";
  }
  env["PORT"] = String(port);
  env["NODE_ENV"] = "production";

  let serverOutput = "";
  let exited: { code: number | null; signal: NodeJS.Signals | null } | null =
    null;

  const server: ChildProcess = spawn("node", ["--enable-source-maps", entry], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => (serverOutput += d));
  server.stderr?.on("data", (d) => (serverOutput += d));
  server.on("exit", (code, signal) => {
    exited = { code, signal };
  });

  const cleanup = () => {
    if (!server.killed) server.kill("SIGTERM");
  };
  process.on("exit", cleanup);

  const url = `http://127.0.0.1:${port}/api/healthz`;
  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (exited !== null) {
      const { code, signal } = exited as {
        code: number | null;
        signal: NodeJS.Signals | null;
      };
      fail(
        `API server crashed at startup (exit code ${code}, signal ${signal ?? "none"})`,
        `--- server output ---\n${serverOutput || "(no output)"}`,
      );
    }

    try {
      const res = await fetch(url);
      const body: unknown = await res.json().catch(() => null);
      const status =
        body !== null && typeof body === "object" && "status" in body
          ? (body as { status?: unknown }).status
          : undefined;

      if (res.status === 200 && status === "ok") {
        console.log(`\nPASS  GET /api/healthz → 200 {"status":"ok"}`);
        cleanup();
        process.exit(0);
      }

      fail(
        `Health endpoint returned unexpected response: HTTP ${res.status} body=${JSON.stringify(body)}`,
        `--- server output ---\n${serverOutput || "(no output)"}`,
      );
    } catch {
      // Server not accepting connections yet — keep polling.
    }

    await sleep(POLL_INTERVAL_MS);
  }

  fail(
    `API server did not become healthy within ${BOOT_TIMEOUT_MS / 1000}s`,
    `--- server output ---\n${serverOutput || "(no output)"}`,
  );
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
