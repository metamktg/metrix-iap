// ─── Evidence tab: creative → configured assets → variables → segments ──
// Spec §15: layered disclosure from the creative's configured copy bundle
// through its deconstructed variables to their demographic and placement
// performance, with direct_asset and ad_context badges kept apart. A
// headline with only ad-context evidence and a primary text with direct
// demographic evidence must read differently, and do.

import { useMemo } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DisclosureStack, type DisclosureItem } from "@/components/widgets/DisclosureStack";
import { fmtMetric } from "@/lib/normalize";
import { resolveVariableLabel } from "@/lib/variable-registry";
import type { CreativeAssetRow, VariableEvidenceRow, VariableSegmentRow } from "@/lib/data/seedTypes";
import { type CreativeAdIdentity, variablesForCreative } from "@/lib/creative-evidence";
import { EvidenceChip, EvidenceExplainer } from "./EvidenceChip";

const ASSET_LABEL: Record<string, string> = {
  primary_text: "Primary text",
  headline: "Headline",
  description: "Description",
  cta_type: "Call to action",
  cta_text: "CTA text",
  destination: "Destination",
  display_link: "Display link",
  image: "Image",
  video: "Video",
  media: "Media",
};

function segmentLabel(s: VariableSegmentRow): string {
  const d = s.segment;
  if (s.breakdown === "demographic") return `${d.age ?? "?"} · ${d.gender ?? "?"}`;
  if (s.breakdown === "placement") return [d.platform, d.placement, d.device].filter(Boolean).join(" · ");
  if (s.breakdown === "all") return "All ads";
  // An asset segment is named by what was delivered, not by its key: the
  // key is a hash since 2026-09-04 (the value used to be inside it, and a
  // copy signature's whole text broke a database key). A copy signature's
  // fields are joined by \u0001 in the value; read them as a row.
  if (d.asset_fields && Object.keys(d.asset_fields).length > 0) {
    return Object.entries(d.asset_fields).map(([k, v]) => `${ASSET_LABEL[k] ?? k}: ${v}`).join(" · ");
  }
  if (d.asset_value) return [d.asset_type ? (ASSET_LABEL[d.asset_type] ?? d.asset_type) : null, d.asset_value.split("\u0001").join(" · ")].filter(Boolean).join(": ");
  return s.segment_key;
}

function SegmentRows({ rows }: { rows: VariableSegmentRow[] }) {
  const ordered = [...rows].sort((a, b) => (a.breakdown === "all" ? -1 : b.breakdown === "all" ? 1 : (b.contextual_totals["amount_spent"] ?? 0) + (b.direct_totals["amount_spent"] ?? 0) - ((a.contextual_totals["amount_spent"] ?? 0) + (a.direct_totals["amount_spent"] ?? 0))));
  return (
    <div className="space-y-1">
      {ordered.slice(0, 12).map((s) => {
        const spend = (s.direct_totals["amount_spent"] ?? 0) + (s.contextual_totals["amount_spent"] ?? 0);
        const direct = s.direct_totals["amount_spent"] ?? 0;
        return (
          <div key={`${s.breakdown}${s.segment_key}${s.result_type}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/30 px-3 py-2" data-testid="variable-segment-row">
            <div className="min-w-0">
              <div className={cn(TYPE.caption, "font-medium text-foreground truncate")}>{segmentLabel(s)}</div>
              <div className={cn(TYPE.microLabel, "text-muted-foreground/75 normal-case tracking-normal tabular-nums")}>
                {fmtMetric("usd_total", spend)} · {fmtMetric("count", s.result_volume)} results
                {s.cost_per_result !== null ? ` · ${fmtMetric("usd_unit", s.cost_per_result)} each` : ""}
                {s.interaction_index !== null ? ` · index ${s.interaction_index.toFixed(2)}` : ""}
                {direct > 0 ? ` · ${fmtMetric("usd_total", direct)} direct` : ""}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <EvidenceChip state={s.evidence_state} testId="variable-segment-state" />
              <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{s.confidence}</span>
            </div>
          </div>
        );
      })}
      {ordered.length > 12 && <p className={cn(TYPE.caption, "text-muted-foreground/75")}>{ordered.length - 12} more segments in the IAP Library.</p>}
    </div>
  );
}

export function EvidenceTab({
  identity,
  assets,
  evidence,
  segments,
}: {
  identity: CreativeAdIdentity;
  assets: CreativeAssetRow[];
  evidence: VariableEvidenceRow[];
  segments: VariableSegmentRow[] | undefined;
}) {
  const variables = useMemo(() => variablesForCreative(evidence, segments), [evidence, segments]);
  const configured = assets.filter((a) => a.provenance === "configured");
  const delivered = assets.filter((a) => a.provenance === "delivered");

  if (identity.adIds.length === 0 && identity.adNames.length === 0) {
    return (
      <div className="py-10 text-center space-y-1.5">
        <p className={cn(TYPE.body, "font-medium text-muted-foreground/75")}>No mapped ads</p>
        <p className={cn(TYPE.label, "text-muted-foreground/75")}>Evidence joins through this creative's mapped Ad IDs. Map the creative to an ad from the upload editor, then re-run analysis.</p>
      </div>
    );
  }

  const assetItems: DisclosureItem[] = [
    ...configured.map((a) => ({
      id: `cfg-${a.id}`,
      title: ASSET_LABEL[a.asset_type] ?? a.asset_type,
      meta: <EvidenceChip state="ad_context" testId="asset-evidence" />,
      content: (
        <div className="space-y-1">
          <p className={cn(TYPE.body, "text-foreground whitespace-pre-wrap")}>{a.raw_value}</p>
          <p className={cn(TYPE.caption, "text-muted-foreground/75")}>Configured on the ad ({a.source_column}). Receives the ad's evidence as context; it is not attributed on its own.</p>
        </div>
      ),
    })),
    ...delivered.map((a) => ({
      id: `dlv-${a.id}`,
      title: `${ASSET_LABEL[a.asset_type] ?? a.asset_type} · delivered`,
      meta: <EvidenceChip state="direct_asset" testId="asset-evidence" />,
      content: (
        <div className="space-y-1">
          <p className={cn(TYPE.body, "text-foreground whitespace-pre-wrap")}>{a.raw_value}</p>
          <p className={cn(TYPE.caption, "text-muted-foreground/75")}>Meta broke performance down for this asset instance ({a.source_column}).</p>
        </div>
      ),
    })),
  ];

  const variableItems: DisclosureItem[] = variables.map((v) => ({
    id: `${v.variable_family}-${v.variable_id}`,
    title: resolveVariableLabel(v.variable_id) || v.variable_id,
    meta: (
      <span className="flex items-center gap-1.5">
        <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{v.variable_family}</span>
        <EvidenceChip state={v.relationship} testId="variable-evidence" />
      </span>
    ),
    content: v.segments.length > 0 ? <SegmentRows rows={v.segments} /> : <p className={cn(TYPE.caption, "text-muted-foreground/75")}>No segment rows for this variable yet. Run analysis after the deconstruction was filed.</p>,
  }));

  return (
    <div className="space-y-5" data-testid="evidence-tab">
      <div className="space-y-1">
        <p className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>Mapped ads</p>
        <p className={cn(TYPE.caption, "text-muted-foreground")}>
          {identity.adIds.length} Ad ID{identity.adIds.length === 1 ? "" : "s"} under {identity.adNames.length} name{identity.adNames.length === 1 ? "" : "s"} · joined by {identity.via === "cell" ? "cell code" : "mapped ad names"}
        </p>
      </div>

      <div className="space-y-2">
        <p className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>Creative bundle</p>
        {assetItems.length > 0 ? (
          <DisclosureStack items={assetItems} mode="single" label="Assets" data-testid="asset-stack" />
        ) : (
          <p className={cn(TYPE.caption, "text-muted-foreground/75")}>No copy or media columns in the staged exports. Add the creative columns to the Ad Summary export to see the bundle.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>Deconstructed variables</p>
        {variableItems.length > 0 ? (
          <DisclosureStack items={variableItems} mode="single" label="Variables" data-testid="variable-stack" />
        ) : (
          <p className={cn(TYPE.caption, "text-muted-foreground/75")}>No filed deconstruction reaches these ads. Deconstruct the creative, then re-run analysis.</p>
        )}
      </div>

      <EvidenceExplainer state={variables.some((v) => v.relationship === "direct_asset") ? "direct_asset" : "ad_context"} contextual />
    </div>
  );
}
