// Contrast-safety check: verify all --mx-text-* and --color-text-* CSS custom
// properties in index.css have a WCAG AA contrast ratio (≥ 4.5:1) against the
// canonical dark cockpit background --mx-bg-main (#050b18).
//
// Supported value formats (resolved recursively):
//   #rrggbb / #rgb              — direct hex
//   hsl(H S% L%)                — modern space-separated hsl
//   hsl(H, S%, L%)              — legacy comma-separated hsl
//   hsl(var(--x))               — resolved by looking up --x in the same file
//   var(--x)                    — resolved recursively
//   "H S% L%"                   — bare shadcn HSL channel string (used with hsl() wrapper)
//
// Values that cannot be resolved (e.g. rgba(), env(), computed expressions) are
// skipped with a SKIP note — they do NOT cause a failure.
//
// Suppression: tokens whose raw value line in the CSS contains "/* contrast-ok */"
// are acknowledged exceptions and are not flagged.
//
// Run: pnpm --filter @workspace/scripts run check:css-token-contrast

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const CSS_FILE = path.join(repoRoot, "artifacts/metrix-iap/src/index.css");
/** Command Deck design-system stylesheet. The IAP is always dark (index.html
 * sets class="dark"), so its `.dark { … }` block supplies the effective values
 * for --foreground, --primary, --muted-foreground, … that the app's tokens
 * alias. Merging it lets var() chains that cross into the package resolve. */
const DS_CSS_FILE = path.join(repoRoot, "artifacts/command-deck/src/index.css");
/** The dark cockpit background every text token must contrast against. */
const BG_HEX = "#050b18"; // --mx-bg-main
/** WCAG AA minimum for normal text. */
const MIN_CONTRAST = 4.5;
const SUPPRESSION_MARKER = "contrast-ok";

// ── Color math ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  );
}

function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const l1 = relativeLuminance(...fg);
  const l2 = relativeLuminance(...bg);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

// ── CSS parsing ───────────────────────────────────────────────────────────────

type CssVarMap = Map<string, string>;

/**
 * Collect ALL --custom-property declarations in the CSS file.
 * When the same property is declared more than once (e.g. :root then .dark)
 * the first occurrence is kept — that is the canonical light-mode / default
 * value which is what the check targets.
 */
function parseCssVars(css: string): CssVarMap {
  const map: CssVarMap = new Map();
  // Match:  --var-name : value ;
  // Value stops at the next semicolon (handles multi-word values).
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const name = m[1]!.trim();
    const val = m[2]!.trim();
    if (!map.has(name)) {
      map.set(name, val);
    }
  }
  return map;
}

/**
 * Recursively resolve a CSS value to a "flat" string suitable for parseColor().
 * Returns null when the value cannot be resolved (complex expressions, env(), etc.).
 */
function resolveVar(
  value: string,
  vars: CssVarMap,
  depth = 0,
): string | null {
  if (depth > 12) return null; // circular-ref guard
  const trimmed = value.trim();

  // hsl(var(--x)) — resolve the inner var, then re-wrap in hsl()
  const hslVarMatch = trimmed.match(/^hsl\(\s*var\((--[\w-]+)\)\s*\)$/);
  if (hslVarMatch) {
    const inner = vars.get(hslVarMatch[1]!);
    if (inner == null) return null;
    const resolved = resolveVar(inner, vars, depth + 1);
    return resolved != null ? `hsl(${resolved})` : null;
  }

  // hsl(var(--x) / A) — resolve the inner var, keep the alpha for compositing
  const hslVarAlphaMatch = trimmed.match(
    /^hsl\(\s*var\((--[\w-]+)\)\s*\/\s*([\d.]+%?)\s*\)$/,
  );
  if (hslVarAlphaMatch) {
    const inner = vars.get(hslVarAlphaMatch[1]!);
    if (inner == null) return null;
    const resolved = resolveVar(inner, vars, depth + 1);
    return resolved != null ? `hsl(${resolved} / ${hslVarAlphaMatch[2]!})` : null;
  }

  // var(--x) — resolve directly
  const varMatch = trimmed.match(/^var\((--[\w-]+)\)$/);
  if (varMatch) {
    const inner = vars.get(varMatch[1]!);
    if (inner == null) return null;
    return resolveVar(inner, vars, depth + 1);
  }

  return trimmed;
}

/**
 * Parse a resolved color string into an RGB triple.
 * Returns null when the format is not supported (rgba, oklch, env, …).
 */
function parseColor(resolved: string | null): [number, number, number] | null {
  if (!resolved) return null;
  const val = resolved.trim();

  // hex
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(val)) {
    return hexToRgb(val);
  }

  // hsl(H S% L%) / hsl(H, S%, L%) / hsl(H S% L% / A) — extract permissively.
  // A trailing alpha (0–1 or %) is composited over the check background,
  // matching how the always-dark app renders translucent text.
  if (val.startsWith("hsl(")) {
    const nums = val.match(/[\d.]+%?/g);
    if (nums && nums.length >= 3) {
      const rgb = hslToRgb(
        parseFloat(nums[0]!),
        parseFloat(nums[1]!),
        parseFloat(nums[2]!),
      );
      if (nums.length >= 4 && val.includes("/")) {
        let a = parseFloat(nums[3]!);
        if (nums[3]!.endsWith("%")) a /= 100;
        const bg = hexToRgb(BG_HEX)!;
        return [
          Math.round(rgb[0] * a + bg[0] * (1 - a)),
          Math.round(rgb[1] * a + bg[1] * (1 - a)),
          Math.round(rgb[2] * a + bg[2] * (1 - a)),
        ];
      }
      return rgb;
    }
  }

  // bare "H S% L%" (shadcn pattern — stored without the hsl() wrapper)
  const bareHsl = val.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (bareHsl) {
    return hslToRgb(
      parseFloat(bareHsl[1]!),
      parseFloat(bareHsl[2]!),
      parseFloat(bareHsl[3]!),
    );
  }

  return null;
}

// ── Suppression: per-line contrast-ok markers ─────────────────────────────────

/**
 * Build a set of suppressed variable names by scanning for lines that contain
 * both a --mx-text-* / --color-text-* declaration and the suppression marker.
 */
function suppressedTokens(css: string): Set<string> {
  const suppressed = new Set<string>();
  for (const line of css.split("\n")) {
    if (!line.includes(SUPPRESSION_MARKER)) continue;
    const m = line.match(/(--(?:mx-text|color-text)-[\w-]+)/);
    if (m) suppressed.add(m[1]!);
  }
  return suppressed;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(CSS_FILE)) {
    console.error(`\nFAIL  CSS file not found: ${CSS_FILE}`);
    process.exit(1);
  }

  const css = fs.readFileSync(CSS_FILE, "utf-8");
  const vars = parseCssVars(css);
  const suppressed = suppressedTokens(css);

  // Merge the Command Deck dark-theme variables (app is always dark) so that
  // app tokens aliasing package vars (e.g. var(--foreground)) resolve to real
  // colors. App-file declarations win; package vars only fill gaps.
  if (fs.existsSync(DS_CSS_FILE)) {
    const dsCss = fs.readFileSync(DS_CSS_FILE, "utf-8");
    const darkBlock = dsCss.match(/\.dark\s*\{([^}]*)\}/);
    if (darkBlock) {
      for (const [name, val] of parseCssVars(darkBlock[1]!)) {
        if (!vars.has(name)) vars.set(name, val);
      }
    }
  } else {
    console.error(`\nFAIL  Design-system CSS not found: ${DS_CSS_FILE}`);
    process.exit(1);
  }

  const bgRgb = hexToRgb(BG_HEX);
  if (!bgRgb) {
    console.error(`\nFAIL  Cannot parse background color: ${BG_HEX}`);
    process.exit(1);
  }

  // Collect all text tokens
  const textTokenNames: string[] = [];
  for (const name of vars.keys()) {
    if (name.startsWith("--mx-text-") || name.startsWith("--color-text-")) {
      textTokenNames.push(name);
    }
  }

  if (textTokenNames.length === 0) {
    console.log(
      "\nPASS  No --mx-text-* or --color-text-* tokens found in index.css.\n",
    );
    process.exit(0);
  }

  type Result = {
    name: string;
    rawValue: string;
    resolvedValue: string | null;
    ratio: number | null;
    pass: boolean;
    skipped: boolean;
    exempt: boolean;
  };

  const results: Result[] = [];

  for (const name of textTokenNames) {
    const rawValue = vars.get(name)!;
    const exempt = suppressed.has(name);
    const resolvedValue = resolveVar(rawValue, vars);
    const rgb = parseColor(resolvedValue);
    const ratio = rgb != null ? contrastRatio(rgb, bgRgb) : null;
    const pass = exempt || (ratio != null ? ratio >= MIN_CONTRAST : false);
    const skipped = !exempt && rgb == null;
    results.push({ name, rawValue, resolvedValue, ratio, pass, skipped, exempt });
  }

  const failures = results.filter((r) => !r.pass && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const passed = results.filter((r) => r.pass && !r.skipped);
  const exempt = results.filter((r) => r.exempt);

  const rel = path.relative(repoRoot, CSS_FILE);
  console.log(`\nChecking text tokens in ${rel} against ${BG_HEX} (--mx-bg-main)\n`);

  const padName = Math.max(...results.map((r) => r.name.length), 36) + 2;

  for (const r of passed) {
    console.log(
      `  PASS  ${r.name.padEnd(padName)}  ${r.ratio!.toFixed(2)}:1`,
    );
  }
  for (const r of exempt) {
    console.log(
      `  SKIP  ${r.name.padEnd(padName)}  contrast-ok (suppressed)`,
    );
  }
  for (const r of skipped) {
    console.log(
      `  SKIP  ${r.name.padEnd(padName)}  value not resolvable: ${r.rawValue}`,
    );
  }

  // Zero evaluated tokens means the check is measuring nothing — that is a
  // failure, not a pass (e.g. a var chain broke and everything got skipped).
  if (failures.length === 0 && passed.length === 0 && exempt.length === 0) {
    console.error(
      `\nFAIL  0 text tokens could be evaluated (${skipped.length} skipped as unresolvable).\n` +
        "      The check must resolve real colors — fix the var() chains or the\n" +
        "      design-system CSS merge so tokens evaluate again.\n",
    );
    process.exit(1);
  }

  if (failures.length === 0) {
    console.log(
      `\nPASS  All ${passed.length} resolvable text token(s) meet WCAG AA (≥ ${MIN_CONTRAST}:1).\n` +
        (skipped.length > 0
          ? `      ${skipped.length} token(s) skipped (unresolvable value format).\n`
          : ""),
    );
    process.exit(0);
  }

  // ── Failure output ─────────────────────────────────────────────────────────
  console.error(
    `\nFAIL  ${failures.length} text token(s) below WCAG AA (${MIN_CONTRAST}:1) on ${BG_HEX}:\n`,
  );
  for (const r of failures) {
    const displayVal = r.resolvedValue ?? r.rawValue;
    console.error(
      `  FAIL  ${r.name.padEnd(padName)}  ${r.ratio!.toFixed(2)}:1  (resolved: ${displayVal})`,
    );
  }

  console.error(
    "\nFix suggestions:\n" +
      "  • Increase the HSL lightness of the token until its contrast is ≥ 4.5:1.\n" +
      "  • Use an already-compliant token (e.g. --mx-text-main, --mx-text-soft,\n" +
      "    --mx-text-interactive) instead of introducing a new one.\n" +
      "  • Verify your adjusted value at https://webaim.org/resources/contrastchecker/\n" +
      "\n" +
      "WCAG AA thresholds:\n" +
      "  ≥ 4.5:1  normal text  (< 18 pt regular / < 14 pt bold)\n" +
      "  ≥ 3.0:1  large text   (≥ 18 pt regular / ≥ 14 pt bold)\n" +
      "\n" +
      "To suppress a deliberate exception (decorative, non-readable text),\n" +
      "add /* contrast-ok */ on the same line as the token declaration in index.css.\n",
  );
  process.exit(1);
}

main();
