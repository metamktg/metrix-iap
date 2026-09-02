// Does the reconciliation ledger agree with the raw tables it claims to
// summarise? The third leg of the triple validation in
// docs/specs/iap-multi-report-reconciliation.md §20.
//
// The unit suites prove the pure functions over synthetic fixtures; the spec
// table names the canonical source of every rule; this re-derives, from the
// LIVE tables after a real run, the numbers the ledger wrote and fails on any
// disagreement. Nothing here trusts the ledger's own arithmetic.
//
// READ-ONLY. Runs no DDL, writes nothing. Prints no credential material
// (host:port only), same discipline as check:ad-performance-views.
//
// For the account's latest successful run it checks, per breakdown:
//   1. Σ ad_breakdown_performance.spend  == ledger account row observed (spend)
//   2. Σ ad-scope ledger observed         == account-scope observed, per metric
//   3. residual == truth − observed and coverage == observed / truth on every
//      row that has a truth value; overcoverage == max(0, observed − truth)
//   4. evidence_state follows the ±1% rule from coverage
//   5. for the demographic breakdown, Σ spend == Σ demographic_performance
//      spend for the run's window (the daily table the run also wrote)
//
// Exit codes:
//   0 — every check agrees (tolerance 0.005 in currency units)
//   1 — a disagreement (details printed)
//   2 — no credential resolved, or the account has no run with a ledger
//
// Usage:
//   pnpm --filter @workspace/scripts run check:reconciliation-ledger -- <account_id>
import pg from "pg";
import { resolveSupabaseDbUrl } from "./lib/supabase-db-connection.js";

const TOLERANCE = 0.005;

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(unparseable)";
  }
}

const close = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE;

async function main(): Promise<number> {
  const accountId = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (!accountId) {
    console.error("Usage: check:reconciliation-ledger -- <account_id>");
    return 2;
  }
  const url = resolveSupabaseDbUrl("SUPABASE_DB_URL");
  if (!url) {
    console.error("No Supabase DB credential resolved — nothing was checked (exit 2).");
    return 2;
  }
  console.log(`check:reconciliation-ledger — ${hostOf(url)} — account ${accountId}`);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const failures: string[] = [];
  try {
    const run = await client.query<{ id: string; date_start: string; date_end: string; reconciliation_summary: unknown }>(
      `select id, date_start::text, date_end::text, reconciliation_summary
         from manual_analysis_runs
        where account_id = $1 and status = 'success'
        order by started_at desc limit 1`,
      [accountId],
    );
    const latest = run.rows[0];
    if (!latest) {
      console.error("No successful run for this account (exit 2).");
      return 2;
    }
    const ledgerCount = await client.query<{ n: string }>(`select count(*)::text as n from reconciliation_ledger where manual_analysis_run_id = $1`, [latest.id]);
    if (Number(ledgerCount.rows[0]!.n) === 0) {
      console.error(`Run ${latest.id} wrote no ledger rows — it predates the layer (exit 2).`);
      return 2;
    }
    console.log(`run ${latest.id} · ${latest.date_start} → ${latest.date_end} · ${ledgerCount.rows[0]!.n} ledger rows`);

    // 1. account observed spend per breakdown == Σ fact rows
    const facts = await client.query<{ breakdown: string; spend: string }>(
      `select breakdown, coalesce(sum(spend),0)::text as spend from ad_breakdown_performance where manual_analysis_run_id = $1 group by breakdown`,
      [latest.id],
    );
    const accountRows = await client.query<{ report_class: string; metric: string; truth_value: string | null; observed_value: string; coverage_pct: string | null; residual: string | null; overcoverage: string | null; evidence_state: string }>(
      `select report_class, metric, truth_value::text, observed_value::text, coverage_pct::text, residual::text, overcoverage::text, evidence_state
         from reconciliation_ledger where manual_analysis_run_id = $1 and scope = 'account'`,
      [latest.id],
    );
    for (const f of facts.rows) {
      const acct = accountRows.rows.find((r) => r.report_class === f.breakdown && r.metric === "amount_spent");
      if (!acct) {
        failures.push(`${f.breakdown}: fact rows exist but no account ledger row for spend`);
        continue;
      }
      if (!close(Number(f.spend), Number(acct.observed_value))) failures.push(`${f.breakdown}: Σ fact spend ${f.spend} ≠ ledger observed ${acct.observed_value}`);
      else console.log(`✓ ${f.breakdown}: Σ fact spend ${Number(f.spend).toFixed(2)} == ledger observed`);
    }

    // 2. Σ ad-scope observed == account observed, per (class, metric)
    const adSums = await client.query<{ report_class: string; metric: string; observed: string; truth: string | null }>(
      `select report_class, metric, sum(observed_value)::text as observed, sum(truth_value)::text as truth
         from reconciliation_ledger where manual_analysis_run_id = $1 and scope = 'ad' group by report_class, metric`,
      [latest.id],
    );
    for (const a of adSums.rows) {
      const acct = accountRows.rows.find((r) => r.report_class === a.report_class && r.metric === a.metric);
      if (!acct) continue;
      if (!close(Number(a.observed), Number(acct.observed_value))) failures.push(`${a.report_class}/${a.metric}: Σ ad observed ${a.observed} ≠ account observed ${acct.observed_value}`);
    }
    console.log(`✓ ad-scope observed sums agree with account scope (${adSums.rows.length} class × metric pairs)`);

    // 3 + 4. arithmetic and state on every row with a truth
    const all = await client.query<{ scope: string; report_class: string; metric: string; truth_value: string | null; observed_value: string; coverage_pct: string | null; residual: string | null; overcoverage: string | null; evidence_state: string }>(
      `select scope, report_class, metric, truth_value::text, observed_value::text, coverage_pct::text, residual::text, overcoverage::text, evidence_state
         from reconciliation_ledger where manual_analysis_run_id = $1`,
      [latest.id],
    );
    let checked = 0;
    for (const r of all.rows) {
      if (r.truth_value === null) {
        if (!["unreconciled", "incompatible"].includes(r.evidence_state)) failures.push(`${r.scope}/${r.report_class}/${r.metric}: no truth but state ${r.evidence_state}`);
        continue;
      }
      const truth = Number(r.truth_value);
      const observed = Number(r.observed_value);
      const residual = Number(r.residual);
      if (!close(residual, truth - observed)) failures.push(`${r.scope}/${r.report_class}/${r.metric}: residual ${residual} ≠ ${truth} − ${observed}`);
      if (r.overcoverage !== null && !close(Number(r.overcoverage), Math.max(0, observed - truth))) failures.push(`${r.scope}/${r.report_class}/${r.metric}: overcoverage ${r.overcoverage} ≠ max(0, observed − truth)`);
      if (truth > 0) {
        const coverage = (observed / truth) * 100;
        if (r.coverage_pct === null || Math.abs(Number(r.coverage_pct) - coverage) > 0.011) failures.push(`${r.scope}/${r.report_class}/${r.metric}: coverage ${r.coverage_pct} ≠ ${coverage.toFixed(2)}`);
        const expected = r.evidence_state === "incompatible" ? "incompatible" : coverage > 101 ? "overcounted" : coverage >= 99 ? "observed_reconciled" : "observed_partial";
        if (r.evidence_state !== expected) failures.push(`${r.scope}/${r.report_class}/${r.metric}: state ${r.evidence_state}, coverage ${coverage.toFixed(2)} implies ${expected}`);
      }
      checked += 1;
    }
    console.log(`✓ arithmetic and evidence state re-derived on ${checked} rows with a truth value`);

    // 5. demographic fact spend == demographic_performance spend for the window
    const daily = await client.query<{ spend: string }>(
      `select coalesce(sum(spend),0)::text as spend from demographic_performance where manual_analysis_run_id = $1`,
      [latest.id],
    );
    const demoFact = facts.rows.find((f) => f.breakdown === "demographic");
    if (demoFact) {
      if (!close(Number(demoFact.spend), Number(daily.rows[0]!.spend))) failures.push(`demographic: fact spend ${demoFact.spend} ≠ demographic_performance ${daily.rows[0]!.spend}`);
      else console.log(`✓ demographic fact spend == demographic_performance spend (${Number(daily.rows[0]!.spend).toFixed(2)})`);
    }

    const summary = latest.reconciliation_summary as { breakdowns?: { report_class: string; by_metric: { metric: string; coverage_pct: number | null; observed_value: number; truth_value: number | null }[] }[] } | null;
    for (const b of summary?.breakdowns ?? []) {
      const spend = b.by_metric.find((m) => m.metric === "amount_spent");
      if (spend) console.log(`  ${b.report_class}: observed ${spend.observed_value} of ${spend.truth_value ?? "—"} (${spend.coverage_pct ?? "—"}%)`);
    }
  } finally {
    await client.end();
  }
  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} disagreement(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log("\nledger agrees with the raw tables (exit 0)");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
