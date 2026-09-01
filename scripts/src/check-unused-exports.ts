// ─── Unused-export ratchet ────────────────────────────────────────────
//
// Two things accumulate silently in a codebase this size, and both cost most
// at a rearchitecture, when someone has to decide whether each file is worth
// carrying forward:
//
//   unreferenced  an exported value nothing outside its own file uses
//   test-only     an exported value only its tests use — it does not ship,
//                 but the passing test makes it look load-bearing
//
// The second is the more dangerous category. `lib/mst-analysis.ts` is 541
// lines implementing the seven-layer MST method, fully unit-tested, and no
// page imports it: the MST views read their results out of the seed. Nothing
// was going to tell anyone that.
//
// This is a RATCHET, not a cleanup order. Everything found today is recorded
// in the baseline. The gate fails only on a NEW entry, so the redesign cannot
// add orphans, while what already exists stays a deliberate decision rather
// than something this script deletes on its own.
//
// Run: pnpm --filter @workspace/scripts run check:unused-exports
//      pnpm --filter @workspace/scripts run check:unused-exports -- --write

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_PATH = path.join(REPO_ROOT, "scripts/src/unused-exports.baseline.json");

/** Where exported values are looked FOR. */
const SCAN_ROOT = "artifacts/metrix-iap/src";
/** Where references to them are looked for. */
const REFERENCE_ROOTS = ["artifacts", "lib", "scripts", "tests"];

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "generated", "test-fixtures"]);

/**
 * Only runtime values. `export type` / `export interface` are left alone: a
 * type with no importer costs nothing at runtime and is often the published
 * shape of a contract, so flagging them would bury the values that matter.
 */
const EXPORT_RE =
  /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const IDENT_RE = /[A-Za-z_$][\w$]*/g;

function isTestFile(file: string): boolean {
  return (
    file.includes(`${path.sep}__tests__${path.sep}`) ||
    /\.(test|spec)\.tsx?$/.test(file)
  );
}

function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [path.join(REPO_ROOT, root)];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        out.push(path.relative(REPO_ROOT, full));
      }
    }
  }
  return out.sort();
}

type Category = "unreferenced" | "test-only";

interface Finding {
  key: string;
  category: Category;
}

function analyse(): { findings: Finding[]; scanned: number } {
  // Where each exported name is defined. A name exported from two files is
  // ambiguous, so it is dropped rather than guessed at — better to miss one
  // than to report a false orphan.
  const defs = new Map<string, string | null>();
  for (const file of walk(SCAN_ROOT)) {
    if (isTestFile(file)) continue;
    const src = fs.readFileSync(path.join(REPO_ROOT, file), "utf-8");
    for (const m of src.matchAll(EXPORT_RE)) {
      const name = m[1]!;
      defs.set(name, defs.has(name) ? null : file);
    }
  }

  // One pass over every candidate file, recording which identifiers appear in
  // it. Cheaper and more accurate than one search per symbol.
  const seenIn = new Map<string, Set<string>>();
  const files = new Set<string>();
  for (const root of REFERENCE_ROOTS) for (const f of walk(root)) files.add(f);
  for (const file of files) {
    const src = fs.readFileSync(path.join(REPO_ROOT, file), "utf-8");
    for (const name of new Set(src.match(IDENT_RE) ?? [])) {
      if (!defs.has(name)) continue;
      let set = seenIn.get(name);
      if (set === undefined) seenIn.set(name, (set = new Set()));
      set.add(file);
    }
  }

  const findings: Finding[] = [];
  let scanned = 0;
  for (const [name, definedIn] of [...defs].sort(([a], [b]) => a.localeCompare(b))) {
    if (definedIn === null) continue; // exported from more than one file
    scanned += 1;
    const elsewhere = [...(seenIn.get(name) ?? [])].filter((f) => f !== definedIn);
    if (elsewhere.length === 0) {
      findings.push({ key: `${definedIn}::${name}`, category: "unreferenced" });
    } else if (elsewhere.every(isTestFile)) {
      findings.push({ key: `${definedIn}::${name}`, category: "test-only" });
    }
  }
  return { findings, scanned };
}

function main(): void {
  const write = process.argv.includes("--write");
  const { findings, scanned } = analyse();

  if (scanned < 200) {
    console.error(
      `\nFAIL  only ${scanned} exported value(s) scanned under ${SCAN_ROOT} — ` +
        `the scan found almost nothing, so a pass would mean nothing`,
    );
    process.exit(1);
  }

  const current = new Map(findings.map((f) => [f.key, f.category]));

  if (write) {
    const out: Record<string, Category> = {};
    for (const key of [...current.keys()].sort()) out[key] = current.get(key)!;
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`Wrote ${current.size} baseline entr(ies) to ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    return;
  }

  const baseline: Record<string, Category> = JSON.parse(
    fs.readFileSync(BASELINE_PATH, "utf-8"),
  );

  const added = [...current].filter(([key]) => !(key in baseline));
  const fixed = Object.keys(baseline).filter((key) => !current.has(key));
  // A symbol that was merely test-only and is now referenced by nothing has
  // gone backwards even though its key is unchanged.
  const worsened = [...current].filter(
    ([key, category]) => key in baseline && baseline[key] !== category && category === "unreferenced",
  );

  const counts = { unreferenced: 0, "test-only": 0 } as Record<Category, number>;
  for (const [, category] of current) counts[category] += 1;

  if (added.length === 0 && worsened.length === 0) {
    console.log(
      `\nPASS  ${counts.unreferenced} unreferenced and ${counts["test-only"]} test-only export(s) ` +
        `across ${scanned} scanned — at or under the recorded baseline.`,
    );
    if (fixed.length > 0) {
      console.log(
        `      ${fixed.length} baseline entr(ies) no longer apply. Re-run with --write to ratchet down:\n` +
          fixed.map((k) => `        ${k}`).join("\n"),
      );
    }
    return;
  }

  console.error("\nFAIL  new orphaned export(s).\n");
  for (const [key, category] of added) console.error(`  + ${category.padEnd(12)} ${key}`);
  for (const [key, category] of worsened) {
    console.error(`  ! ${category.padEnd(12)} ${key}  (was ${baseline[key]})`);
  }
  console.error(
    "\n      Either wire it up, delete it, or — if it is deliberately unreferenced for now —\n" +
      "      re-run with --write and say why in the commit message.",
  );
  process.exit(1);
}

main();
