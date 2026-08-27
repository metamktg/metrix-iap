// Confidence-report signal-weight drift check (E-a).
//
// `SIGNAL_WEIGHTS` lives twice by necessity: canonically in the API
// server's iapCsvSpec.ts, and mirrored in the client's lib/signalWeights.ts
// because the Confidence Report grades an import in the browser and cannot
// pull server code into its bundle.
//
// Nothing tied the two together except a comment saying "must be kept in
// sync" — the Frankenstein pattern the Phase 1 audit flagged. They had
// already drifted: the client's table carried an "Amount spent (USD)" key
// the server's did not, so the two files disagreed about which columns
// exist while both claimed to agree. This check is the tie.
//
// Both tables are plain `Record<string, number>` literals, so they are read
// as text rather than imported — the scripts package's rootDir forbids
// cross-package imports, and a failure to parse either table is itself a
// loud failure rather than a silent pass.
//
// Run: pnpm --filter @workspace/scripts run check:signal-weights-drift

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SERVER_FILE = path.join(repoRoot, "artifacts/api-server/src/lib/iapCsvSpec.ts");
const CLIENT_FILE = path.join(repoRoot, "artifacts/metrix-iap/src/lib/signalWeights.ts");

/** Parse `export const SIGNAL_WEIGHTS: Record<string, number> = { … };` out of a source file. */
function parseWeights(file: string): Record<string, number> {
  const src = fs.readFileSync(file, "utf-8");
  const start = src.indexOf("export const SIGNAL_WEIGHTS");
  if (start === -1) throw new Error(`SIGNAL_WEIGHTS not found in ${path.relative(repoRoot, file)}`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("};", open);
  if (open === -1 || close === -1) throw new Error(`Could not bound the SIGNAL_WEIGHTS literal in ${file}`);
  const body = src.slice(open + 1, close);

  const out: Record<string, number> = {};
  const entry = /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(body)) !== null) out[m[1]] = Number(m[2]);
  if (Object.keys(out).length === 0) throw new Error(`No weight entries parsed from ${file}`);
  return out;
}

const server = parseWeights(SERVER_FILE);
const client = parseWeights(CLIENT_FILE);

const problems: string[] = [];

for (const key of Object.keys(server)) {
  if (!(key in client)) problems.push(`missing from the client mirror: "${key}" (server weight ${server[key]})`);
  else if (client[key] !== server[key]) {
    problems.push(`weight disagrees for "${key}": server ${server[key]}, client ${client[key]}`);
  }
}
for (const key of Object.keys(client)) {
  if (!(key in server)) problems.push(`present only in the client mirror: "${key}" (weight ${client[key]})`);
}

const serverTotal = Object.values(server).reduce((s, w) => s + w, 0);
// The table's own comments claimed 1.00 for a long time; the real figure is
// 0.98 across 17 entries. Nothing depends on it — the report grades present
// weight over the total weight of the columns an import actually carries,
// so it self-normalises — but a constant that misstates itself is how the
// next reader gets misled. Pinned at the true value so closing the 0.02
// stays a deliberate product decision rather than a drive-by typo fix.
const EXPECTED_TOTAL = 0.98;
if (Math.abs(serverTotal - EXPECTED_TOTAL) > 1e-6) {
  problems.push(
    `canonical weights now total ${serverTotal.toFixed(4)}, not the documented ${EXPECTED_TOTAL} — ` +
      `update the comment in iapCsvSpec.ts AND the expected total in this check, deliberately.`,
  );
}

if (problems.length > 0) {
  console.error(`\nFAIL  SIGNAL_WEIGHTS drift between server and client:\n`);
  for (const p of problems) console.error(`      · ${p}`);
  console.error(
    `\n      Canonical: ${path.relative(repoRoot, SERVER_FILE)}` +
      `\n      Mirror:    ${path.relative(repoRoot, CLIENT_FILE)}\n`,
  );
  process.exit(1);
}

console.log(
  `\nPASS  ${Object.keys(server).length} signal weight(s) identical across the server table and the client mirror ` +
    `(total ${serverTotal.toFixed(2)}).\n`,
);
