// ─── Post-import Confidence Report ──────────────────────────────────────
// Shown after a successful CSV import to grade overall column coverage and
// surface per-column mapping results. Uses the mapping_summary stored on
// each ManualImport at upload time — no extra round-trip required.
//
// Grade scale (weighted column coverage):
//   A ≥ 0.90  — excellent coverage, analysis will be complete
//   B ≥ 0.75  — good coverage, minor columns missing
//   C ≥ 0.60  — acceptable, some signal penalty expected
//   D ≥ 0.45  — poor coverage, significant signal gaps
//   F < 0.45  — too many key columns missing
//
// Signal weights live in iapCsvSpec.ts SIGNAL_WEIGHTS. Any canonical column
// not listed there has weight 0 and does not affect the grade.

import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingDown } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import type { ManualImport } from "@workspace/api-client-react";
import { InfoTooltip } from "./shared";

// ── Signal weights (mirrors iapCsvSpec.ts SIGNAL_WEIGHTS) ──────────────
// Maintained as a client-side copy so the frontend doesn't need a separate
// API call. Must be kept in sync with the server-side constant.
const SIGNAL_WEIGHTS: Record<string, number> = {
  "Amount spent ({ACCOUNT_CURRENCY})": 0.20,
  "Amount spent (USD)": 0.20,  // resolved currency variant
  "Results": 0.23,
  "Impressions": 0.10,
  "CTR (link click-through rate)": 0.07,
  "Link clicks": 0.07,
  "Reach": 0.06,
  "CPM (cost per 1,000 impressions)": 0.05,
  "Video average play time": 0.03,
  "ThruPlays": 0.03,
  "Landing page views": 0.03,
  "Clicks (all)": 0.02,
  "CTR (all)": 0.02,
  "Frequency": 0.02,
  "Result type": 0.02,
  "Ad creative body text": 0.01,
  "Ad creative headline": 0.01,
  "Conversion device": 0.01,
};

type MappingEntry = NonNullable<ManualImport["mapping_summary"]>[number];

type ColumnReport = MappingEntry & {
  signalWeight: number;
};

function getSignalWeight(canonical: string): number {
  return SIGNAL_WEIGHTS[canonical] ?? 0;
}

function computeGrade(present: number, total: number): { grade: "A" | "B" | "C" | "D" | "F"; pct: number } {
  const pct = total > 0 ? present / total : 0;
  const grade: "A" | "B" | "C" | "D" | "F" =
    pct >= 0.9 ? "A" :
    pct >= 0.75 ? "B" :
    pct >= 0.6 ? "C" :
    pct >= 0.45 ? "D" : "F";
  return { grade, pct };
}

function GradeBadge({ grade }: { grade: "A" | "B" | "C" | "D" | "F" }) {
  const colors: Record<string, string> = {
    A: "bg-emerald-400/15 border-emerald-400/40 text-emerald-300",
    B: "bg-chart-1/15 border-blue-400/40 text-blue-300",
    C: "bg-amber-400/15 border-amber-400/40 text-amber-300",
    D: "bg-orange-400/15 border-orange-400/40 text-orange-300",
    F: "bg-red-500/15 border-red-400/40 text-red-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-8 h-8 rounded-lg border text-body font-bold tabular-nums",
        colors[grade]
      )}
    >
      {grade}
    </span>
  );
}

function TierBadge({ tier }: { tier: MappingEntry["tier"] }) {
  const styles: Record<string, string> = {
    exact: "bg-emerald-400/10 border-emerald-400/25 text-emerald-400",
    resolved: "bg-chart-1/10 border-blue-400/25 text-blue-300",
    inferred: "bg-amber-400/10 border-amber-400/25 text-amber-300",
    missing: "bg-red-500/10 border-red-400/30 text-red-300",
  };
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-label font-semibold uppercase tracking-wide border",
        styles[tier] ?? "bg-white/[0.04] border-border/30 text-muted-foreground/80"
      )}
    >
      {tier}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 90 ? "bg-emerald-400/60" :
    pct >= 70 ? "bg-chart-1/60" :
    pct >= 50 ? "bg-amber-400/60" :
    "bg-red-400/60";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-[width]", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-label tabular-nums text-muted-foreground/70 w-8 text-right">{pct}%</span>
    </div>
  );
}

/**
 * Confidence Report for a single staged performance CSV.
 * Shows overall grade and per-column breakdown.
 */
function SingleCsvConfidenceReport({
  imp,
  defaultOpen,
}: {
  imp: ManualImport;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const summary = imp.mapping_summary;
  if (!summary || summary.length === 0) return null;

  // Build column reports with signal weights
  const columns: ColumnReport[] = summary.map((entry) => ({
    ...entry,
    signalWeight: getSignalWeight(entry.canonical),
  }));

  // Grade = sum of weights for present columns / sum of all weights for weighted columns
  let totalWeight = 0;
  let presentWeight = 0;
  for (const col of columns) {
    if (col.signalWeight > 0) {
      totalWeight += col.signalWeight;
      if (col.tier !== "missing") presentWeight += col.signalWeight;
    }
  }

  const { grade, pct } = computeGrade(presentWeight, totalWeight || 1);

  const csvLabel =
    imp.kind === "performance_demo_csv" ? "Demographics CSV" :
    imp.kind === "performance_placement_csv" ? "Placements CSV" :
    imp.kind === "performance_ad_summary_csv" ? "Ad Summary CSV" :
    imp.kind === "performance_conversion_device_csv" ? "Conversion Device CSV" :
    imp.filename;

  const missingColumns = columns.filter((c) => c.tier === "missing" && c.signalWeight > 0);
  const resolvedColumns = columns.filter((c) => c.tier !== "missing");

  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
        )}
        <GradeBadge grade={grade} />
        <div className="flex-1 min-w-0">
          <div className="text-body font-medium text-foreground truncate">{csvLabel}</div>
          <p className="text-label text-muted-foreground/70">
            {Math.round(pct * 100)}% signal coverage ·{" "}
            {resolvedColumns.length} of {summary.length} columns matched
          </p>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/30 px-3 pb-3 pt-2 space-y-3">
          {/* Missing weighted columns with signal penalty */}
          {missingColumns.length > 0 && (
            <div className="space-y-1">
              <div className="text-label font-semibold uppercase tracking-wide text-muted-foreground/50 mb-1">
                Missing signal columns
              </div>
              {missingColumns.map((col) => (
                <div key={col.canonical} className="flex items-center gap-2">
                  <span className="flex-1 text-label text-foreground/80 truncate">{col.canonical}</span>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-400/25 text-label text-red-300 font-mono shrink-0">
                    <TrendingDown className="w-3 h-3" />
                    −{Math.round(col.signalWeight * 100)}% signal
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Full column table */}
          <div className="space-y-1">
            <div className="text-label font-semibold uppercase tracking-wide text-muted-foreground/50 mb-1">
              All columns ({summary.length})
            </div>
            <div className="rounded-md border border-border/30 divide-y divide-border/20">
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-label font-medium text-foreground/85 truncate">{col.canonical}</span>
                      {col.found_as && col.found_as !== col.canonical && (
                        <span className="text-label text-muted-foreground/50 font-mono truncate">← {col.found_as}</span>
                      )}
                    </div>
                  </div>
                  <TierBadge tier={col.tier} />
                  {col.tier !== "missing" && col.confidence < 1 ? (
                    <div className="w-20 shrink-0">
                      <ConfidenceBar value={col.confidence} />
                    </div>
                  ) : col.tier === "missing" ? (
                    <span className="text-label text-muted-foreground/40 w-20 shrink-0 text-right">—</span>
                  ) : (
                    <span className="text-label text-emerald-400/60 w-20 shrink-0 text-right">100%</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Confidence Report card rendered after a successful import.
 * Shows one grade card per staged performance CSV.
 * Pass the full imports list; non-CSV imports are silently ignored.
 */
export function ImportConfidenceReport({ imports }: { imports: ManualImport[] }) {
  // Deduplicate by kind — keep only the most recent upload per CSV type.
  // The server retains multiple rows for the same kind on re-uploads; without
  // deduplication the same CSV card repeats once per historical upload.
  const kindToImport = new Map<string, ManualImport>();
  for (const imp of imports) {
    if (
      (imp.kind === "performance_demo_csv" ||
        imp.kind === "performance_placement_csv" ||
        imp.kind === "performance_ad_summary_csv" ||
        imp.kind === "performance_conversion_device_csv") &&
      imp.mapping_summary &&
      imp.mapping_summary.length > 0
    ) {
      kindToImport.set(imp.kind, imp); // later entries win → most recent per kind
    }
  }
  const csvImports = Array.from(kindToImport.values());

  if (csvImports.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="text-caption font-semibold text-foreground/85">
          Import Confidence Report
        </div>
        <InfoTooltip content='Grade reflects weighted column coverage — columns with higher signal value carry more weight. Missing columns with a "−% signal" badge reduce analysis accuracy for this import.' />
      </div>
      {csvImports.map((imp) => (
        <SingleCsvConfidenceReport
          key={imp.id}
          imp={imp}
          defaultOpen={csvImports.length === 1}
        />
      ))}
    </div>
  );
}
