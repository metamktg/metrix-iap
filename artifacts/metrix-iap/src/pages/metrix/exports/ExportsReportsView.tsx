// ─── Exports · Reports ────────────────────────────────────────────────
// Reports already have real export functionality (lib/reportExport.ts:
// PDF, HTML, and Google Doc creation via the existing connector) — this
// page doesn't rebuild that list, it explains the available formats and
// branding, and sends the user to Report History to actually download.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ModuleScopeGate, SectionCard, PendingState, CrossLink } from "../shared";
import { FORMAT_LABEL } from "../reports/reportFormatLabels";
import { FileText, Check } from "lucide-react";

const SECTION = "Exports · 09";

export function ExportsReportsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Reports" account={account}>
      {() => {
        const acct = account!;
        const reportBuilder = getReportBuilder(seed, adAccountId);

        if (!reportBuilder) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Reports" accountName={acct.name} />
              <PendingState title="No report configuration yet" message="Set up reporting for this account first." icon={FileText} />
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Reports"
              accountName={acct.name}
              subtitle="Reports already export as real files — download them from Report History."
              table="export_formats, report_history"
            />
            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <SectionCard title="Available formats" desc="Every generated report can be downloaded in these formats.">
                <ul className="space-y-1.5">
                  {reportBuilder.export_formats.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-body text-foreground/85">
                      <Check className="w-3.5 h-3.5 text-status-success shrink-0" />
                      {FORMAT_LABEL[f] ?? f}
                    </li>
                  ))}
                </ul>
              </SectionCard>

              <SectionCard title="Branding" desc="How reports are labeled when exported.">
                <div className="space-y-1.5 text-body text-foreground/85">
                  <div>Default branding: <span className="font-medium">{reportBuilder.default_branding}</span></div>
                  <div>White-label: <span className="font-medium">{reportBuilder.white_label_supported ? "Supported" : "Not supported"}</span></div>
                  <div>Logo policy: <span className="font-medium">{reportBuilder.logo_policy}</span></div>
                </div>
              </SectionCard>

              <div className="pt-1">
                <CrossLink to="/app/reports/history" label="Go to Report History to download" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
