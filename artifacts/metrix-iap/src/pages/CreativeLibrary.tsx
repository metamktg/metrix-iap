import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Layers, TrendingUp, Activity, RefreshCw,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CREATIVE_CONCEPTS, CREATIVE_VARIABLES, ADS } from "@/lib/mock-data";
import type { ConfidenceLabel, PerformanceTier } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────

function confidenceChip(c: ConfidenceLabel) {
  const map: Record<ConfidenceLabel, string> = {
    high: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    medium: "bg-yellow-400/10 border-yellow-400/20 text-yellow-400",
    validation_required: "bg-orange-400/10 border-orange-400/20 text-orange-400",
    insufficient: "bg-muted border-border/40 text-muted-foreground",
  };
  const labels: Record<ConfidenceLabel, string> = {
    high: "High", medium: "Medium", validation_required: "Validate", insufficient: "Insufficient",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none", map[c])}>
      {labels[c]}
    </span>
  );
}

function tierBadge(t: PerformanceTier) {
  const colors = ["", "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", "text-orange-400 bg-orange-400/10 border-orange-400/20", "text-red-400 bg-red-500/10 border-red-500/20"];
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none", colors[t])}>T{t}</span>
  );
}

const FATIGUE_STYLES: Record<string, string> = {
  fresh: "text-emerald-400",
  mild_fatigue: "text-yellow-400",
  fatigued: "text-orange-400",
  burnt: "text-red-400",
};

const ACTION_STYLES: Record<string, string> = {
  Keep: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  Extend: "text-primary border-primary/20 bg-primary/10",
  Retire: "text-red-400 border-red-500/20 bg-red-500/10",
  Validate: "text-orange-400 border-orange-400/20 bg-orange-400/10",
};

const FAMILY_COLORS: Record<string, string> = {
  HK: "text-primary bg-primary/10 border-primary/20",
  FW: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  TN: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  CN: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  CTA: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
};

// ─── Performance index bar ─────────────────────────────────────────────

function PerfBar({ index }: { index: number }) {
  const pct = Math.min(100, (index / 200) * 100);
  const color = index >= 130 ? "bg-emerald-500" : index >= 100 ? "bg-primary" : index >= 70 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border/30 rounded-full h-1.5 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-[10px] font-mono font-semibold w-8 text-right", index >= 130 ? "text-emerald-400" : index >= 100 ? "text-foreground" : index >= 70 ? "text-yellow-400" : "text-red-400")}>
        {index}
      </span>
    </div>
  );
}

// ─── Concept Card ──────────────────────────────────────────────────────

function ConceptCard({ concept }: { concept: typeof CREATIVE_CONCEPTS[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground font-mono">{concept.cell_id}</span>
            {tierBadge(concept.tier)}
            {confidenceChip(concept.confidence)}
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none", ACTION_STYLES[concept.recommended_action])}>
              {concept.recommended_action}
            </span>
          </div>
          <p className="text-xs font-medium text-foreground leading-snug">{concept.name}</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{concept.stage}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className={FATIGUE_STYLES[concept.fatigue_state]}>{concept.fatigue_state.replace("_", " ")}</span>
          </div>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      </button>
      {open && (
        <div className="border-t border-border/30 px-4 py-3 space-y-3">
          <div className="text-[11px] text-muted-foreground leading-relaxed">{concept.iap_read}</div>
          <div className="grid grid-cols-2 gap-3 text-[10px]">
            <div>
              <div className="text-muted-foreground mb-1">Hook</div>
              <div className="font-mono text-foreground">{concept.hook_variable}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Tone</div>
              <div className="font-mono text-foreground">{concept.tone_variable}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Framework</div>
              <div className="font-mono text-foreground">{concept.framework_variable}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">CTA</div>
              <div className="font-mono text-foreground">{concept.cta_variable}</div>
            </div>
          </div>
          {concept.winning_segments.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Winning Segments</div>
              <div className="flex flex-wrap gap-1">
                {concept.winning_segments.map(s => (
                  <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-muted border border-border/30 text-muted-foreground">{s}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Primary Message</div>
            <p className="text-xs text-foreground font-medium">{concept.primary_message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CreativeLibrary ───────────────────────────────────────────────────

type SortKey = "performance_index" | "win_rate" | "usage_count";
type SortDir = "asc" | "desc";

export function CreativeLibrary() {
  const { currentWorkspace } = useWorkspace();

  const [tab, setTab] = useState<"variables" | "concepts" | "ads">("variables");
  const [sortKey, setSortKey] = useState<SortKey>("performance_index");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [familyFilter, setFamilyFilter] = useState<string>("All");
  const [tierFilter, setTierFilter] = useState<string>("All");

  const wsId = currentWorkspace?.id;

  // Variables
  const allVars = wsId
    ? CREATIVE_VARIABLES.filter(v => v.workspace_id === wsId)
    : CREATIVE_VARIABLES;

  const families = ["All", ...Array.from(new Set(CREATIVE_VARIABLES.map(v => v.family))).sort()];
  const filteredVars = allVars.filter(v => familyFilter === "All" || v.family === familyFilter);
  const sortedVars = [...filteredVars].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Concepts
  const allConcepts = wsId
    ? CREATIVE_CONCEPTS.filter(c => c.workspace_id === wsId)
    : CREATIVE_CONCEPTS;
  const filteredConcepts = tierFilter === "All"
    ? allConcepts
    : allConcepts.filter(c => String(c.tier) === tierFilter);

  // Ads
  const allAds = wsId
    ? ADS.filter(a => a.workspace_id === wsId)
    : ADS;
  const sortedAds = [...allAds].sort((a, b) => a.cpa_usd - b.cpa_usd).slice(0, 20);

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors group"
    >
      {label}
      {sortKey === col
        ? sortDir === "desc"
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronUp className="w-3 h-3" />
        : <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Creative Intelligence Library</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentWorkspace ? currentWorkspace.name : "All workspaces"} — variable codes, concept performance, active ads
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border/50">
          {[
            { id: "variables" as const, label: "Creative Variables", icon: <TrendingUp className="w-3.5 h-3.5" />, count: allVars.length },
            { id: "concepts" as const, label: "Creative Concepts", icon: <Layers className="w-3.5 h-3.5" />, count: allConcepts.length },
            { id: "ads" as const, label: "Active Ads", icon: <Activity className="w-3.5 h-3.5" />, count: allAds.length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all -mb-px",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              {t.label}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                tab === t.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Variables Tab ── */}
        {tab === "variables" && (
          <div className="space-y-4">
            {/* Family filter */}
            <div className="flex items-center gap-2 flex-wrap">
              {families.map(f => (
                <button
                  key={f}
                  onClick={() => setFamilyFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all",
                    familyFilter === f
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-transparent border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-border/50 bg-muted/20">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Code</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Label</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Family</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <SortBtn col="performance_index" label="Perf Index" />
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <SortBtn col="win_rate" label="Win Rate" />
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <SortBtn col="usage_count" label="Usage" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {sortedVars.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-xs text-muted-foreground">
                        No variable data for this workspace.
                      </td>
                    </tr>
                  ) : sortedVars.map(v => (
                    <tr key={v.id} className="hover:bg-white/3 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-mono font-semibold text-foreground">{v.code}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[11px] text-muted-foreground">{v.label}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none", FAMILY_COLORS[v.family] ?? "text-muted-foreground border-border/40")}>
                          {v.family}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 min-w-[140px]">
                        <PerfBar index={v.performance_index} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn(
                          "text-[11px] font-semibold",
                          v.win_rate >= 0.6 ? "text-emerald-400" : v.win_rate >= 0.4 ? "text-yellow-400" : "text-muted-foreground"
                        )}>
                          {Math.round(v.win_rate * 100)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-[11px] text-muted-foreground">{v.usage_count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Concepts Tab ── */}
        {tab === "concepts" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {["All", "1", "2", "3", "4"].map(t => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all",
                    tierFilter === t
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-transparent border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {t === "All" ? "All Tiers" : `Tier ${t}`}
                </button>
              ))}
            </div>
            {filteredConcepts.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">No concepts found.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredConcepts.map(c => <ConceptCard key={c.id} concept={c} />)}
              </div>
            )}
          </div>
        )}

        {/* ── Ads Tab ── */}
        {tab === "ads" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">Top 20 ads by CPA (lowest first). Active + Paused.</p>
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-border/50 bg-muted/20">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ad Name</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tier</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Conf</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">CPA</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Spend</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Format</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fatigue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {sortedAds.map(ad => (
                    <tr key={ad.id} className="hover:bg-white/3 transition-colors">
                      <td className="px-4 py-2.5 max-w-xs">
                        <p className="text-[11px] text-foreground truncate">{ad.name}</p>
                        <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">{ad.conversion_type}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center">{tierBadge(ad.tier)}</td>
                      <td className="px-3 py-2.5 text-center">{confidenceChip(ad.confidence)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "text-[11px] font-mono font-semibold",
                          ad.tier === 1 ? "text-emerald-400" : ad.tier === 4 ? "text-red-400" : "text-foreground"
                        )}>
                          ${ad.cpa_usd.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[11px] text-muted-foreground">${(ad.spend_usd / 1000).toFixed(1)}K</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[10px] text-muted-foreground">{ad.format ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("text-[10px]", FATIGUE_STYLES[ad.fatigue_signal ?? "fresh"])}>
                          {ad.fatigue_signal?.replace("_", " ") ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Variable stack leaderboard */}
            <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Top Variable Combinations</span>
              </div>
              <div className="space-y-2">
                {[
                  { stack: "HK_Authority + TN_Aspirational + FW_AIDA", usage: 12, avgCpa: 248 },
                  { stack: "HK_Curiosity + TN_Relatable + FW_ProblemSolution", usage: 8, avgCpa: 282 },
                  { stack: "HK_Benefit + TN_Rational + FW_BAB", usage: 9, avgCpa: 318 },
                  { stack: "HK_Urgency + TN_Assertive + FW_Direct", usage: 6, avgCpa: 296 },
                  { stack: "HK_Problem + TN_Deadpan + FW_PAS", usage: 5, avgCpa: 421 },
                ].map(row => (
                  <div key={row.stack} className="flex items-center gap-3 text-[11px]">
                    <span className="font-mono text-foreground flex-1 truncate">{row.stack}</span>
                    <span className="text-muted-foreground shrink-0">{row.usage}x used</span>
                    <span className={cn("font-semibold shrink-0", row.avgCpa <= 280 ? "text-emerald-400" : row.avgCpa <= 350 ? "text-yellow-400" : "text-orange-400")}>
                      ${row.avgCpa} avg CPA
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
