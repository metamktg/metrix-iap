// Weight must never contradict the size ramp.
//
// THE DEFECT THIS EXISTS TO PREVENT
// Measured across the app before this check was written:
//
//   331 weight-emphasized elements in the 10–12px CHROME band
//    55 weight-emphasized elements at 17px and above
//
// Six to one. And worse than the ratio, the direction: fifteen 11px uppercase
// eyebrows were `font-bold` while forty 17px card titles had been downgraded
// to `font-semibold` or `font-medium` at their call sites. An eyebrow was
// outranking the title it labelled — on the same card, at the same moment.
//
// That is what "everything competes for attention" means mechanically. It is
// not that a screen has too much text. It is that weight, the one property
// whose whole job is to say "this outranks that", had been applied AGAINST
// the hierarchy in enough places that it stopped carrying any signal at all.
// A reader scanning such a page has to fall back on size alone, and the two
// commonest steps in this product are 11px and 17px — close enough that a
// bold 11px label wins on ink even though it loses on size.
//
// THE RULE (typography.ts, "RULE 3: WEIGHT IS MONOTONIC WITH RANK")
//
//   10–12px chrome LABEL   semibold max, never bold
//   10–12px chrome VALUE   bold allowed — see below
//   14px body              regular; medium for genuine emphasis
//   17px+ title            bold, never downgraded at a call site
//
// LABEL vs VALUE is the one judgement call here, and it is made
// mechanically: a chrome LABEL is uppercased by CSS (`uppercase`), a chrome
// VALUE is not. A count badge, a set of initials, a tabular figure in a pill
// is DATA — it sits inside a scoped container and being loud is its job. An
// eyebrow is subordinate by definition and already separates by case,
// tracking and colour; weight is a fourth signal it does not need.
//
// WHY A STATIC CHECK RATHER THAN REVIEW
// Both halves of the inversion are invisible in isolation. `text-label
// font-bold uppercase` reads as a perfectly reasonable line, and so does
// `text-title font-semibold`. The defect only exists in the RELATIONSHIP
// between them, which no reviewer sees while reading one file. It took a
// count across 104 files to see it at all.
//
// Run: pnpm --filter @workspace/scripts run check:optical-authority

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOTS = [
  path.join(repoRoot, "artifacts/metrix-iap/src/pages"),
  path.join(repoRoot, "artifacts/metrix-iap/src/components"),
];

/** The 10–12px band. Subordinate by definition. */
const CHROME = /\btext-(?:micro|label|caption)\b/;
/** 17px card/list-item titles — the level the chrome was outranking. */
const TITLE = /\btext-(?:title|h5)\b/;
/** Roles that define their own tracking; an arbitrary value beside one is a tie. */
const ROLE_WITH_TRACKING = /\btext-(?:micro|label|title|h5)\b/;
/** A real heading element. */
const HEADING_TAG = /<h[1-6][\s>]/;
/**
 * The mono face, which is not part of this product's type system.
 *
 * It was used 305 times across 78 files, doing two jobs, and only one was
 * real: aligning figures so a column of numbers does not jitter as it
 * updates. `tabular-nums` does that properly — a font-variant that makes
 * Figtree's own digits equal-width, with none of the terminal aesthetic.
 * The other job was decorative, and a measurement product that dresses its
 * numbers as console output reads as a debug view rather than an instrument.
 *
 * `--app-font-mono` still resolves to a real monospace for the one case
 * that needs one — a code block, where character alignment IS the content.
 * Reaching for it on a metric is what this catches.
 */
const MONO_CLASS = /\bfont-mono\b/;

/**
 * Stock Tailwind size classes, which are OFF THE RAMP.
 *
 * The ramp migration replaced every arbitrary `text-[14px]`-style class and
 * the rulebook gate ratchets those — but `text-sm` is a STANDARD Tailwind
 * class, so no instrument ever looked at it. Thirty of them survived, and
 * they were not random: `text-sm font-bold` (14px) had become the app's
 * accidental sub-card-title style — pillar names, concept names, playbook
 * buckets, dialog titles — putting 14px titles over 12px uppercase labels.
 * A 2px hierarchy is why a page full of correct data reads as "I cannot
 * tell what I am looking at".
 *
 * Every size on screen must be a step somebody chose: micro/label/caption/
 * body/title/callout/h1-h5/stat. Stock sizes are banned outright — there is
 * no baseline to ratchet, because the correct count is zero.
 */
const STOCK_SIZE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/;

const SUPPRESS = "authority-ok";

interface Finding {
  file: string;
  line: number;
  kind:
    | "bold-chrome-label"
    | "downgraded-title"
    | "tracking-tie"
    | "chrome-sized-heading"
    | "mono-face"
    | "stock-size";
  snippet: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

const findings: Finding[] = [];
let scanned = 0;

for (const root of ROOTS) {
  if (!fs.existsSync(root)) {
    console.error(`\nFAIL  Scan root not found: ${path.relative(repoRoot, root)}\n`);
    process.exit(1);
  }
  for (const file of walk(root)) {
    scanned += 1;
    const rel = path.relative(repoRoot, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const t = line.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      if (line.includes(SUPPRESS)) return;
      const at = { file: rel, line: i + 1, snippet: line.trim().slice(0, 120) };

      if (CHROME.test(line) && /\bfont-bold\b/.test(line) && /\buppercase\b/.test(line)) {
        findings.push({ ...at, kind: "bold-chrome-label" });
      }
      if (TITLE.test(line) && /\bfont-(?:medium|semibold)\b/.test(line)) {
        findings.push({ ...at, kind: "downgraded-title" });
      }
      if (ROLE_WITH_TRACKING.test(line) && /\btracking-\[[^\]]+\]/.test(line)) {
        findings.push({ ...at, kind: "tracking-tie" });
      }
      // A heading ELEMENT sized in the chrome band. This is the inversion in
      // its purest form: the DOM says "level-3 heading", the pixels say
      // "metadata", and the heading ends up SMALLER than the body it heads.
      if (HEADING_TAG.test(line) && CHROME.test(line)) {
        findings.push({ ...at, kind: "chrome-sized-heading" });
      }
      if (MONO_CLASS.test(line)) {
        findings.push({ ...at, kind: "mono-face" });
      }
      if (STOCK_SIZE.test(line)) {
        findings.push({ ...at, kind: "stock-size" });
      }
    });
  }
}

const EXPLAIN: Record<Finding["kind"], string> = {
  "bold-chrome-label":
    "An 11px uppercase eyebrow at font-bold outranks the 17px title it labels.\n" +
    "        Chrome tops out at semibold — case, tracking and colour already\n" +
    "        separate it. (A count badge or initials is a VALUE, not a label: it\n" +
    "        carries no `uppercase` class and this check does not flag it.)",
  "downgraded-title":
    "A title role already states font-bold. Re-stating a lighter weight beside\n" +
    "        it is exactly how forty card titles ended up under their own eyebrows.\n" +
    "        Drop the font-medium/font-semibold and let the role carry it.",
  "chrome-sized-heading":
    "A real <h1>-<h6> sized in the 10-12px chrome band. Nine of these existed:\n" +
    "        an <h3> at 12px mono-uppercase heading a stack of 14px cards, so the\n" +
    "        heading was SMALLER than its own content. Either give it a heading\n" +
    "        role (HEADING.h5 is 'a group header inside a card') or, if it is\n" +
    "        really an eyebrow rather than a heading, make it a <span>.",
  "mono-face":
    "font-mono is not part of this type system. If the intent is aligned\n" +
    "        figures, that is `tabular-nums` — a font-variant on the sans's own\n" +
    "        digits, which is what 305 of these were actually reaching for. If it\n" +
    "        is genuinely a code block, where character alignment is the content,\n" +
    "        mark the line `// authority-ok` and say so.",
  "stock-size":
    "A stock Tailwind size (text-sm/xs/base/lg/xl) — not a step on the ramp.\n" +
    "        text-sm font-bold was the app's accidental 14px sub-card title,\n" +
    "        2px above its own labels. Use the roles: TYPE.title for a card/item\n" +
    "        title, text-caption for chrome, text-body for prose, text-callout\n" +
    "        for a stat.",
  "tracking-tie":
    "This role defines its own letter-spacing. A tracking-[…] beside it is a tie\n" +
    "        resolved by generated-CSS order rather than by intent — and the app\n" +
    "        carried four different arbitrary values for the same eyebrow role.",
};

if (findings.length > 0) {
  const byKind = new Map<Finding["kind"], Finding[]>();
  for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);

  console.error(`\nFAIL  ${findings.length} place(s) where weight contradicts the hierarchy:\n`);
  for (const [kind, list] of byKind) {
    console.error(`  ${kind} — ${list.length}`);
    for (const f of list.slice(0, 8)) console.error(`    · ${f.file}:${f.line}  ${f.snippet}`);
    if (list.length > 8) console.error(`    … and ${list.length - 8} more`);
    console.error(`        ${EXPLAIN[kind]}\n`);
  }
  console.error(
    "The rule lives in artifacts/metrix-iap/src/pages/metrix/typography.ts\n" +
      "(\"RULE 3: WEIGHT IS MONOTONIC WITH RANK\").\n" +
      `A deliberate, reviewed exception takes \`// ${SUPPRESS}\` on the same line.\n`,
  );
  process.exit(1);
}

console.log(
  `\nPASS  Weight follows the hierarchy across ${scanned} file(s): no bold chrome label,\n` +
    `      no title downgraded below its role, no heading sized as chrome, and no\n` +
    `      arbitrary tracking racing a role.\n`,
);
