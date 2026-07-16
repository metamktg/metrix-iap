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
// This check closes that gap WITHOUT touching the live generated files:
//   1. Regenerate codegen into a throwaway sandbox directory
//      (ORVAL_DRIFT_OUT, honored by lib/api-spec/orval.config.ts).
//      IMPORTANT: never regenerate in place here. Orval runs with
//      `clean: true` — it deletes and rewrites lib/*/src/generated/** mid-run,
//      and the Vite dev servers watch those files. In-place regeneration
//      crashes live browser sessions with mass HMR invalidations (broken
//      React context identity: "useAuth must be used within an AuthProvider").
//   2. Diff the sandbox output against the committed generated directories
//      -> fails loudly if they differ, meaning the committed generated types
//         had drifted from openapi.yaml.
//   3. `pnpm run typecheck`
//      -> full typecheck across all packages (rebuilds composite lib decls
//         first), catching any artifact whose code no longer matches the
//         spec. Safe because step 2 proved committed output == fresh output.
//
// Run: pnpm --filter @workspace/scripts run check:api-codegen-drift

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withValidationLock } from "./lib/validation-lock.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Committed Orval output vs its sandbox counterpart. If regenerating into the
// sandbox produces different content, the committed types were stale.
const GENERATED_PAIRS = [
  {
    committed: "lib/api-zod/src/generated",
    sandbox: "api-zod/src/generated",
  },
  {
    committed: "lib/api-client-react/src/generated",
    sandbox: "api-client-react/src/generated",
  },
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
  extraEnv?: Record<string, string>,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    console.log(`${label}...`);
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
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
  // The codegen itself now runs in a sandbox and never touches the shared
  // libs, but step 3 (`pnpm run typecheck`) still rebuilds the composite lib
  // declarations (`lib/*/dist`, .tsbuildinfo). Hold the shared validation
  // lock for that phase so concurrent build smokes never race on lib output.
  await withValidationLock("api-codegen-drift", runChecks);
}

async function runChecks() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "api-codegen-drift-"));
  // fail() exits the process directly (skipping try/finally), so also clean
  // the sandbox up on exit to avoid leaking temp dirs on failure paths.
  const cleanup = () => fs.rmSync(sandbox, { recursive: true, force: true });
  process.on("exit", cleanup);
  try {
    await regenerateIntoSandbox(sandbox);
    checkDrift(sandbox);
  } finally {
    cleanup();
  }

  // Full typecheck across all packages against the (proven in-sync) committed
  // libs. Rebuilds composite lib declarations first via typecheck:libs.
  const typecheck = await run("Typechecking all packages", "pnpm", [
    "run",
    "typecheck",
  ]).catch((err) => {
    fail("Could not run typecheck", String(err?.message ?? err));
  });
  if (typecheck.code !== 0) {
    fail(
      "Typecheck failed against rebuilt libs — an artifact's code no longer\n" +
        "matches the generated API contract. Re-run `pnpm run typecheck` to see details.",
      typecheck.output,
    );
  }

  console.log(
    "\nPASS  Generated API types are in sync with openapi.yaml and all packages typecheck.",
  );
  process.exit(0);
}

async function regenerateIntoSandbox(sandbox: string) {
  // Mirror the committed layout so generated relative imports are identical:
  // the react-query client imports its mutator as ../custom-fetch, so the
  // real custom-fetch.ts must sit next to the sandbox generated dir.
  // NOTE: orval runs prettier on its output, and prettier resolves config
  // upward from the file being formatted. The repo currently has no prettier
  // or editorconfig config, so /tmp output formats identically. If one is
  // ever added, copy it into the sandbox root here or this check will
  // false-positive on formatting drift.
  fs.mkdirSync(path.join(sandbox, "api-client-react", "src"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(sandbox, "api-zod", "src"), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, "lib", "api-client-react", "src", "custom-fetch.ts"),
    path.join(sandbox, "api-client-react", "src", "custom-fetch.ts"),
  );

  const codegen = await run(
    "Regenerating API codegen from openapi.yaml (sandboxed)",
    "pnpm",
    [
      "--filter",
      "@workspace/api-spec",
      "exec",
      "orval",
      "--config",
      "./orval.config.ts",
    ],
    { ORVAL_DRIFT_OUT: sandbox },
  ).catch((err) => {
    fail("Could not run codegen", String(err?.message ?? err));
  });
  if (codegen.code !== 0) {
    fail(
      "Codegen failed to run — check lib/api-spec/openapi.yaml and orval.config.ts",
      codegen.output,
    );
  }

  // Guard against the sandbox redirect silently not applying (e.g. the env
  // override in orval.config.ts being removed): if orval wrote nothing into
  // the sandbox, the comparison below would be meaningless.
  for (const pair of GENERATED_PAIRS) {
    const sandboxDir = path.join(sandbox, pair.sandbox);
    if (!fs.existsSync(sandboxDir) || fs.readdirSync(sandboxDir).length === 0) {
      fail(
        `Sandboxed codegen produced no output at ${pair.sandbox} — the\n` +
          "ORVAL_DRIFT_OUT override in lib/api-spec/orval.config.ts is not being honored.",
      );
    }
  }
}

function checkDrift(sandbox: string) {
  console.log("Checking generated API types for drift...");
  const problems: string[] = [];

  for (const pair of GENERATED_PAIRS) {
    const committedDir = path.join(repoRoot, pair.committed);
    const sandboxDir = path.join(sandbox, pair.sandbox);
    compareDirs(committedDir, sandboxDir, pair.committed, problems);
  }

  if (problems.length > 0) {
    fail(
      "Generated API types are STALE — they drifted from lib/api-spec/openapi.yaml.\n" +
        "Someone edited the OpenAPI spec without regenerating the committed types.\n\n" +
        "Fix it by running:\n" +
        "    pnpm --filter @workspace/api-spec run codegen\n" +
        "then commit the updated files under:\n" +
        GENERATED_PAIRS.map((p) => `    ${p.committed}`).join("\n"),
      `\n--- drift ---\n${problems.join("\n")}`,
    );
  }
}

// Recursively compare committed vs freshly generated trees, reporting
// missing, extra, and content-different files (paths relative to repo root).
function compareDirs(
  committedDir: string,
  sandboxDir: string,
  label: string,
  problems: string[],
  rel = "",
) {
  const committedEntries = listDir(path.join(committedDir, rel));
  const sandboxEntries = listDir(path.join(sandboxDir, rel));
  const names = new Set([...committedEntries.keys(), ...sandboxEntries.keys()]);

  for (const name of [...names].sort()) {
    const relPath = rel ? path.join(rel, name) : name;
    const inCommitted = committedEntries.get(name);
    const inSandbox = sandboxEntries.get(name);

    if (inCommitted === undefined) {
      problems.push(`missing (spec now generates it): ${label}/${relPath}`);
      continue;
    }
    if (inSandbox === undefined) {
      problems.push(`stale (spec no longer generates it): ${label}/${relPath}`);
      continue;
    }
    if (inCommitted !== inSandbox) {
      problems.push(
        `type mismatch (file vs directory): ${label}/${relPath}`,
      );
      continue;
    }
    if (inCommitted === "dir") {
      compareDirs(committedDir, sandboxDir, label, problems, relPath);
      continue;
    }
    const committedContent = fs.readFileSync(
      path.join(committedDir, relPath),
      "utf8",
    );
    const sandboxContent = fs.readFileSync(
      path.join(sandboxDir, relPath),
      "utf8",
    );
    if (committedContent !== sandboxContent) {
      problems.push(`content differs: ${label}/${relPath}`);
    }
  }
}

function listDir(dir: string): Map<string, "file" | "dir"> {
  const out = new Map<string, "file" | "dir">();
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    out.set(entry.name, entry.isDirectory() ? "dir" : "file");
  }
  return out;
}

main().catch((err) => {
  fail("Codegen drift check crashed", String(err?.stack ?? err));
});
