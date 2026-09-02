// ─── Placement drill: platform → placement → device ─────────────────────
// Spec §15: DisclosureStack (the split-accordion mechanic) at each level,
// bars per row from summed spend, and the unattributed residual as its own
// row when the ledger has one — never as a segment.

import { useMemo } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DisclosureStack, type DisclosureItem } from "@/components/widgets/DisclosureStack";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { fmtMetric } from "@/lib/normalize";
import { platformLabel } from "@/pages/metrix/shared";
import type { AdBreakdownRow } from "@/lib/data/seedTypes";
import { type PlacementNode, evidenceSummaryFor, placementTreeFor } from "@/lib/creative-evidence";
import { CoverageStrip, EvidenceChip, EvidenceExplainer } from "./EvidenceChip";

function Bar({ node, max, resultLabel }: { node: PlacementNode; max: number; resultLabel: string }) {
  return (
    <div className="space-y-1">
      <ProgressMeter value={max > 0 ? Math.round((node.spend / max) * 100) : 0} total={100} label={`${node.label} spend share`} size="sm" fillClassName="bg-primary/50" />
      <div className={cn(TYPE.caption, "text-muted-foreground/75 tabular-nums")}>
        {fmtMetric("usd_total", node.spend)} · {fmtMetric("count", node.results)} {resultLabel}
        {node.results > 0 ? ` · ${fmtMetric("usd_unit", node.spend / node.results)} each` : ""}
      </div>
    </div>
  );
}

function items(nodes: PlacementNode[], depth: number, resultLabel: string): DisclosureItem[] {
  const max = Math.max(...nodes.map((n) => n.spend), 1);
  return nodes.map((n) => ({
    id: n.key,
    title: depth === 0 ? platformLabel(n.label) : n.label.replace(/_/g, " "),
    meta: (
      <span className="flex items-center gap-2">
        <span className={cn(TYPE.caption, "tabular-nums text-muted-foreground")}>{fmtMetric("usd_total", n.spend)}</span>
        <EvidenceChip state={n.evidence_state} testId={`placement-evidence-${depth}`} />
      </span>
    ),
    content: (
      <div className="space-y-3 pt-1">
        <Bar node={n} max={max} resultLabel={resultLabel} />
        {n.children.length > 0 && (
          <DisclosureStack items={items(n.children, depth + 1, resultLabel)} mode="single" label={depth === 0 ? "Placements" : "Devices"} className="pl-2" />
        )}
      </div>
    ),
  }));
}

export function PlacementDrill({
  rows,
  unattributedSpend = null,
  resultLabel = "results",
  className,
}: {
  rows: AdBreakdownRow[];
  /** The ledger's residual for the placement breakdown at this scope, when known. */
  unattributedSpend?: number | null;
  resultLabel?: string;
  className?: string;
}) {
  const tree = useMemo(() => placementTreeFor(rows), [rows]);
  const summary = useMemo(() => evidenceSummaryFor(rows), [rows]);
  return (
    <div className={cn("space-y-4", className)} data-testid="placement-drill">
      <div className="flex items-center gap-2 flex-wrap">
        <p className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>Platform → placement → device</p>
        <EvidenceChip state={summary.state} />
      </div>
      <CoverageStrip coveragePct={summary.coverage_pct} metricLabel="spend" />
      <DisclosureStack items={items(tree, 0, resultLabel)} mode="single" defaultOpen={tree[0] ? [tree[0].key] : []} label="Platforms" />
      {unattributedSpend !== null && unattributedSpend > 0 && (
        <div className={cn("flex items-center justify-between rounded-lg border border-dashed border-border/50 px-3 py-2", TYPE.caption)} data-testid="unattributed-row">
          <span className="text-muted-foreground/75">Unattributed by this breakdown</span>
          <span className="tabular-nums text-muted-foreground">{fmtMetric("usd_total", unattributedSpend)}</span>
        </div>
      )}
      <EvidenceExplainer state={summary.state} coveragePct={summary.coverage_pct} />
    </div>
  );
}
