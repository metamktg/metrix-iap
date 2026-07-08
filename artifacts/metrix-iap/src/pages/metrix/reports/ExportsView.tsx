// ─── Reports · Exports ────────────────────────────────────────────────
// Export formats, branding policy, and past exported deliverables for
// this account's reports.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder, getReportHistory } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, CaveatNote, PendingState, CrossLink } from "../shared";
import { FORMAT_LABEL } from "./NewReportView";
import { FileDown, FileText, Check } from "lucide-react";

const SECTION = "Reports · 06";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ExportsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Exports" account={account}>
      {() => {
        const acct = account!;
        const rb = getReportBuilder(seed, adAccountId);
        const exportedReports = getReportHistory(seed, adAccountId).filter((r) => r.status === "exported");

        if (!rb) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Exports" />
              <ScopeBanner account={acct} />
              <PendingState title="No export options" message="Export formats become available once the report template exists." icon={FileDown} />
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Exports"
              subtitle="How reports leave Metrix: formats, branding policy, and delivered exports."
              table="report_builder"
            />
            <ScopeBanner account={acct} />

            <div className="px-6 py-5 space-y-5 max-w-3xl">
              <SectionCard title="Available formats" desc="Formats supported for delivering this account's reports.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {rb.export_formats.map((f) => (
                    <div key={f} className="rounded-lg border border-border/40 bg-white/[0.02] p-3.5 flex items-center gap-2.5">
                      <FileDown className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <div className="text-[12px] font-medium text-foreground">{FORMAT_LABEL[f] ?? f}</div>
                        <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" /> Supported</div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Branding policy" desc="How exported reports are branded for delivery.">
                <div className="text-[12px] text-foreground/85 capitalize mb-2">
                  Default: {rb.default_branding} branding · white-label {rb.white_label_supported ? "supported" : "unavailable"}
                </div>
                <CaveatNote text={rb.logo_policy} />
              </SectionCard>

              <SectionCard title="Exported deliverables" desc="Reports from this account that have been exported.">
                {exportedReports.length === 0 ? (
                  <PendingState title="Nothing exported yet" message="Exported reports will be listed here with their format and date." icon={FileText} />
                ) : (
                  <div className="divide-y divide-border/20">
                    {exportedReports.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 py-2.5">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-foreground truncate">{r.title}</div>
                          <div className="text-[10px] font-mono text-muted-foreground/70">{fmtDate(r.generated_at)} · {r.mode === "client" ? "Client-facing" : "Internal"}</div>
                        </div>
                        {r.export_format && (
                          <span className="text-[10px] font-semibold uppercase text-primary border border-primary/25 bg-primary/10 px-1.5 py-0.5 rounded leading-none shrink-0">
                            {FORMAT_LABEL[r.export_format] ?? r.export_format}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <div className="flex items-center gap-4">
                <CrossLink to="/app/reports/new" label="Compose a new report" />
                <CrossLink to="/app/reports/history" label="Full report history" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
