// ─── Data-coverage warning banner ──────────────────────────────────────
// Persistent, specific warning rendered on every surface that aggregates a
// report class whose measured join coverage fell below the server's
// threshold (AnalysisDataCoverage.classes[].below_threshold — see
// analysisEngine.ts computeDataCoverage). The message text is the server's
// own measured cause+remedy note, so every surface states the same facts.
// Never rendered when coverage is unmeasured (legacy runs / importer
// accounts) or above threshold — this banner marks measured degradation,
// not generic uncertainty.

import { AlertTriangle } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
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
    <div
      role="status"
      data-testid="data-coverage-banner"
      className={cn(
        "rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 flex items-start gap-3",
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-0.5">
        <p className={cn(TYPE.label, "text-amber-300 font-semibold uppercase tracking-wider")}>
          Demographic coverage {pct != null ? `· ${pct}% of spend` : "· insufficient"}
        </p>
        <p className={cn(TYPE.body, "text-amber-100/80")}>
          {coverage.note ??
            "Demographic data covers too little of this account's spend for segment classification to be trustworthy."}
        </p>
      </div>
    </div>
  );
}
