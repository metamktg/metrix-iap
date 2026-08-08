// Static lint: every <SectionCard> in CommunicationsView must have a
// right={<SectionInfoIcon …} prop.
//
// WHY: CommunicationsView uses SectionCard for each visual section.
// The section-info-icons smoke suite asserts one tooltip per section, but it
// only does so after the component is already built.  A developer can add a
// new SectionCard without wiring up its SectionInfoIcon and the e2e suite
// would only catch it if it also adds a tooltip assertion — an easy step to
// forget.  This static check closes that gap at the source level: it fails
// immediately the moment a SectionCard appears without its icon, before
// anything reaches the browser.
//
// SUPPRESSION: if a SectionCard intentionally has no icon (e.g. a purely
// structural grouping card), add `// section-icon-ok` on the same line as
// the <SectionCard opening tag.
//
// Run: pnpm --filter @workspace/scripts run check:communications-section-icons

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TARGET_FILE = path.join(
  repoRoot,
  "artifacts/metrix-iap/src/pages/metrix/strategy/CommunicationsView.tsx",
);

const SUPPRESSION_MARKER = "section-icon-ok";

function fail(message: string, extra?: string): never {
  console.error(`\nFAIL  ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

/**
 * Strip single-line comments (//…) and block comments (/* … *\/) from source
 * while preserving newlines so that line numbers remain meaningful.
 * This is intentionally naive — it is sufficient for catching missing props
 * in well-formed TSX and avoids pulling in a full parser dependency.
 */
function stripComments(src: string): string {
  // Replace block comments with whitespace (preserve newlines).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
  // Replace line comments with whitespace (preserve line length for col tracking).
  out = out.replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));
  return out;
}

interface SectionCardOccurrence {
  /** 1-based line number of the `<SectionCard` opening. */
  line: number;
  /** Whether a suppression marker was present on the same original source line. */
  suppressed: boolean;
  /** Whether a `right={<SectionInfoIcon` prop was found in the opening tag. */
  hasIcon: boolean;
}

function findSectionCards(src: string, originalSrc: string): SectionCardOccurrence[] {
  const results: SectionCardOccurrence[] = [];
  const stripped = stripComments(src);

  // Split into lines for line-number tracking (1-based).
  const originalLines = originalSrc.split("\n");

  let pos = 0;
  while (pos < stripped.length) {
    const idx = stripped.indexOf("<SectionCard", pos);
    if (idx === -1) break;

    // Ensure it is actually a JSX element open (next char is whitespace, /, or >)
    // and not e.g. `<SectionCardFoo`.
    const charAfter = stripped[idx + "<SectionCard".length];
    if (
      charAfter !== undefined &&
      charAfter !== " " &&
      charAfter !== "\t" &&
      charAfter !== "\n" &&
      charAfter !== "\r" &&
      charAfter !== "/" &&
      charAfter !== ">"
    ) {
      // Not a standalone <SectionCard — skip past it.
      pos = idx + 1;
      continue;
    }

    // Compute 1-based line number of this occurrence.
    const lineNumber =
      stripped.slice(0, idx).split("\n").length;

    // Check for suppression marker on the same line in the original source.
    const originalLine = originalLines[lineNumber - 1] ?? "";
    const suppressed = originalLine.includes(SUPPRESSION_MARKER);

    // Extract the opening tag text — scan forward until we reach the `>`
    // that closes the opening tag, tracking {} nesting so we don't stop
    // inside a JSX expression attribute like right={<SectionInfoIcon … />}.
    let depth = 0;          // {} nesting depth
    let tagClosed = false;
    let endIdx = idx + "<SectionCard".length;

    while (endIdx < stripped.length) {
      const ch = stripped[endIdx];
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
      } else if (ch === ">" && depth === 0) {
        // This `>` closes the opening tag (either `/>` or `>`).
        tagClosed = true;
        endIdx++;
        break;
      }
      endIdx++;
    }

    const tagText = stripped.slice(idx, tagClosed ? endIdx : stripped.length);

    // Check for the icon prop.  We accept:
    //   right={<SectionInfoIcon …}
    //   right={ <SectionInfoIcon …}
    //   right={(<SectionInfoIcon …)  (uncommon but legal)
    const hasIcon = /right\s*=\s*\{[\s(]*<SectionInfoIcon/.test(tagText);

    results.push({ line: lineNumber, suppressed, hasIcon });

    pos = idx + 1;
  }

  return results;
}

function main() {
  if (!fs.existsSync(TARGET_FILE)) {
    fail(
      `CommunicationsView not found: ${path.relative(repoRoot, TARGET_FILE)}`,
      "Has the file been moved or renamed?  Update TARGET_FILE in this script.",
    );
  }

  const src = fs.readFileSync(TARGET_FILE, "utf-8");
  const occurrences = findSectionCards(src, src);

  if (occurrences.length === 0) {
    // No SectionCards at all — nothing to enforce. Warn but don't fail:
    // the file may legitimately have no cards yet.
    console.log(
      `\nPASS  No <SectionCard> elements found in CommunicationsView — nothing to check.\n` +
        `      If that is unexpected, verify the component is using <SectionCard> from shared.tsx.`,
    );
    process.exit(0);
  }

  const violations = occurrences.filter((o) => !o.hasIcon && !o.suppressed);
  const suppressed = occurrences.filter((o) => o.suppressed);

  if (violations.length === 0) {
    const suppressedNote =
      suppressed.length > 0
        ? `  (${suppressed.length} suppressed with // ${SUPPRESSION_MARKER})`
        : "";
    console.log(
      `\nPASS  ${occurrences.length} <SectionCard>(s) in CommunicationsView — ` +
        `all have a right={<SectionInfoIcon} prop.${suppressedNote}\n`,
    );
    process.exit(0);
  }

  console.error(
    `\nFAIL  ${violations.length} <SectionCard>(s) in CommunicationsView ` +
      `are missing a right={<SectionInfoIcon …} prop.\n`,
  );
  for (const v of violations) {
    console.error(
      `  CommunicationsView.tsx:${v.line}  — <SectionCard> has no SectionInfoIcon in its right= prop`,
    );
  }
  console.error(
    `\nFix: add a SectionInfoIcon with a descriptive tip= string to each listed <SectionCard>.\n` +
      `     Example:\n` +
      `       right={<SectionInfoIcon tip="…description of what this section shows…" />}\n` +
      `\n` +
      `If a SectionCard intentionally has no icon (e.g. a purely structural grouping card),\n` +
      `add // ${SUPPRESSION_MARKER} on the same line as the <SectionCard opening tag.\n`,
  );
  process.exit(1);
}

main();
