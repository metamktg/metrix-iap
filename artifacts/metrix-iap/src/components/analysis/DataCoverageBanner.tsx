// ─── Data-coverage strip ────────────────────────────────────────────────
// One quiet line, rendered once on a surface that aggregates a report class
// whose measured join coverage fell below the server's threshold
// (AnalysisDataCoverage.classes[].below_threshold — analysisEngine.ts
// computeDataCoverage). A tag, a caption, and the server's own measured note
// behind a reveal. Never rendered when coverage is unmeasured (legacy runs /
// importer accounts) or above threshold. Owner direction 2026-09-02: this
// is context for the reader, not a warning — no icon, no amber box.

import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DetailReveal } from "@/pages/metrix/shared";
import { CoverageTag } from "@/components/evidence/SignalTag";
import type { DemographicCoverageInput } from "@/lib/segment-analytics";

export function DataCoverageBanner({
  coverage,
  className,
}: {
  coverage: DemographicCoverageInput | null;
  className?: string;
}) {
  if (!coverage?.below_threshold) return null;
  const pct = coverage.spend_coverage_pct;
  return (
    <div role="status" data-testid="data-coverage-banner" className={cn("flex items-center gap-2 flex-wrap min-w-0", className)}>
      <CoverageTag coverage={{ pct, partial: true, note: coverage.note }} />
      <span className={cn(TYPE.caption, "text-muted-foreground/75")}>
        Demographic rows carry {pct != null ? `${pct}%` : "part"} of this account's spend · segment reads describe that slice
      </span>
      <DetailReveal
        label="Why"
        eyebrow="Coverage"
        sections={[
          { label: "Measured", text: coverage.note ?? "The demographic export covers part of this account's spend." },
          { label: "Widen it", text: "Export Demographics from Meta Ads Reporting for all ads over the full window and re-run analysis." },
        ]}
        labelClassName={cn(TYPE.caption, "text-muted-foreground/75")}
        testId="data-coverage-why"
      />
    </div>
  );
}
