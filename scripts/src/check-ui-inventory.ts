// Every UI class in the product, and whether the new design has reached it.
//
// WHY THIS IS A SCRIPT AND NOT A SPREADSHEET
// "Have we done a pass on every widget?" is a question nobody can answer from
// memory once the surface count passes about thirty, and a hand-written list
// is out of date the day after it is written. It is also the wrong shape for
// the question: what matters is not whether someone LOOKED at a file, it is
// whether the file exhibits the properties the new design is made of. Those
// are all detectable.
//
// So this reads every component and page in the app, classifies it by the
// kind of surface it is, and reports which of the design properties it
// carries. Run it after a change and the delta tells you what moved.
//
// WHAT IT MEASURES, AND WHY EACH ONE
//
//   TYPE       Uses the type roles (TYPE.*/HEADING.*) rather than raw
//              Tailwind text sizes. Without this a surface is off the ramp
//              and its headings have no defined rank.
//   MOTION     Uses lib/motion. Hand-rolled durations are how no two moving
//              things in the product move alike.
//   DISCLOSE   Has a progressive-disclosure affordance. A dense surface with
//              none of these puts everything on the first layer or hides it
//              in a modal, and both read as heavy.
//   VIZ        Renders a shared chart/dataviz primitive rather than a
//              hand-rolled bar or grid.
//   RESPONSIVE Carries at least one responsive breakpoint. A fixed layout
//              inside a shell whose sidebar collapses is a layout that
//              breaks when the sidebar collapses.
//   A11Y       Carries explicit accessibility wiring (aria-*, role=). Mostly
//              relevant to the interactive classes.
//
// A surface is not required to carry all six — a chart primitive has no need
// of DISCLOSE, and a pure layout shell has nothing to type. The report is a
// map, not a scoreboard: it exists so the next person can SEE where the new
// design has and has not reached, and pick the next target from evidence.
//
// Run:  pnpm --filter @workspace/scripts run check:ui-inventory
//       …            run check:ui-inventory -- --gaps     (only what is missing)
//       …            run check:ui-inventory -- --kind=popup

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(repoRoot, "artifacts/metrix-iap/src");

type Kind = "page" | "module" | "widget" | "popup" | "panel" | "chart" | "nav" | "shell";

interface Row {
  file: string;
  kind: Kind;
  lines: number;
  type: boolean;
  motion: boolean;
  disclose: boolean;
  viz: boolean;
  responsive: boolean;
  a11y: boolean;
}

const SIGNAL = {
  type: /\b(TYPE\.[a-zA-Z]+|HEADING\.h[1-6]|DIALOG\.title)\b/,
  motion: /from "@\/lib\/motion"|framer-motion/,
  disclose:
    /\b(DetailReveal|DisclosureStack|FilterDisclosure|useShowMore|ShowMoreButton|AccordionToggle|DenseText|ClampedProse|ExpandableText)\b/,
  viz: /\b(MetricBarChart|TrendChart|SharePieChart|FunnelChart|HeatMatrix|VariableStack|MetricTable|RankedBars|ProgressMeter|RunProgress|DataModule|SwipeDeck)\b/,
  // A breakpoint prefix on any utility, or a container query.
  responsive: /\b(sm:|md:|lg:|xl:|2xl:|@container|@[a-z]+:)/,
  a11y: /\b(aria-[a-z]+|role=)/,
};

/**
 * Classify by directory first — it is the strongest signal and the one the
 * codebase actually organises by — then fall back to the filename.
 *
 * `rel` is relative to src/, so it has NO leading slash. Matching on
 * "/components/charts/" silently classified every file as the fallback and
 * made the whole report say "panel" — the first version of this did exactly
 * that, and the summary looked plausible enough to nearly ship.
 */
function classify(rel: string): Kind {
  const dir = rel.replace(/\\/g, "/");
  const base = path.basename(dir);
  if (dir.startsWith("components/charts/")) return "chart";
  if (dir.startsWith("components/nav/") || dir.startsWith("navigation/")) return "nav";
  if (dir.startsWith("components/widgets/")) return "widget";
  if (dir.startsWith("components/data-module/")) return "module";
  if (dir.startsWith("components/layout/")) return "shell";
  if (/Dialog|Modal|Popover|Tooltip|Drawer|Sheet/.test(base)) return "popup";
  if (dir.startsWith("pages/")) return "page";
  if (/Panel|Tray|Deck|Card|Strip|Bar|Grid|List|View/.test(base)) return "panel";
  return "panel";
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) {
      out.push(p);
    }
  }
  return out;
}

const rows: Row[] = [];
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  const src = fs.readFileSync(file, "utf8");
  // A file with no JSX is a helper, not a surface.
  if (!/return\s*\(?\s*</.test(src) && !/=>\s*\(?\s*</.test(src)) continue;
  rows.push({
    file: rel,
    kind: classify(rel),
    lines: src.split("\n").length,
    type: SIGNAL.type.test(src),
    motion: SIGNAL.motion.test(src),
    disclose: SIGNAL.disclose.test(src),
    viz: SIGNAL.viz.test(src),
    responsive: SIGNAL.responsive.test(src),
    a11y: SIGNAL.a11y.test(src),
  });
}

// ── Report ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const gapsOnly = args.includes("--gaps");
const kindArg = args.find((a) => a.startsWith("--kind="))?.split("=")[1] as Kind | undefined;

const mark = (b: boolean) => (b ? "*" : ".");
const KINDS: Kind[] = ["shell", "nav", "page", "module", "widget", "chart", "panel", "popup"];

const counts = new Map<Kind, { n: number; type: number; motion: number; disclose: number; viz: number; responsive: number; a11y: number }>();
for (const k of KINDS) counts.set(k, { n: 0, type: 0, motion: 0, disclose: 0, viz: 0, responsive: 0, a11y: 0 });
for (const r of rows) {
  const c = counts.get(r.kind)!;
  c.n++;
  if (r.type) c.type++;
  if (r.motion) c.motion++;
  if (r.disclose) c.disclose++;
  if (r.viz) c.viz++;
  if (r.responsive) c.responsive++;
  if (r.a11y) c.a11y++;
}

console.log(`\nUI INVENTORY — ${rows.length} surfaces\n`);
console.log("KIND        n    TYPE  MOTION  DISCL   VIZ  RESP  A11Y");
for (const k of KINDS) {
  const c = counts.get(k)!;
  if (c.n === 0) continue;
  const pct = (v: number) => String(Math.round((v / c.n) * 100)).padStart(4) + "%";
  console.log(
    k.padEnd(10) + String(c.n).padStart(3) + "  " +
    pct(c.type) + "  " + pct(c.motion) + "  " + pct(c.disclose) + "  " +
    pct(c.viz) + " " + pct(c.responsive) + " " + pct(c.a11y),
  );
}

const shown = rows
  .filter((r) => (kindArg ? r.kind === kindArg : true))
  .filter((r) => (gapsOnly ? !r.type || !r.responsive : true))
  .sort((a, b) => b.lines - a.lines);

console.log(`\n${gapsOnly ? "GAPS — missing TYPE roles or any responsive breakpoint" : "ALL SURFACES"} (largest first)\n`);
console.log("TYPE MOTION DISCL VIZ RESP A11Y  lines  kind      file");
for (const r of shown.slice(0, 60)) {
  console.log(
    `  ${mark(r.type)}     ${mark(r.motion)}     ${mark(r.disclose)}   ${mark(r.viz)}   ` +
    `${mark(r.responsive)}    ${mark(r.a11y)}  ${String(r.lines).padStart(5)}  ${r.kind.padEnd(8)}  ${r.file}`,
  );
}
if (shown.length > 60) console.log(`\n  … and ${shown.length - 60} more`);

console.log(
  "\n* = present  . = absent. Not a scoreboard — a chart primitive needs no\n" +
    "disclosure and a layout shell has nothing to type. Read it to pick the\n" +
    "next target from evidence rather than from memory.\n",
);
