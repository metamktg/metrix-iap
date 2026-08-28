// Type-scale conformance check.
//
// The Metrix type scale is governed by two rules. Both were broken before
// the readability pass, and both are the kind of thing that decays one
// well-meaning tweak at a time — so they are checked rather than trusted.
//
//   1. THE BODY FLOOR IS 15px, AND NOTHING A READER TAKES IN SITS UNDER
//      13px. The ramp was lifted to those two numbers: caption (the
//      smallest role carrying real information — counts, units, dates) is
//      13px, and body prose is 15px. Everything below 13 is chrome that is
//      LOOKED AT rather than read: an uppercase eyebrow at 12px and a badge
//      numeral at 11px, both separated by case and colour rather than by
//      being small enough to squint at.
//
//   2. A HEADER IS >= 3px ABOVE THE CONTENT IT LABELS.
//        H1 34 -> H2 28 -> H3 24 -> H4 21 -> H5 18 -> body 15
//      Under 13px the rule stops applying, because 3px steps run out of
//      readable sizes almost immediately. Nothing carrying a sentence lives
//      there.
//
// Sizes are read from index.css rather than duplicated here, so this
// cannot pass while disagreeing with what actually ships.
//
// Run: pnpm --filter @workspace/scripts run check:type-scale

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CSS = path.join(repoRoot, "artifacts/metrix-iap/src/index.css");

const REM = 16;

/** Read `.text-foo { font-size: N rem` declarations out of the stylesheet. */
function readScale(src: string): Map<string, number> {
  const out = new Map<string, number>();
  // [a-z0-9] not [a-z] — the ramp roles are text-h2 … text-h5, and the
  // digit-free pattern silently skipped every one of them.
  const re = /\.(text-[a-z0-9]+)\s*\{[^}]*font-size:\s*([0-9.]+)rem/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.set(m[1]!, Math.round(Number(m[2]) * REM));
  return out;
}

/** The page title is its own class, not a text-* utility. */
function readPageTitle(src: string): number | null {
  const m = /\.mx-section-header__title\s*\{[^}]*font-size:\s*([0-9.]+)rem/.exec(src);
  return m ? Math.round(Number(m[1]) * REM) : null;
}

const src = fs.readFileSync(CSS, "utf-8");
const scale = readScale(src);
const pageTitle = readPageTitle(src);

const problems: string[] = [];
const need = (name: string): number | null => {
  const v = scale.get(name);
  if (v == null) {
    problems.push(`missing size for ${name} — the scale is read from index.css and it is not there`);
    return null;
  }
  return v;
};

const body = need("text-body");
const title = need("text-title");
const cardtitle = need("text-cardtitle");
const callout = need("text-callout");
const caption = need("text-caption");

// ─── The design system's fallback copies must not drift ──────────────
//
// command-deck's overlay primitives (tooltip especially) are sized with
// .text-caption / .text-body, and those primitives render from a package
// that cannot see this app's stylesheet. So the design system carries its
// own copy of exactly those two steps.
//
// Two copies of a number is how a scale drifts. This asserts they agree,
// which is cheap, and means a change to the app ramp cannot silently leave
// every tooltip in the product a step behind.
const DS_TEMPLATE = path.join(repoRoot, "artifacts/command-deck/scripts/theme-template.css");
if (fs.existsSync(DS_TEMPLATE)) {
  const ds = readScale(fs.readFileSync(DS_TEMPLATE, "utf-8"));
  for (const name of ["text-caption", "text-body"]) {
    const app = scale.get(name);
    const sys = ds.get(name);
    if (app == null) continue;
    if (sys == null) {
      problems.push(
        `${name} is missing from the design system template — command-deck's overlay ` +
          `primitives are sized with it and render outside this app's stylesheet.`,
      );
    } else if (sys !== app) {
      problems.push(
        `${name} is ${app}px in the app ramp but ${sys}px in the design system template ` +
          `(artifacts/command-deck/scripts/theme-template.css). Two copies of a size is how ` +
          `a scale drifts — every tooltip in the product would be a step behind.`,
      );
    }
  }
}

export const BODY_FLOOR = 15;
const MIN_HEADER_STEP = 3;

// ── Rule 1: the body floor ────────────────────────────────────────────
// Every role that can carry a sentence, not the chrome band below it.
const READING_ROLES = ["text-body", "text-title", "text-callout", "text-cardtitle",
                       "text-display", "text-section", "text-stat", "text-bignum", "text-hero"];
for (const role of READING_ROLES) {
  const size = scale.get(role);
  if (size != null && size < BODY_FLOOR) {
    problems.push(`${role} is ${size}px — below the ${BODY_FLOOR}px body floor. Roles that carry sentences may not shrink under it.`);
  }
}

// The chrome band must stay BELOW the floor, or it stops being chrome and
// starts competing with real content.
for (const role of ["text-micro", "text-label", "text-caption"]) {
  const size = scale.get(role);
  if (size != null && size >= BODY_FLOOR) {
    problems.push(`${role} is ${size}px — at or above the body floor. Chrome labels must stay below it; if this role now carries sentences it should be TYPE.body instead.`);
  }
}

// ── Rule 2: header steps ──────────────────────────────────────────────
// The real ramp is now five heading levels above the floor, each on its own
// face. Every adjacent pair still has to clear the 3px step — that is what
// stops a level being a size nobody can pick out of the one above it.
const h2 = need("text-h2");
const h3 = need("text-h3");
const h4 = need("text-h4");
const h5 = need("text-h5");

const steps: Array<[string, number | null, string, number | null]> = [
  ["H1 page title", pageTitle, "H2 section title", h2],
  ["H2 section title", h2, "H3 card title", h3],
  ["H3 card title", h3, "H4 group header", h4],
  ["H4 group header", h4, "H5 sub-group header", h5],
  ["H5 sub-group header", h5, "body prose", body],
  ["dialog title", callout, "body prose", body],
];
for (const [an, a, bn, b] of steps) {
  if (a == null || b == null) continue;
  const gap = a - b;
  if (gap < MIN_HEADER_STEP) {
    problems.push(
      `${an} (${a}px) is only ${gap}px above ${bn} (${b}px) — needs ${MIN_HEADER_STEP}px. ` +
        `A header that barely outranks its own content reads as a competing element.`,
    );
  }
}

// ── Rule 3: roles that sit together may not share a size ──────────────
//
// The original defect was NOT two CSS sizes colliding — it was two ROLES
// resolving to the same size. HEADING.h4 (a data-table column header) and
// TYPE.caption (the metadata under it) both mapped to text-caption at 11px,
// so a header and its own content rendered identically. Checking the
// stylesheet alone cannot see that, because the stylesheet is fine; the
// mapping is what collides. So read the mapping.
const TYPOGRAPHY = path.join(repoRoot, "artifacts/metrix-iap/src/pages/metrix/typography.ts");
const typographySrc = fs.readFileSync(TYPOGRAPHY, "utf-8");

/** Resolve a role constant (e.g. TYPE.caption) to the text-* class it uses. */
function roleSizeClass(constName: string, member: string): string | null {
  const block = new RegExp(`export const ${constName} = \\{([\\s\\S]*?)\\n\\} as const;`).exec(typographySrc);
  if (!block) return null;
  const line = new RegExp(`\\b${member}:\\s*"([^"]+)"`).exec(block[1]!);
  if (!line) return null;
  return line[1]!.split(/\s+/).find((c) => /^text-[a-z0-9]+$/.test(c)) ?? null;
}

/** Pairs that appear next to each other on screen and must be tellable apart. */
const ADJACENT: Array<[string, string, string, string, string]> = [
  ["HEADING", "h4", "TYPE", "caption", "a table column header and the metadata beneath it"],
  ["TYPE", "title", "TYPE", "body", "a card title and its own paragraph"],
  ["HEADING", "h2", "TYPE", "title", "a section title and a card title inside it"],
  ["TYPE", "label", "TYPE", "microLabel", "an eyebrow and the micro-index under it"],
];
for (const [ac, am, bc, bm, why] of ADJACENT) {
  const aClass = roleSizeClass(ac, am);
  const bClass = roleSizeClass(bc, bm);
  if (!aClass || !bClass) {
    problems.push(`could not resolve ${ac}.${am} or ${bc}.${bm} to a text-* size class in typography.ts`);
    continue;
  }
  if (aClass === bClass) {
    problems.push(
      `${ac}.${am} and ${bc}.${bm} both resolve to ${aClass} — ${why} would render identically. ` +
        `This is the exact collision the scale was rebuilt to remove.`,
    );
  }
}

// ── Rule 4: every heading level carries its own face ──────────────────
//
// Five levels separated by size alone would need a range this scale does not
// have above a 14px floor. Each level therefore also changes typeface, so a
// reader tells an H3 from an H4 by its shape as well as its size. This
// checks the mapping declares one; index.css defines what each face is.
const FACE_REQUIRED: Array<[string, string]> = [
  ["h1", "font-h1"], ["h2", "font-h2"], ["h3", "font-h3"],
  ["h4", "font-h4"], ["h5", "font-h5"], ["h6", "font-h6"],
];
for (const [member, face] of FACE_REQUIRED) {
  const block = /export const HEADING = \{([\s\S]*?)\n\} as const;/.exec(typographySrc);
  const line = block ? new RegExp(`\\b${member}:\\s*"([^"]+)"`).exec(block[1]!) : null;
  if (!line) {
    problems.push(`HEADING.${member} is not defined — the ramp needs all six levels.`);
    continue;
  }
  if (!line[1]!.split(/\s+/).includes(face)) {
    problems.push(
      `HEADING.${member} does not carry ${face}. Each heading level changes typeface as well as ` +
        `size — five levels cannot be told apart by size alone above a 14px floor.`,
    );
  }
}

if (caption != null && body != null && caption >= body) {
  problems.push(`text-caption (${caption}px) is not below text-body (${body}px) — metadata must not outrank prose.`);
}

if (problems.length > 0) {
  console.error("\nFAIL  Type scale violations:\n");
  for (const p of problems) console.error(`      · ${p}`);
  console.error(`\n      Scale is read from ${path.relative(repoRoot, CSS)}.\n`);
  process.exit(1);
}

const ladder = [
  `H1 ${pageTitle}`, `H2 ${h2}`, `H3 ${h3}`, `H4 ${h4}`, `H5 ${h5}`, `body ${body}`, `caption ${caption}`,
  `label ${scale.get("text-label")}`, `micro ${scale.get("text-micro")}`,
].join("  ->  ");
console.log(`\nPASS  Type scale conforms: ${BODY_FLOOR}px body floor, ${MIN_HEADER_STEP}px header steps.\n      ${ladder}\n`);
