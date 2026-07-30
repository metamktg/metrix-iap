// ─── Analysis · History ──────────────────────────────────────────────
// Full detail on the account's analysis runs. The backend today only
// retains the LATEST manual analysis run per account (no run-list
// endpoint exists yet) — this page is honest about that rather than
// fabricating a multi-row log.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useGetLatestAnalysisRun, getGetLatestAnalysisRunQueryKey } from "@workspace/api-client-react";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, PendingState, CaveatNote } from "../shared";
import { History, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";

const METRIC_LABEL: Record<string, string> = { spend: "Spend", results: "Results" };

function fmtTotal(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const SECTION = "Analysis · 03";

export function AnalysisHistoryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { data } = useGetLatestAnalysisRun(account?.id ?? "", {
    query: { queryKey: getGetLatestAnalysisRunQueryKey(account?.id ?? ""), enabled: !!account },
  });
  const run = data?.run ?? null;

  return (
    <ModuleScopeGate section={SECTION} title="History" account={account}>
      {() => (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <ModuleHeader section={SECTION} title="History" subtitle="Analysis runs for this account." table="manual_analysis_runs" />
          <ScopeBanner account={account!} />
          <div className="px-6 py-5 space-y-4 max-w-3xl">
            <CaveatNote text="Only the most recent analysis run is tracked today — a full multi-run log is planned but not yet built." />
            {!run ? (
              <PendingState title="No runs yet" message="Run analysis from the Analysis command center to see it here." icon={History} />
            ) : (
              <SectionCard title="Latest run" desc={`Date range: ${run.date_range}`}>
                <div className="flex items-center gap-2 mb-3">
                  {run.status === "running" && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
                  {run.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {run.status === "error" && <XCircle className="w-4 h-4 text-red-400" />}
                  <span className="text-[13px] font-semibold text-foreground capitalize">{run.status}</span>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <dt className="text-muted-foreground/70">Started</dt>
                    <dd className="text-foreground/90">{new Date(run.started_at).toLocaleString()}</dd>
                  </div>
                  {run.finished_at && (
                    <div>
                      <dt className="text-muted-foreground/70">Finished</dt>
                      <dd className="text-foreground/90">{new Date(run.finished_at).toLocaleString()}</dd>
                    </div>
                  )}
                  {run.date_start && run.date_end && (
                    <div>
                      <dt className="text-muted-foreground/70">Covered</dt>
                      <dd className="text-foreground/90">{run.date_start} → {run.date_end}</dd>
                    </div>
                  )}
                  {run.rows_ingested != null && (
                    <div>
                      <dt className="text-muted-foreground/70">Rows ingested</dt>
                      <dd className="text-foreground/90">{run.rows_ingested}</dd>
                    </div>
                  )}
                </dl>
                {run.error_message && (
                  <p className="text-[11px] text-red-400/90 mt-3">{run.error_message}</p>
                )}
              </SectionCard>
            )}

            {run && (run.reconciliation ?? []).length > 0 && (
              <SectionCard
                title="Data integrity"
                desc="The demographic and placement exports are cross-checked against each other — both are pivot slices of the same underlying campaigns, so their totals should match."
                table="import_metric_reconciliation"
              >
                <div className="space-y-2">
                  {run.reconciliation.map((r) => (
                    <div
                      key={r.metric_key}
                      className={
                        "flex items-center gap-3 rounded-lg border p-3 " +
                        (r.flagged ? "border-amber-400/25 bg-amber-400/[0.05]" : "border-border/30 bg-white/[0.02]")
                      }
                    >
                      {r.flagged ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400/70 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground">{METRIC_LABEL[r.metric_key] ?? r.metric_key}</div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          Demographic export: {fmtTotal(r.demographic_total)} · Placement export: {fmtTotal(r.placement_total)}
                          {r.flagged && ` · ${r.delta_pct.toFixed(1)}% apart`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </ModuleScopeGate>
  );
}
