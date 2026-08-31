// The dark palette must survive as a COMPLETE `.dark { … }` block.
//
// It did not, for an unknown stretch before 2026-08-31: two lines of a
// pnpm run banner had been committed inside that block in
// `artifacts/command-deck/scripts/theme-template.css` (and therefore in
// the `src/index.css` generated from it). `>` is a legal CSS child
// combinator, so nothing failed. Browsers recover per-declaration, so the
// dev server looked right. The production CSS pipeline resynchronised at
// the next custom property and silently dropped the ~40 declarations
// above it — `--background`, `--foreground`, `--card`, `--sidebar`,
// `--primary`. The built app shipped with no dark palette: it rendered
// light while `<html>` said `dark`, and the theme toggle flipped a class
// nothing responded to.
//
// `check:stray-shell-output` guards the CAUSE. This guards the EFFECT, so
// any other way of losing the dark ground fails here too.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "../../../..");

const FILES = [
  "artifacts/command-deck/scripts/theme-template.css",
  "artifacts/command-deck/src/index.css",
];

/** The `.dark { … }` body, brace-matched from the first top-level `.dark {`. */
function darkBlock(css: string): string {
  const m = /^\.dark\s*\{/m.exec(css);
  if (!m) return "";
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(m.index + m[0].length, i);
    }
  }
  return "";
}

// Every token the app's ground, text and chrome are painted from. A dark
// block that has lost any one of these produces a half-light interface.
const REQUIRED = [
  "--background",
  "--foreground",
  "--card",
  "--border",
  "--sidebar",
  "--popover",
  "--primary",
  "--muted",
];

describe.each(FILES)("%s", (rel) => {
  const css = fs.readFileSync(path.join(REPO, rel), "utf8");
  const block = darkBlock(css);

  it("has a top-level .dark block", () => {
    expect(block.length).toBeGreaterThan(0);
  });

  it.each(REQUIRED)("its .dark block defines %s", (token) => {
    expect(new RegExp(`(^|[;{\\s])${token}\\s*:`).test(block)).toBe(true);
  });

  it("keeps a dark ground — --background resolves to a dark lightness", () => {
    const bg = /(?:^|[;{\s])--background\s*:\s*([^;]+)/.exec(block)?.[1]?.trim();
    expect(bg).toBeTruthy();
    // The template carries __DS_DARK_BACKGROUND__ placeholders that the
    // generator substitutes from tokens.json; only the generated file has a
    // literal to weigh. Asserting the placeholder is the right assertion for
    // the template — a substituted-away or renamed one is just as broken.
    if (bg!.startsWith("__DS_")) {
      expect(bg).toBe("__DS_DARK_BACKGROUND__");
      return;
    }
    // Lightness is the third space-separated part of the HSL triplet.
    const lightness = Number(/\s([\d.]+)%\s*$/.exec(bg!)?.[1] ?? NaN);
    expect(lightness).toBeLessThan(20);
  });

  it("carries no shell transcript inside the .dark block", () => {
    const offenders = block
      .split("\n")
      .filter((l) => /^\s*>\s+\S+@[\w.\-+]+\s/.test(l) || /^\s*>\s+(tsx|node|vite|pnpm|npm)\s/.test(l));
    expect(offenders).toEqual([]);
  });
});
