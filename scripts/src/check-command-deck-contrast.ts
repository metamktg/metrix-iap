// Contrast-safety check for the Command Deck design system.
//
// Validates every *Foreground/surface color pair in
// artifacts/command-deck/tokens.json against WCAG AA (>= 4.5:1) in BOTH the
// light and dark palettes. Pairing rule: a token named `xForeground` is
// checked against its base surface token `x`; the top-level `foreground`
// token is checked against `background`.
//
// Suppression: add "contrast-ok" to the token's $description in tokens.json
// to acknowledge a deliberate exception (it will be reported as SKIP).
//
// Run: pnpm --filter @workspace/scripts run check:command-deck-contrast

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const TOKENS_FILE = path.join(repoRoot, "artifacts/command-deck/tokens.json");
/** WCAG AA minimum for normal text. */
const MIN_CONTRAST = 4.5;
const SUPPRESSION_MARKER = "contrast-ok";

// ── Color math ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0]! + clean[0]!, 16),
      parseInt(clean[1]! + clean[1]!, 16),
      parseInt(clean[2]! + clean[2]!, 16),
    ];
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

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
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

// ── Token parsing ─────────────────────────────────────────────────────────────

type TokenEntry = { $value: string; $description?: string };
type Palette = Record<string, TokenEntry>;

function baseTokenFor(foregroundName: string): string | null {
  if (foregroundName === "foreground") return "background";
  if (foregroundName.endsWith("Foreground")) {
    const base = foregroundName.slice(0, -"Foreground".length);
    // sidebarForeground pairs with sidebar, etc.
    return base;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(TOKENS_FILE)) {
    console.error(`\nFAIL  tokens file not found: ${TOKENS_FILE}`);
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8")) as {
    color?: Record<string, unknown>;
  };
  const color = tokens.color;
  if (!color) {
    console.error(`\nFAIL  tokens.json has no "color" group.`);
    process.exit(1);
  }

  const modes = ["light", "dark"].filter(
    (m) => typeof color[m] === "object" && color[m] != null,
  );
  if (modes.length !== 2) {
    console.error(
      `\nFAIL  tokens.json color group must define both "light" and "dark" palettes (found: ${modes.join(", ") || "none"}).`,
    );
    process.exit(1);
  }

  type Result = {
    mode: string;
    fgName: string;
    bgName: string;
    fgHex: string;
    bgHex: string;
    ratio: number;
    pass: boolean;
    exempt: boolean;
  };

  const results: Result[] = [];
  const errors: string[] = [];
  let pairCount = 0;

  for (const mode of modes) {
    const palette = color[mode] as Palette;
    for (const [name, entry] of Object.entries(palette)) {
      const bgName = baseTokenFor(name);
      if (!bgName) continue;
      pairCount++;
      const bgEntry = palette[bgName];
      if (!bgEntry) {
        errors.push(
          `${mode}.${name} has no matching surface token "${bgName}"`,
        );
        continue;
      }
      const fgRgb = hexToRgb(String(entry.$value));
      const bgRgb = hexToRgb(String(bgEntry.$value));
      if (!fgRgb || !bgRgb) {
        errors.push(
          `${mode}.${name} / ${mode}.${bgName}: unparseable hex value (${entry.$value} / ${bgEntry.$value})`,
        );
        continue;
      }
      const exempt =
        (entry.$description ?? "").includes(SUPPRESSION_MARKER) ||
        (bgEntry.$description ?? "").includes(SUPPRESSION_MARKER);
      const ratio = contrastRatio(fgRgb, bgRgb);
      results.push({
        mode,
        fgName: name,
        bgName,
        fgHex: String(entry.$value),
        bgHex: String(bgEntry.$value),
        ratio,
        pass: exempt || ratio >= MIN_CONTRAST,
        exempt,
      });
    }
  }

  if (pairCount === 0) {
    console.error(
      `\nFAIL  No *Foreground tokens found in tokens.json — pairing rule may be broken.`,
    );
    process.exit(1);
  }

  const rel = path.relative(repoRoot, TOKENS_FILE);
  console.log(
    `\nChecking ${pairCount} foreground/surface pair(s) in ${rel} against WCAG AA (>= ${MIN_CONTRAST}:1)\n`,
  );

  const pad =
    Math.max(...results.map((r) => `${r.mode}.${r.fgName}`.length), 30) + 2;

  for (const r of results) {
    const label = `${r.mode}.${r.fgName}`.padEnd(pad);
    if (r.exempt) {
      console.log(`  SKIP  ${label}  contrast-ok (suppressed)`);
    } else {
      console.log(
        `  ${r.pass ? "PASS" : "FAIL"}  ${label}  ${r.ratio.toFixed(2)}:1  on ${r.mode}.${r.bgName}`,
      );
    }
  }

  const failures = results.filter((r) => !r.pass);

  if (errors.length > 0) {
    console.error(`\nFAIL  ${errors.length} structural problem(s):\n`);
    for (const e of errors) console.error(`  • ${e}`);
  }

  if (failures.length === 0 && errors.length === 0) {
    console.log(
      `\nPASS  All ${results.filter((r) => !r.exempt).length} checked pair(s) meet WCAG AA (>= ${MIN_CONTRAST}:1).\n`,
    );
    process.exit(0);
  }

  if (failures.length > 0) {
    console.error(
      `\nFAIL  ${failures.length} pair(s) below WCAG AA (${MIN_CONTRAST}:1):\n`,
    );
    for (const r of failures) {
      console.error(
        `  FAIL  ${r.mode}.${r.fgName} (${r.fgHex}) on ${r.mode}.${r.bgName} (${r.bgHex})  ${r.ratio.toFixed(2)}:1`,
      );
    }
    console.error(
      "\nFix suggestions:\n" +
        "  • Darken/lighten the foreground or surface hex in tokens.json until the ratio is >= 4.5:1.\n" +
        "  • Verify at https://webaim.org/resources/contrastchecker/\n" +
        "  • For a deliberate exception, add \"contrast-ok\" to the token's $description.\n",
    );
  }
  process.exit(1);
}

main();
