// Every colour in the app comes from a token.
//
// Before this gate there were 1,014 raw Tailwind palette classes across 77
// files — `bg-emerald-500/10`, `text-amber-400`, `border-red-500/40` — and
// 89% of them were emerald / amber / red doing the work of success, warning
// and danger. They were written by hand because the design system shipped
// only `destructive` and there was nothing else to point at.
//
// The consequence was not cosmetic. It meant editing tokens.json moved
// almost nothing on screen: the platform's colour lived in component class
// strings, so the design system could be changed without changing the
// design. It also meant the product wore Tailwind's stock palette, which is
// the same palette every other dashboard ships with.
//
// Two other things this catches:
//
//   · Raw hex and rgba() literals in components. Same problem, harder to
//     grep for later.
//   · Control characters embedded in source. A raw NUL was being used as a
//     composite-key separator in two files; the technique is right, but as
//     an embedded byte it makes the file grep as binary and any tool that
//     round-trips it through a text encoder can drop it silently, collapsing
//     two different keys onto one. Written as an escape it is safe.
//
// Run: pnpm --filter @workspace/scripts run check:token-colors

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(repoRoot, "artifacts/metrix-iap/src");

const FAMILIES = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow",
  "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet",
  "purple", "fuchsia", "pink", "rose",
].join("|");
const PREFIX = "bg|text|border|from|to|via|ring|fill|stroke|shadow|outline|divide|decoration|accent|caret";

const RAW_CLASS = new RegExp(`\\b(?:${PREFIX})-(?:${FAMILIES})-\\d{2,3}(?:/[0-9.]+)?\\b`, "g");
// `bg-white/[0.02]` is the subtle-surface-tint idiom — it was used 583 times.
// It works on any dark ground, which is why it spread, but it hardcodes PURE
// white as the lift: on the cockpit's blue-navy that reads cold and grey, and
// it does not follow a re-theme. bg-foreground/[0.02] is the same tint taken
// from the token.
const RAW_TONE = new RegExp(`\\b(?:${PREFIX})-(?:white|black)(?:/(?:\\[[0-9.]+\\]|[0-9]+))?\\b`, "g");
// A literal colour inside a component. The stylesheet may hold them; a .tsx
// may not — that is where they escape review.
const RAW_LITERAL = /(?:#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d)/g;
// Everything below 0x20 except tab, newline and carriage return.
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]", "g");

/**
 * Files that may hold literals, each for a stated reason:
 *   design-lab   a swatch page — showing the values IS the point
 *   chartChrome  layered box-shadows, which have no token form
 *   reportExport builds a standalone print/Word document that carries none
 *                of the app's CSS, so it cannot reference a custom property
 *   *.test.*     tests state the exact value they expect
 */
const LITERAL_EXEMPT = [/design-lab\.tsx$/, /chartChrome\.tsx$/, /reportExport\.ts$/, /\.test\.tsx?$/];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const problems: string[] = [];
let scanned = 0;

for (const file of walk(SRC)) {
  const rel = path.relative(repoRoot, file);
  const src = fs.readFileSync(file, "utf-8");
  scanned += 1;
  // Strip comments before looking for literals. A hex inside a comment is
  // documentation — several of these files explain a past colour bug by
  // naming the exact values involved, which is worth keeping.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const classes = [...code.matchAll(RAW_CLASS)].map((m) => m[0]);
  if (classes.length > 0) {
    const distinct = [...new Set(classes)];
    problems.push(
      `${rel}: ${classes.length} raw Tailwind palette class${classes.length === 1 ? "" : "es"} ` +
        `(${distinct.slice(0, 4).join(", ")}${distinct.length > 4 ? ", …" : ""}). ` +
        `Use a token: status-success / status-warning / status-danger for state, ` +
        `interactive / primary / metrix-cyan for brand, muted-foreground / border for chrome, ` +
        `or a --mx-<role>-<step> ramp value when a specific step is needed.`,
    );
  }

  const tones = [...code.matchAll(RAW_TONE)].map((m) => m[0]);
  if (tones.length > 0) {
    const distinct = [...new Set(tones)];
    problems.push(
      `${rel}: ${tones.length} hardcoded white/black utilit${tones.length === 1 ? "y" : "ies"} ` +
        `(${distinct.slice(0, 3).join(", ")}${distinct.length > 3 ? ", …" : ""}). ` +
        `Use foreground/background at the same opacity — a pure-white tint on a blue-navy ground ` +
        `reads cold, and it will not follow a re-theme.`,
    );
  }

  if (/\.tsx?$/.test(file) && !LITERAL_EXEMPT.some((r) => r.test(file))) {
    const lits = [...code.matchAll(RAW_LITERAL)].map((m) => m[0]);
    if (lits.length > 0) {
      problems.push(
        `${rel}: ${lits.length} raw colour literal${lits.length === 1 ? "" : "s"} ` +
          `(${[...new Set(lits)].slice(0, 3).join(", ")}). A colour written into a component cannot ` +
          `be re-themed and will not appear in any token audit.`,
      );
    }
  }

  const ctrl = src.match(CONTROL);
  if (ctrl) {
    problems.push(
      `${rel}: ${ctrl.length} control character${ctrl.length === 1 ? "" : "s"} embedded in source. ` +
        `Write them as escapes — as raw bytes the file greps as binary and a text round-trip can ` +
        `drop them silently.`,
    );
  }
}

if (problems.length > 0) {
  console.error("\nFAIL  Colour-token violations:\n");
  for (const p of problems) console.error(`      · ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`\nPASS  Every colour comes from a token, across ${scanned} files.\n`);
