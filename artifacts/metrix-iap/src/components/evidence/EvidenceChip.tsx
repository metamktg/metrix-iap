// ─── Evidence chip · coverage strip · explainer ─────────────────────────
// Spec §9 / §15: every number on the new surfaces carries its evidence
// state, and where relevant its coverage. The chip is chrome (a label), the
// strip is a static meter (ProgressMeter, role="meter" — deliberately NOT
// RunProgress, which is a run-phase widget), and the sentences live behind
// DetailReveal. None of these render inside a <button> card.

import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DetailReveal } from "@/pages/metrix/shared";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import type { EvidenceState } from "@/lib/data/seedTypes";
import { EVIDENCE_LABEL, EVIDENCE_MEANING, evidenceTone, type EvidenceTone } from "@/lib/creative-evidence";

const TONE_CLASS: Record<EvidenceTone, string> = {
  success: "bg-status-success/10 text-status-success border-status-success/25",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/25",
  danger: "bg-status-danger/10 text-status-danger border-status-danger/25",
  primary: "bg-primary/10 text-interactive border-primary/25",
  muted: "bg-foreground/[0.04] text-muted-foreground border-border/40",
};

export function EvidenceChip({ state, className, testId }: { state: EvidenceState | null; className?: string; testId?: string }) {
  const tone = evidenceTone(state);
  return (
    <span
      data-testid={testId ?? "evidence-chip"}
      data-state={state ?? "none"}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 whitespace-nowrap", TYPE.microLabel, TONE_CLASS[tone], className)}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", tone === "muted" ? "bg-muted-foreground/60" : "bg-current")} aria-hidden />
      {state ? EVIDENCE_LABEL[state] : "No evidence"}
    </span>
  );
}

/** Static coverage meter: observed share of the control source, for one metric. */
export function CoverageStrip({
  coveragePct,
  metricLabel = "spend",
  className,
  testId,
}: {
  coveragePct: number | null;
  metricLabel?: string;
  className?: string;
  testId?: string;
}) {
  const value = coveragePct === null ? null : Math.max(0, Math.min(100, Math.round(coveragePct)));
  return (
    <div className={cn("space-y-1", className)} data-testid={testId ?? "coverage-strip"}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Coverage · {metricLabel}</span>
        <span className={cn(TYPE.caption, "tabular-nums font-medium", value === null ? "text-muted-foreground/75" : value >= 99 ? "text-status-success" : "text-foreground/80")}>
          {coveragePct === null ? "not reconciled" : `${coveragePct}%`}
        </span>
      </div>
      <ProgressMeter
        value={value}
        total={100}
        label={`Coverage of ${metricLabel}`}
        size="sm"
        fillClassName={value === null ? "bg-muted-foreground/30" : value >= 99 ? "bg-status-success/60" : "bg-primary/50"}
      />
    </div>
  );
}

/** The sentences: what the state means, what coverage means here, and the non-additive note. */
export function EvidenceExplainer({
  state,
  coveragePct,
  contextual,
  nonAdditive,
  className,
  testId,
}: {
  state: EvidenceState | null;
  coveragePct?: number | null;
  /** True when the figures are ad-level evidence attached to a component (never attributed to it). */
  contextual?: boolean;
  /** True when the surface shows reach or another metric that must not be summed. */
  nonAdditive?: boolean;
  className?: string;
  testId?: string;
}) {
  const sections = [
    state ? { label: EVIDENCE_LABEL[state], text: EVIDENCE_MEANING[state] } : { label: "No evidence", text: "No breakdown rows join to this creative's ads yet." },
    ...(coveragePct !== undefined
      ? [
          {
            label: "Coverage",
            text:
              coveragePct === null
                ? "Coverage is measured against the Ad Summary export per Ad ID. Without one at this scope the rows are shown as observed and labelled unreconciled."
                : `${coveragePct}% of the control source's spend is carried by these rows. The remainder is unattributed by this breakdown — it is never allocated to a segment and never scaled.`,
          },
        ]
      : []),
    ...(contextual ? [{ label: "Contextual attribution", text: EVIDENCE_MEANING.ad_context }] : []),
    ...(nonAdditive ? [{ label: "Non-additive", text: EVIDENCE_MEANING.unavailable }] : []),
  ];
  return <DetailReveal label="How to read this" eyebrow="Evidence" sections={sections} labelClassName={cn(TYPE.caption, "text-muted-foreground/75")} className={className} testId={testId ?? "evidence-explainer"} />;
}
