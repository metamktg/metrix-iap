// Which fields does the JSON carry that the interface never shows?
//
// THE QUESTION THIS ANSWERS
// The seed bundle is assembled server-side from Supabase and handed to the
// app as one JSON document. Its shape is declared in seedTypes.ts — 58
// interfaces, several hundred fields. Every one of those fields cost
// something to compute: a query, an aggregation, an IAP prompt stage. A
// field the UI never reads is analysis nobody sees, and there is nothing in
// a passing build, a passing test or a rendered page that would tell you it
// happened.
//
// That is a different failure from a bug. A bug shows you something wrong.
// This shows you nothing at all, and looks complete while doing it.
//
// HOW IT WORKS, AND WHERE IT IS APPROXIMATE
// Every declared field name is searched for across the app's components and
// pages. A field is COVERED if its name appears anywhere in a way that could
// read it — `r.foo`, `["foo"]`, `foo:` in a destructure. That is deliberately
// generous, because the cost of a false "uncovered" (someone chases a field
// that is actually rendered) is a wasted hour, while the cost of a false
// "covered" is a field that stays invisible forever.
//
// Two consequences of the generosity, stated so nobody over-reads the output:
//
//   1. A field read into a variable and then dropped counts as COVERED. The
//      check sees the read, not the render.
//   2. A field whose name collides with a common identifier (`id`, `label`,
//      `name`, `status`, `value`) is unreliable, so those are reported in
//      their own bucket rather than counted as clean.
//
// So this is a WORKLIST, not a verdict: everything it flags needs a human to
// look at the field and decide whether it should surface. What it does
// reliably is bound the problem — it turns "does the UI show everything?"
// from unanswerable into a list with a length.
//
// Run: pnpm --filter @workspace/scripts run check:field-coverage
//      … -- --interface=SignalCard      one shape
//      … -- --all                       include the covered fields too

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TYPES = path.join(repoRoot, "artifacts/metrix-iap/src/lib/data/seedTypes.ts");
const APP = path.join(repoRoot, "artifacts/metrix-iap/src");

/**
 * Field names too generic to attribute. A hit on `id` proves nothing about
 * whether THIS interface's id is rendered.
 */
const AMBIGUOUS = new Set([
  "id", "name", "label", "status", "value", "type", "kind", "title", "key",
  "count", "total", "date", "url", "text", "note", "notes", "detail", "details",
  "source", "code", "index", "order", "state", "data", "rows", "items",
]);

interface Field {
  iface: string;
  name: string;
  optional: boolean;
  line: number;
}

// ── 1. Read the declared shape ────────────────────────────────────────

const typesSrc = fs.readFileSync(TYPES, "utf8");
const typeLines = typesSrc.split("\n");

const fields: Field[] = [];
let current: string | null = null;
let depth = 0;

typeLines.forEach((raw, i) => {
  const line = raw.trim();
  const open = (raw.match(/\{/g) ?? []).length;
  const close = (raw.match(/\}/g) ?? []).length;

  const decl = /^export interface ([A-Za-z0-9_]+)/.exec(line);
  if (decl && depth === 0) {
    current = decl[1]!;
    depth += open - close;
    return;
  }
  if (current) {
    // Only top-level members of the interface, not members of a nested
    // object literal — those belong to the nested shape, not this one.
    if (depth === 1) {
      const m = /^["']?([A-Za-z_][A-Za-z0-9_ ()%/-]*)["']?(\?)?\s*:/.exec(line);
      if (m && !line.startsWith("//") && !line.startsWith("*")) {
        fields.push({ iface: current, name: m[1]!, optional: Boolean(m[2]), line: i + 1 });
      }
    }
    depth += open - close;
    if (depth <= 0) {
      current = null;
      depth = 0;
    }
  }
});

// ── 2. Read everything that could consume it ──────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith("seedTypes.ts")) {
      out.push(p);
    }
  }
  return out;
}

// One concatenated haystack. Slower to build, far faster than N× file reads
// per field, and the field count is in the hundreds.
const consumers = walk(APP)
  .filter((f) => !f.includes("__tests__") && !f.includes(".test."))
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");

// ── 3. Match ──────────────────────────────────────────────────────────

function isRead(name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    // r.foo
    new RegExp(`\\.${esc}\\b`),
    // r["foo"] / r['foo']
    new RegExp(`\\[\\s*["']${esc}["']\\s*\\]`),
    // { foo }  ·  { foo, … }  ·  foo:
    new RegExp(`[{,]\\s*${esc}\\s*[},:]`),
    // "foo": — a QUOTED object key. Field names with spaces or punctuation
    // ("Ad name", "Clicks (all)", "Amount spent (USD)") can only ever be
    // written this way, and the bare-identifier pattern above cannot match
    // them. Missing this reported the entire Meta-export vocabulary as
    // unread on a first run.
    new RegExp(`["']${esc}["']\\s*:`),
    // The name as a bare string literal anywhere. This catches STRING
    // INDIRECTION — `{ key: "avoid", list: "avoid_combinations" }` in
    // scalingBuckets.ts, read later as obj[entry.list]. No static analysis
    // can follow that to the access site, and treating it as unread reported
    // a field that is rendered. Generous on purpose: this tool must
    // under-report, because a false "unread" costs an hour and a false
    // "read" costs a field that stays invisible forever.
    new RegExp(`["']${esc}["']`),
  ];
  return patterns.some((re) => re.test(consumers));
}

const byIface = new Map<string, { covered: Field[]; missing: Field[]; ambiguous: Field[] }>();
for (const f of fields) {
  if (!byIface.has(f.iface)) byIface.set(f.iface, { covered: [], missing: [], ambiguous: [] });
  const bucket = byIface.get(f.iface)!;
  if (AMBIGUOUS.has(f.name)) bucket.ambiguous.push(f);
  else if (isRead(f.name)) bucket.covered.push(f);
  else bucket.missing.push(f);
}

// ── 4. Report ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--interface="))?.split("=")[1];
const showAll = args.includes("--all");

let totalFields = 0, totalMissing = 0, totalAmbiguous = 0;
for (const b of byIface.values()) {
  totalFields += b.covered.length + b.missing.length + b.ambiguous.length;
  totalMissing += b.missing.length;
  totalAmbiguous += b.ambiguous.length;
}

console.log(
  `\nFIELD COVERAGE — ${totalFields} declared fields across ${byIface.size} interfaces\n` +
    `  ${totalFields - totalMissing - totalAmbiguous} read somewhere in the app\n` +
    `  ${totalMissing} NOT read anywhere — computed, shipped, never shown\n` +
    `  ${totalAmbiguous} unattributable (name too generic to match reliably)\n`,
);

const entries = [...byIface.entries()]
  .filter(([iface]) => (only ? iface === only : true))
  .filter(([, b]) => showAll || b.missing.length > 0)
  .sort((a, b) => b[1].missing.length - a[1].missing.length);

for (const [iface, b] of entries) {
  const declared = b.covered.length + b.missing.length + b.ambiguous.length;
  console.log(`${iface}  (${b.missing.length} of ${declared} unread)`);
  for (const f of b.missing) {
    console.log(`    ·  ${f.name}${f.optional ? "?" : ""}   seedTypes.ts:${f.line}`);
  }
  if (showAll && b.ambiguous.length > 0) {
    console.log(`    ~  unattributable: ${b.ambiguous.map((f) => f.name).join(", ")}`);
  }
  console.log();
}

console.log(
  "A WORKLIST, NOT A VERDICT. Matching is deliberately generous — a field read\n" +
    "into a variable and then dropped still counts as covered, so this UNDER-\n" +
    "reports. Everything listed needs a human to decide whether it should\n" +
    "surface, be removed from the contract, or is genuinely internal.\n",
);
