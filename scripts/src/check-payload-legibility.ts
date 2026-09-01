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
// For a fixed list of payload-bearing field names, four chrome treatments
// are failures:
//
//   1. TRUNCATED   passed to deriveLabel() — mechanical truncation.
//   2. HIDDEN      used as a <DetailReveal label={...}> — behind a popover.
//   3. SLICED      passed through .slice(0, N) — hand-rolled truncation.
//                  This is the same defect as (1) written by hand, and it
//                  evaded rule 1 completely: the pillar list card cut its
//                  descriptor with .slice(0, 80) on top of a line-clamp-2
//                  that already handled overflow. Cut twice, by two
//                  different mechanisms, in one element.
//   4. UPPERCASED  rendered inside an element whose className carries an
//                  uppercase chrome role (TYPE.label, TYPE.microLabel,
//                  text-label, text-micro, or a bare `uppercase`). Same
//                  pillar descriptor, same line: 12px UPPERCASE. Uppercase
//                  destroys the word shapes that long-form reading depends
//                  on — it is legible for a two-word eyebrow and close to
//                  unreadable for a sentence. Nothing in that band is
//                  meant to carry prose; typography.ts says so in the
//                  scale comment ("That band is CHROME... Nothing carrying
//                  a sentence belongs there") and this enforces it for the
//                  fields where it costs the most.
//
// Payload should render as prose, optionally clamped with <DenseText>,
// which keeps the words on the page, expands in place, and renders no
// control at all when the text already fits.
//
// SCOPE, NAMED HONESTLY: this matches field NAMES in source text. It
// cannot see a payload field passed through a variable with another name
// — the brief view reads its fields through fbString(copy, "problem_setup")
// into camelCase locals, and this check is blind to every one of them —
// and it does not judge whether a given field is well presented, only that
// it has not been truncated, hidden or set in a chrome face. It is a
// ratchet against the specific regressions that happened, not a proof of
// legibility.
//
// Suppression: `// payload-ok: <reason>` on the line or in the six lines
// above it, for the genuine chrome cases — a <button> card where an
// interactive control is invalid HTML, or a tray/bookmark entry whose text
// is an identifier rather than the deliverable.
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
  "test_variant",
  "success_criteria",
];

/**
 * className fragments that put text in the uppercase chrome band. A
 * sentence set in any of these is unreadable at length.
 */
const UPPERCASE_ROLE = /TYPE\.label\b|TYPE\.microLabel\b|\btext-label\b|\btext-micro\b|\buppercase\b/;

/** How far above a finding a `payload-ok:` marker still suppresses it. */
const SUPPRESSION_LINES = 6;
/** How far back to look for the opening tag of the element around a line. */
const ELEMENT_LOOKBACK = 6;

const findings: string[] = [];
let scanned = 0;

function tracked(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", SCAN_ROOT], {
    cwd: REPO, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  return out.split("\0").filter((f) => f.endsWith(".tsx") && !f.includes("__tests__"));
}

/**
 * Blank out comments and string bodies while preserving every line break,
 * so line numbers still line up with the file.
 *
 * Per-line heuristics ("does this line start with //") are not enough here:
 * the rulebook comments in these files are multi-line JSX comments whose
 * continuation lines start with ordinary words. One of them literally reads
 * "cut twice, so a risk warning could not be read at all" — a sentence that
 * names a payload field, inside a comment explaining the fix for that very
 * field, sitting under a className with line-clamp-1. A naive scan reports
 * the comment as the defect.
 *
 * String bodies are blanked for the same reason in the other direction: a
 * tooltip or empty-state sentence mentioning a field name is prose about
 * the product, not a render of the field.
 */
function stripNonCode(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  let state: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  while (i < n) {
    const c = src[i]!;
    const c2 = src[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; out.push("  "); i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out.push("  "); i += 2; continue; }
      if (c === "'") { state = "sq"; out.push(" "); i++; continue; }
      if (c === '"') { state = "dq"; out.push(" "); i++; continue; }
      if (c === "`") { state = "tpl"; out.push(" "); i++; continue; }
      out.push(c); i++; continue;
    }
    // Inside a comment or string: keep newlines, blank everything else.
    if (c === "\n") {
      out.push("\n");
      if (state === "line") state = "code";
      i++; continue;
    }
    if (state === "block" && c === "*" && c2 === "/") { state = "code"; out.push("  "); i += 2; continue; }
    if (state === "sq" && c === "\\") { out.push("  "); i += 2; continue; }
    if (state === "dq" && c === "\\") { out.push("  "); i += 2; continue; }
    if (state === "tpl" && c === "\\") { out.push("  "); i += 2; continue; }
    if (state === "sq" && c === "'") { state = "code"; out.push(" "); i++; continue; }
    if (state === "dq" && c === '"') { state = "code"; out.push(" "); i++; continue; }
    if (state === "tpl" && c === "`") { state = "code"; out.push(" "); i++; continue; }
    out.push(" "); i++;
  }
  return out.join("");
}

const fieldAlt = PAYLOAD_FIELDS.join("|");
// deriveLabel(anything.<payload_field> …) — mechanical truncation
const TRUNCATED = new RegExp(String.raw`deriveLabel\(\s*[^)]*\b(${fieldAlt})\b`);
// <DetailReveal … label={… .<payload_field> …} — hidden behind a popover.
const HIDDEN_LABEL = new RegExp(String.raw`label=\{[^}]*\b(${fieldAlt})\b`);
// <payload_field>… .slice( — hand-rolled truncation
const SLICED = new RegExp(String.raw`\b(${fieldAlt})\b[^\n]{0,40}\.slice\(`);
// bare mention, for the uppercase-context rule
const MENTIONS = new RegExp(String.raw`\b(${fieldAlt})\b`);

for (const rel of tracked()) {
  const raw = fs.readFileSync(path.join(REPO, rel), "utf8");
  scanned++;
  const rawLines = raw.split("\n");
  const codeLines = stripNonCode(raw).split("\n");

  const suppressed = (i: number): boolean => {
    for (let k = Math.max(0, i - SUPPRESSION_LINES); k <= i; k++) {
      if (rawLines[k]?.includes("payload-ok:")) return true;
    }
    return false;
  };

  let revealDepth = 0;
  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i]!;
    const shown = rawLines[i]!.trim().slice(0, 100);

    if (line.includes("<DetailReveal")) revealDepth = 1;

    const t = TRUNCATED.exec(line);
    const sl = SLICED.exec(line);
    const h = revealDepth === 1 ? HIDDEN_LABEL.exec(line) : null;

    // Uppercase rule: find the element this line sits in by walking back to
    // the nearest opening `<`, and test that opening tag's className.
    let up: string | null = null;
    const m = MENTIONS.exec(line);
    if (m) {
      const ctx = codeLines.slice(Math.max(0, i - ELEMENT_LOOKBACK), i + 1).join("\n");
      const k = ctx.lastIndexOf("<");
      const elem = k >= 0 ? ctx.slice(k) : ctx;
      if (UPPERCASE_ROLE.test(elem)) up = m[1]!;
    }

    if ((t || sl || h || up) && !suppressed(i)) {
      if (t) findings.push(`${rel}:${i + 1}  payload truncated by deriveLabel — "${t[1]}"\n      ${shown}`);
      else if (sl) findings.push(`${rel}:${i + 1}  payload truncated by .slice() — "${sl[1]}"\n      ${shown}`);
      else if (h) findings.push(`${rel}:${i + 1}  payload hidden behind DetailReveal — "${h[1]}"\n      ${shown}`);
      else if (up) findings.push(`${rel}:${i + 1}  payload set in an uppercase chrome role — "${up}"\n      ${shown}`);
    }

    if (revealDepth === 1 && (line.includes("/>") || line.includes("</DetailReveal>"))) revealDepth = 0;
  }
}

if (findings.length === 0) {
  console.log(`check:payload-legibility — clean (${scanned} surfaces, ${PAYLOAD_FIELDS.length} payload fields, 4 rules)`);
  process.exit(0);
}

console.log(`\ncheck:payload-legibility — ${findings.length} finding(s)\n`);
for (const f of findings) console.log("  " + f + "\n");
console.log(
  "Payload is what the customer pays to read. Render it as prose, clamped\n" +
  "with <DenseText> if it is long — that keeps the words on the page and\n" +
  "shows no control at all when the text already fits. Set it at text-body\n" +
  "or text-caption; the uppercase 11-12px band is for two-word eyebrows.\n" +
  "Genuinely chrome — a <button> card face, a tray bookmark? Clamp once\n" +
  "with line-clamp-N (not on top of a slice or a deriveLabel) and add\n" +
  "`// payload-ok: <reason>` on the line or just above it.\n",
);
process.exit(1);
