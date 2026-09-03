// ─── Copy components panel ─────────────────────────────────────────────
// The Creative Library's copy-level layer: every distinct headline,
// primary text, description and CTA the account ran, weighted against the
// results of the ads that carried it (creativeComponents.ts on the server).
// Plus the evidence the analysis engine now grades each concept on: how
// much of its spend the engine can explain at the copy level.
//
// Rulebook: first layer is labels, marks and numbers; the full component
// text and its ad names live behind DetailReveal; a component with no
// results shows no cost per result, and a concept graded before the
// evidence columns existed reads "not graded", never "no evidence".

import { useState } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TabRail } from "@/components/nav/TabRail";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { ConfidenceBadge, DetailReveal, MetricTile, deriveLabel } from "@/pages/metrix/shared";
import { TYPE } from "@/pages/metrix/typography";
import { fmtMetric } from "@/lib/normalize";
import { classifyResultEvent } from "@/lib/resultEvents";
import type {
  ConceptRollupRow, CreativeComponentFamily, CreativeComponents, CreativeInputSource,
} from "@/lib/data/seedTypes";

const FAMILY_LABEL: Record<CreativeComponentFamily, string> = {
  headline: "Headlines",
  primary_text: "Primary text",
  description: "Descriptions",
  cta_type: "Calls to action",
};

const SOURCE_LABEL: Record<CreativeInputSource, string> = {
  performance_export: "Performance export",
  uploaded_asset: "Uploaded creatives",
  meta_api: "Meta API",
};

function sourceLabel(s: CreativeInputSource): string {
  return SOURCE_LABEL[s];
}

const EVIDENCE_LABEL: Record<string, string> = { full: "Full", partial: "Partial", none: "None" };

export function CreativeComponentsPanel({
  components,
  rollup,
  embedded = false,
}: {
  components: CreativeComponents;
  /** Run-scoped concept rollup rows (the caller scopes them). */
  rollup: ConceptRollupRow[];
  /** True when mounted inside a surface that already pads its content (the IAP Library's Ad copy tab). */
  embedded?: boolean;
}) {
  const families = (Object.keys(FAMILY_LABEL) as CreativeComponentFamily[]);
  const firstWithRows = families.find((f) => components.families[f].length > 0) ?? "headline";
  const [family, setFamily] = useState<CreativeComponentFamily>(firstWithRows);
  const rows = components.families[family];
  const cov = components.coverage;
  const graded = rollup.filter((r) => r.evidence_grade != null);
  // The result events the server's weighting ran over (its dominant intent
  // class). Stated, because it is fixed at seed time and does not follow the
  // page's result scope — a reader must not take a weight computed on
  // purchases for one computed under the scope they chose.
  const scope = components.scope;
  const scopeLine = scope
    ? `Weighted on ${scope.result_types.map((rt) => classifyResultEvent(rt).label).join(" + ") || "no placed event"}` +
      (scope.excluded_result_types.length > 0 ? ` · not ${scope.excluded_result_types.map((rt) => classifyResultEvent(rt).label).join(", ")}` : "")
    : null;

  return (
    <div className={cn(embedded ? "space-y-6" : "px-6 py-5 space-y-6")} data-testid="creative-components-panel">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Ads with known copy" value={`${cov.ads_with_copy} of ${cov.ads_total}`} variant="primary" />
        <MetricTile label="Spend covered" value={fmtMetric("pct", cov.coverage * 100)} sub={`${fmtMetric("usd_total", cov.spend_with_copy)} of ${fmtMetric("usd_total", cov.spend_total)}`} />
        <MetricTile label="Baseline cost per result" value={fmtMetric("usd_unit", components.baseline.cost_per_result)} sub="covered ads only" />
        <MetricTile label="Source" value={cov.sources.map(sourceLabel).join(" + ") || "None"} />
      </div>
      <p className={cn(TYPE.caption, "text-muted-foreground/75 -mt-3")} data-testid="creative-components-by-family">
        Ads carrying each family: headlines {fmtMetric("count", cov.by_family.headline)} · primary text {fmtMetric("count", cov.by_family.primary_text)} · descriptions {fmtMetric("count", cov.by_family.description)} · calls to action {fmtMetric("count", cov.by_family.cta_type)}
        {scopeLine ? ` · ${scopeLine}` : ""}
      </p>

      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <TabRail
            label="Component family"
            active={family}
            onChange={(id) => setFamily(id as CreativeComponentFamily)}
            tabs={families.map((f) => ({
              id: f,
              label: FAMILY_LABEL[f],
              count: components.families[f].length,
              disabledReason: components.families[f].length === 0 ? `The export carried no ${FAMILY_LABEL[f].toLowerCase()}` : undefined,
            }))}
          />
          <DetailReveal
            label="How weights are computed"
            eyebrow="Method"
            labelClassName={cn(TYPE.caption, "text-muted-foreground/75")}
            sections={[
              { label: "Weight", text: "Result share × efficiency index, normalised so the family's best value is 1.0. It ranks this account's own copy against its own results; it is not a model." },
              { label: "Efficiency index", text: "The covered ads' cost per result divided by this value's cost per result. 1.0 means as efficient as the copy we can see; above 1.0 is cheaper. Absent when the value has no results." },
              { label: "Coverage", text: "The share of the account's spend that ran on ads whose copy the export carried. Ads with unknown copy stay in the denominator." },
            ]}
          />
        </div>

        {rows.length === 0 ? (
          <p className={cn(TYPE.caption, "text-muted-foreground/75 py-6 text-center")}>
            No {FAMILY_LABEL[family].toLowerCase()} in the export for this account.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-foreground/[0.03] text-muted-foreground/75">
                  <th scope="col" className={cn(TYPE.microLabel, "text-left px-3 py-2 w-10")}>#</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-left px-3 py-2")}>Value</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Ads</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Spend</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Results</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Cost / result</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Link CTR</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Efficiency</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-left px-3 py-2 min-w-[140px]")}>Weight</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-left px-3 py-2")}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.family}:${r.value}`} className="border-t border-border/30 align-top" data-testid="creative-component-row">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground/75">{r.rank}</td>
                    <td className="px-3 py-2 max-w-[360px]">
                      <DetailReveal
                        label={deriveLabel(r.value, 72)}
                        eyebrow={FAMILY_LABEL[family]}
                        labelClassName={cn(TYPE.caption, "text-foreground")}
                        sections={[
                          { label: "Full text", text: r.value },
                          { label: `Carried by ${r.ads} ad${r.ads === 1 ? "" : "s"}`, text: r.ad_names.join(" · ") },
                          { label: "Share of covered set", text: `${fmtMetric("pct", r.spend_share * 100)} of spend · ${fmtMetric("pct", r.result_share * 100)} of results` },
                          ...(r.result_types.length ? [{ label: "Result types", text: r.result_types.join(", ") }] : []),
                        ]}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMetric("count", r.ads)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMetric("usd_total", r.spend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMetric("count", r.results)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" title={r.cost_per_result == null ? "No results yet — cost per result is not computable" : undefined}>
                      {fmtMetric("usd_unit", r.cost_per_result)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMetric("pct", r.ctr_link_pct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.efficiency_index == null ? "—" : `${r.efficiency_index.toFixed(2)}×`}</td>
                    <td className="px-3 py-2">
                      <ProgressMeter value={r.weight} total={1} label={`Weight ${r.weight.toFixed(2)}`} size="sm" />
                    </td>
                    <td className="px-3 py-2"><ConfidenceBadge value={r.confidence.replace("_", " ")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className={cn(TYPE.label, "text-muted-foreground/75")}>Evidence by concept</h3>
          <DetailReveal
            label="What this grades"
            labelClassName={cn(TYPE.caption, "text-muted-foreground/75")}
            sections={[{ text: "Each concept's confidence tier is set by spend and result volume, as before. The evidence grade says how much of that concept's spend ran on ads whose copy is known — full at 80% or more, partial above 0 — and the score scales the tier by it, with a 70% floor so a concept with no known copy keeps most of its volume-based confidence." }]}
          />
        </div>
        {graded.length === 0 ? (
          <p className={cn(TYPE.caption, "text-muted-foreground/75")}>
            Concepts are graded for creative evidence on the next analysis run.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-foreground/[0.03] text-muted-foreground/75">
                  <th scope="col" className={cn(TYPE.microLabel, "text-left px-3 py-2")}>Concept</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Spend</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-left px-3 py-2")}>Confidence</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Copy coverage</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-left px-3 py-2")}>Evidence</th>
                  <th scope="col" className={cn(TYPE.microLabel, "text-right px-3 py-2")}>Score</th>
                </tr>
              </thead>
              <tbody>
                {graded.map((r) => (
                  <tr key={`${r.book ?? ""}:${r.concept}`} className="border-t border-border/30" data-testid="concept-evidence-row">
                    <td className="px-3 py-2 font-medium text-foreground">{r.book ? `${r.book} · ${r.concept}` : r.concept}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMetric("usd_total", r.spend)}</td>
                    <td className="px-3 py-2">{r.confidence_level ? <ConfidenceBadge value={r.confidence_level.replace("_", " ")} /> : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMetric("pct", r.creative_coverage_pct)}</td>
                    <td className="px-3 py-2">{EVIDENCE_LABEL[String(r.evidence_grade)] ?? String(r.evidence_grade)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.confidence_score == null ? "—" : r.confidence_score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
