// Chart-palette conformance check.
//
// Two rules, both of which the platform broke before this gate existed, and
// both of which are invisible to jsdom because jsdom does not resolve CSS
// variables — every test passed while the bug shipped.
//
//   1. STATUS COLOURS ARE RESERVED. A status role (success, warning, danger,
//      info) may never resolve to a chart series slot. It used to:
//        --status-success: var(--chart-3)
//        --status-warning: var(--chart-4)
//      That coupling ran both ways. Two of five categorical slots were spoken
//      for before any chart was designed, so the palette could not move hue;
//      and a palette change would have silently repainted every success and
//      warning state in the product. The proposed zinc token set would have
//      turned both grey, at 1.35:1 from each other.
//
//   2. A CATEGORICAL PALETTE IS NEVER CYCLED. `PALETTE[i % PALETTE.length]`
//      guarantees that past the end of the scale two different series wear one
//      colour, and the legend then maps two names onto one swatch. The share
//      donut did exactly this, with a ten-entry list in which four entries
//      were aliases resolving to a colour already in the list — so it repeated
//      colours from slice seven onward, before the modulo even engaged.
//      Overflow folds into a neutral bucket; it does not borrow a hue.
//
// Values are resolved from tokens.json through both stylesheets, so this
// cannot pass while disagreeing with what actually renders.
//
// Run: pnpm --filter @workspace/scripts run check:chart-palette

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOKENS = path.join(repoRoot, "artifacts/command-deck/tokens.json");
const DS_CSS = path.join(repoRoot, "artifacts/command-deck/src/index.css");
const APP_CSS = path.join(repoRoot, "artifacts/metrix-iap/src/index.css");
const APP_SRC = path.join(repoRoot, "artifacts/metrix-iap/src");

const problems: string[] = [];

// ── Resolve the alias graph ───────────────────────────────────────────
// A custom property whose value is exactly `var(--x)` or `hsl(var(--x))` is
// an alias. Anything else (a colour, a calc, a gradient) is a leaf.
function readAliases(file: string): Map<string, string> {
  const src = fs.readFileSync(file, "utf-8");
  const out = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:\s*(?:hsl\(\s*)?var\(\s*(--[a-z0-9-]+)\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // First definition wins: later ones are theme overrides of the same edge.
    if (!out.has(m[1]!)) out.set(m[1]!, m[2]!);
  }
  return out;
}

const aliases = new Map([...readAliases(DS_CSS), ...readAliases(APP_CSS)]);

/** camelCase token name -> the CSS custom property it generates. */
const tokenVar = (name: string) =>
  "--" + name.replace(/([a-z])([A-Z0-9])/g, "$1-$2").replace(/([0-9])/g, "-$1").replace(/--+/g, "-").toLowerCase();

interface Tokens { color: Record<string, Record<string, { $value?: string }>>; }
const tokens = JSON.parse(fs.readFileSync(TOKENS, "utf-8")) as Tokens;

function leafValues(scope: "light" | "dark"): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, node] of Object.entries(tokens.color[scope] ?? {})) {
    if (name.startsWith("$")) continue;
    const v = node?.$value;
    if (typeof v === "string" && v.startsWith("#")) out.set(tokenVar(name), v.toLowerCase());
  }
  return out;
}

/** Follow the alias chain until it lands on a token, or give up. */
function resolve(varName: string, leaves: Map<string, string>): { token: string; hex: string | null } {
  const seen = new Set<string>();
  let cur = varName;
  while (!leaves.has(cur) && aliases.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = aliases.get(cur)!;
  }
  return { token: cur, hex: leaves.get(cur) ?? null };
}

// ── Rule 1: status roles may not land on a chart slot ──────────────────
const STATUS_VARS = [
  "--status-success", "--status-warning", "--status-danger", "--status-info",
  "--mx-success", "--mx-warning", "--mx-danger",
  "--metrix-success", "--metrix-gold", "--metrix-danger",
];
for (const scope of ["light", "dark"] as const) {
  const leaves = leafValues(scope);
  for (const v of STATUS_VARS) {
    if (!aliases.has(v) && !leaves.has(v)) continue; // not defined; nothing to check
    const { token } = resolve(v, leaves);
    if (/^--chart-\d+$/.test(token)) {
      problems.push(
        `${v} resolves to ${token} in ${scope} mode. Status colours are reserved: a state ` +
          `must not wear a categorical series hue, and a series slot must not be pinned by a state.`,
      );
    }
  }
}

// ── Rule 2: no two entries of a series palette share a colour ──────────
// Find declared palette arrays of CSS-variable strings and resolve each entry.
const PALETTE_DECL = /const\s+([A-Z][A-Z0-9_]*(?:VARS|PALETTE|COLORS|COLOURS|SERIES))\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const darkLeaves = leafValues("dark");
for (const file of walk(APP_SRC)) {
  const src = fs.readFileSync(file, "utf-8");
  const rel = path.relative(repoRoot, file);
  let m: RegExpExecArray | null;
  PALETTE_DECL.lastIndex = 0;
  while ((m = PALETTE_DECL.exec(src)) !== null) {
    const name = m[1]!;
    const entries = [...m[2]!.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)].map((x) => x[1]!);
    if (entries.length < 2) continue;

    const byHex = new Map<string, string[]>();
    for (const e of entries) {
      const { hex } = resolve(e, darkLeaves);
      if (!hex) continue;
      (byHex.get(hex) ?? byHex.set(hex, []).get(hex)!).push(e);
    }
    for (const [hex, vars] of byHex) {
      if (vars.length > 1) {
        problems.push(
          `${rel}: ${name} has ${vars.length} entries that all resolve to ${hex} — ${vars.join(", ")}. ` +
            `Two series painted the same colour make the legend ambiguous.`,
        );
      }
    }

    // A reserved status colour is not a series slot.
    for (const e of entries) {
      const { token } = resolve(e, darkLeaves);
      if (/^--(destructive|success|warning|info)$/.test(token)) {
        problems.push(`${rel}: ${name} uses ${e} (-> ${token}) as a series slot. Status colours are reserved.`);
      }
    }

    // And the scale is never cycled past its end.
    if (new RegExp(`${name}\\s*\\[[^\\]]*%\\s*${name}\\.length`).test(src)) {
      problems.push(
        `${rel}: ${name} is indexed with \`% ${name}.length\` — a cycled categorical scale. ` +
          `Past the last slot two series wear one colour. Fold the overflow into a neutral bucket instead.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("\nFAIL  Chart palette violations:\n");
  for (const p of problems) console.error(`      · ${p}`);
  console.error("");
  process.exit(1);
}

console.log("\nPASS  Chart palette conforms: status colours reserved, no duplicate or cycled series slots.\n");
