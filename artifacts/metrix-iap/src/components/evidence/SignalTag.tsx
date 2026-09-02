// ─── Signal tag · coverage tag ───────────────────────────────────────────
// Owner direction (2026-09-02): Metrix surfaces objective truths from
// subjective media — the signal IS the product. So the interface emphasises
// a HIGH read, says nothing about an ordinary one, and marks a thin read or
// a partial source with the smallest tag that still reads, never a banner.
// The sentences live behind DetailReveal (signalExplainerSections), so no
// surface carries a paragraph of caveats on its first layer.

import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import type { DetailSection } from "@/pages/metrix/shared";
import type { SegmentSignal, SegmentSignalCoverage } from "@/lib/segment-analytics";

const HIGH_MEANING =
  "Clears the documented high confidence band on its own volume (more than 100 results or $1,000 of spend) with no thin-read flags. Read it with confidence.";
const OK_MEANING = "An ordinary, usable read: inside the documented medium band with no thin-read flags.";

/** The tag itself. Renders nothing for an ordinary read — silence is the default state. */
export function SignalTag({ signal, className, testId }: { signal: SegmentSignal; className?: string; testId?: string }) {
  if (signal.state === "ok") return null;
  const high = signal.state === "high";
  return (
    <span
      data-testid={testId ?? "signal-tag"}
      data-state={signal.state}
      title={high ? HIGH_MEANING : signal.reasons.join(" ")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px whitespace-nowrap select-none",
        TYPE.microLabel,
        high ? "border-status-success/30 bg-status-success/10 text-status-success" : "border-border/50 bg-transparent text-muted-foreground/75",
        className,
      )}
    >
      <span className={cn("w-1 h-1 rounded-full", high ? "bg-current" : "bg-status-warning/80")} aria-hidden />
      {high ? "High signal" : "Low signal"}
    </span>
  );
}

/** The source's measured coverage, shown once per surface when it is partial. */
export function CoverageTag({ coverage, className, testId }: { coverage: SegmentSignalCoverage | null | undefined; className?: string; testId?: string }) {
  if (!coverage?.partial) return null;
  return (
    <span
      data-testid={testId ?? "coverage-tag"}
      data-state="partial"
      title={coverage.note ?? "The demographic export covers part of this account's spend; segment reads describe that slice."}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-px whitespace-nowrap select-none text-muted-foreground/75 tabular-nums",
        TYPE.microLabel,
        className,
      )}
    >
      {coverage.pct != null ? `${coverage.pct}% coverage` : "Partial coverage"}
    </span>
  );
}

/** Sections for a DetailReveal: what the tag means, and what coverage means here. */
export function signalExplainerSections(signal: SegmentSignal): DetailSection[] {
  const sections: DetailSection[] = [
    signal.state === "high"
      ? { label: "High signal", text: HIGH_MEANING }
      : signal.state === "low"
        ? { label: "Low signal", text: signal.reasons.join(" ") }
        : { label: "Signal", text: OK_MEANING },
  ];
  if (signal.coverage?.partial) {
    sections.push({
      label: "Coverage",
      text:
        signal.coverage.note ??
        `The demographic export carries ${signal.coverage.pct ?? "part"}% of this account's spend. This segment's own numbers are observed; a ranking across segments describes that slice.`,
    });
  }
  return sections;
}
