// Smoke check for the Metrix IAP vitest suite.
//
// Runs `vitest run` for the metrix-iap package and asserts all tests pass.
// Catches the class of regression where a jsdom environment bug (missing
// polyfill, broken mock, etc.) causes test failures that would otherwise
// only be noticed manually.
//
// Run: pnpm --filter @workspace/scripts run smoke:metrix-iap-tests

import { spawn } from "node:child_process";
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

async function main() {
  console.log("Running @workspace/metrix-iap vitest suite...");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@workspace/metrix-iap", "run", "test"],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
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
            `vitest exited with code ${code}\n--- output ---\n${output || "(no output)"}`,
          ),
        );
      }
    });
  }).catch((err) => {
    fail("Metrix IAP test suite failed", String(err?.message ?? err));
  });

  console.log("\nPASS  Metrix IAP test suite passed");
  process.exit(0);
}

main().catch((err) => {
  fail("Smoke check crashed", String(err?.stack ?? err));
});
