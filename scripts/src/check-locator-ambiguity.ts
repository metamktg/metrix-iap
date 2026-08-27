// A spec locator names exactly one control.
//
// Playwright matches `getByRole(role, { name })` by CASE-INSENSITIVE SUBSTRING
// unless `exact: true` is passed. So a spec asking for the button named
// "Funnel" also matches a button whose accessible name is
// "Collapse section: Conversion funnel" — and the moment a second match
// exists the locator throws a strict-mode violation and the spec fails.
//
// `button:has-text("X")` is the same trap through a different door: it matches
// the element's TEXT CONTENT, so an aria-label does not shield the header from
// it. `button:has-text("Run analysis")` matches both the real run control and
// the header of the <SectionCard title="Run analysis"> that wraps it.
//
// That is not a hypothetical. Making SectionCard's header a real button with
// `aria-label="Collapse section: ${title}"` — a straight accessibility win —
// silently made thirteen locators ambiguous across two specs, each written
// against a name that used to be unique and no longer was. The first spec to
// reach them failed nine of its ten tests at once; the rest were still sitting
// there unreported, in specs the fail-fast run never got to. Nothing caught
// any of it until a ~30-minute browser suite ran end to end.
//
// The costly part is that the two halves live far apart: the collision is
// created by a `title` prop in a page component and detonates in a spec file
// nobody edited. This check closes that distance statically. It reads every
// literal SectionCard title, derives what the header matches under each
// matcher — the two accessible names for `getByRole`, the bare title for
// `has-text` — and fails if a spec locator sweeps one in while aiming at
// something else.
//
// The fix at a finding is almost always `exact: true` (the spec means the
// control named exactly that) or a more specific role — a ModuleTabs tab is
// role="tab", not role="button", so asking for the right role disambiguates
// and documents intent at the same time.
//
// Run: pnpm --filter @workspace/scripts run check:locator-ambiguity

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APP_SRC = path.join(repoRoot, "artifacts/metrix-iap/src");
const SPEC_DIR = path.join(repoRoot, "tests/e2e");

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(p, ext, out);
    } else if (ext.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

const lineAt = (src: string, index: number) => src.slice(0, index).split("\n").length;

// ── 1. Accessible names the SectionCard header can carry ──────────────
//
// shared.tsx builds it as `${open ? "Collapse" : "Expand"} section: ${title}`.
// Both states matter: a spec can run against either.

const HEADER_PREFIXES = ["Collapse section: ", "Expand section: "];

const headerNames = new Set<string>();
// What `has-text` sees: the header button's text content is the <h2>, i.e.
// the bare title. aria-label does not participate in a text-content match.
const headerTexts = new Set<string>();
const dynamicTitles: string[] = [];

for (const file of walk(APP_SRC, /\.tsx$/)) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("SectionCard")) continue;
  const rel = path.relative(repoRoot, file);

  // <SectionCard ... title="X" | title={"X"} | title={`…`} | title={expr}
  const re = /<SectionCard\b[\s\S]{0,600}?\btitle=(\{`[^`]*`\}|\{"[^"]*"\}|"[^"]*"|\{[^}]*\})/g;
  for (const m of src.matchAll(re)) {
    const raw = m[1]!;
    let literal: string | null = null;
    if (raw.startsWith('"')) literal = raw.slice(1, -1);
    else if (raw.startsWith('{"')) literal = raw.slice(2, -2);
    else if (raw.startsWith("{`") && !raw.includes("${")) literal = raw.slice(2, -2);

    if (literal === null) {
      dynamicTitles.push(`${rel}:${lineAt(src, m.index!)}`);
      continue;
    }
    for (const prefix of HEADER_PREFIXES) headerNames.add(prefix + literal);
    headerTexts.add(literal);
  }
}

if (headerNames.size === 0) {
  console.error(
    "\nFAIL  Found no literal SectionCard titles. Either the component was renamed or the " +
      "title prop changed shape — this check is reading nothing and would pass vacuously.\n",
  );
  process.exit(1);
}

// ── 2. Non-exact spec locators, matched the way Playwright matches ────

interface Finding {
  file: string;
  line: number;
  locator: string;
  hits: string[];
  /** Which matcher produced the collision — they need different fixes. */
  kind: "role-name" | "has-text";
}

const findings: Finding[] = [];
let checked = 0;
let checkedHasText = 0;

// getByRole("button", { name: "X" | 'X' | /re/flags })  — captures a trailing
// `exact: true` so we can skip the ones already disambiguated.
const LOCATOR_RE =
  /getByRole\(\s*["'](button)["']\s*,\s*\{\s*name:\s*(\/(?:[^/\\\n]|\\.)+\/[a-z]*|"[^"\n]*"|'[^'\n]*')\s*((?:,\s*[A-Za-z]+:\s*[^,}]+)*)\s*\}/g;

// button:has-text("X")  /  button[...]:has-text('X')
const HAS_TEXT_RE = /\bbutton\b[^"'\n]*?:has-text\(\s*("[^"\n]*"|'[^'\n]*')\s*\)/g;

for (const file of walk(SPEC_DIR, /\.spec\.ts$/)) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(repoRoot, file);

  for (const m of src.matchAll(LOCATOR_RE)) {
    const nameTok = m[2]!;
    const opts = m[3] ?? "";
    if (/\bexact:\s*true\b/.test(opts)) continue; // full-string, case-sensitive
    checked++;

    let matches: (candidate: string) => boolean;
    if (nameTok.startsWith("/")) {
      const lastSlash = nameTok.lastIndexOf("/");
      let rx: RegExp;
      try {
        rx = new RegExp(nameTok.slice(1, lastSlash), nameTok.slice(lastSlash + 1));
      } catch {
        continue; // not a regex we can evaluate; leave it to the browser run
      }
      matches = (candidate) => rx.test(candidate);
    } else {
      // Playwright's default: whitespace-normalized, case-insensitive substring.
      const needle = nameTok.slice(1, -1).trim().replace(/\s+/g, " ").toLowerCase();
      if (!needle) continue;
      matches = (candidate) => candidate.toLowerCase().includes(needle);
    }

    // A locator that is ITSELF aiming at the header is fine — it only becomes
    // a defect when the locator means something else and sweeps the header in.
    if (HEADER_PREFIXES.some((p) => matches(p.trim()))) continue;

    const hits = [...headerNames].filter(matches);
    if (hits.length > 0) {
      findings.push({
        file: rel, line: lineAt(src, m.index!), locator: nameTok, hits, kind: "role-name",
      });
    }
  }

  // ── button:has-text("X") — matches TEXT CONTENT, so the header's <h2>
  // is in scope and its aria-label does not shield it. Always substring,
  // always case-insensitive: `has-text` has no exact form (that is
  // `text="X"`), which is why this half has no opt-out to honour.
  for (const m of src.matchAll(HAS_TEXT_RE)) {
    const quoted = m[1]!;
    const needle = quoted.slice(1, -1).trim().replace(/\s+/g, " ").toLowerCase();
    if (!needle) continue;
    checkedHasText++;
    const hits = [...headerTexts].filter((t) => t.toLowerCase().includes(needle));
    if (hits.length > 0) {
      findings.push({
        file: rel, line: lineAt(src, m.index!), locator: quoted, hits, kind: "has-text",
      });
    }
  }
}

// ── 3. Report ─────────────────────────────────────────────────────────

if (dynamicTitles.length > 0) {
  console.log(
    `\nNOTE  ${dynamicTitles.length} SectionCard title(s) are computed at render time and cannot ` +
      `be checked here — only the browser run sees their accessible names:\n` +
      dynamicTitles.map((d) => `        · ${d}`).join("\n"),
  );
}

if (findings.length > 0) {
  console.error(`\nFAIL  ${findings.length} ambiguous spec locator(s):\n`);
  for (const f of findings) {
    if (f.kind === "role-name") {
      console.error(`      · ${f.file}:${f.line} — getByRole("button", { name: ${f.locator} })`);
      for (const hit of [...new Set(f.hits)].slice(0, 3)) {
        console.error(`        also matches the SectionCard header named "${hit}"`);
      }
      console.error(
        `        Playwright matches name by case-insensitive SUBSTRING. Two matches is a\n` +
          `        strict-mode violation, so this spec fails. Add exact: true, or query the\n` +
          `        role the control actually has (a ModuleTabs tab is role="tab").\n`,
      );
    } else {
      console.error(`      · ${f.file}:${f.line} — button:has-text(${f.locator})`);
      for (const hit of [...new Set(f.hits)].slice(0, 3)) {
        console.error(`        also matches the header of <SectionCard title="${hit}">`);
      }
      console.error(
        `        :has-text matches TEXT CONTENT, so the header's <h2> is in scope and its\n` +
          `        aria-label does not shield it — and :has-text has no exact form. Use\n` +
          `        getByRole("button", { name: "…", exact: true }) instead, which matches the\n` +
          `        accessible name and so reads the header as "Collapse section: …".\n`,
      );
    }
  }
  process.exit(1);
}

console.log(
  `\nPASS  ${checked} non-exact getByRole locator(s) and ${checkedHasText} :has-text locator(s) ` +
    `checked against ${headerTexts.size} SectionCard title(s); each names one control.\n`,
);
