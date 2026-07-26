// Contrast-safety check: catch opacity-reduced `text-muted` and `text-secondary`
// usage that falls below WCAG 3:1 on the darkest cockpit backgrounds.
//
// TOKEN BASELINES (from artifacts/metrix-iap/src/index.css)
//   --text-muted     hsl(216 28% 78%) ≈ #b7c4d7   → ~3.5:1 on surface-deep
//   --text-secondary hsl(217 37% 88%) ≈ #d5deec   → ~5.5:1 on surface-deep
//
// DARKEST SURFACES
//   --surface-deep    hsl(222 61% 6%)  ≈ #06081a   (modals, slide-over panels)
//   --surface-preview hsl(222 65% 5%)  ≈ #04060f   (creative preview / video bg)
//
// WHY OPACITY MODIFIERS ARE DANGEROUS
//   Tailwind lets you write `text-muted/75` which renders the token at 75% opacity,
//   blending toward the dark surface background. Even though the full-opacity token
//   meets WCAG AA on bg-main (#050b18), applying opacity on surface-deep or
//   surface-preview pushes effective contrast below the 3:1 minimum required for
//   large text and UI components (WCAG 1.4.11 / 1.4.3 large text).
//
//   Relative-luminance threshold math (simplified):
//     effective_contrast ≈ opacity × base_contrast + (1 − opacity) × 1  [towards bg]
//   For text-muted (~3.5:1 base on surface-deep):
//     opacity < 3.0/3.5 ≈ 86% → contrast < 3:1
//   For text-secondary (~5.5:1 base on surface-deep):
//     opacity < 3.0/5.5 ≈ 55% → contrast < 3:1
//
// FLAGGED PATTERNS
//   text-muted/N     where N ≤ 85   (any Tailwind opacity step that breaks 3:1)
//   text-secondary/N where N ≤ 50   (similarly computed threshold)
//
// NOT FLAGGED
//   text-muted              — bare token at full opacity; acceptable on bg-main
//   text-secondary          — bare token at full opacity; acceptable on bg-main
//   hover:text-muted/75     — modifier-gated; only active on hover
//   focus:text-muted/75     — modifier-gated
//   any <modifier>:text-muted/N — modifier-gated; runtime-only
//   bg-muted/N, border-muted/N  — non-text properties; irrelevant to contrast
//   text-muted-foreground        — distinct token family
//
// SUPPRESSION
//   Add `// contrast-ok` on the same line for deliberate decorative exceptions,
//   e.g. a watermark or disabled-state hint where contrast rules are intentionally relaxed.
//
// Run: pnpm --filter @workspace/scripts run check:text-muted-contrast

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TARGET_DIR = path.join(repoRoot, "artifacts/metrix-iap/src");
const EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);
const SUPPRESSION_MARKER = "contrast-ok";

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

type Rule = {
  /** Human-readable token name for diagnostics */
  token: string;
  /**
   * Matches `<token>/<N>` that is NOT modifier-gated.
   *
   * Negative lookbehind `(?<![:\w-])` excludes:
   *   - `:` → Tailwind modifier prefix (hover:, focus:, …)
   *   - `\w` → word char that makes it part of another class name
   *   - `-` → hyphen continuation
   *
   * Negative lookahead `(?!-[a-z])` excludes suffix families like
   *   text-muted-foreground, text-secondary-foreground.
   *
   * The opacity group `\/(\d+)` must be present — we only flag the
   * opacity-variant form; the bare token is allowed at full opacity.
   */
  pattern: RegExp;
  /** Maximum opacity value (inclusive) that is flagged */
  maxOpacity: number;
  /** Minimum contrast ratio this token achieves at full opacity on surface-deep */
  baseContrastApprox: string;
  /** Minimum safe opacity to maintain ≥ 3:1 */
  minSafeOpacity: number;
};

const RULES: Rule[] = [
  {
    token: "text-muted",
    // text-muted/<N>  (N captured as group 1)
    // Excludes: text-muted-foreground (lookahead), modifier-gated (lookbehind)
    pattern: /(?<![:\w-])text-muted\/(\d+)(?!-[a-z])/g,
    maxOpacity: 85,
    baseContrastApprox: "~3.5:1",
    minSafeOpacity: 86,
  },
  {
    token: "text-secondary",
    // text-secondary/<N>
    // Excludes: text-secondary-foreground (lookahead), modifier-gated (lookbehind)
    pattern: /(?<![:\w-])text-secondary\/(\d+)(?!-[a-z])/g,
    maxOpacity: 50,
    baseContrastApprox: "~5.5:1",
    minSafeOpacity: 55,
  },
];

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

type Violation = {
  file: string;
  line: number;
  col: number;
  snippet: string;
  token: string;
  opacity: number;
  rule: Rule;
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

    // Skip pure comment lines.
    const trimmed = line.trimStart();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      continue;
    }

    // Skip explicitly suppressed lines.
    if (line.includes(SUPPRESSION_MARKER)) {
      continue;
    }

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.pattern.exec(line)) !== null) {
        const opacity = parseInt(match[1]!, 10);
        if (opacity <= rule.maxOpacity) {
          violations.push({
            file: rel,
            line: i + 1,
            col: match.index + 1,
            snippet: line.trim(),
            token: rule.token,
            opacity,
            rule,
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`\nFAIL  ${message}`);
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
      `\nPASS  No low-contrast opacity-muted text found across ${files.length} source file(s).\n` +
        "      text-muted and text-secondary opacity variants are contrast-safe.",
    );
    process.exit(0);
  }

  console.error(
    `\nFAIL  Found ${allViolations.length} opacity-reduced text token(s) below WCAG 3:1 on dark surfaces.\n` +
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
      console.error(
        `    L${v.line}:${v.col}  [${v.token}/${v.opacity}]  ${v.snippet}`,
      );
    }
    console.error();
  }

  console.error(
    "Why flagged:\n" +
      "  text-muted     (base contrast ~3.5:1 on surface-deep) falls below 3:1\n" +
      "  when opacity ≤ 85. Use opacity ≥ 86 or omit the opacity modifier.\n" +
      "\n" +
      "  text-secondary (base contrast ~5.5:1 on surface-deep) falls below 3:1\n" +
      "  when opacity ≤ 50. Use opacity ≥ 55 or omit the opacity modifier.\n" +
      "\n" +
      "Allowed patterns (not flagged):\n" +
      "  text-muted                       — full opacity; acceptable on bg-main\n" +
      "  text-secondary                   — full opacity; acceptable on bg-main\n" +
      "  text-muted-foreground            — distinct token family\n" +
      "  hover:text-muted/75 (modifier:)  — modifier-gated; only active on hover\n" +
      "  bg-muted/50, border-muted/50     — non-text properties; irrelevant\n" +
      "\n" +
      "To suppress a deliberate exception (e.g. disabled hint, watermark),\n" +
      "add `// contrast-ok` on the same line.",
  );

  process.exit(1);
}

main();
