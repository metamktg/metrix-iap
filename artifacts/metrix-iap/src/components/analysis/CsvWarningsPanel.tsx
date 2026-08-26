// ─── Run warnings panel ───────────────────────────────────────────────
//
// Shared because it used to live inside ManualAnalysisControls and render
// for the LATEST run only (C10). A run started from the Loop command chain
// or the task tray therefore surfaced its warnings nowhere, and the
// analysis history — the one screen that lists every run — showed none at
// all, even though `csv_warnings` has always been on the AnalysisRun the
// list endpoint already returns. Warnings belong wherever runs are started
// or listed, not at one entry point.

import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { AnalysisRun } from "@workspace/api-client-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { splitWarningsBySeverity, hasReducedConfidence } from "@/lib/warningSeverity";

/**
 * Shows CSV column warnings from a completed analysis run.
 * Displayed when the parser auto-resolved column names (e.g. legacy "Date" → "Day"),
 * found missing columns, or spotted unrecognised columns that might map to
 * expected ones. Uses amber styling — the run succeeded, but at reduced
 * confidence for missing core metrics.
 */
export function CsvWarningsPanel({ run, compact = false }: { run: AnalysisRun; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const warnings = run.csv_warnings;
  if (!warnings || warnings.length === 0) return null;

  // Severity split (same classifier as the staging popup): routine
  // auto-mapping notices collapse behind a count so the lines that carry a
  // finding — coverage, ID corruption, re-run supersedes, reconciliation —
  // are the ones a reader actually sees. Stored runs keep their warnings
  // verbatim, so the classifier also understands older phrasings.
  const { attention, notices } = splitWarningsBySeverity(warnings);
  if (attention.length === 0 && notices.length === 0) return null;
  const alarmed = attention.length > 0;
  // Classified by lib/warningSeverity, not by substring-matching the
  // message inline: a copy edit to the parser's wording must not silently
  // demote this headline (E-b).
  const reducedConfidence = hasReducedConfidence(attention);

  return (
    <div
      data-testid="csv-warnings-panel"
      className={cn(
        "rounded-lg border space-y-2",
        compact ? "p-2" : "p-3",
        alarmed ? "border-status-warning/30 bg-status-warning/[0.06]" : "border-border/40 bg-white/[0.02]",
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-2 text-left"
      >
        <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", alarmed ? "text-status-warning" : "text-muted-foreground/70")} />
        <div className="flex-1 min-w-0">
          <div className={cn("text-caption font-semibold", alarmed ? "text-status-warning" : "text-foreground/85")}>
            {reducedConfidence
              ? "Analysis succeeded with reduced confidence"
              : alarmed
                ? `Analysis succeeded — ${attention.length} warning${attention.length !== 1 ? "s" : ""} to review`
                : "Analysis succeeded — routine column mappings only"}
          </div>
          <p className={cn("text-label mt-0.5", alarmed ? "text-status-warning/70" : "text-muted-foreground/70")}>
            {reducedConfidence
              ? "Some core metric columns were missing — key efficiency scores may be incomplete. "
              : ""}
            {attention.length > 0 && `${attention.length} warning${attention.length !== 1 ? "s" : ""}`}
            {attention.length > 0 && notices.length > 0 && " · "}
            {notices.length > 0 && `${notices.length} routine mapping notice${notices.length !== 1 ? "s" : ""}`}
            {" "}
            <span className="underline cursor-pointer">{expanded ? "Hide" : "Show"} details</span>
          </p>
        </div>
      </button>
      {expanded && (
        <div className={cn("space-y-1 pt-1 border-t", alarmed ? "border-status-warning/20" : "border-border/30")}>
          {attention.length > 0 && (
            <ul className="space-y-1">
              {attention.map((w, i) => (
                <li key={i} className="text-label text-status-warning/75 leading-relaxed">
                  · {w}
                </li>
              ))}
            </ul>
          )}
          {notices.length > 0 && (
            <details className="group/run-notices pt-1">
              <summary className="flex items-center gap-1 text-label text-muted-foreground/70 cursor-pointer hover:text-foreground/80 transition-colors [&::-webkit-details-marker]:hidden">
                <ChevronRight className="w-3 h-3 shrink-0 transition-transform group-open/run-notices:rotate-90" />
                {notices.length} routine notice{notices.length !== 1 ? "s" : ""} — automatic mappings &amp; optional columns (no action needed)
              </summary>
              <ul className="space-y-1 pl-4 pt-1">
                {notices.map((w, i) => (
                  <li key={i} className="text-label text-muted-foreground/70 leading-relaxed">
                    · {w}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
