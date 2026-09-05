// Seed evidence carriage check (READ-ONLY operator check, not a .replit validation).
//
// Reads GET /api/metrix/seed as the demo account and checks, for every account
// whose latest analysis run wrote a reconciliation summary, that the seed
// actually CARRIES that run's evidence layer: the ledger, the ad-grain
// breakdowns and the variable segments. The request logs cannot see this
// class of failure. On 2026-09-05 production read every ledger page for the
// Pure Path run (163 pages, 0 errors) and shipped the account with an empty
// ledger because the aggregation threw after the last page and the seed's
// catch returned nothing; the day before, the storm's timed-out pages fell to
// the same empty fallback. Both times the app read "no evidence" for a run
// that had succeeded, and only reading the payload showed it.
//
//   pnpm --filter @workspace/scripts run check:seed-evidence
//
// Requirements: an API server reachable at API_BASE_URL (default
// http://localhost:80/api; for production, https://app.metrix.ad/api) and
// DEMO_ACCOUNT_EMAIL / DEMO_ACCOUNT_PASSWORD. Prints no credential material.
// Exit 0 clean / 1 an account is missing evidence it should carry / 2 nothing
// was checked (no credential, no server), which is not a verdict.

const BASE = (process.env["API_BASE_URL"] ?? "http://localhost:80/api").replace(/\/$/, "");
const DEMO_EMAIL = process.env["DEMO_ACCOUNT_EMAIL"] ?? "demo@metrix.app";
const DEMO_PASSWORD = process.env["DEMO_ACCOUNT_PASSWORD"];

type Row = Record<string, unknown>;

interface AccountEvidence {
  id: string;
  name: string;
  hasAnalysis: boolean;
  runId: string | null;
  summaryBreakdowns: number;
  truthSource: string | null;
  ledger: number;
  breakdowns: number;
  segments: number;
}

function num(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

/** Pure: the accounts whose seed object should carry evidence, and what it carries. */
export function readEvidence(seed: Row): AccountEvidence[] {
  const accounts = (seed["accounts"] ?? seed["ad_accounts"]) as Row[] | undefined;
  const list = Array.isArray(accounts) ? accounts : [];
  return list.map((a) => {
    // The evidence layer lives under the account's IAP analysis block
    // (seedTypes.ts AnalysisData; the client reads it through
    // getAnalysisData(seed, accountId) = account.iap.analysis).
    const iap = (a["iap"] ?? null) as Row | null;
    const analysis = (iap?.["analysis"] ?? null) as Row | null;
    const reconciliation = (analysis?.["reconciliation"] ?? null) as Row | null;
    const summary = (reconciliation?.["summary"] ?? null) as Row | null;
    return {
      id: String(a["id"] ?? ""),
      name: String(a["name"] ?? a["account_name"] ?? ""),
      hasAnalysis: analysis !== null && typeof analysis === "object",
      runId: (analysis?.["latest_analysis_run_id"] as string | null | undefined) ?? null,
      summaryBreakdowns: num(summary?.["breakdowns"]),
      truthSource: (summary?.["truth_source"] as string | null | undefined) ?? null,
      ledger: num(reconciliation?.["ledger"]),
      breakdowns: num(analysis?.["ad_breakdowns"]),
      segments: num(analysis?.["variable_segment_performance"]),
    };
  });
}

/**
 * Pure: a seed in which no account carries an analysis block at the path
 * this check reads is a seed this check does not understand, and "nothing
 * matched, so nothing failed" must never read as a pass. The first run of
 * this script read the account's top level instead of `iap.analysis`,
 * printed "no run" for every account and exited 0 on a seed that carried
 * 162k ledger rows; this is the guard against that shape of mistake.
 */
export function shapeRecognised(accounts: AccountEvidence[]): boolean {
  return accounts.some((a) => a.hasAnalysis);
}

/**
 * Pure: an account whose run reconciled at least one breakdown wrote a ledger
 * (one row per scope × ad × report class × metric) and ad-grain breakdown
 * rows, so a seed that carries the summary and none of the rows lost them
 * on the way. Segments can be legitimately empty (no variable library on
 * the account), so they are reported, not judged.
 */
export function findings(accounts: AccountEvidence[]): string[] {
  const out: string[] = [];
  for (const a of accounts) {
    if (!a.runId || a.summaryBreakdowns === 0) continue;
    if (a.ledger === 0) {
      out.push(`${a.id} (${a.name}): run ${a.runId} reconciled ${a.summaryBreakdowns} breakdown(s) but the seed carries 0 ledger rows`);
    }
    if (a.breakdowns === 0) {
      out.push(`${a.id} (${a.name}): run ${a.runId} reconciled ${a.summaryBreakdowns} breakdown(s) but the seed carries 0 ad-grain breakdown rows`);
    }
  }
  return out;
}

async function main(): Promise<number> {
  if (!DEMO_PASSWORD) {
    console.log("NOTE  DEMO_ACCOUNT_PASSWORD is not set; nothing checked (exit 2).");
    return 2;
  }
  let cookie = "";
  try {
    const login = await fetch(`${BASE}/metrix/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
    if (!login.ok) {
      console.log(`NOTE  login answered ${login.status} at ${BASE}; nothing checked (exit 2).`);
      return 2;
    }
    cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  } catch (err) {
    console.log(`NOTE  could not reach ${BASE} (${(err as Error).message}); nothing checked (exit 2).`);
    return 2;
  }

  const started = Date.now();
  const res = await fetch(`${BASE}/metrix/seed`, { headers: { cookie } });
  const text = await res.text();
  const ms = Date.now() - started;
  if (!res.ok) {
    console.log(`NOTE  seed answered ${res.status} after ${ms} ms; nothing checked (exit 2).`);
    return 2;
  }
  const seed = JSON.parse(text) as Row;
  console.log(`seed  ${res.status}  ${ms} ms  ${text.length.toLocaleString("en-US")} bytes`);

  const accounts = readEvidence(seed);
  if (accounts.length === 0 || !shapeRecognised(accounts)) {
    console.log("NOTE  no account in this seed carries iap.analysis; the seed's shape is not the one this check reads, nothing checked (exit 2).");
    return 2;
  }
  for (const a of accounts) {
    const run = a.runId ? a.runId.slice(0, 8) : "no run";
    console.log(
      `  ${a.id.padEnd(22)} ${run.padEnd(8)} ledger ${String(a.ledger).padStart(7)}  breakdowns ${String(a.breakdowns).padStart(7)}  segments ${String(a.segments).padStart(6)}  summary breakdowns ${a.summaryBreakdowns}${a.truthSource ? `  control ${a.truthSource}` : ""}`,
    );
  }
  const problems = findings(accounts);
  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL  ${p}`);
    return 1;
  }
  console.log(`OK    ${accounts.filter((a) => a.runId && a.summaryBreakdowns > 0).length} reconciled account(s) carry their evidence layer.`);
  return 0;
}

const isDirectRun = process.argv[1]?.endsWith("check-seed-evidence.ts") ?? false;
if (isDirectRun) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error("FAIL ", err);
    process.exit(1);
  });
}
