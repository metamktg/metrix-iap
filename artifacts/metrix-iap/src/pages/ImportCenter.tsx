import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, XCircle,
  Clock, ChevronDown, ChevronUp, Calendar, Database,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { IMPORTS, WORKSPACES, AD_ACCOUNTS } from "@/lib/mock-data";
import type { ImportStatus } from "@/lib/types";

// ─── Status helpers ────────────────────────────────────────────────────

const STATUS_STYLES: Record<ImportStatus, string> = {
  Uploaded: "text-blue-400 border-blue-400/20 bg-blue-400/10",
  Validating: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
  "Needs Mapping": "text-orange-400 border-orange-400/20 bg-orange-400/10",
  Warning: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
  Ready: "text-primary border-primary/20 bg-primary/10",
  Processed: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  Failed: "text-red-400 border-red-500/20 bg-red-500/10",
};

const STATUS_ICONS: Partial<Record<ImportStatus, React.ReactNode>> = {
  Processed: <CheckCircle2 className="w-3 h-3" />,
  Warning: <AlertTriangle className="w-3 h-3" />,
  "Needs Mapping": <AlertTriangle className="w-3 h-3" />,
  Failed: <XCircle className="w-3 h-3" />,
  Validating: <Clock className="w-3 h-3" />,
};

function StatusChip({ status }: { status: ImportStatus }) {
  return (
    <span className={cn(
      "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-semibold leading-none",
      STATUS_STYLES[status]
    )}>
      {STATUS_ICONS[status]}
      {status}
    </span>
  );
}

// ─── File type label ───────────────────────────────────────────────────

const FILE_TYPE_LABELS: Record<string, string> = {
  demographic_text: "Demographic + Text",
  device_placement_platform: "Device + Placement + Platform",
};

// ─── Import Row ────────────────────────────────────────────────────────

function ImportRow({ imp }: { imp: typeof IMPORTS[0] }) {
  const [open, setOpen] = useState(false);
  const ws = WORKSPACES.find(w => w.id === imp.workspace_id);
  const aa = AD_ACCOUNTS.find(a => a.id === imp.ad_account_id);
  const totalRows = imp.files.reduce((s, f) => s + f.row_count, 0);

  return (
    <div className={cn(
      "border rounded-xl bg-card overflow-hidden transition-all",
      imp.status === "Warning" || imp.status === "Needs Mapping"
        ? "border-yellow-400/20"
        : imp.status === "Failed"
        ? "border-red-500/20"
        : "border-border/60"
    )}>
      <button
        className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        {/* Status stripe */}
        <div className={cn(
          "w-1 h-8 rounded-full shrink-0",
          imp.status === "Processed" ? "bg-emerald-500"
          : imp.status === "Warning" || imp.status === "Needs Mapping" ? "bg-yellow-400"
          : imp.status === "Failed" ? "bg-red-500"
          : "bg-border"
        )} />

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span>{ws?.name ?? imp.workspace_id}</span>
            <span className="text-muted-foreground font-normal">·</span>
            <span className="text-muted-foreground font-normal">{aa?.account_name ?? imp.ad_account_id}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              {imp.date_range_start} – {imp.date_range_end}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1">
              <Database className="w-2.5 h-2.5" />
              {totalRows.toLocaleString()} rows total
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span>{imp.files.length} file{imp.files.length !== 1 ? "s" : ""}</span>
            <span className="text-muted-foreground/30">·</span>
            <span>{imp.created_at}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {imp.warnings.length > 0 && (
            <span className="text-[10px] text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {imp.warnings.length} warning
            </span>
          )}
          <StatusChip status={imp.status} />
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/30 px-4 py-3 space-y-3">
          {imp.warnings.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {imp.warnings.join(" · ")}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Files</div>
            {imp.files.map(f => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="text-[11px] font-mono text-foreground truncate">{f.filename}</div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{FILE_TYPE_LABELS[f.file_type] ?? f.file_type}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span>{f.row_count.toLocaleString()} rows</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span>{f.date_range_start} – {f.date_range_end}</span>
                  </div>
                  {f.warnings.length > 0 && (
                    <div className="text-[10px] text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {f.warnings.join(" · ")}
                    </div>
                  )}
                </div>
                <StatusChip status={f.status} />
              </div>
            ))}
          </div>

          {imp.processed_at && (
            <div className="text-[10px] text-muted-foreground">
              Processed: {imp.processed_at}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ImportCenter ──────────────────────────────────────────────────────

export function ImportCenter() {
  const { currentWorkspace } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const statuses = ["All", "Processed", "Warning", "Needs Mapping", "Failed"];

  const allImports = IMPORTS.filter(i => i.workspace_id === currentWorkspace.id);

  const filtered = statusFilter === "All"
    ? allImports
    : allImports.filter(i => i.status === statusFilter);

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const processed = allImports.filter(i => i.status === "Processed").length;
  const warnings = allImports.filter(i => i.status === "Warning" || i.status === "Needs Mapping").length;
  const totalRows = allImports.flatMap(i => i.files).reduce((s, f) => s + f.row_count, 0);
  const totalFiles = allImports.flatMap(i => i.files).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Import Center</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentWorkspace.name} — {allImports.length} import{allImports.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-xs font-medium cursor-not-allowed opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload CSV
            <span className="text-[9px] border border-primary/30 px-1 py-0.5 rounded font-mono">Live</span>
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Imports", value: allImports.length, sub: "all time" },
            { label: "Processed", value: processed, sub: "ready for analysis", color: "text-emerald-400" },
            { label: "Need Attention", value: warnings, sub: "warnings or mapping", color: warnings > 0 ? "text-yellow-400" : undefined },
            { label: "Total Rows", value: totalRows.toLocaleString(), sub: `${totalFiles} files` },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-1">
              <div className={cn("text-xl font-bold", k.color ?? "text-foreground")}>{k.value}</div>
              <div className="text-[10px] font-medium text-foreground">{k.label}</div>
              <div className="text-[10px] text-muted-foreground">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* How imports work */}
        <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 space-y-1">
          <div className="text-xs font-semibold text-foreground">How imports work</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Export two CSV breakdowns from Meta Ads Manager: <strong className="text-foreground">Demographic + Text</strong> and <strong className="text-foreground">Device + Placement + Platform</strong>. Upload both for a date range. Metrix IAP validates, maps columns, and makes the data available for IAP analysis runs.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                statusFilter === s
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-transparent border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Import list */}
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Upload className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No imports found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(imp => <ImportRow key={imp.id} imp={imp} />)}
          </div>
        )}
      </div>
    </div>
  );
}
