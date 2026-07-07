import { useState } from "react";
import { cn } from "@/lib/utils";
import { List, ToggleLeft, ToggleRight, GripVertical, ChevronDown } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CLIENT_ENABLED_COHORTS, COHORT_DEFINITIONS } from "@/lib/mock-data";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import type { ClientEnabledCohort, CohortKey } from "@/lib/types";

const COHORT_LABELS: Record<CohortKey, string> = {
  age_gender: "Age × Gender",
  placement: "Placement",
  device: "Device",
  creative_angle: "Creative Angle",
  funnel_stage: "Funnel Stage",
  language: "Language",
  geography: "Geography",
  audience_type: "Audience Type",
};

const COHORT_DESCRIPTIONS: Record<CohortKey, string> = {
  age_gender: "Segment performance by age range and gender for creative and bidding differentiation.",
  placement: "Feed vs. Story vs. Reel — placement performance isolation.",
  device: "Mobile vs. Desktop conversion efficiency. Critical for iOS/Android splits.",
  creative_angle: "Hook variable family performance comparison across creative angles.",
  funnel_stage: "TOF / MOF / BOF budget allocation segmentation.",
  language: "EN vs. ES creative performance for bilingual markets.",
  geography: "DMA-level geo targeting and regional performance.",
  audience_type: "Cold prospecting vs. warm lookalike vs. retargeting.",
};

// ─── Row component ────────────────────────────────────────────────────

function CohortRow({ cohort, def, onTogglePrimary, onToggleEnabled }: {
  cohort: ClientEnabledCohort;
  def?: { funnel_stages: string[]; kpi_targets: Record<string, number> };
  onTogglePrimary: (id: string) => void;
  onToggleEnabled: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "border rounded-xl bg-card overflow-hidden transition-all",
      cohort.enabled ? "border-border/60" : "border-border/30 opacity-60"
    )}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab" />

        <div className="flex items-center gap-2 w-6 shrink-0">
          <span className="text-[10px] font-bold font-mono text-muted-foreground">P{cohort.priority}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{COHORT_LABELS[cohort.cohort_key]}</span>
            {cohort.is_primary && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary font-semibold leading-none">
                Primary
              </span>
            )}
            <span className="text-[9px] font-mono text-muted-foreground/50">{cohort.cohort_key}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-1">
            {COHORT_DESCRIPTIONS[cohort.cohort_key]}
          </p>
        </div>

        {/* Funnel stages */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          {cohort.funnel_stages.map(s => (
            <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 border border-border/30 text-muted-foreground font-mono leading-none">
              {s}
            </span>
          ))}
        </div>

        {/* Primary toggle */}
        <button
          onClick={() => onTogglePrimary(cohort.id)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Toggle primary cohort"
        >
          {cohort.is_primary
            ? <ToggleRight className="w-5 h-5 text-primary" />
            : <ToggleLeft className="w-5 h-5" />
          }
        </button>

        {/* Enable/Disable */}
        <button
          onClick={() => onToggleEnabled(cohort.id)}
          className={cn(
            "shrink-0 text-[9px] px-2 py-1 rounded border font-medium transition-colors",
            cohort.enabled
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              : "border-border/40 bg-muted text-muted-foreground hover:bg-white/5"
          )}
        >
          {cohort.enabled ? "Active" : "Paused"}
        </button>

        <button onClick={() => setOpen(o => !o)}>
          <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1.5">KPI Targets</div>
              <div className="space-y-1">
                {Object.entries(cohort.kpi_targets).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground font-mono">{k.replace(/_/g, " ")}</span>
                    <span className="text-foreground font-mono font-semibold">
                      {k.includes("usd") ? `$${v}` : k.includes("rate") || k.includes("min") && v < 1 ? `${(v * 100).toFixed(1)}%` : v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1.5">Funnel Stages</div>
              <div className="flex flex-wrap gap-1">
                {cohort.funnel_stages.map(s => (
                  <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 border border-border/30 text-muted-foreground font-mono">
                    {s}
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1.5 mt-3">Cohort Definition</div>
              <span className="text-[9px] font-mono text-muted-foreground/60">{cohort.cohort_definition_id}</span>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground/50">Updated {cohort.updated_at}</div>
        </div>
      )}
    </div>
  );
}

// ─── CohortSettings page ──────────────────────────────────────────────

export function CohortSettings() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace.id;

  const raw = CLIENT_ENABLED_COHORTS.filter(c => c.workspace_id === wsId);
  const defs = COHORT_DEFINITIONS;

  const [cohorts, setCohorts] = useState<ClientEnabledCohort[]>(
    [...raw].sort((a, b) => a.priority - b.priority)
  );

  function togglePrimary(id: string) {
    setCohorts(cs => cs.map(c => ({ ...c, is_primary: c.id === id ? !c.is_primary : false })));
  }

  function toggleEnabled(id: string) {
    setCohorts(cs => cs.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  }

  if (cohorts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm">
          <List className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <h2 className="text-base font-bold text-foreground">No Cohorts Configured</h2>
          <p className="text-xs text-muted-foreground">
            Cohort settings control which analysis dimensions are active for this client.
            Contact your workspace admin to configure cohorts.
          </p>
        </div>
      </div>
    );
  }

  const primaryCohort = cohorts.find(c => c.is_primary);
  const enabledCount = cohorts.filter(c => c.enabled).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3 mb-1">
          <List className="w-4 h-4 text-primary" />
          <h1 className="text-base font-bold text-foreground">Cohort Settings</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border/50 text-muted-foreground font-mono">
            {enabledCount}/{cohorts.length} active
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-1">
          Configure which analysis cohorts are active for <strong>{currentWorkspace.name}</strong>. The primary cohort is used as the default grouping dimension in Intelligence Cards.
        </p>
        <DataSourceBadge table="client_enabled_cohorts, cohort_definitions" className="mt-1.5" />
      </div>

      {/* Summary bar */}
      {primaryCohort && (
        <div className="px-6 py-2.5 border-b border-border/30 bg-muted/10 flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">Primary cohort:</span>
          <span className="text-[10px] font-semibold text-primary">{COHORT_LABELS[primaryCohort.cohort_key]}</span>
          <span className="text-[9px] font-mono text-muted-foreground/50">{primaryCohort.cohort_key}</span>
          <span className="ml-auto text-[9px] text-muted-foreground">Priority order controls card grouping weight</span>
        </div>
      )}

      {/* Cohort list */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
        {cohorts.map(cohort => (
          <CohortRow
            key={cohort.id}
            cohort={cohort}
            def={defs.find(d => d.id === cohort.cohort_definition_id)}
            onTogglePrimary={togglePrimary}
            onToggleEnabled={toggleEnabled}
          />
        ))}
      </div>

      {/* Footer note */}
      <div className="px-6 py-3 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground/60">
          Changes here affect how IAP analyses segment and prioritize intelligence cards for this client. Writes to <code className="font-mono">client_enabled_cohorts</code>.
        </p>
      </div>
    </div>
  );
}
