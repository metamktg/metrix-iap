import { useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Zap, ChevronLeft, CheckCircle2, Circle, AlertCircle,
  FileText, Calendar, Target, Layers,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  AD_ACCOUNTS, IMPORTS, ANALYSIS_RUNS, WORKSPACES,
} from "@/lib/mock-data";
import type { AnalysisDepth, AnalysisObjective, Workspace } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────

const DEPTHS: { value: AnalysisDepth; label: string; desc: string; time: string }[] = [
  { value: "Fast Read", label: "Fast Read", desc: "Top-level tier classification and priority findings only.", time: "~2 min" },
  { value: "Full IAP Analysis", label: "Full IAP Analysis", desc: "Complete 11-dimension diagnostic across all signals.", time: "~8 min" },
  { value: "Creative Sprint Analysis", label: "Creative Sprint Analysis", desc: "Creative DNA focus — hook, framework, tone, and fatigue scoring.", time: "~5 min" },
  { value: "Executive Report", label: "Executive Report", desc: "Client-ready narrative with budget decisions and next sprint.", time: "~10 min" },
  { value: "Investor/Demo Mode", label: "Investor / Demo Mode", desc: "Agency-level rollup with highlight metrics and story arc.", time: "~6 min" },
];

const OBJECTIVES: AnalysisObjective[] = [
  "Purchase volume", "CPA reduction", "ROAS improvement", "Lead quality",
  "Creative fatigue diagnosis", "Creative testing read", "Scale readiness",
  "Account audit", "Next sprint planning", "Client reporting",
];

// ─── Step indicator ────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={cn(
      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
      done ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
           : active ? "bg-primary/20 border-primary text-primary"
           : "bg-transparent border-border/40 text-muted-foreground"
    )}>
      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
    </div>
  );
}

// ─── Running simulation ────────────────────────────────────────────────

function RunningAnimation({ workspaceId }: { workspaceId: string }) {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<"boot" | "running" | "done">("boot");
  const [progress, setProgress] = useState(0);

  const PHASES = [
    "Initialising signal extraction…",
    "Loading import data…",
    "Running buyer-intent funnel analysis…",
    "Scoring creative DNA…",
    "Computing confidence labels…",
    "Classifying performance tiers…",
    "Generating findings…",
    "Building decision feed…",
    "Finalising…",
  ];
  const [phaseIdx, setPhaseIdx] = useState(0);

  useState(() => {
    let prog = 0;
    const iv = setInterval(() => {
      prog += Math.random() * 18 + 4;
      if (prog >= 100) {
        prog = 100;
        clearInterval(iv);
        setTimeout(() => setPhase("done"), 400);
      }
      setProgress(Math.min(100, prog));
      setPhaseIdx(p => Math.min(PHASES.length - 1, p + 1));
    }, 320);
    setPhase("running");
    return () => clearInterval(iv);
  });

  const targetRunId = workspaceId === "ws_bookster" ? "run_0001" : null;

  if (phase === "done") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Analysis Complete</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {targetRunId ? "Full IAP Analysis — CPA reduction" : "Run queued and processed."}
            </p>
          </div>
          {targetRunId ? (
            <button
              onClick={() => navigate(`/app/iap/runs/${targetRunId}`)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
            >
              <Zap className="w-4 h-4" />
              View Analysis Run
            </button>
          ) : (
            <p className="text-xs text-muted-foreground px-4 leading-relaxed">
              This workspace uses sample data. Navigate to Bookster to see a fully populated run.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center space-y-6 max-w-sm w-full">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full bg-primary/10 border border-primary/20 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap className="w-7 h-7 text-primary" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Running IAP Analysis</h2>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{PHASES[phaseIdx]}</p>
        </div>
        <div className="w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
      </div>
    </div>
  );
}

// ─── IAPRunBuilder ─────────────────────────────────────────────────────

export function IAPRunBuilder() {
  const [, navigate] = useLocation();
  const { currentWorkspace } = useWorkspace();

  const [selectedWsId, setSelectedWsId] = useState<string>(currentWorkspace?.id ?? "ws_bookster");
  const [selectedAaId, setSelectedAaId] = useState<string>("");
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [depth, setDepth] = useState<AnalysisDepth>("Full IAP Analysis");
  const [objectives, setObjectives] = useState<AnalysisObjective[]>(["CPA reduction"]);
  const [running, setRunning] = useState(false);

  const selectedWs: Workspace | undefined = WORKSPACES.find(w => w.id === selectedWsId);
  const wsAccounts = AD_ACCOUNTS.filter(a => a.workspace_id === selectedWsId);
  const aaId = selectedAaId || wsAccounts[0]?.id || "";
  const wsImports = IMPORTS
    .filter(i => i.workspace_id === selectedWsId && i.ad_account_id === aaId)
    .filter(i => i.status === "Processed" || i.status === "Ready");

  const toggleObjective = (obj: AnalysisObjective) => {
    setObjectives(prev =>
      prev.includes(obj) ? prev.filter(o => o !== obj) : [...prev, obj]
    );
  };

  const toggleImport = (id: string) => {
    setSelectedImportIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const allImportsSelected = wsImports.length > 0 && wsImports.every(i => selectedImportIds.includes(i.id));

  const canSubmit = objectives.length > 0;

  if (running) {
    return (
      <div className="h-full">
        <RunningAnimation workspaceId={selectedWsId} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">IAP Run Builder</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Configure and launch an Intelligent Ad Performance analysis</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* Main form — 2 cols */}
          <div className="col-span-2 space-y-6">

            {/* Section: Workspace + Account */}
            <section className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Workspace & Account</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Workspace</label>
                  <select
                    value={selectedWsId}
                    onChange={e => {
                      setSelectedWsId(e.target.value);
                      setSelectedAaId("");
                      setSelectedImportIds([]);
                    }}
                    className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                  >
                    {WORKSPACES.map(ws => (
                      <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Ad Account</label>
                  <select
                    value={aaId}
                    onChange={e => {
                      setSelectedAaId(e.target.value);
                      setSelectedImportIds([]);
                    }}
                    className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                  >
                    {wsAccounts.length === 0 ? (
                      <option value="">No accounts</option>
                    ) : wsAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.account_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Section: Analysis Depth */}
            <section className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Analysis Depth</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {DEPTHS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setDepth(d.value)}
                    className={cn(
                      "flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all",
                      depth === d.value
                        ? "border-primary/50 bg-primary/8 ring-1 ring-primary/20"
                        : "border-border/50 hover:border-border hover:bg-white/3"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-all",
                      depth === d.value ? "border-primary bg-primary" : "border-border/60"
                    )}>
                      {depth === d.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-xs font-semibold", depth === d.value ? "text-foreground" : "text-muted-foreground")}>
                          {d.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">{d.time}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{d.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Section: Objectives */}
            <section className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Primary Objectives</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Select all that apply</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {OBJECTIVES.map(obj => {
                  const active = objectives.includes(obj);
                  return (
                    <button
                      key={obj}
                      onClick={() => toggleObjective(obj)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all",
                        active
                          ? "bg-primary/15 border-primary/50 text-primary"
                          : "bg-transparent border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      {active && <span className="mr-1">✓</span>}
                      {obj}
                    </button>
                  );
                })}
              </div>
              {objectives.length === 0 && (
                <p className="text-[11px] text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Select at least one objective.
                </p>
              )}
            </section>

            {/* Section: Imports */}
            <section className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Import Data</span>
                </div>
                {wsImports.length > 0 && (
                  <button
                    onClick={() => setSelectedImportIds(
                      allImportsSelected ? [] : wsImports.map(i => i.id)
                    )}
                    className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                  >
                    {allImportsSelected ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>

              {wsImports.length === 0 ? (
                <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-muted/20 border border-border/40">
                  <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    No processed imports found for this ad account.
                    The analysis will use all connected data if API sync is active.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {wsImports.map(imp => {
                    const selected = selectedImportIds.includes(imp.id);
                    const totalRows = imp.files.reduce((s, f) => s + f.row_count, 0);
                    return (
                      <button
                        key={imp.id}
                        onClick={() => toggleImport(imp.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                          selected
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/50 hover:border-border/80 hover:bg-white/3"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all",
                          selected ? "border-primary bg-primary" : "border-border/60 bg-transparent"
                        )}>
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-foreground font-mono">{imp.id}</span>
                            <span className={cn(
                              "text-[9px] px-1 py-0.5 rounded border font-semibold leading-none",
                              imp.status === "Processed"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-primary/10 text-primary border-primary/20"
                            )}>
                              {imp.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>{imp.date_range_start} – {imp.date_range_end}</span>
                            <span className="text-muted-foreground/30">·</span>
                            <span>{imp.files.length} files · {totalRows.toLocaleString()} rows</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right sidebar — summary */}
          <div className="col-span-1 space-y-4">

            {/* Run summary card */}
            <div className="bg-card border border-border/60 rounded-xl p-4 space-y-4 sticky top-6">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Run Summary</span>
              </div>

              <div className="space-y-3 text-[11px]">
                <div>
                  <div className="text-muted-foreground mb-0.5">Workspace</div>
                  <div className="font-medium text-foreground">{selectedWs?.name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Ad Account</div>
                  <div className="font-medium text-foreground truncate">
                    {wsAccounts.find(a => a.id === aaId)?.account_name ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Depth</div>
                  <div className="font-medium text-foreground">{depth}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Objectives</div>
                  {objectives.length === 0 ? (
                    <div className="text-destructive">None selected</div>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {objectives.map(o => (
                        <span key={o} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] border border-primary/20">{o}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Imports</div>
                  <div className="font-medium text-foreground">
                    {selectedImportIds.length > 0
                      ? `${selectedImportIds.length} selected`
                      : wsImports.length === 0
                      ? "API sync (live)"
                      : "None selected"}
                  </div>
                </div>
              </div>

              {/* Estimated time */}
              <div className="border-t border-border/40 pt-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Est. time
                  </span>
                  <span className="text-foreground font-mono">
                    {DEPTHS.find(d => d.value === depth)?.time ?? "—"}
                  </span>
                </div>
              </div>

              <button
                disabled={!canSubmit}
                onClick={() => setRunning(true)}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all",
                  canSubmit
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <Zap className="w-4 h-4" />
                Launch Analysis
              </button>

              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                SAMPLE / DEMO DATA — No real analysis will run.
              </p>
            </div>

            {/* Signal quality preview */}
            {selectedWsId === "ws_bookster" && (
              <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Last Run Quality</span>
                </div>
                {(() => {
                  const lastRun = ANALYSIS_RUNS.find(r => r.workspace_id === "ws_bookster");
                  if (!lastRun) return null;
                  return (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-foreground">{lastRun.signal_quality.overall}</span>
                        <span className="text-xs text-muted-foreground">/100</span>
                      </div>
                      <div className="w-full bg-border/30 rounded-full h-1">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${lastRun.signal_quality.overall}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        From run_0001 · Full IAP Analysis · {lastRun.date_range_start} – {lastRun.date_range_end}
                      </p>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
