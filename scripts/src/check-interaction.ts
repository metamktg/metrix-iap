// Every control behaves like a control.
//
// The design gates that already exist answer "is this the right colour" and
// "is this the right size". This one answers "can a person actually use it",
// which is the question a screenshot cannot and jsdom will not.
//
// Three defect classes, each one found in this codebase before it was
// written as a rule:
//
//   · An affordance that only exists on hover does not exist on a phone.
//     MetricTile's "Segment breakdown →" was text-interactive/0 until hover,
//     so on touch the tile looked identical to the static one beside it and
//     gave the reader no reason to press it.
//   · A control smaller than 40x40 is a miss on a touch screen. SectionCard's
//     disclosure was an 18px chevron, and it was also the only part of a
//     full-width header strip a keyboard could reach.
//   · A button inside a button is invalid HTML, and browsers resolve it by
//     dropping one — so one of the two actions silently stops working. It
//     came up as a div-with-onClick wrapping a real button, which is the
//     same bug with the invalidity hidden.
//
// Run: pnpm --filter @workspace/scripts run check:interaction

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(repoRoot, "artifacts/metrix-iap/src");

/**
 * Tailwind height steps in CSS pixels.
 *
 * Two thresholds, deliberately different, because they are different claims:
 *
 *   24px is WCAG 2.2 AA (2.5.8 Target Size Minimum). Below it is a failure.
 *   40px is a touch-comfort recommendation, and 44px is AAA (2.5.5).
 *
 * A measurement of this codebase found 14 controls under 24px and 148
 * between 24 and 39. Forcing all 162 to 40px would visibly inflate the
 * density of a dashboard that is dense on purpose, so the gate fails on the
 * 14 and reports the rest. Density is the product's call; 24px is not.
 */
const H_STEP: Record<string, number> = {
  px: 1, "0.5": 2, "1": 4, "1.5": 6, "2": 8, "2.5": 10, "3": 12, "3.5": 14,
  "4": 16, "5": 20, "6": 24, "7": 28, "8": 32, "9": 36,
};
const AA_TARGET_PX = 24;
const COMFORT_PX = 40;
/** An element that starts invisible and is revealed only by hover. */
const HIDDEN_AT_REST = /\b(?:opacity-0|text-[a-z-]+\/0)\b/;
const HOVER_REVEAL = /\b(?:group-)?hover(?:\/[a-z]+)?:(?:opacity-100|text-[a-z-]+\/[1-9])/;

/**
 * Blanks comments while preserving every byte offset and newline, so line
 * numbers stay true and a scan cannot be fooled by prose.
 *
 * This is not hypothetical: strategyShared.tsx documents two helpers as
 * "safe inside <button> cards", and reading those as markup made the scanner
 * think a scope was open for the rest of the file — every later button in
 * it reported as nested. Blanking rather than deleting keeps the reported
 * line pointing at the real source line.
 */
function blankComments(src: string): string {
  const out = src.split("");
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "*") {
      let j = src.indexOf("*/", i + 2);
      if (j < 0) j = src.length; else j += 2;
      for (let k = i; k < j; k++) if (out[k] !== "\n") out[k] = " ";
      i = j;
    } else if (src[i] === "/" && src[i + 1] === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = src.length;
      for (let k = i; k < j; k++) out[k] = " ";
      i = j;
    } else i++;
  }
  return out.join("");
}

interface Finding { file: string; line: number; what: string; fix: string }
const findings: Finding[] = [];
/** 24-39px: above the AA floor, below the comfort target. Reported, not failed. */
const snug: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out); }
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * The opening tag starting at `i`, and its class list. Tags are read to their
 * closing ">" with a depth counter over {} so a className built with cn(...)
 * spanning several lines is read whole — the reason a plain line-based grep
 * finds a fraction of these.
 */
function readTag(src: string, i: number): { tag: string; end: number } | null {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return { tag: src.slice(i, j + 1), end: j };
  }
  return null;
}

for (const file of walk(SRC)) {
  const rel = path.relative(repoRoot, file);
  const raw = fs.readFileSync(file, "utf-8");
  const src = blankComments(raw);
  const lineAt = (idx: number) => raw.slice(0, idx).split("\n").length;

  // ── Hover-only affordances ────────────────────────────────────────
  for (const m of src.matchAll(/<[A-Za-z][^\s/>]*/g)) {
    const t = readTag(src, m.index!);
    if (!t) continue;
    if (HIDDEN_AT_REST.test(t.tag) && HOVER_REVEAL.test(t.tag)) {
      // A purely decorative mark may hide at rest; content and controls may
      // not. WCAG 1.4.13 governs CONTENT that appears on hover, and an 8px
      // unlabelled icon is not content — flagging it would train the reader
      // to skip this gate's output.
      //
      // The distinction is whether the hidden thing is reachable another
      // way: an element that is revealed on focus, or on a device with no
      // hover, is available to everyone. Either escape clears it.
      const reachableOtherwise =
        /(?:group-)?focus-within(?:\/[a-z]+)?:(?:opacity-100|pointer-events-auto)/.test(t.tag) ||
        /\[@media\(hover:none\)\]/.test(t.tag);
      // Decorative: carries no text of its own and nothing announces it.
      const bare = !/aria-label|title=/.test(t.tag) && !/<button|<a\b|role="button"/.test(t.tag);
      if (reachableOtherwise || bare) continue;
      findings.push({
        file: rel, line: lineAt(m.index!),
        what: "invisible until hover",
        fix: "A touch screen has no hover, so this never appears on a phone or tablet. " +
             "Show it at rest and brighten on hover instead of materialising it.",
      });
    }
  }

  // ── Hit area ──────────────────────────────────────────────────────
  for (const m of src.matchAll(/<button\b/g)) {
    const t = readTag(src, m.index!);
    if (!t) continue;
    const h = /\b(?:h|size)-(px|[0-9.]+)\b/.exec(t.tag);
    if (!h) continue; // no explicit height — content and padding decide it
    const px = H_STEP[h[1]!];
    if (px === undefined || px >= COMFORT_PX) continue;
    // .hit-target-24 extends the PRESSABLE area with a centred pseudo-element
    // at least 24px in each axis, without changing how big the control looks.
    // The rule is about the target, not the paint.
    const extended = /\bhit-target-24\b/.test(t.tag);
    if (px < AA_TARGET_PX && !extended) {
      findings.push({
        file: rel, line: lineAt(m.index!),
        what: `control is ${px}px tall — below the WCAG 2.2 AA target size of ${AA_TARGET_PX}px`,
        fix: "Give it h-6 at minimum, or extend the target with a pseudo-element if the " +
             "visible element must stay small. h-10 is the comfort target.",
      });
    } else if (!extended) {
      snug.push(`${rel}:${lineAt(m.index!)} (${px}px)`);
    }
  }

  // ── Nested interactives ───────────────────────────────────────────
  {
    let depth = 0;
    const tagRe = /<button\b|<\/button>/g;
    for (const m of src.matchAll(tagRe)) {
      if (m[0] === "</button>") { depth = Math.max(0, depth - 1); continue; }
      const t = readTag(src, m.index!);
      // A self-closing <button ... /> opens no scope. Without this the first
      // one in a file made every later button read as nested.
      const selfClosing = t ? /\/>$/.test(t.tag.trim()) : false;
      if (depth > 0) {
        findings.push({
          file: rel, line: lineAt(m.index!),
          what: "a button inside a button",
          fix: "Invalid HTML — the browser drops one, so one of the two actions silently " +
               "stops working. Put the inner control beside the outer one, not inside it.",
        });
      }
      if (!selfClosing) depth++;
    }
  }
}

if (snug.length > 0) {
  console.log(
    `\nNOTE  ${snug.length} control(s) between ${AA_TARGET_PX}px and ${COMFORT_PX}px. Above the ` +
      `WCAG 2.2 AA target size, below the touch-comfort target — a density choice, not a failure.`,
  );
}

if (findings.length > 0) {
  console.error(`\nFAIL  ${findings.length} interaction defect(s):\n`);
  for (const f of findings) {
    console.error(`      · ${f.file}:${f.line} — ${f.what}`);
    console.error(`        ${f.fix}\n`);
  }
  process.exit(1);
}
console.log("\nPASS  Every control is reachable, pressable and singular.\n");
