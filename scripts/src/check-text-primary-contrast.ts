// Contrast-safety check: catch bare `text-primary` usage on foreground text/icon elements.
//
// The `--color-primary` token (#145BFC) has ~3:1 contrast on the dark cockpit
// background (#050b18) — below WCAG AA for small text. The accessible token
// for interactive foreground text is `text-interactive` (#5c9bff, ~6.5:1).
//
// DISALLOWED:
//   - `text-primary`       — bare (no Tailwind modifier prefix)
//   - `text-primary/N`     — opacity variants still use the low-contrast blue
//
// ALLOWED (not flagged):
//   - `text-primary-foreground`   — white text on primary-colored backgrounds
//   - `hover:text-primary`        — modifier-gated; only active on container hover
//   - `focus:text-primary`        — modifier-gated
//   - `active:text-primary`       — modifier-gated
//   - `group-hover:text-primary`  — modifier-gated
//   - `data-[...]:text-primary`   — modifier-gated
//   - Any other `<modifier>:text-primary` — safe by the same logic
//   - `bg-primary`, `border-primary`  — non-text properties; separate class family
//
// Suppression: add `// contrast-ok` on the same line to acknowledge an intentional
// exception (e.g. a decorative element where contrast rules do not apply).
//
// Run: pnpm --filter @workspace/scripts run check:text-primary-contrast

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TARGET_DIR = path.join(repoRoot, "artifacts/metrix-iap/src");
const EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

// Matches `text-primary` (or `text-primary/N`) that is NOT:
//   1. Preceded by `:` (which would be a Tailwind modifier like hover:text-primary)
//   2. Preceded by `-` or a word character that makes it part of another token
//   3. Followed by `-` then a lowercase letter (which would be a suffix like -foreground)
//
// Breakdown:
//   (?<![:\w-])   — negative lookbehind: not immediately after : / word char / -
//   text-primary  — the literal token
//   (?!-[a-z])    — negative lookahead: not followed by -<letter> (blocks -foreground)
//
// `text-primary/80` is flagged: the `/` is not a lowercase letter, so the lookahead passes.
const VIOLATION_RE = /(?<![:\w-])text-primary(?!-[a-z])/g;

// Lines containing this annotation are explicitly suppressed.
const SUPPRESSION_MARKER = "contrast-ok";

type Violation = {
  file: string;
  line: number;
  col: number;
  snippet: string;
};

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

    // Skip pure comment lines (the token doesn't appear in real code on these lines).
    const trimmed = line.trimStart();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      continue;
    }

    // Allow explicitly suppressed lines.
    if (line.includes(SUPPRESSION_MARKER)) {
      continue;
    }

    VIOLATION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VIOLATION_RE.exec(line)) !== null) {
      violations.push({
        file: rel,
        line: i + 1,
        col: match.index + 1,
        snippet: line.trim(),
      });
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
      `\nPASS  No bare text-primary usage found across ${files.length} source file(s).\n` +
        "      Foreground interactive text is contrast-safe.",
    );
    process.exit(0);
  }

  console.error(
    `\nFAIL  Found ${allViolations.length} bare text-primary usage(s) — low contrast on dark bg.\n` +
      `      Scanned ${files.length} file(s) under ${path.relative(repoRoot, TARGET_DIR)}\n`,
  );

  // Group by file for readability.
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }

  for (const [file, vs] of byFile) {
    console.error(`  ${file}`);
    for (const v of vs) {
      console.error(`    L${v.line}:${v.col}  ${v.snippet}`);
    }
    console.error();
  }

  console.error(
    "Fix: replace bare `text-primary` (and `text-primary/{opacity}`) with\n" +
      "     `text-interactive` on foreground text/icon elements.\n" +
      "\n" +
      "Allowed patterns (not flagged):\n" +
      "  bg-primary, border-primary          — non-text CSS properties\n" +
      "  text-primary-foreground             — white text on primary-colored bg\n" +
      "  hover:text-primary (any modifier:)  — gated by a Tailwind modifier prefix\n" +
      "\n" +
      "To suppress a deliberate exception, add `// contrast-ok` on the same line.",
  );

  process.exit(1);
}

main();
