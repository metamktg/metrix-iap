// ─── Report Builder ───────────────────────────────────────────────────
// Metrix-branded / white-label report composition, scoped to the account.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, SectionCard, CaveatNote, UnconfiguredState, PendingState } from "./shared";
import { cn } from "@/lib/utils";
import { FileText, FileDown, Palette, Check } from "lucide-react";

const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  google_doc: "Google Doc",
  html: "HTML",
};

export function ReportBuilderView() {
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(adAccountId);

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Report Builder · 04" title="Report Builder" />
        <PendingState title="No ad account selected" message="Choose an ad account to build a report." />
      </div>
    );
  }
  if (account.status !== "configured") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Report Builder · 04" title="Report Builder" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const rb = getReportBuilder(adAccountId);
  if (!rb) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Report Builder · 04" title="Report Builder" />
        <ScopeBanner account={account} />
        <PendingState title="Report Builder pending" message="No report template is available for this account yet." icon={FileText} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Report Builder · 04"
        title="Report Builder"
        subtitle="Compose a client-ready report from this account's analysis and strategy."
        table="reports"
        right={
          <div className="flex items-center gap-1.5">
            {rb.export_formats.map((f) => (
              <button key={f} className="flex items-center gap-1 h-8 px-2.5 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <FileDown className="w-3 h-3" /> {FORMAT_LABEL[f] ?? f}
              </button>
            ))}
          </div>
        }
      />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-5 max-w-4xl">
        {/* Branding */}
        <SectionCard title="Branding" desc="Report white-labeling for client delivery.">
          <div className="flex items-center gap-4 flex-wrap">
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", "border-primary/25 bg-primary/8")}>
              <Palette className="w-3.5 h-3.5 text-primary" />
              <div>
                <div className="text-[11px] font-medium text-foreground capitalize">{rb.default_branding} branding</div>
                <div className="text-[9px] text-muted-foreground/50">Default on first load</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <Check className={cn("w-3.5 h-3.5", rb.white_label_supported ? "text-emerald-400" : "text-muted-foreground/40")} />
              White-label {rb.white_label_supported ? "supported" : "unavailable"}
            </div>
          </div>
          <div className="mt-3">
            <CaveatNote text={rb.logo_policy} />
          </div>
        </SectionCard>

        {/* Sections */}
        <SectionCard title="Report sections" desc={`${rb.report_sections.length} sections, in delivery order.`}>
          <ol className="space-y-1.5">
            {rb.report_sections.map((s, i) => (
              <li key={s} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/30 bg-white/[0.02]">
                <span className="w-6 h-6 rounded-md bg-white/[0.04] border border-border/40 flex items-center justify-center text-[10px] font-mono text-muted-foreground/60 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[12px] font-medium text-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}
