// Build-safety check: catch stale generated API types before they break the build.
//
// The api-server, metrix-iap, and marketing apps all consume the shared,
// generated API contract types (`lib/api-zod`, `lib/api-client-react`) that are
// produced from `lib/api-spec/openapi.yaml` by Orval. Because those libs are
// composite TypeScript project references, an isolated per-artifact typecheck
// can pass or fail purely depending on whether the libs were rebuilt first —
// so a spec change whose committed codegen output was never regenerated (or
// whose libs were never rebuilt) can slip through and only explode at build
// time (e.g. "property X does not exist" against a stale .d.ts).
//
// This check closes that gap by running the canonical full sequence:
//   1. `pnpm --filter @workspace/api-spec run codegen`
//        -> regenerates lib/api-zod + lib/api-client-react from the spec,
//           then rebuilds the composite lib declarations (typecheck:libs).
//   2. `git diff` over the generated directories
//        -> fails loudly if regenerating produced any change, meaning the
//           committed generated types had drifted from openapi.yaml.
//   3. `pnpm run typecheck`
//        -> full typecheck across all packages against the freshly rebuilt
//           libs, catching any artifact whose code no longer matches the spec.
//
// Run: pnpm --filter @workspace/scripts run check:api-codegen-drift

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Directories that hold Orval-generated output. If codegen changes any of
// these, the committed types were stale.
const GENERATED_PATHS = [
  "lib/api-zod/src/generated",
  "lib/api-client-react/src/generated",
];

function fail(message: string, extra?: string): never {
  console.error(`\nFAIL  ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

function run(
  label: string,
  command: string,
  args: string[],
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    console.log(`${label}...`);
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main() {
  // 1. Regenerate codegen from the spec (also rebuilds composite lib decls).
  const codegen = await run("Regenerating API codegen from openapi.yaml", "pnpm", [
    "--filter",
    "@workspace/api-spec",
    "run",
    "codegen",
  ]).catch((err) => {
    fail("Could not run codegen", String(err?.message ?? err));
  });
  if (codegen.code !== 0) {
    fail(
      "Codegen failed to run — check lib/api-spec/openapi.yaml and orval.config.ts",
      codegen.output,
    );
  }

  // 2. Detect drift: if regenerating changed committed generated output, the
  //    types were stale. `git diff --exit-code` returns 1 when there are
  //    differences. (This is a read-only inspection, not a VCS mutation.)
  const diff = await run("Checking generated API types for drift", "git", [
    "diff",
    "--exit-code",
    "--",
    ...GENERATED_PATHS,
  ]).catch((err) => {
    fail("Could not inspect git diff for generated types", String(err?.message ?? err));
  });

  if (diff.code !== 0) {
    fail(
      "Generated API types are STALE — they drifted from lib/api-spec/openapi.yaml.\n" +
        "Someone edited the OpenAPI spec without regenerating the committed types.\n\n" +
        "Fix it by running:\n" +
        "    pnpm --filter @workspace/api-spec run codegen\n" +
        "then commit the updated files under:\n" +
        GENERATED_PATHS.map((p) => `    ${p}`).join("\n"),
      diff.output ? `\n--- git diff ---\n${diff.output}` : undefined,
    );
  }

  // 3. Full typecheck across all packages against the freshly rebuilt libs.
  const typecheck = await run("Typechecking all packages", "pnpm", [
    "run",
    "typecheck",
  ]).catch((err) => {
    fail("Could not run typecheck", String(err?.message ?? err));
  });
  if (typecheck.code !== 0) {
    fail(
      "Typecheck failed against freshly rebuilt libs — an artifact's code no longer\n" +
        "matches the generated API contract. Re-run `pnpm run typecheck` to see details.",
      typecheck.output,
    );
  }

  console.log(
    "\nPASS  Generated API types are in sync with openapi.yaml and all packages typecheck.",
  );
  process.exit(0);
}

main().catch((err) => {
  fail("Codegen drift check crashed", String(err?.stack ?? err));
});
