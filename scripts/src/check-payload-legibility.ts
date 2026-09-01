// ─── check:payload-legibility ─────────────────────────────────────────
//
// The design rulebook says "no full sentences on the first layer". That
// rule is correct for CHROME — tile captions, table cells, chips, card
// faces, breadcrumbs, provenance. It is wrong for PAYLOAD: the strategic
// output a customer is paying to read.
//
// Applied to payload it hid the product. Measured on the Strategy pages
// before this check existed:
//   - a message pillar cut to 72 characters, remainder behind a click
//   - a hypothesis rendered as variable-code chips INSTEAD OF the sentence
//   - a stated risk deriveLabel'd to 90 chars *inside* a line-clamp-1, so
//     it could not be read at all
//   - "why it matters" — arguably the highest-value field in the product —
//     two clicks deep inside a detail panel the reader had already opened
//
// WHAT THIS CHECKS
//
// For a fixed list of payload-bearing field names, fail when the field is
// passed to deriveLabel() (mechanical truncation) or used as a
// <DetailReveal label={...}> (hidden behind a popover). Both are the
// signatures of chrome treatment.
//
// Payload should render as prose, optionally clamped with <DenseText>,
// which keeps the words on the page, expands in place, and renders no
// control at all when the text already fits.
//
// SCOPE, NAMED HONESTLY: this matches field NAMES in source text. It
// cannot see a payload field passed through a variable with another name,
// and it does not judge whether a given field is well presented — only
// that it has not been truncated or hidden. It is a ratchet against the
// specific regression that happened, not a proof of legibility.
//
// Suppression: `// payload-ok: <reason>` on the same line, for the genuine
// button-card case where an interactive control is invalid HTML and the
// full text lives one click away.
//
// Exit 0 clean / 1 with each finding as file:line.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(import.meta.dirname, "../..");
const SCAN_ROOT = "artifacts/metrix-iap/src";

/**
 * Fields that carry the strategic output itself. Adding a field here is a
 * claim that a reader is paying to read it.
 */
const PAYLOAD_FIELDS = [
  "why_it_matters",
  "strategic_recommendation",
  "psychographic_profile",
  "budget_reallocation_note",
  "message_resonance",
  "plain_descriptor",
  "expected_impact",
  "human_direction",
  "data_insight",
  "rationale",
  "risk",
];

const findings: string[] = [];
let scanned = 0;

function tracked(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", SCAN_ROOT], {
    cwd: REPO, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  return out.split("\0").filter((f) => f.endsWith(".tsx") && !f.includes("__tests__"));
}

const fieldAlt = PAYLOAD_FIELDS.join("|");
// deriveLabel(anything.<payload_field> …) — mechanical truncation
const TRUNCATED = new RegExp(String.raw`deriveLabel\(\s*[^)]*\b(${fieldAlt})\b`);
// <DetailReveal … label={… .<payload_field> …} — hidden behind a popover.
// Matched on the single line carrying `label=` to keep this a cheap scan.
const HIDDEN_LABEL = new RegExp(String.raw`label=\{[^}]*\b(${fieldAlt})\b`);

for (const rel of tracked()) {
  const src = fs.readFileSync(path.join(REPO, rel), "utf8");
  scanned++;
  const lines = src.split("\n");
  // Track whether we are inside a <DetailReveal … > opening tag.
  let revealDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes("payload-ok:")) continue;
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;

    const t = TRUNCATED.exec(line);
    if (t) {
      findings.push(`${rel}:${i + 1}  payload truncated by deriveLabel — "${t[1]}"\n      ${line.trim().slice(0, 100)}`);
    }
    if (line.includes("<DetailReveal")) revealDepth = 1;
    if (revealDepth === 1) {
      const h = HIDDEN_LABEL.exec(line);
      if (h && !t) {
        findings.push(`${rel}:${i + 1}  payload hidden behind DetailReveal — "${h[1]}"\n      ${line.trim().slice(0, 100)}`);
      }
      if (line.includes("/>") || line.includes("</DetailReveal>")) revealDepth = 0;
    }
  }
}

if (findings.length === 0) {
  console.log(`check:payload-legibility — clean (${scanned} surfaces, ${PAYLOAD_FIELDS.length} payload fields)`);
  process.exit(0);
}

console.log(`\ncheck:payload-legibility — ${findings.length} finding(s)\n`);
for (const f of findings) console.log("  " + f + "\n");
console.log(
  "Payload is what the customer pays to read. Render it as prose, clamped\n" +
  "with <DenseText> if it is long — that keeps the words on the page and\n" +
  "shows no control at all when the text already fits.\n" +
  "Genuinely inside a <button> card? Clamp with line-clamp-N (once, not on\n" +
  "top of a deriveLabel) and add `// payload-ok: <reason>`.\n",
);
process.exit(1);
