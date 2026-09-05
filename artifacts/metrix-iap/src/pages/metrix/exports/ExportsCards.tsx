// ─── Exports · the four export cards, on one page ───────────────────────
// Each export used to be a page of its own holding one card and a caveat,
// reached from a hub that only listed the four pages. Four thin pages and a
// relay page is five clicks of chrome around four buttons. The cards now
// render together on the Exports page; the child routes stay for deep links
// and keep their own module headers, so nothing bookmarked breaks.

import type { ReactNode } from "react";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAnalysisData, getStrategyData, getBriefBuilder, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { buildExportEnvelope } from "@/lib/jsonExport";
import { analysisExportRows, analysisExportEmpty, analysisExportSummary } from "@/lib/analysisExport";
import type { AdAccount } from "@/lib/data/seedTypes";
import { SectionCard, CrossLink } from "../shared";
import { FORMAT_LABEL } from "../reports/reportFormatLabels";
import { JsonExportCard } from "./exportsShared";
import { BarChart3, FileJson, FileStack, FileText, Check } from "lucide-react";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";

function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

/** The honest "nothing to export yet" face: what is missing and where it is made. */
function NotYet({ icon: Icon, title, message, to, linkLabel }: { icon: typeof BarChart3; title: string; message: string; to: string; linkLabel: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/40 p-4 flex items-start gap-3" data-testid="export-not-yet">
      <span className="shrink-0 w-9 h-9 rounded-lg bg-foreground/[0.03] border border-border/40 flex items-center justify-center">
        <Icon className="w-4 h-4 text-muted-foreground/75" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-title font-bold text-foreground">{title}</div>
        <p className={cn(TYPE.caption, "text-muted-foreground/80 leading-relaxed mt-0.5")}>{message}</p>
        <div className="mt-2"><CrossLink to={to} label={linkLabel} /></div>
      </div>
    </div>
  );
}

export function AnalysisExportCard({ account }: { account: AdAccount }) {
  const seed = useMetrixSeed();
  const analysis = getAnalysisData(seed, account.id);
  const rows = analysisExportRows(account, analysis);
  if (!analysis || analysisExportEmpty(rows)) {
    return <NotYet icon={BarChart3} title="Analysis" message="Run analysis first. There are no ad, cell or variable rows to export yet." to="/app/analysis" linkLabel="Go to Analysis to run it" />;
  }
  const payload = buildExportEnvelope(account, {
    performance_by_cell: rows.performance_by_cell,
    v3_variable_performance: rows.v3_variable_performance,
  });
  return (
    <JsonExportCard
      title="Analysis export"
      desc="Everything the Analysis pages currently show for this account."
      filename={`${slug(account.name)}-analysis-export.json`}
      data={payload}
      fieldSummary={analysisExportSummary(rows)}
    />
  );
}

export function StrategyExportCard({ account }: { account: AdAccount }) {
  const seed = useMetrixSeed();
  const strategy = getStrategyData(seed, account.id);
  if (!strategy || strategy.message_pillars.length === 0) {
    return <NotYet icon={FileJson} title="Strategy JSON" message="Generate strategy first. There are no pillars or hypotheses to export yet." to="/app/strategy" linkLabel="Go to Strategy to generate it" />;
  }
  const payload = buildExportEnvelope(account, {
    message_pillars: strategy.message_pillars,
    active_hypotheses: strategy.active_hypotheses,
  });
  return (
    <JsonExportCard
      title="Strategy export"
      desc="Everything the Strategy pages currently show for this account."
      filename={`${slug(account.name)}-strategy-export.json`}
      data={payload}
      fieldSummary={[
        `${strategy.message_pillars.length} message pillars`,
        `${strategy.active_hypotheses.length} active hypotheses`,
      ]}
    />
  );
}

export function BriefExportCard({ account }: { account: AdAccount }) {
  const seed = useMetrixSeed();
  const briefBuilder = getBriefBuilder(seed, account.id);
  if (!briefBuilder || briefBuilder.draft_briefs.length === 0) {
    return <NotYet icon={FileStack} title="Brief" message="Build a brief first. There are no draft briefs to export yet." to="/app/creative/builder" linkLabel="Go to the Brief Builder" />;
  }
  const draftBriefs = briefBuilder.draft_briefs.map(({ full_brief: _fullBrief, ...displayed }) => displayed);
  const payload = buildExportEnvelope(account, { draft_briefs: draftBriefs });
  return (
    <JsonExportCard
      title="Brief export"
      desc="Everything the Brief Builder page currently shows for this account."
      filename={`${slug(account.name)}-brief-export.json`}
      data={payload}
      fieldSummary={[`${draftBriefs.length} draft briefs`]}
    />
  );
}

export function ReportsExportCard({ account }: { account: AdAccount }): ReactNode {
  const seed = useMetrixSeed();
  const reportBuilder = getReportBuilder(seed, account.id);
  if (!reportBuilder) {
    return <NotYet icon={FileText} title="Reports" message="Set up reporting for this account first." to="/app/reports/configuration" linkLabel="Open report configuration" />;
  }
  return (
    <SectionCard title="Report files" desc="Generated reports download as real files from Report History.">
      <ul className="space-y-1.5 mb-3">
        {reportBuilder.export_formats.map((f) => (
          <li key={f} className="flex items-center gap-2 text-body text-foreground/85">
            <Check className="w-3.5 h-3.5 text-status-success shrink-0" aria-hidden="true" />
            {FORMAT_LABEL[f] ?? f}
          </li>
        ))}
      </ul>
      <CrossLink to="/app/reports/history" label="Download from Report History" />
    </SectionCard>
  );
}
