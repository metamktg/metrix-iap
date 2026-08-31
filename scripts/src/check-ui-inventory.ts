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
//   TYPE       Uses the type roles rather than raw Tailwind text sizes —
//              either spelling: the `TYPE.*`/`HEADING.*`/`DIALOG.title` TS
//              constants, or the `.text-label`/`.text-caption`/`.text-body`
//              /`.text-title`… utilities that declare the same steps in
//              index.css. Without one a surface is off the ramp and its
//              headings have no defined rank. A raw `text-[Npx]` is not a
//              role and never counts.
//   MOTION     Moves with the system's motion vocabulary: imports lib/motion
//              or framer-motion directly, OR composes one of the
//              motion-carrying widgets (RevealPanel, DisclosureStack,
//              ListStack, CopyConfirmButton/ActionConfirmButton, SwipeDeck,
//              ActionSlider) — those animate with the one spring/signature
//              internally, so a page built from them moves correctly without
//              importing a duration itself. Counting only direct imports
//              penalized exactly the architecture the system wants (motion
//              by composition) and pushed pages toward hand-rolling.
//              The four Radix content primitives (Dialog/AlertDialog/
//              Popover/Sheet Content) count for the same reason: each
//              animates its own arrival and departure inside the shared
//              primitive, so a dialog is animated by composition too.
//              Approximation, named: the widget names are matched anywhere
//              in the source, comments included — same class of regex signal
//              as the rest of this file.
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
  // Two legitimate spellings of ONE ramp, and counting only the first was
  // this check's third composition blind spot (after page- and popup-MOTION).
  // `TYPE.*` / `HEADING.*` / `DIALOG.title` are the TS constants; the
  // `.text-micro|label|caption|body|title|callout|display|h2..h5` utilities
  // are the SAME steps declared in index.css (11/12/13/15/18/19/21/24/25px),
  // and the CSS side is the more complete of the two. A file spelling the
  // ramp in CSS is on the ramp. The shell class read TYPE 0% across seven
  // surfaces purely because chrome spells it that way — 70 role uses across
  // TaskTray/Sidebar/AccountSwitcher/Topbar, zero TYPE.* imports.
  // What this still does NOT count, deliberately: a raw `text-[Npx]`, which
  // is off-ramp by definition and is what check:disclosure-rulebook ratchets.
  type: /\b(TYPE\.[a-zA-Z]+|HEADING\.h[1-6]|DIALOG\.title|text-(?:micro|micro-num|label|caption|body|title|cardtitle|callout|display|section|bignum|hero|h[2-5]))\b/,
  // SectionCard belongs in this list since its body went onto RevealPanel
  // (2026-08-29): every collapsible module section now animates with the
  // one signature, so a page built from SectionCards moves correctly with
  // zero motion imports of its own. NOTE the limit this creates: MOTION is
  // a presence signal ("composes the system's motion vocabulary"), and it
  // can no longer find the opposite defect — a page that ALSO hand-rolls a
  // duration. The truer residual gate would flag raw duration-* /
  // transition-duration values outside lib/motion; build that when the
  // hand-rolled count is worth hunting.
  //
  // The four Radix content primitives joined the list on 2026-08-31 for the
  // same reason, after "popup MOTION 10%" turned out to be this detector's
  // blind spot rather than a gap in the dialogs. Every one of them carries
  // its own enter AND exit in the shared primitive — DialogContent and
  // AlertDialogContent fade-in-0 / zoom-in-95 over duration-200,
  // PopoverContent adds a per-side slide, SheetContent slides from its edge
  // (open 500ms / close 300ms) — and the dialog-stack recede that rides on
  // .mx-dialog-content is turned off under prefers-reduced-motion in
  // index.css. A file that renders one of them is animated by composition,
  // exactly as a file built from SectionCards is; counting only lib/motion
  // imports asked those surfaces to hand-roll a second, competing signature.
  // Same approximation as above: matched anywhere in source, comments
  // included. Same residual blind spot too — presence, not absence of
  // hand-rolled durations.
  motion:
    /from "@\/lib\/motion"|framer-motion|\b(RevealPanel|DisclosureStack|ListStack|CopyConfirmButton|ActionConfirmButton|SwipeDeck|ActionSlider|SectionCard|LayeredDisclosure|FilterDisclosure|DialogContent|AlertDialogContent|PopoverContent|SheetContent)\b/,
  disclose:
    /\b(DetailReveal|DisclosureStack|FilterDisclosure|useShowMore|ShowMoreButton|AccordionToggle|DenseText|ClampedProse|ExpandableText|LayeredDisclosure|ListStack)\b/,
  // BreakdownExplorer is a composite that renders its charts internally —
  // a page wiring it has a working dimension×metric visualization even
  // though no primitive's name appears in that page's source.
  viz: /\b(MetricBarChart|TrendChart|SharePieChart|FunnelChart|HeatMatrix|VariableStack|MetricTable|RankedBars|ProgressMeter|RunProgress|DataModule|SwipeDeck|BreakdownExplorer)\b/,
  // A breakpoint prefix on any utility, a container query, or one of the
  // dashboard grid classes — those carry their breakpoints inside index.css
  // (2 cols at base → 4 at ≥768px, etc.), so a file using one IS responsive
  // even though no `sm:` appears in its source. ManagerOverview scored `.`
  // for RESP while reflowing correctly at every width for exactly this
  // reason.
  responsive: /\b(sm:|md:|lg:|xl:|2xl:|@container|@[a-z]+:|grid-cols-dashboard-)/,
  a11y: /\b(aria-[a-z]+|role=)/,
};

/**
 * Files that render JSX but are NOT surfaces a reader ever looks at.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A CONVENIENCE
 * The `panel` bucket held 39 files, of which NINE were seven context
 * providers, the router (`App.tsx`) and the design lab. A provider returns
 * `<Ctx.Provider>{children}</Ctx.Provider>`: it has no heading to give a type
 * role, no breakpoint to add, nothing to disclose. It can never satisfy the
 * checks, so it permanently drags the class average down — and the Phase 1
 * exit criterion written against that average (`TYPE >= 90%`) was
 * UNREACHABLE. Nine of thirty-nine caps the class at 77%.
 *
 * A gate nobody can ever pass gets ignored, and then it stops protecting the
 * thirty files that CAN pass. So these are excluded from the inventory
 * entirely rather than scored and forgiven: an exclusion you can read is
 * honest, a number you have to mentally discount is not.
 *
 * `design-lab.tsx` is excluded on the same principle — it is the component
 * gallery, deliberately not a product surface, and refacing it to hit a
 * coverage number would be optimising the instrument.
 */
function isInfrastructure(rel: string): boolean {
  const dir = rel.replace(/\\/g, "/");
  if (dir === "App.tsx" || dir === "main.tsx" || dir === "design-lab.tsx") return true;
  if (dir.startsWith("contexts/")) return true;
  if (/(?:^|\/)[A-Za-z]+(?:Context|Provider)\.tsx$/.test(dir)) return true;
  // Kebab-case providers escape the suffix test above: lib/concept-registry-
  // context.tsx is a context provider in every way that matters (it returns
  // <Ctx.Provider> and renders no surface), and it sat in the panel bucket
  // dragging the class average exactly the way the nine CamelCase providers
  // did before they were excluded.
  if (/(?:^|\/)[a-z-]+-context\.tsx$/.test(dir)) return true;
  return false;
}

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
const excluded: string[] = [];
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  const src = fs.readFileSync(file, "utf8");
  // A file with no JSX is a helper, not a surface.
  if (!/return\s*\(?\s*</.test(src) && !/=>\s*\(?\s*</.test(src)) continue;
  // Renders JSX, but nobody reads it — see isInfrastructure.
  if (isInfrastructure(rel)) { excluded.push(rel); continue; }
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

console.log(
  `\nUI INVENTORY — ${rows.length} surfaces` +
    (excluded.length > 0
      ? `  (${excluded.length} infrastructure file(s) excluded: ${excluded.join(", ")})`
      : "") +
    "\n",
);
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
