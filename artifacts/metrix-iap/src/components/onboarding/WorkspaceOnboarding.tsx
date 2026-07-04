import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Plug, Upload, CheckCircle2, ChevronRight,
  Info, Copy, Check, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXPORT_CLASS_INFO, DEMOGRAPHIC_TEXT_BREAKDOWN_COLUMNS, DEVICE_PLACEMENT_BREAKDOWN_COLUMNS } from "@/lib/utils/import-validation";
import type { Workspace } from "@/lib/types";
import type { OnboardingPath } from "@/lib/workspace-state";

interface WorkspaceOnboardingProps {
  workspace: Workspace;
}

export function WorkspaceOnboarding({ workspace }: WorkspaceOnboardingProps) {
  const [path, setPath] = useState<OnboardingPath>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {path === null && <PathSelector workspace={workspace} onSelect={setPath} />}
      {path === "connect_account" && <ConnectAccountPanel workspace={workspace} onBack={() => setPath(null)} />}
      {path === "upload_import" && <UploadImportPanel workspace={workspace} onBack={() => setPath(null)} copied={copied} onCopy={copyText} />}
    </div>
  );
}

// ─── Path Selector ────────────────────────────────────────────────────

function PathSelector({ workspace, onSelect }: { workspace: Workspace; onSelect: (p: OnboardingPath) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-20 px-6">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/60 text-xs text-muted-foreground font-mono mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
            No data connected
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Set up {workspace.name}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Connect your Meta Ads account for live sync, or manually upload the required pivot export files to begin an IAP analysis.
          </p>
        </div>

        {/* Two paths */}
        <div className="grid grid-cols-2 gap-4">
          {/* Path A: Connect account */}
          <button
            onClick={() => onSelect("connect_account")}
            className={cn(
              "group relative text-left rounded-xl border border-border/60 bg-card p-6",
              "hover:border-primary/40 hover:bg-primary/5 transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary/40"
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Plug className="w-5 h-5 text-primary" />
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-foreground">Connect Ad Account</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Link your Meta Ads account via API for automatic data sync. Recommended for ongoing analysis.
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Automatic sync", "Real-time data", "No CSV export needed"].map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/15 font-medium">
                  {t}
                </span>
              ))}
            </div>
          </button>

          {/* Path B: Upload CSV */}
          <button
            onClick={() => onSelect("upload_import")}
            className={cn(
              "group relative text-left rounded-xl border border-border/60 bg-card p-6",
              "hover:border-[hsl(var(--metrix-cyan)/0.4)] hover:bg-[hsl(var(--metrix-cyan)/0.04)] transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--metrix-cyan)/0.4)]"
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-[hsl(var(--metrix-cyan)/0.12)] border border-[hsl(var(--metrix-cyan)/0.2)] flex items-center justify-center">
                <Upload className="w-5 h-5 text-[hsl(var(--metrix-cyan))]" />
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-foreground">Upload Import Files</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Export two pivot CSV files from Meta Ads Reporting and upload them here to run an IAP analysis.
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["2 CSV files required", "135 columns each", "Same date range"].map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--metrix-cyan)/0.1)] text-[hsl(var(--metrix-cyan))] border border-[hsl(var(--metrix-cyan)/0.15)] font-medium">
                  {t}
                </span>
              ))}
            </div>
          </button>
        </div>

        {/* Bottom note */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/40 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
          <span>
            Bookster (ws_bookster) is the reference workspace — it contains a complete IAP analysis you can explore while setting this workspace up.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Connect Account Panel ────────────────────────────────────────────

function ConnectAccountPanel({ workspace, onBack }: { workspace: Workspace; onBack: () => void }) {
  const steps = [
    {
      title: "Grant API access",
      description: "Authorize Metrix to read your Meta Ads account data. We request read-only permissions.",
      status: "pending" as const,
    },
    {
      title: "Select ad accounts",
      description: "Choose which ad accounts to connect. Multiple accounts can be linked to one workspace.",
      status: "locked" as const,
    },
    {
      title: "Configure sync",
      description: "Set date range, metrics, and sync frequency. Data will appear in Import Center.",
      status: "locked" as const,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-20 px-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-1">
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-4">
            ← Back
          </button>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
              <Plug className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Connect Meta Ads Account</h2>
              <p className="text-xs text-muted-foreground">{workspace.name}</p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 p-4 rounded-xl border transition-all",
                step.status === "pending"
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/40 bg-card opacity-50"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold",
                step.status === "pending"
                  ? "border-primary text-primary"
                  : "border-muted-foreground/30 text-muted-foreground/30"
              )}>
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground mb-1">{step.title}</div>
                <div className="text-xs text-muted-foreground">{step.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Button className="w-full bg-primary hover:bg-primary/90 text-white font-medium" size="lg">
            <Plug className="w-4 h-4 mr-2" />
            Authorize Meta Ads Access
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            API integration is in development. Use CSV import in the meantime.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Import Panel ──────────────────────────────────────────────

function UploadImportPanel({
  workspace, onBack, copied, onCopy,
}: {
  workspace: Workspace;
  onBack: () => void;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const [uploaded, setUploaded] = useState<{ demo: boolean; device: boolean }>({ demo: false, device: false });
  const demoInfo = EXPORT_CLASS_INFO.demographic_text;
  const deviceInfo = EXPORT_CLASS_INFO.device_placement_platform;

  function handleDrop(type: "demo" | "device", e: React.DragEvent) {
    e.preventDefault();
    setUploaded(prev => ({ ...prev, [type]: true }));
  }

  const bothUploaded = uploaded.demo && uploaded.device;

  return (
    <div className="overflow-y-auto py-8 px-6">
      <div className="w-full max-w-3xl mx-auto space-y-6">
        <div>
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-4">
            ← Back
          </button>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[hsl(var(--metrix-cyan)/0.12)] border border-[hsl(var(--metrix-cyan)/0.2)] flex items-center justify-center">
              <Upload className="w-4 h-4 text-[hsl(var(--metrix-cyan))]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Upload Import Files</h2>
              <p className="text-xs text-muted-foreground">{workspace.name}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed max-w-xl">
            Two pivot CSV exports are required per import. Both must cover the same date range and include all 125 metric columns.
            Each file has 10 breakdown columns + 125 metric columns = <strong className="text-foreground">135 total columns</strong>.
          </p>
        </div>

        {/* Requirements summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Files required", value: "2", note: "per import" },
            { label: "Columns per file", value: "135", note: "10 breakdown + 125 metrics" },
            { label: "Date range", value: "Must match", note: "across both files" },
          ].map(item => (
            <div key={item.label} className="bg-card border border-border/60 rounded-lg px-4 py-3 text-center">
              <div className="text-lg font-bold text-foreground">{item.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{item.label}</div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5">{item.note}</div>
            </div>
          ))}
        </div>

        {/* Upload zones */}
        <div className="grid grid-cols-2 gap-4">
          {([
            { key: "demo" as const, info: demoInfo, breakdownCols: DEMOGRAPHIC_TEXT_BREAKDOWN_COLUMNS },
            { key: "device" as const, info: deviceInfo, breakdownCols: DEVICE_PLACEMENT_BREAKDOWN_COLUMNS },
          ]).map(({ key, info, breakdownCols }) => (
            <div key={key} className="space-y-3">
              {/* File info card */}
              <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-mono text-muted-foreground/60 mb-1">{info.class_name}</div>
                    <div className="text-sm font-semibold text-foreground">{info.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{info.description}</div>
                  </div>
                  {uploaded[key] && (
                    <CheckCircle2 className="w-4 h-4 text-[hsl(var(--metrix-success))] shrink-0" />
                  )}
                </div>

                {/* Breakdown columns */}
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Breakdown columns ({breakdownCols.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(breakdownCols as readonly string[]).map(col => (
                      <span key={col} className="var-badge text-[9px]">{col}</span>
                    ))}
                  </div>
                </div>

                {/* Metric count */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">+ 125 metric columns</span>
                  <button
                    className="flex items-center gap-1 text-muted-foreground/60 hover:text-foreground transition-colors"
                    onClick={() => onCopy(info.class_name, `classname_${key}`)}
                  >
                    {copied === `classname_${key}` ? (
                      <Check className="w-3 h-3 text-[hsl(var(--metrix-success))]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span className="text-[10px]">{copied === `classname_${key}` ? "Copied" : "Copy class name"}</span>
                  </button>
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={(e) => handleDrop(key, e)}
                onClick={() => setUploaded(prev => ({ ...prev, [key]: true }))}
                className={cn(
                  "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all",
                  uploaded[key]
                    ? "border-[hsl(var(--metrix-success)/0.5)] bg-[hsl(var(--metrix-success)/0.05)]"
                    : "border-border/40 hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                {uploaded[key] ? (
                  <div className="space-y-1.5">
                    <CheckCircle2 className="w-6 h-6 text-[hsl(var(--metrix-success))] mx-auto" />
                    <div className="text-xs font-medium text-[hsl(var(--metrix-success))]">File ready</div>
                    <div className="text-[10px] text-muted-foreground">
                      {key === "demo" ? "demo_text_export.csv" : "device_placement_export.csv"}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setUploaded(prev => ({ ...prev, [key]: false })); }}
                      className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-5 h-5 text-muted-foreground/40 mx-auto" />
                    <div className="text-xs text-muted-foreground">
                      Drop CSV file here or <span className="text-primary underline">browse</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/50">
                      {info.total_columns} columns required
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Export instructions */}
        <div className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground">How to export from Meta Ads Reporting</span>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {([
              { key: "demo" as const, info: demoInfo },
              { key: "device" as const, info: deviceInfo },
            ]).map(({ key, info }) => (
              <div key={key} className="space-y-2">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {info.label}
                </div>
                <ol className="space-y-1.5">
                  {info.how_to_export.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <span className="text-muted-foreground/40 font-mono shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded bg-[hsl(var(--metrix-gold)/0.08)] border border-[hsl(var(--metrix-gold)/0.2)] text-[11px] text-[hsl(var(--metrix-gold)/0.9)]">
            <span className="font-bold shrink-0">⚠</span>
            <span>
              Both exports must cover the <strong>exact same date range</strong> and include all 125 metric columns.
              Disable "Show totals" and "Show subtotals" before exporting.
            </span>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-white font-medium"
            size="lg"
            disabled={!bothUploaded}
          >
            {bothUploaded ? (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Process Import & Run Analysis
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload both files to continue
              </>
            )}
          </Button>
          {bothUploaded && (
            <div className="text-[11px] text-muted-foreground">
              Both files ready. Date range validation will run automatically.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

