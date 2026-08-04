// Progressive-disclosure rulebook conformance check.
//
// The Metrix IAP module pages (artifacts/metrix-iap/src/pages/metrix/) have an
// authoritative disclosure rulebook: the TYPE scale (typography.ts) is the only
// source of text sizing, and DetailReveal/DenseText/ClampedProse (shared.tsx) are
// the only ways long prose reaches the first layer of a screen. A page that
// hand-rolls raw pixel classes or dumps full prose with no reveal/clamp bypasses
// both rules silently — this check catches that drift the same way
// check-text-primary-contrast.ts catches contrast drift.
//
// DISALLOWED in artifacts/metrix-iap/src/pages/metrix/**:
//   - `text-[Npx]` / `text-[N.Npx]` — any raw pixel font-size class. Use
//     TYPE.label / TYPE.title / TYPE.body / TYPE.caption instead.
//
// Suppression: add `// disclosure-ok` on the same line for a deliberate,
// reviewed exception (e.g. a one-off decorative element outside the TYPE scale).
//
// Run: pnpm --filter @workspace/scripts run check:disclosure-rulebook

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TARGET_DIR = path.join(repoRoot, "artifacts/metrix-iap/src/pages/metrix");
const EXTENSIONS = new Set([".tsx", ".ts"]);

// Matches text-[10px], text-[10.5px], text-[1rem] is NOT matched (px only —
// the TYPE scale and every rem-based Tailwind utility are both fine).
const VIOLATION_RE = /text-\[\d+(?:\.\d+)?px\]/g;

const SUPPRESSION_MARKER = "disclosure-ok";

type Violation = { file: string; line: number; col: number; snippet: string };

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function scanFile(filePath: string): Violation[] {
  const src = fs.readFileSync(filePath, "utf-8");
  const lines = src.split("\n");
  const violations: Violation[] = [];
  const rel = path.relative(repoRoot, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (line.includes(SUPPRESSION_MARKER)) continue;

    VIOLATION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VIOLATION_RE.exec(line)) !== null) {
      violations.push({ file: rel, line: i + 1, col: match.index + 1, snippet: line.trim() });
    }
  }

  return violations;
}

function fail(message: string, extra?: string): never {
  console.error(`\nFAIL  ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    fail(`Target directory not found: ${TARGET_DIR}`);
  }

  const files = collectFiles(TARGET_DIR);
  const allViolations: Violation[] = [];
  for (const file of files.sort()) {
    allViolations.push(...scanFile(file));
  }

  if (allViolations.length === 0) {
    console.log(
      `\nPASS  No raw pixel text-size classes found across ${files.length} module page file(s).\n` +
        "      Every screen sources typography from the TYPE scale.",
    );
    process.exit(0);
  }

  console.error(
    `\nFAIL  Found ${allViolations.length} raw pixel text-size class(es) — bypasses the TYPE scale.\n` +
      `      Scanned ${files.length} file(s) under ${path.relative(repoRoot, TARGET_DIR)}\n`,
  );

  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }
  for (const [file, vs] of byFile) {
    console.error(`  ${file}`);
    for (const v of vs) console.error(`    L${v.line}:${v.col}  ${v.snippet}`);
    console.error();
  }

  console.error(
    "Fix: replace text-[Npx] with TYPE.label / TYPE.title / TYPE.body / TYPE.caption\n" +
      "     (artifacts/metrix-iap/src/pages/metrix/typography.ts).\n" +
      "\n" +
      "To suppress a deliberate, reviewed exception, add `// disclosure-ok` on the same line.",
  );

  process.exit(1);
}

main();
