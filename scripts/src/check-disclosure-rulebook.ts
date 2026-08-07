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
//     TYPE.microLabel / TYPE.label / TYPE.title / TYPE.body / TYPE.caption instead.
//
// Suppression: add `// disclosure-ok` on the same line for a deliberate,
// reviewed exception (e.g. a one-off decorative element outside the TYPE scale).
//
// Enforcement is a RATCHET, not a hard zero: `disclosure-rulebook.baseline.json`
// records the known violation count per file. A file may never exceed its
// baseline count, and a brand-new file may not introduce any violations at
// all (no baseline entry = 0 allowed) — this is exactly how freshly-written
// screens (e.g. the MST Cross-Map merge) slipped in fresh ad-hoc classes
// unnoticed. Fixed a file below its baseline? Lower that file's count in
// disclosure-rulebook.baseline.json in the same PR — the baseline only ever
// ratchets down, never up.
//
// Run: pnpm --filter @workspace/scripts run check:disclosure-rulebook
// Re-seed (after fixing files, to lower the baseline): pass --write-baseline

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TARGET_DIR = path.join(repoRoot, "artifacts/metrix-iap/src/pages/metrix");
const BASELINE_PATH = path.join(repoRoot, "scripts/src/disclosure-rulebook.baseline.json");
const EXTENSIONS = new Set([".tsx", ".ts"]);

// Matches text-[10px], text-[10.5px], text-[1rem] is NOT matched (px only —
// the TYPE scale and every rem-based Tailwind utility are both fine).
const VIOLATION_RE = /text-\[\d+(?:\.\d+)?px\]/g;

const SUPPRESSION_MARKER = "disclosure-ok";

type Violation = { file: string; line: number; col: number; snippet: string };
type Baseline = { maxTotalViolations: number; perFile: Record<string, number> };

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

function groupByFile(violations: Violation[]): Map<string, Violation[]> {
  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }
  return byFile;
}

function loadBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    fail(
      `Baseline file not found: ${path.relative(repoRoot, BASELINE_PATH)}`,
      "Run with --write-baseline to seed it from the current violation count.",
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as Baseline;
}

function writeBaseline(byFile: Map<string, Violation[]>, totalCount: number): void {
  const perFile: Record<string, number> = {};
  for (const [file, vs] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    perFile[file] = vs.length;
  }
  const baseline: Baseline = { maxTotalViolations: totalCount, perFile };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(
    `\nWrote baseline: ${totalCount} violation(s) across ${byFile.size} file(s) → ` +
      `${path.relative(repoRoot, BASELINE_PATH)}`,
  );
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
  const byFile = groupByFile(allViolations);

  if (process.argv.includes("--write-baseline")) {
    writeBaseline(byFile, allViolations.length);
    process.exit(0);
  }

  const baseline = loadBaseline();

  const overBaseline: { file: string; count: number; allowed: number }[] = [];
  const noBaselineEntry: { file: string; count: number }[] = [];
  for (const [file, vs] of byFile) {
    const allowed = baseline.perFile[file];
    if (allowed === undefined) {
      noBaselineEntry.push({ file, count: vs.length });
    } else if (vs.length > allowed) {
      overBaseline.push({ file, count: vs.length, allowed });
    }
  }
  const totalOverBaseline = allViolations.length > baseline.maxTotalViolations;

  if (overBaseline.length === 0 && noBaselineEntry.length === 0 && !totalOverBaseline) {
    console.log(
      `\nPASS  ${allViolations.length} raw pixel text-size class(es) — at or under the ` +
        `${baseline.maxTotalViolations}-violation baseline across ${files.length} module page file(s).\n` +
        "      No file exceeds its recorded baseline; no new file introduces fresh violations.",
    );
    process.exit(0);
  }

  console.error(
    `\nFAIL  Disclosure-rulebook baseline exceeded.\n` +
      `      Scanned ${files.length} file(s) under ${path.relative(repoRoot, TARGET_DIR)}\n`,
  );

  if (noBaselineEntry.length > 0) {
    console.error("  New file(s) with no baseline entry (0 raw-pixel classes allowed):");
    for (const { file, count } of noBaselineEntry) {
      console.error(`    ${file} — ${count} violation(s)`);
      for (const v of byFile.get(file)!) console.error(`      L${v.line}:${v.col}  ${v.snippet}`);
    }
    console.error();
  }

  if (overBaseline.length > 0) {
    console.error("  File(s) exceeding their baseline:");
    for (const { file, count, allowed } of overBaseline) {
      console.error(`    ${file} — ${count} violation(s), baseline allows ${allowed}`);
      for (const v of byFile.get(file)!) console.error(`      L${v.line}:${v.col}  ${v.snippet}`);
    }
    console.error();
  }

  if (totalOverBaseline) {
    console.error(
      `  Total violations (${allViolations.length}) exceed the baseline sum (${baseline.maxTotalViolations}).\n`,
    );
  }

  console.error(
    "Fix: replace text-[Npx] with TYPE.microLabel / TYPE.label / TYPE.title / TYPE.body / TYPE.caption\n" +
      "     (artifacts/metrix-iap/src/pages/metrix/typography.ts).\n" +
      "\n" +
      "Fixed a file below its baseline? Re-run with --write-baseline to lower the\n" +
      "recorded counts — the baseline only ever ratchets down, never up.\n" +
      "\n" +
      "To suppress a deliberate, reviewed exception, add `// disclosure-ok` on the same line.",
  );

  process.exit(1);
}

main();
