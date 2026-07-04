import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Layers, TrendingUp, Activity, RefreshCw, ChevronDown, ChevronUp,
  Flame, CheckCircle2, RotateCcw, AlertCircle,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CREATIVE_CONCEPTS, CREATIVE_VARIABLES, ADS } from "@/lib/mock-data";
import type { ConfidenceLabel, PerformanceTier, CreativeConcept } from "@/lib/types";

// ─── Chip helpers ──────────────────────────────────────────────────────

function ConfidenceChip({ c }: { c: ConfidenceLabel }) {
  const map: Record<ConfidenceLabel, string> = {
    high: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    medium: "bg-yellow-400/10 border-yellow-400/20 text-yellow-400",
    validation_required: "bg-orange-400/10 border-orange-400/20 text-orange-400",
    insufficient: "bg-muted/50 border-border/40 text-muted-foreground",
  };
  const labels: Record<ConfidenceLabel, string> = {
    high: "High", medium: "Med", validation_required: "Validate", insufficient: "Insuff.",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none", map[c])}>
      {labels[c]}
    </span>
  );
}

function PerfBadge({ t }: { t: PerformanceTier }) {
  const colors = [
    "",
    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    "text-orange-400 bg-orange-400/10 border-orange-400/20",
    "text-red-400 bg-red-500/10 border-red-500/20",
  ];
  const labels = ["", "P1 — Top", "P2 — Strong", "P3 — Developing", "P4 — At Risk"];
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none", colors[t])}>
      {labels[t]}
    </span>
  );
}

function ActionChip({ a }: { a: CreativeConcept["recommended_action"] }) {
  const s: Record<string, string> = {
    Keep: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    Extend: "text-primary border-primary/20 bg-primary/10",
    Retire: "text-red-400 border-red-500/20 bg-red-500/10",
    Validate: "text-orange-400 border-orange-400/20 bg-orange-400/10",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none", s[a])}>
      {a}
    </span>
  );
}

const FATIGUE_STYLES: Record<string, string> = {
  fresh: "text-emerald-400",
  mild_fatigue: "text-yellow-400",
  fatigued: "text-orange-400",
  burnt: "text-red-400",
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
  const color =
    index >= 130 ? "bg-emerald-500" : index >= 100 ? "bg-primary" : index >= 70 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border/30 rounded-full h-1 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={cn(
          "text-[10px] font-mono font-semibold w-8 text-right",
          index >= 130 ? "text-emerald-400" : index >= 100 ? "text-foreground" : index >= 70 ? "text-yellow-400" : "text-red-400"
        )}
      >
        {index}
      </span>
    </div>
  );
}

// ─── Angle Row (within a concept group) ───────────────────────────────

function AngleRow({ concept, last }: { concept: CreativeConcept; last: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("border-t border-border/20", last && !open && "rounded-b-xl overflow-hidden")}>
      <button
        className={cn(
          "w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.03] transition-colors",
        )}
        onClick={() => setOpen(o => !o)}
      >
        {/* Cell ID */}
        <span className="text-[11px] font-mono font-bold text-foreground/70 w-10 shrink-0">
          {concept.cell_id}
        </span>

        {/* Name + stage */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground truncate">{concept.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{concept.stage}</p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <PerfBadge t={concept.tier} />
          <ConfidenceChip c={concept.confidence} />
          <ActionChip a={concept.recommended_action} />
          <span className={cn("text-[10px] ml-1", FATIGUE_STYLES[concept.fatigue_state])}>
            {concept.fatigue_state.replace("_", " ")}
          </span>
          {open ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground ml-1" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground ml-1" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 space-y-3 bg-muted/[0.03]">
          <p className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
            {concept.iap_read}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Hook", value: concept.hook_variable },
              { label: "Framework", value: concept.framework_variable },
              { label: "Tone", value: concept.tone_variable },
              { label: "CTA", value: concept.cta_variable },
            ].map(f => (
              <div key={f.label}>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">{f.label}</div>
                <div className="text-[10px] font-mono text-foreground">{f.value}</div>
              </div>
            ))}
          </div>
          {concept.winning_segments.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground mr-1">Winning:</span>
              {concept.winning_segments.map(s => (
                <span
                  key={s}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-border/30 bg-muted/30 text-muted-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Primary Message</div>
            <p className="text-[11px] text-foreground font-medium">{concept.primary_message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Concept Group card ────────────────────────────────────────────────

interface ConceptGroup {
  concept_id: string;
  name: string;
  angles: CreativeConcept[];
}

function ConceptGroupCard({ group }: { group: ConceptGroup }) {
  const [open, setOpen] = useState(false);

  const topPerf = group.angles.filter(a => a.tier === 1).length;
  const atRisk = group.angles.filter(a => a.tier === 4).length;
  const actions = group.angles.reduce<Record<string, number>>((acc, a) => {
    acc[a.recommended_action] = (acc[a.recommended_action] ?? 0) + 1;
    return acc;
  }, {});
  const bestTier = Math.min(...group.angles.map(a => a.tier)) as PerformanceTier;

  return (
    <div className={cn(
      "bg-card border rounded-xl overflow-hidden transition-all",
      bestTier === 1
        ? "border-emerald-500/25"
        : bestTier === 4
        ? "border-red-500/15"
        : "border-border/60",
    )}>
      {/* Header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {/* Left accent */}
        <div
          className={cn(
            "w-1 h-10 rounded-full shrink-0",
            bestTier === 1 ? "bg-emerald-500" : bestTier === 2 ? "bg-yellow-400" : bestTier === 3 ? "bg-orange-400" : "bg-red-500"
          )}
        />

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold font-mono text-primary/80 shrink-0">
              {group.concept_id}
            </span>
            <span className="text-xs font-semibold text-foreground leading-snug truncate">
              {group.name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{group.angles.length} angle{group.angles.length !== 1 ? "s" : ""}</span>
            {topPerf > 0 && (
              <span className="flex items-center gap-0.5 text-emerald-400">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {topPerf} top
              </span>
            )}
            {atRisk > 0 && (
              <span className="flex items-center gap-0.5 text-red-400">
                <Flame className="w-2.5 h-2.5" />
                {atRisk} at risk
              </span>
            )}
            <span className="text-muted-foreground/30">·</span>
            {Object.entries(actions).map(([action, count]) => (
              <span key={action} className="text-muted-foreground">
                {count} {action.toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PerfBadge t={bestTier} />
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Angles table */}
      {open && (
        <div className="border-t border-border/30">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-5 py-2 border-b border-border/20 bg-muted/10">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide w-10 shrink-0">
              Angle
            </span>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide flex-1">
              Creative Name / Stage
            </span>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
              Performance · Confidence · Action · Fatigue
            </span>
          </div>

          {/* Angle rows */}
          {group.angles.map((angle, i) => (
            <AngleRow key={angle.id} concept={angle} last={i === group.angles.length - 1} />
          ))}
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

  const [tab, setTab] = useState<"variables" | "concepts" | "ads">("concepts");
  const [sortKey, setSortKey] = useState<SortKey>("performance_index");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [familyFilter, setFamilyFilter] = useState<string>("All");
  const [actionFilter, setActionFilter] = useState<string>("All");

  const wsId = currentWorkspace?.id;

  // ── Variables ──────────────────────────────────────────────────────
  const allVars = wsId ? CREATIVE_VARIABLES.filter(v => v.workspace_id === wsId) : CREATIVE_VARIABLES;
  const families = ["All", ...Array.from(new Set(CREATIVE_VARIABLES.map(v => v.family))).sort()];
  const filteredVars = allVars.filter(v => familyFilter === "All" || v.family === familyFilter);
  const sortedVars = [...filteredVars].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // ── Concepts — grouped by concept_id ───────────────────────────────
  const allConcepts = wsId ? CREATIVE_CONCEPTS.filter(c => c.workspace_id === wsId) : CREATIVE_CONCEPTS;

  const filteredConcepts =
    actionFilter === "All" ? allConcepts : allConcepts.filter(c => c.recommended_action === actionFilter);

  // Group by concept_id
  const groupMap = new Map<string, ConceptGroup>();
  for (const c of filteredConcepts) {
    if (!groupMap.has(c.concept_id)) {
      groupMap.set(c.concept_id, { concept_id: c.concept_id, name: c.name, angles: [] });
    }
    groupMap.get(c.concept_id)!.angles.push(c);
  }
  const conceptGroups = Array.from(groupMap.values()).sort((a, b) =>
    a.concept_id.localeCompare(b.concept_id)
  );

  // ── Ads ─────────────────────────────────────────────────────────────
  const allAds = wsId ? ADS.filter(a => a.workspace_id === wsId) : ADS;
  const sortedAds = [...allAds].sort((a, b) => a.cpa_usd - b.cpa_usd).slice(0, 20);

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors group"
    >
      {label}
      {sortKey === col ? (
        sortDir === "desc" ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronUp className="w-3 h-3" />
        )
      ) : (
        <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />
      )}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Creative Intelligence Library</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentWorkspace ? currentWorkspace.name : "All workspaces"} — variable codes, concept performance, active ads
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border/50">
          {[
            { id: "concepts" as const, label: "Creative Concepts", icon: <Layers className="w-3.5 h-3.5" />, count: allConcepts.length },
            { id: "variables" as const, label: "Variable Library", icon: <TrendingUp className="w-3.5 h-3.5" />, count: allVars.length },
            { id: "ads" as const, label: "Active Ads", icon: <Activity className="w-3.5 h-3.5" />, count: allAds.length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all -mb-px",
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              {t.label}
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                  tab === t.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Concepts Tab ─────────────────────────────────────────────── */}
        {tab === "concepts" && (
          <div className="space-y-4">

            {/* Explainer */}
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
              <AlertCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Concepts are grouped by creative family (C1, C2…). Each family contains multiple <strong className="text-foreground">angles</strong> (C1A, C1B…) — distinct creative approaches within the same strategic concept. Within each angle, relaunches and setup variants are tracked as iterations.{" "}
                <strong className="text-foreground">P1–P4</strong> denotes performance classification, not relaunch sequence.
              </p>
            </div>

            {/* Action filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-medium">Filter:</span>
              {["All", "Keep", "Extend", "Validate", "Retire"].map(a => (
                <button
                  key={a}
                  onClick={() => setActionFilter(a)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all",
                    actionFilter === a
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-transparent border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {a === "All" ? "All Actions" : a}
                </button>
              ))}
            </div>

            {/* Summary strip */}
            {conceptGroups.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {(["Keep", "Extend", "Validate", "Retire"] as const).map(action => {
                  const count = allConcepts.filter(c => c.recommended_action === action).length;
                  const colors: Record<string, string> = {
                    Keep: "text-emerald-400",
                    Extend: "text-primary",
                    Validate: "text-orange-400",
                    Retire: "text-red-400",
                  };
                  const icons: Record<string, React.ReactNode> = {
                    Keep: <CheckCircle2 className="w-3 h-3" />,
                    Extend: <TrendingUp className="w-3 h-3" />,
                    Validate: <RotateCcw className="w-3 h-3" />,
                    Retire: <Flame className="w-3 h-3" />,
                  };
                  return (
                    <button
                      key={action}
                      onClick={() => setActionFilter(action)}
                      className="bg-card border border-border/50 rounded-xl px-4 py-3 text-left hover:border-border transition-all"
                    >
                      <div className={cn("flex items-center gap-1.5 text-lg font-bold", colors[action])}>
                        {icons[action]}
                        {count}
                      </div>
                      <div className="text-[10px] font-medium text-foreground mt-0.5">{action}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Concept groups */}
            {conceptGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Layers className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No concepts found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conceptGroups.map(group => (
                  <ConceptGroupCard key={group.concept_id} group={group} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Variables Tab ─────────────────────────────────────────── */}
        {tab === "variables" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-medium">Family:</span>
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

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-border/50 bg-muted/20">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Code
                    </th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Label
                    </th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Family
                    </th>
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
                  ) : (
                    sortedVars.map(v => (
                      <tr key={v.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] font-mono font-semibold text-foreground">{v.code}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[11px] text-muted-foreground">{v.label}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none",
                              FAMILY_COLORS[v.family] ?? "text-muted-foreground border-border/40"
                            )}
                          >
                            {v.family}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 min-w-[140px]">
                          <PerfBar index={v.performance_index} />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={cn(
                              "text-[11px] font-semibold",
                              v.win_rate >= 0.6 ? "text-emerald-400" : v.win_rate >= 0.4 ? "text-yellow-400" : "text-muted-foreground"
                            )}
                          >
                            {Math.round(v.win_rate * 100)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-[11px] text-muted-foreground">{v.usage_count}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Ads Tab ──────────────────────────────────────────────── */}
        {tab === "ads" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Top 20 ads by CPA (lowest first). Active + Paused. Ad naming convention: <code className="font-mono text-foreground/70 text-[10px]">CONCEPT_ANGLE — Description | T{"{n}"}</code> where T{"{n}"} is the relaunch iteration, not performance class.
            </p>
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-border/50 bg-muted/20">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Ad Name
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Perf
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Conf
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      CPA
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Spend
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Format
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Fatigue
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {sortedAds.map(ad => (
                    <tr key={ad.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 max-w-xs">
                        <p className="text-[11px] text-foreground truncate">{ad.name}</p>
                        <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">
                          {ad.conversion_type}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <PerfBadge t={ad.tier} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <ConfidenceChip c={ad.confidence} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={cn(
                            "text-[11px] font-mono font-semibold",
                            ad.tier === 1 ? "text-emerald-400" : ad.tier === 4 ? "text-red-400" : "text-foreground"
                          )}
                        >
                          ${ad.cpa_usd.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[11px] text-muted-foreground">
                          ${(ad.spend_usd / 1000).toFixed(1)}K
                        </span>
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
                    <span className="text-muted-foreground shrink-0">{row.usage}× used</span>
                    <span
                      className={cn(
                        "font-semibold shrink-0",
                        row.avgCpa <= 280 ? "text-emerald-400" : row.avgCpa <= 350 ? "text-yellow-400" : "text-orange-400"
                      )}
                    >
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
