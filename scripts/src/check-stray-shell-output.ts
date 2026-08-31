// ─── check:stray-shell-output ─────────────────────────────────────────
//
// WHY THIS EXISTS
//
// Twice now, a terminal's own output has been committed into a source
// file, and both times the damage was invisible at review and silent at
// runtime:
//
//   1. `scripts/src/apply-supabase-schema.ts` took raw keystrokes and
//      stopped compiling (TS1127/TS1434). Loud, at least.
//   2. `artifacts/command-deck/src/index.css` took two lines of pnpm's
//      run banner —
//        > @workspace/scripts@0.0.0 build:mx-ramps /home/user/...
//        > tsx ./src/build-mx-ramps.ts
//      — INSIDE the `.dark { … }` token block, from a generator whose
//      stdout was piped in with the banner attached. `>` is a valid CSS
//      child combinator, so nothing errored. The browser's forgiving
//      parser recovered per-declaration and dev looked correct; the
//      production CSS pipeline resynchronised at the next `--token` and
//      dropped the 40 declarations above it — `--background`,
//      `--foreground`, `--card`, `--sidebar`, `--primary`, all of them.
//      The built app had NO dark palette. It rendered light while the
//      html class said dark, and the theme toggle changed a class that
//      nothing responded to.
//
// A defect that only appears after a production build, in a file nobody
// re-reads, is exactly the kind a cheap scan should catch instead.
//
// WHAT IT MATCHES, AND WHAT IT DELIBERATELY DOES NOT
//
// Only the unambiguous shapes of a shell transcript at the START of a
// line: an npm/pnpm/yarn run banner (`> pkg@version script /path`), a
// bare runner invocation (`> tsx …`, `> node …`, `> vite …`), a shell
// prompt with a package manager (`$ pnpm …`), and npm's ERR!/WARN
// prefixes. Markdown blockquotes are NOT this shape, and the scan skips
// .md entirely. Prose containing "> tsx" mid-line is not matched — the
// marker must open the line.
//
// Exit 0 clean / 1 with every finding as file:line.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(import.meta.dirname, "../..");

/** Extensions worth scanning: source and config, never docs or fixtures. */
const EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".json", ".yaml", ".yml", ".sql", ".html",
]);

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "npm/pnpm/yarn run banner", re: /^>\s+\S+@[\w.\-+]+\s+\S+(\s+\/|$)/ },
  { name: "runner invocation echo", re: /^>\s+(tsx|node|vite|tsc|esbuild|next|jest|vitest|playwright|drizzle-kit)\s/ },
  { name: "shell prompt", re: /^[$#]\s+(pnpm|npm|yarn|npx)\s/ },
  { name: "npm diagnostic", re: /^npm (ERR!|WARN)\s/ },
];

function tracked(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter(Boolean);
}

const findings: string[] = [];
let scanned = 0;

for (const rel of tracked()) {
  if (!EXT.has(path.extname(rel))) continue;
  const abs = path.join(REPO, rel);
  let src: string;
  try {
    if (fs.statSync(abs).size > 4 * 1024 * 1024) continue;
    src = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  scanned++;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        findings.push(`${rel}:${i + 1}  ${p.name}\n    ${line.trim().slice(0, 110)}`);
        break;
      }
    }
  }
}

if (findings.length === 0) {
  console.log(`check:stray-shell-output — clean (${scanned} source files scanned)`);
  process.exit(0);
}

console.log(`\ncheck:stray-shell-output — ${findings.length} finding(s) in ${scanned} files\n`);
for (const f of findings) console.log("  " + f + "\n");
console.log(
  "Terminal output committed into a source file. Delete the transcript lines.\n" +
  "If a generator writes this file, pipe ONLY its stdout — a package manager\n" +
  "prints its run banner to stdout too, which is how this gets in.\n",
);
process.exit(1);
