// Drift check for the Command Deck design system's generated token files.
//
// tokens.json is the single source of truth, but consumers actually read the
// generated artifacts (src/index.css and src/generated/tokens.tsx) produced by
// scripts/build-tokens.mjs. If the generated files go stale (hand-edited, or
// not regenerated after a tokens.json change), shipped colors can silently
// differ from the values the contrast check validates.
//
// This check regenerates both outputs in memory using the generator's own
// buildCss/buildTs functions and byte-compares them against the checked-in
// files. Any mismatch fails loudly with the first differing lines.
//
// Run: pnpm --filter @workspace/scripts run check:command-deck-token-drift
// Fix: pnpm --filter @workspace/command-deck exec node scripts/build-tokens.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const dsRoot = path.join(repoRoot, "artifacts/command-deck");
const TOKENS_FILE = path.join(dsRoot, "tokens.json");
const GENERATOR = path.join(dsRoot, "scripts/build-tokens.mjs");

type Target = {
  label: string;
  file: string;
  build: (tokens: unknown) => string;
};

function firstDiff(expected: string, actual: string): string {
  const e = expected.split("\n");
  const a = actual.split("\n");
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] !== a[i]) {
      return [
        `    first difference at line ${i + 1}:`,
        `      expected: ${JSON.stringify(e[i] ?? "<missing line>")}`,
        `      actual:   ${JSON.stringify(a[i] ?? "<missing line>")}`,
      ].join("\n");
    }
  }
  return "    files differ only in trailing content/length";
}

async function main() {
  for (const f of [TOKENS_FILE, GENERATOR]) {
    if (!fs.existsSync(f)) {
      console.error(`\nFAIL  required file not found: ${f}`);
      process.exit(1);
    }
  }

  const generator = (await import(pathToFileURL(GENERATOR).href)) as {
    buildCss?: (tokens: unknown) => string;
    buildTs?: (tokens: unknown) => string;
  };
  if (
    typeof generator.buildCss !== "function" ||
    typeof generator.buildTs !== "function"
  ) {
    console.error(
      `\nFAIL  ${path.relative(repoRoot, GENERATOR)} no longer exports buildCss/buildTs — update this drift check to match the generator.`,
    );
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8")) as unknown;

  const targets: Target[] = [
    {
      label: "web theme CSS",
      file: path.join(dsRoot, "src/index.css"),
      build: generator.buildCss,
    },
    {
      label: "portable tokens TS",
      file: path.join(dsRoot, "src/generated/tokens.tsx"),
      build: generator.buildTs,
    },
  ];

  console.log(
    `\nChecking generated Command Deck token files against ${path.relative(repoRoot, TOKENS_FILE)}\n`,
  );

  const failures: string[] = [];
  for (const t of targets) {
    const rel = path.relative(repoRoot, t.file);
    if (!fs.existsSync(t.file)) {
      console.error(`  FAIL  ${t.label}  ${rel}  (file missing)`);
      failures.push(`${rel} is missing — run the generator to create it.`);
      continue;
    }
    let expected: string;
    try {
      expected = t.build(tokens);
    } catch (err) {
      console.error(`  FAIL  ${t.label}  generator threw: ${String(err)}`);
      failures.push(`generator failed for ${rel}: ${String(err)}`);
      continue;
    }
    const actual = fs.readFileSync(t.file, "utf-8");
    if (actual === expected) {
      console.log(`  PASS  ${t.label}  ${rel}  matches tokens.json`);
    } else {
      console.error(`  FAIL  ${t.label}  ${rel}  DRIFTED from tokens.json`);
      console.error(firstDiff(expected, actual));
      failures.push(`${rel} does not match what tokens.json generates.`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `\nFAIL  ${failures.length} generated file(s) drifted from tokens.json:\n`,
    );
    for (const f of failures) console.error(`  • ${f}`);
    console.error(
      "\nFix: regenerate the outputs from the source of truth:\n" +
        "  pnpm --filter @workspace/command-deck exec node scripts/build-tokens.mjs\n" +
        "Never hand-edit src/index.css or src/generated/tokens.tsx — edit tokens.json instead.\n",
    );
    process.exit(1);
  }

  console.log(
    "\nPASS  Generated CSS/TS token files are in sync with tokens.json.\n",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`\nFAIL  unexpected error: ${String(err)}`);
  process.exit(1);
});
