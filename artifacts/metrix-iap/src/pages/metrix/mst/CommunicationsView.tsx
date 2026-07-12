// ─── MST · Communications ─────────────────────────────────────────────
// Copy, variables, and audience resonance as first-class analytical
// dimensions: Copy Library, Variable Breakdown, Angle Prominence, and
// Audience × Communication segment resonance.

import { useState, useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount,
  getMST,
  getAnalysisData,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader,
  ScopeBanner,
  ModuleScopeGate,
  ModuleTabs,
  PendingState,
  readableVariables,
  fmtUSD,
  fmtNum,
  fmtPct,
  RangeScopeBar,
  NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMstRangeScope } from "@/lib/date-scope";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Tags,
  BarChart2,
  Users,
  AlertTriangle,
} from "lucide-react";
import type {
  CopyLibraryRow,
  MSTLibraryCell,
  DemographicRow,
  VariablePerformanceRow,
  VariableRegistryEntry,
} from "@/lib/data/seedTypes";

const SECTION = "MST · 07";

// ─── Formatting helpers ───────────────────────────────────────────────

function charCountLabel(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n} chars`;
}

// ─── Copy Library panel ───────────────────────────────────────────────

type CopyTypeFilter = "all" | string;
type CopySort = "usage" | "chars-asc" | "chars-desc" | "alpha";

function CopyLibraryPanel({ rows }: { rows: CopyLibraryRow[] }) {
  const [typeFilter, setTypeFilter] = useState<CopyTypeFilter>("all");
  const [sort, setSort] = useState<CopySort>("usage");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const copyTypes = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.copy_type ?? "other").filter(Boolean))).sort()],
    [rows],
  );

  const filtered = useMemo(() => {
    let list = typeFilter === "all" ? rows : rows.filter((r) => (r.copy_type ?? "other") === typeFilter);
    if (sort === "chars-asc") list = [...list].sort((a, b) => (a.char_count ?? 0) - (b.char_count ?? 0));
    else if (sort === "chars-desc") list = [...list].sort((a, b) => (b.char_count ?? 0) - (a.char_count ?? 0));
    else if (sort === "alpha") list = [...list].sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
    return list;
  }, [rows, typeFilter, sort]);

  if (rows.length === 0) {
    return (
      <PendingState
        title="No copy library data"
        message="The copy library populates from the local book2 library CSV import."
        icon={BookOpen}
      />
    );
  }

  const TYPE_COLORS: Record<string, string> = {
    headline: "border-blue-400/30 bg-blue-400/[0.06] text-blue-300",
    primary: "border-violet-400/30 bg-violet-400/[0.06] text-violet-300",
    cta: "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300",
    overlay: "border-amber-400/30 bg-amber-400/[0.06] text-amber-300",
  };
  const typeColor = (t: string | null | undefined) =>
    TYPE_COLORS[t?.toLowerCase() ?? ""] ?? "border-border/40 bg-white/[0.02] text-muted-foreground/70";

  const SORT_OPTS: { id: CopySort; label: string }[] = [
    { id: "usage", label: "Usage" },
    { id: "chars-desc", label: "Longest" },
    { id: "chars-asc", label: "Shortest" },
    { id: "alpha", label: "A → Z" },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {copyTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "text-[10px] font-medium px-2.5 py-1 rounded-md border transition-colors",
                typeFilter === t
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground/60 hover:text-muted-foreground/80 hover:border-border/60",
              )}
            >
              {t === "all" ? "All types" : t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {SORT_OPTS.map((o) => (
            <button
              key={o.id}
              onClick={() => setSort(o.id)}
              className={cn(
                "text-[10px] font-mono px-2 py-1 rounded border transition-colors",
                sort === o.id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground/50 hover:text-muted-foreground/70",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/60">
        {filtered.length} copy unit{filtered.length !== 1 ? "s" : ""}
        {typeFilter !== "all" ? ` · ${typeFilter}` : ""}
      </p>

      {/* Copy rows */}
      <div className="space-y-2">
        {filtered.map((row) => {
          const isExpanded = expandedCode === row.code;
          const truncated = (row.copy ?? "").length > 160 && !isExpanded;
          const display = truncated ? (row.copy ?? "").slice(0, 160) + "…" : (row.copy ?? "");
          return (
            <div
              key={row.code}
              className="rounded-lg border border-border/40 bg-white/[0.02] px-4 py-3 space-y-2"
            >
              <div className="flex items-start gap-2 flex-wrap">
                <span className="font-mono text-[11px] text-foreground/80 shrink-0">{row.code}</span>
                {row.copy_type && (
                  <span className={cn("text-[9px] font-medium border rounded px-1.5 py-0.5 leading-none", typeColor(row.copy_type))}>
                    {row.copy_type}
                  </span>
                )}
                {row.scope && (
                  <span className="text-[9px] font-mono text-muted-foreground/50 border border-border/30 rounded px-1.5 py-0.5 leading-none">
                    {row.scope}
                  </span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono">{charCountLabel(row.char_count)}</span>
              </div>
              {display && (
                <p className="text-[12px] text-foreground/80 leading-relaxed">
                  {display}
                  {truncated && (
                    <button
                      onClick={() => setExpandedCode(row.code)}
                      className="ml-1 text-[10px] text-primary/70 hover:text-primary underline-offset-2 hover:underline"
                    >
                      show more
                    </button>
                  )}
                  {isExpanded && (row.copy ?? "").length > 160 && (
                    <button
                      onClick={() => setExpandedCode(null)}
                      className="ml-1 text-[10px] text-primary/70 hover:text-primary underline-offset-2 hover:underline"
                    >
                      show less
                    </button>
                  )}
                </p>
              )}
              {row.usage && (
                <p className="text-[10px] text-muted-foreground/50 font-mono">
                  Usage: {row.usage}
                </p>
              )}
              {row.notes && (
                <p className="text-[10px] text-muted-foreground/50 italic">{row.notes}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Variable Breakdown panel ─────────────────────────────────────────

interface VarFamilyGroup {
  family: string;
  registryMissing: boolean;
  rows: VariablePerformanceRow[];
  totalSpend: number;
  totalResults: number;
  avgCpa: number | null;
  avgCtr: number | null;
}

function VariableBreakdownPanel({
  rows,
  registry,
}: {
  rows: VariablePerformanceRow[];
  registry: VariableRegistryEntry[];
}) {
  const [activeFamily, setActiveFamily] = useState<string | null>(null);

  const missingPrefixes = useMemo(
    () => new Set(registry.filter((r) => r.status === "registry_missing").map((r) => r.prefix)),
    [registry],
  );

  const isMissingPrefix = (varId: string) => {
    const prefix = varId.split("_")[0] ?? "";
    return missingPrefixes.has(prefix);
  };

  const familyGroups = useMemo<VarFamilyGroup[]>(() => {
    const map = new Map<string, VariablePerformanceRow[]>();
    for (const r of rows) {
      const key = r.variable_family;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([family, fRows]) => {
        const spend = fRows.reduce((s, r) => s + (r["Amount spent (USD)"] ?? 0), 0);
        const results = fRows.reduce((s, r) => s + (r.Results ?? 0), 0);
        const cpaRows = fRows.filter((r) => r.CPA_result != null);
        const avgCpa = cpaRows.length > 0 ? cpaRows.reduce((s, r) => s + r.CPA_result!, 0) / cpaRows.length : null;
        const ctrRows = fRows.filter((r) => r.CTR_link_pct != null);
        const avgCtr = ctrRows.length > 0 ? ctrRows.reduce((s, r) => s + r.CTR_link_pct, 0) / ctrRows.length : null;
        const registryMissing = fRows.every((r) => isMissingPrefix(r.variable_id));
        return { family, registryMissing, rows: fRows, totalSpend: spend, totalResults: results, avgCpa, avgCtr };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [rows, missingPrefixes]);

  if (rows.length === 0) {
    return (
      <PendingState
        title="No variable performance data"
        message="Variable performance populates from the IAP loop analysis run."
        icon={Tags}
      />
    );
  }

  const shown = activeFamily ? familyGroups.find((g) => g.family === activeFamily) : null;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground/60">
        Aggregated performance per variable family. Click a family to drill into its individual variables.
      </p>

      {/* Family cards */}
      <div className="space-y-2">
        {familyGroups.map((g) => (
          <button
            key={g.family}
            onClick={() => setActiveFamily(activeFamily === g.family ? null : g.family)}
            className={cn(
              "w-full text-left rounded-lg border px-4 py-3 transition-colors",
              activeFamily === g.family
                ? "border-primary/40 bg-primary/[0.04]"
                : "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.03]",
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12px] font-semibold text-foreground/90">{g.family}</span>
              <span className="text-[10px] font-mono text-muted-foreground/55 border border-border/30 rounded px-1.5 py-0.5">
                {g.rows.length} variable{g.rows.length !== 1 ? "s" : ""}
              </span>
              {g.registryMissing && (
                <span className="flex items-center gap-1 text-[9px] font-medium border border-amber-400/30 bg-amber-400/[0.06] text-amber-300 rounded px-1.5 py-0.5">
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  data gap
                </span>
              )}
              <span className="ml-auto text-[11px] font-semibold tabular-nums text-foreground/80">
                {fmtUSD(g.totalSpend)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Results", value: fmtNum(g.totalResults) },
                { label: "Avg CPA", value: g.avgCpa != null ? fmtUSD(g.avgCpa) : "—" },
                { label: "Avg CTR", value: g.avgCtr != null ? fmtPct(g.avgCtr) : "—" },
              ].map((kpi) => (
                <div key={kpi.label} className="text-center">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">{kpi.label}</div>
                  <div className="text-[11px] font-semibold tabular-nums text-foreground/80 mt-0.5">{kpi.value}</div>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Drill-down: individual variables for the active family */}
      {shown && (
        <div className="rounded-xl border border-border/40 bg-white/[0.015] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-foreground/90">{shown.family} — variables</span>
            {shown.registryMissing && (
              <span className="text-[9px] text-amber-300/70 font-mono">registry_missing — meanings unconfirmed</span>
            )}
          </div>
          <div className="divide-y divide-border/20">
            {shown.rows
              .sort((a, b) => (b["Amount spent (USD)"] ?? 0) - (a["Amount spent (USD)"] ?? 0))
              .map((r) => (
                <div key={r.variable_id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-foreground/90 leading-tight">
                      {readableVariables(r.variable_id)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground/55 mt-0.5">{r.variable_id}</div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] tabular-nums shrink-0 flex-wrap">
                    <span className="text-foreground/80 font-semibold">{fmtUSD(r["Amount spent (USD)"])}</span>
                    <span className="text-muted-foreground/60">{fmtNum(r.Results)} results</span>
                    <span className="text-muted-foreground/60">{r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"} CPA</span>
                    <span className="text-muted-foreground/60">{fmtPct(r.CTR_link_pct)} CTR</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Angle Prominence panel ───────────────────────────────────────────

interface AngleGroup {
  conceptCode: string;
  conceptName: string;
  angle: string;
  cellCount: number;
  spend: number;
  results: number;
}

function AngleProminencePanel({
  library,
  perfRows,
}: {
  library: MSTLibraryCell[];
  perfRows: { cell_id: string; "Amount spent (USD)": number; Results: number }[];
}) {
  const [sortBy, setSortBy] = useState<"spend" | "results" | "count">("spend");

  const perfByCell = useMemo(() => {
    const map = new Map<string, { spend: number; results: number }>();
    for (const r of perfRows) {
      const prev = map.get(r.cell_id);
      if (prev) {
        prev.spend += r["Amount spent (USD)"] ?? 0;
        prev.results += r.Results ?? 0;
      } else {
        map.set(r.cell_id, { spend: r["Amount spent (USD)"] ?? 0, results: r.Results ?? 0 });
      }
    }
    return map;
  }, [perfRows]);

  const groups = useMemo<AngleGroup[]>(() => {
    const map = new Map<string, AngleGroup>();
    for (const cell of library) {
      const concept = cell.concept_variable ?? cell.book2_concept_name ?? cell.cell_id;
      const angle =
        [cell.hook_variable, cell.tone_variable, cell.framework_variable]
          .filter(Boolean)
          .join(" + ") || "—";
      const key = `${concept}:::${angle}`;
      const perf = perfByCell.get(cell.cell_id) ?? { spend: 0, results: 0 };
      const prev = map.get(key);
      if (prev) {
        prev.cellCount += 1;
        prev.spend += perf.spend;
        prev.results += perf.results;
      } else {
        map.set(key, {
          conceptCode: concept,
          conceptName: readableVariables(concept),
          angle,
          cellCount: 1,
          spend: perf.spend,
          results: perf.results,
        });
      }
    }
    let arr = Array.from(map.values());
    if (sortBy === "spend") arr = arr.sort((a, b) => b.spend - a.spend);
    else if (sortBy === "results") arr = arr.sort((a, b) => b.results - a.results);
    else arr = arr.sort((a, b) => b.cellCount - a.cellCount);
    return arr;
  }, [library, perfByCell, sortBy]);

  if (library.length === 0) {
    return (
      <PendingState
        title="No library cells"
        message="Angle prominence derives from the Creative Scan library — run a scan first."
        icon={BarChart2}
      />
    );
  }

  const maxSpend = Math.max(...groups.map((g) => g.spend), 1);

  const SORT_OPTS: { id: "spend" | "results" | "count"; label: string }[] = [
    { id: "spend", label: "Spend ↓" },
    { id: "results", label: "Results ↓" },
    { id: "count", label: "Cells ↓" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <p className="text-[11px] text-muted-foreground/60">
          Concept × Angle combinations across live cells, ranked by performance.
        </p>
        <div className="flex items-center gap-1">
          {SORT_OPTS.map((o) => (
            <button
              key={o.id}
              onClick={() => setSortBy(o.id)}
              className={cn(
                "text-[10px] font-mono px-2 py-1 rounded border transition-colors",
                sortBy === o.id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground/50 hover:text-muted-foreground/70",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {groups.map((g, i) => {
          const barW = maxSpend > 0 ? Math.round((g.spend / maxSpend) * 100) : 0;
          return (
            <div key={g.conceptCode + g.angle} className="rounded-lg border border-border/40 bg-white/[0.02] px-4 py-3 space-y-2">
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-foreground/90 leading-tight">{g.conceptName}</div>
                  <div className="text-[10px] font-mono text-muted-foreground/55 mt-0.5">{g.conceptCode}</div>
                  <div className="text-[11px] text-muted-foreground/70 mt-1 leading-snug">{g.angle}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] font-semibold tabular-nums text-foreground/80">{fmtUSD(g.spend)}</div>
                  <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">{fmtNum(g.results)} results</div>
                  <div className="text-[10px] font-mono text-muted-foreground/45 mt-0.5">{g.cellCount} cell{g.cellCount !== 1 ? "s" : ""}</div>
                </div>
              </div>
              {g.spend > 0 && (
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full rounded-full bg-primary/40 transition-all duration-500" style={{ width: `${barW}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Audience × Communication panel ──────────────────────────────────

type AudCommMetric = "cpa" | "ctr";

interface AudRow {
  varValue: string;
  varLabel: string;
  segments: Record<string, { cpa: number | null; ctr: number | null; spend: number }>;
}

function AudienceCommPanel({
  demoRows,
  library,
}: {
  demoRows: DemographicRow[];
  library: MSTLibraryCell[];
}) {
  const [metric, setMetric] = useState<AudCommMetric>("cpa");
  const [varFamily, setVarFamily] = useState<string>("hook_variable");

  const FAMILIES: { key: keyof MSTLibraryCell; label: string }[] = [
    { key: "hook_variable", label: "Hook" },
    { key: "tone_variable", label: "Tone" },
    { key: "framework_variable", label: "Framework" },
    { key: "concept_variable", label: "Concept" },
    { key: "proof_variable", label: "Proof" },
    { key: "cta_variable", label: "CTA" },
  ];

  // Build cell_id → variable value map for the selected family
  const cellVarMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of library) {
      const val = cell[varFamily as keyof MSTLibraryCell] as string | undefined;
      if (val) map.set(cell.cell_id, val);
    }
    return map;
  }, [library, varFamily]);

  // Collect all age×gender segment keys
  const segments = useMemo(() => {
    const set = new Set<string>();
    for (const r of demoRows) {
      if (r.Age && r.Gender) set.add(`${r.Age} · ${r.Gender}`);
    }
    return Array.from(set).sort((a, b) => {
      const ageA = parseInt(a.split("·")[0] ?? "0") || 999;
      const ageB = parseInt(b.split("·")[0] ?? "0") || 999;
      return ageA - ageB || a.localeCompare(b);
    });
  }, [demoRows]);

  // Build variable value → segment → aggregated metrics
  const audRows = useMemo<AudRow[]>(() => {
    const map = new Map<string, { spend: Map<string, number>; cpaSum: Map<string, { sum: number; count: number }>; ctrSum: Map<string, { sum: number; count: number }> }>();

    for (const r of demoRows) {
      const varVal = cellVarMap.get(r.cell_id);
      if (!varVal) continue;
      const seg = `${r.Age} · ${r.Gender}`;
      if (!map.has(varVal)) {
        map.set(varVal, { spend: new Map(), cpaSum: new Map(), ctrSum: new Map() });
      }
      const entry = map.get(varVal)!;
      entry.spend.set(seg, (entry.spend.get(seg) ?? 0) + (r["Amount spent (USD)"] ?? 0));
      if (r.CPA_result != null) {
        const prev = entry.cpaSum.get(seg) ?? { sum: 0, count: 0 };
        entry.cpaSum.set(seg, { sum: prev.sum + r.CPA_result, count: prev.count + 1 });
      }
      if (r.CTR_link_pct != null) {
        const prev = entry.ctrSum.get(seg) ?? { sum: 0, count: 0 };
        entry.ctrSum.set(seg, { sum: prev.sum + r.CTR_link_pct, count: prev.count + 1 });
      }
    }

    return Array.from(map.entries())
      .map(([varVal, data]) => ({
        varValue: varVal,
        varLabel: readableVariables(varVal),
        segments: Object.fromEntries(
          segments.map((seg) => [
            seg,
            {
              cpa: data.cpaSum.has(seg) ? data.cpaSum.get(seg)!.sum / data.cpaSum.get(seg)!.count : null,
              ctr: data.ctrSum.has(seg) ? data.ctrSum.get(seg)!.sum / data.ctrSum.get(seg)!.count : null,
              spend: data.spend.get(seg) ?? 0,
            },
          ]),
        ),
      }))
      .sort((a, b) => {
        const spA = segments.reduce((s, seg) => s + (a.segments[seg]?.spend ?? 0), 0);
        const spB = segments.reduce((s, seg) => s + (b.segments[seg]?.spend ?? 0), 0);
        return spB - spA;
      });
  }, [demoRows, cellVarMap, segments]);

  // Compute per-segment best/worst for color coding
  const { segBest, segWorst } = useMemo(() => {
    const best = new Map<string, number>();
    const worst = new Map<string, number>();
    for (const seg of segments) {
      const vals = audRows
        .map((r) => (metric === "cpa" ? r.segments[seg]?.cpa : r.segments[seg]?.ctr))
        .filter((v): v is number => v != null);
      if (vals.length === 0) continue;
      if (metric === "cpa") {
        best.set(seg, Math.min(...vals));
        worst.set(seg, Math.max(...vals));
      } else {
        best.set(seg, Math.max(...vals));
        worst.set(seg, Math.min(...vals));
      }
    }
    return { segBest: best, segWorst: worst };
  }, [audRows, segments, metric]);

  const cellColor = (val: number | null, seg: string): string => {
    if (val == null) return "";
    const best = segBest.get(seg);
    const worst = segWorst.get(seg);
    if (best == null || worst == null || best === worst) return "";
    const range = Math.abs(worst - best);
    const distFromBest = Math.abs(val - best);
    const ratio = range > 0 ? distFromBest / range : 0;
    if (ratio < 0.25) return "bg-emerald-400/[0.12] text-emerald-300";
    if (ratio > 0.75) return "bg-rose-400/[0.10] text-rose-300/90";
    return "";
  };

  const hasDemoData = demoRows.length > 0;
  const hasCellMapping = audRows.length > 0;

  if (!hasDemoData) {
    return (
      <PendingState
        title="No demographic signal"
        message="Import a demographic pivot export to see audience × communication resonance."
        icon={Users}
      />
    );
  }

  if (!hasCellMapping) {
    return (
      <PendingState
        title="No variable mapping for this family"
        message="Select a different variable family, or run the Creative Scan to map cells."
        icon={Users}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wide mr-1">Variable</span>
          {FAMILIES.map((f) => (
            <button
              key={f.key}
              onClick={() => setVarFamily(f.key)}
              className={cn(
                "text-[10px] font-medium px-2 py-1 rounded border transition-colors",
                varFamily === f.key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground/55 hover:text-muted-foreground/75",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded border border-border/30 overflow-hidden text-[9px]">
          {(["cpa", "ctr"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "px-3 py-1 font-mono uppercase tracking-wide transition-colors",
                metric === m ? "bg-white/10 text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground/70",
              )}
            >
              {m === "cpa" ? "CPA" : "CTR"}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground/50 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-400/[0.12] border border-emerald-400/20 inline-block" />
          Best in column
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-rose-400/[0.10] border border-rose-400/20 inline-block" />
          Worst in column
        </span>
        <span className="ml-auto">Cell = avg {metric === "cpa" ? "CPA" : "Link CTR"} for that variable × segment</span>
      </div>

      {/* Table — horizontally scrollable */}
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/30 bg-white/[0.02]">
              <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wide text-muted-foreground/50 sticky left-0 bg-[hsl(var(--background))] z-10 min-w-[160px]">
                Variable
              </th>
              {segments.map((seg) => (
                <th
                  key={seg}
                  className="px-2 py-2 text-center text-[9px] font-mono uppercase tracking-wide text-muted-foreground/50 whitespace-nowrap min-w-[80px]"
                >
                  {seg}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {audRows.map((row) => (
              <tr key={row.varValue} className="hover:bg-white/[0.015] transition-colors">
                <td className="px-3 py-2.5 sticky left-0 bg-[hsl(var(--background))] z-10 border-r border-border/20">
                  <div className="font-medium text-foreground/85 leading-tight">{row.varLabel}</div>
                  <div className="text-[9px] font-mono text-muted-foreground/45 mt-0.5">{row.varValue}</div>
                </td>
                {segments.map((seg) => {
                  const cell = row.segments[seg];
                  const val = metric === "cpa" ? cell?.cpa : cell?.ctr;
                  const display = val != null ? (metric === "cpa" ? fmtUSD(val) : fmtPct(val)) : "—";
                  return (
                    <td
                      key={seg}
                      className={cn(
                        "px-2 py-2.5 text-center tabular-nums rounded-sm transition-colors",
                        val != null ? cellColor(val, seg) : "text-muted-foreground/30",
                      )}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {audRows.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center py-4">
          No data available for this variable family.
        </p>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

type CommTab = "copy" | "variables" | "angles" | "audience";

export function CommunicationsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<CommTab>("copy");
  const { rangeHasData, range } = useDateRange();
  const { mstRange, mstInRange } = useMstRangeScope(
    getMST(seed, adAccountId),
    getAnalysisData(seed, adAccountId),
  );

  return (
    <ModuleScopeGate section={SECTION} title="Communications" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);

        const copyLibrary = mst?.copy_library ?? [];
        const variablePerf = analysis?.v3_variable_performance ?? [];
        const library = mst?.local_book2_library ?? [];
        const demoRows = analysis?.demographic_registration_signal ?? [];
        const registry = seed.variable_registry ?? [];

        const hasCopy = copyLibrary.length > 0;
        const hasVars = variablePerf.length > 0;
        const hasLibrary = library.length > 0;
        const hasDemo = demoRows.length > 0;

        const TABS: { id: CommTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = [
          { id: "copy", label: "Copy Library", count: copyLibrary.length, Icon: BookOpen },
          { id: "variables", label: "Variable Breakdown", count: variablePerf.length, Icon: Tags },
          { id: "angles", label: "Angle Prominence", count: library.length, Icon: BarChart2 },
          { id: "audience", label: "Audience × Communication", count: demoRows.length, Icon: Users },
        ];

        const hasAnyData = hasCopy || hasVars || hasLibrary || hasDemo;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Communications"
              subtitle="Copy units, creative variables, angle prominence, and audience resonance."
              table="copy_library, v3_variable_performance, local_book2_library, demographic_registration_signal"
            />
            <ScopeBanner account={acct} />
            <ModuleTabs
              tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: t.count, Icon: t.Icon }))}
              active={tab}
              onChange={(id) => setTab(id as CommTab)}
            />
            <RangeScopeBar grainNote="Communications data reflects the full imported library — this import has no daily grain." />

            {!rangeHasData || !mstInRange ? (
              <NoDataInRangeState
                what="communications data"
                detail={
                  !mstInRange && mstRange && range
                    ? `The selected range does not overlap this account's MST data window.`
                    : undefined
                }
              />
            ) : !hasAnyData ? (
              <PendingState
                title="No communications data yet"
                message={mst?.render_policy ?? "Communications data populates once the creative scan and analysis run."}
                icon={BookOpen}
              />
            ) : (
              <div className="px-6 py-5 space-y-4">
                {tab === "copy" && (
                  <CopyLibraryPanel rows={copyLibrary} />
                )}
                {tab === "variables" && (
                  <VariableBreakdownPanel rows={variablePerf} registry={registry} />
                )}
                {tab === "angles" && (
                  <AngleProminencePanel
                    library={library}
                    perfRows={analysis?.performance_by_cell ?? []}
                  />
                )}
                {tab === "audience" && (
                  <AudienceCommPanel demoRows={demoRows} library={library} />
                )}
              </div>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
