// ─── Creative Briefs · History ────────────────────────────────────────
// Chronological record of briefs for the active ad account. Only
// source-backed drafts exist in this build — no fabricated history.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile, CrossLink,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { FileClock, FileText } from "lucide-react";

const SECTION = "Creative Briefs · 05";

const STATUS_LABEL: Record<string, string> = {
  draft_from_seed: "Draft created from seed strategy",
  validation_draft_from_seed: "Validation draft created from seed strategy",
  control_refresh_from_seed: "Control-refresh draft created from seed strategy",
};

const isDraftStatus = (status: string) => status.endsWith("_from_seed") || status.includes("draft");

export function BriefHistoryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();

  return (
    <ModuleScopeGate section={SECTION} title="History" account={account}>
      {() => {
        const acct = account!;
        const briefs = getBriefBuilder(seed, adAccountId)?.draft_briefs ?? [];
        const strategy = getStrategyData(seed, adAccountId);
        const pillarLabel = (id: string) => strategy?.message_pillars.find((p) => p.id === id)?.label ?? id;

        const drafts = briefs.filter((b) => isDraftStatus(b.status)).length;
        const finalized = briefs.length - drafts;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="History"
              subtitle="All generated briefs · current status"
              table="draft_briefs"
              account={acct}
            />
            <RangeScopeBar grainNote="Brief history derives from the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="brief history" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Total briefs" value={String(briefs.length)} />
              <MetricTile label="Drafts" value={String(drafts)} />
              <MetricTile label="Finalized" value={String(finalized)} sub={finalized === 0 ? "none finalized yet" : undefined} />
              <MetricTile label="Formats" value={String(new Set(briefs.map((b) => b.asset_type)).size)} />
            </div>

            <div className="px-6 py-5 max-w-3xl">
              {briefs.length === 0 ? (
                <PendingState title="No brief history" message="Briefs appear here once generated from strategy pillars." icon={FileClock} />
              ) : (
                <div className="space-y-2.5">
                  {briefs.map((b) => (
                    <div key={b.id} className="flex items-start gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                      <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[12px] font-semibold text-foreground leading-tight">{pillarLabel(b.source_pillar)}</p>
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 border border-border/40 px-1.5 py-0.5 rounded leading-none">{b.asset_type}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 mt-1 leading-relaxed">{STATUS_LABEL[b.status] ?? b.status}</p>
                        <div className="mt-2">
                          <CrossLink to={`/app/briefs/builder?focus=${b.id}`} label="Open in Brief Builder" />
                        </div>
                      </div>
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-amber-300 border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">
                        Draft
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
