// ─── check:cohort-reach ────────────────────────────────────────────────
//
// THE RULE (owner decision, 2026-08-29)
// The business-model cohort — ecommerce / lead_gen / service / app, and any
// label derived from an account's `objectives` — is an ANALYSIS LENS. It
// decides which terminal metric a run reads and which funnel stages an
// analysis view can honestly show. It is NOT a property of the account as an
// entity, and it is NOT a way to describe an account to a reader.
//
// So its reach is bounded: cohort may be read inside the analysis interface
// views, inside the cohort module itself, inside the settings surface where an
// operator CONFIGURES objectives, and inside export payloads (data, not
// interface). Anywhere else — the shell, the switcher, headers, tiles, tray,
// strategy, creative, briefs, reports — is a violation.
//
// WHY A GATE AND NOT A CODE REVIEW
// It had already drifted. The account switcher printed "Ecommerce",
// "Ecommerce + App", "Ecommerce + Lead Generation" under every account name,
// which told every reader the whole product was scoped by business model. That
// is a one-line import away from happening again, in any of 145 surfaces, and
// nothing in a passing test suite notices a label that renders correctly and
// means the wrong thing.
//
// WHAT IT CANNOT SEE (named, per this repo's instrument honesty rule)
// It matches imports and identifiers, not rendering. A file could import
// nothing and still print a cohort word typed as a literal; it could import
// cohortMeta for a type alone. Read a finding, don't just obey it.
//
// Run:  pnpm --filter @workspace/scripts run check:cohort-reach

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(repoRoot, "artifacts/metrix-iap/src");

// Paths where reading the cohort is legitimate. Each carries its reason —
// an allowlist without reasons becomes a place to hide.
const ALLOWED: { prefix: string; why: string }[] = [
  { prefix: "lib/data/cohortMeta.ts", why: "the cohort module itself" },
  { prefix: "lib/mst-analysis.ts", why: "MST analysis reads terminal direction — analysis logic" },
  { prefix: "pages/metrix/analysis/", why: "the analysis interface views — the permitted reach" },
  { prefix: "pages/metrix/settings/cohortOptions.ts", why: "the objectives configuration options" },
  { prefix: "pages/metrix/settings/GeneralView.tsx", why: "where an operator SETS objectives" },
  { prefix: "lib/jsonExport.ts", why: "export payload — data, not interface" },
];

// Reading `objectives` or resolving a cohort label. Deliberately narrow: this
// is about the cohort reaching a surface, not about the word appearing in prose.
const COHORT_READ = /\b(resolveObjectivesMeta|resolveCohortMeta|CohortMeta)\b|\.objectives\b|from "@\/lib\/data\/cohortMeta"/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "test-fixtures") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const violations: { file: string; line: number; text: string }[] = [];

for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  if (ALLOWED.some((a) => rel === a.prefix || rel.startsWith(a.prefix))) continue;
  const lines = fs.readFileSync(file, "utf-8").split("\n");
  lines.forEach((text, i) => {
    if (COHORT_READ.test(text)) {
      violations.push({ file: rel, line: i + 1, text: text.trim().slice(0, 100) });
    }
  });
}

if (violations.length === 0) {
  console.log("PASS  The cohort stays inside the analysis views.");
  console.log(`      Allowed reach (${ALLOWED.length} paths):`);
  for (const a of ALLOWED) console.log(`        ${a.prefix} — ${a.why}`);
  process.exit(0);
}

console.log(`FAIL  ${violations.length} cohort read(s) outside the analysis views.\n`);
for (const v of violations) {
  console.log(`  ${v.file}:${v.line}`);
  console.log(`    ${v.text}`);
}
console.log("\nThe business-model cohort is an analysis lens, not a property of the");
console.log("account. Outside an analysis view, describe the account by something");
console.log("true of the account itself — see lib/data/accountSource.ts for the");
console.log("switcher's case. If a new surface genuinely needs the lens, add it to");
console.log("ALLOWED in this file WITH ITS REASON, so the exception is on the record.");
process.exit(1);
