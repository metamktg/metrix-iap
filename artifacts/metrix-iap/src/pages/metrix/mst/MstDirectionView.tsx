// ─── MST · Direction ────────────────────────────────────────────────
// The Optimization Loop's read side: this account's real scaling playbook
// (Strategy's scale_now / optimize / validate / explore / avoid lists,
// authored from analysis reads) applied to every measured concept in
// concept_rollup, so "next-sprint direction" is the account's actual
// classification and its rationale — never invented labels. Full
// automated variable re-weighting is not yet a running job (the
// metrix-optimization-loop skill runs that manually today); the caveat
// below states that honestly rather than fabricating a re-weighting run.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile, CrossLink, CaveatNote,
  SegmentedToggle, DetailReveal, deriveLabel, fmtUSD,
} from "../shared";
import { TYPE } from "../typography";
import { NormalizedRefItem } from "../strategy/strategyShared";
import { bucketEntryForConcept, BUCKET_LABEL, type ScalingBucket } from "@/lib/data/scalingBuckets";
import { cn } from "@workspace/command-deck/lib/utils";
import { Compass, ArrowUpRight, TrendingUp, ShieldCheck, Ban, Sparkles } from "lucide-react";
import type { ConceptRollupRow } from "@/lib/data/seedTypes";

const SECTION = "MST · 06";

const BUCKET_ORDER: ScalingBucket[] = ["scale_now", "optimize", "validate", "explore", "avoid"];

const BUCKET_STYLE: Record<ScalingBucket, string> = {
  scale_now: "border-status-success/25 bg-status-success/[0.06] text-status-success",
  optimize: "border-status-warning/25 bg-status-warning/[0.06] text-status-warning",
  validate: "border-accent/25 bg-accent/[0.06] text-accent",
  explore: "border-primary/25 bg-primary/[0.06] text-primary",
  avoid: "border-status-danger/25 bg-status-danger/[0.06] text-status-danger",
};

const BUCKET_ICON: Record<ScalingBucket, React.ComponentType<{ className?: string }>> = {
  scale_now: ArrowUpRight,
  optimize: TrendingUp,
  validate: ShieldCheck,
  explore: Sparkles,
  avoid: Ban,
};

interface ClassifiedConcept {
  row: ConceptRollupRow;
  bucket: ScalingBucket;
  rationale: string;
}

export function MstDirectionView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [filter, setFilter] = useState<ScalingBucket | "all">("all");

  return (
    <ModuleScopeGate section={SECTION} title="Direction" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const playbook = strategy?.scaling_playbook ?? null;
        const rollup = getAnalysisData(seed, adAccountId)?.concept_rollup ?? [];
        const subtitle = "Scale / optimize / validate / avoid — this account's current playbook applied to every measured concept.";

        if (!playbook) {
          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader section={SECTION} title="Direction" accountName={acct.name} subtitle={subtitle} />
              <div className="px-6 py-5 space-y-4 max-w-3xl">
                <PendingState
                  title="No scaling playbook yet"
                  message="Direction reads this account's scaling playbook, authored as part of Strategy. Generate strategy for this account to populate it."
                  icon={Compass}
                  action={<CrossLink to="/app/strategy/map" label="Open Strategy Map" />}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {BUCKET_ORDER.map((b) => {
                    const Icon = BUCKET_ICON[b];
                    return (
                      <span key={b} className={cn("inline-flex items-center gap-1.5 text-label font-semibold border px-2 py-1 rounded-full", BUCKET_STYLE[b])}>
                        <Icon className="w-3 h-3" />
                        {BUCKET_LABEL[b]}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }

        const classified: ClassifiedConcept[] = [];
        const unclassified: ConceptRollupRow[] = [];
        for (const row of rollup) {
          const match = bucketEntryForConcept(row.book, row.concept, playbook);
          if (match) classified.push({ row, bucket: match.bucket, rationale: match.entry });
          else unclassified.push(row);
        }

        const countsByBucket = new Map<ScalingBucket, number>();
        for (const c of classified) countsByBucket.set(c.bucket, (countsByBucket.get(c.bucket) ?? 0) + 1);
        const activeBuckets = BUCKET_ORDER.filter((b) => (countsByBucket.get(b) ?? 0) > 0);
        const visible = filter === "all" ? classified : classified.filter((c) => c.bucket === filter);

        const filterOptions: { id: ScalingBucket | "all"; label: string }[] = [
          { id: "all", label: `All (${classified.length})` },
          ...activeBuckets.map((b) => ({ id: b, label: `${BUCKET_LABEL[b]} (${countsByBucket.get(b)})` })),
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader section={SECTION} title="Direction" accountName={acct.name} subtitle={subtitle} table="scaling_playbook" />

            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Measured concepts" value={String(rollup.length)} />
              <MetricTile label="Classified" value={String(classified.length)} />
              <MetricTile label="Scale now" value={String(countsByBucket.get("scale_now") ?? 0)} />
              <MetricTile label="Needs review" value={String((countsByBucket.get("validate") ?? 0) + (countsByBucket.get("avoid") ?? 0))} sub="Validate + avoid" />
            </div>

            {activeBuckets.length > 0 && (
              <div className="px-6 pt-4">
                <SegmentedToggle ariaLabel="Filter concepts by classification" active={filter} onChange={(id) => setFilter(id as ScalingBucket | "all")} options={filterOptions} />
              </div>
            )}

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <CaveatNote text="Automated variable re-weighting isn't a running job yet — Direction reads this account's current scaling playbook (Strategy → generate strategy) and applies it to every measured concept. Re-run Strategy to refresh it." />

              {visible.length === 0 ? (
                <p className={cn(TYPE.body, "text-muted-foreground/50 py-6 text-center")}>No concepts classified yet — generate strategy to populate the playbook.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {visible.map(({ row, bucket, rationale }) => {
                    const Icon = BUCKET_ICON[bucket];
                    return (
                      <div key={`${row.book}:${row.concept}`} className="rounded-xl border border-border/40 bg-white/[0.02] p-4" data-testid={`direction-concept-${row.book}-${row.concept}`}>
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className={cn(TYPE.label, "font-mono text-muted-foreground/70")}>{row.book} · {row.concept}</span>
                          <span className={cn("inline-flex items-center gap-1 text-label font-semibold border px-1.5 py-0.5 rounded leading-none", BUCKET_STYLE[bucket])}>
                            <Icon className="w-3 h-3" />
                            {BUCKET_LABEL[bucket]}
                          </span>
                        </div>
                        <div className="flex items-center gap-5 mb-2.5">
                          <div>
                            <div className={TYPE.microLabel}>Cost / result</div>
                            <div className={cn(TYPE.body, "font-semibold tabular-nums")}>{fmtUSD(row.cpa)}</div>
                          </div>
                          <div>
                            <div className={TYPE.microLabel}>Confidence</div>
                            <div className={cn(TYPE.body, "font-semibold capitalize")}>{row.confidence?.replace(/_/g, " ") ?? "—"}</div>
                          </div>
                        </div>
                        <NormalizedRefItem text={rationale} eyebrow={BUCKET_LABEL[bucket]} />
                      </div>
                    );
                  })}
                </div>
              )}

              {unclassified.length > 0 && (
                <p className={cn(TYPE.caption, "text-muted-foreground/50")}>
                  {unclassified.length} measured concept{unclassified.length !== 1 ? "s" : ""} not yet named in the playbook — {unclassified.map((r) => `${r.book} ${r.concept}`).join(", ")}.
                </p>
              )}

              {typeof playbook.budget_reallocation_note === "string" && playbook.budget_reallocation_note && (
                <div className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
                  <div className={cn(TYPE.label, "mb-1 text-muted-foreground/60")}>Budget reallocation</div>
                  <DetailReveal
                    label={deriveLabel(playbook.budget_reallocation_note, 100)}
                    labelClassName={TYPE.body}
                    eyebrow="Budget reallocation"
                    sections={[{ text: playbook.budget_reallocation_note }]}
                  />
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <CrossLink to="/app/strategy/map" label="Full playbook in Strategy Map" />
                <CrossLink to="/app/mst/matrix" label="See it applied on Sprints" />
                <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
