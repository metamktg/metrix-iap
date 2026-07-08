// ─── Reports · New Report ─────────────────────────────────────────────
// Metrix-branded / white-label report composition, scoped to the account.
// Sub-tabs: Report preview (Internal vs Client mode) | Branding & export.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, ModuleTabs, CaveatNote, PendingState, CrossLink } from "../shared";
import { cn } from "@/lib/utils";
import { FileText, FileDown, Palette, Check, Eye, Building2, Users } from "lucide-react";

const SECTION = "Reports · 06";

export const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  google_doc: "Google Doc",
  html: "HTML",
};

type Tab = "preview" | "branding";
type Mode = "internal" | "client";

export function NewReportView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<string>("preview");
  const [mode, setMode] = useState<Mode>("internal");

  return (
    <ModuleScopeGate section={SECTION} title="New Report" account={account}>
      {() => {
        const acct = account!;
        const rb = getReportBuilder(seed, adAccountId);
        if (!rb) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="New Report" />
              <ScopeBanner account={acct} />
              <PendingState title="Report Builder pending" message="No report template is available for this account yet." icon={FileText} />
            </div>
          );
        }

        const tabs: { id: Tab; label: string; count?: number }[] = [
          { id: "preview", label: "Report preview", count: rb.report_sections.length },
          { id: "branding", label: "Branding & export" },
        ];

        const brandLabel = mode === "internal" ? "Metrix IAP" : acct.name;
        const brandSub = mode === "internal"
          ? "Internal dashboard mode · full Metrix branding"
          : "Client-facing mode · white-labeled for the client";

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="New Report"
              subtitle="Compose a client-ready report from this account's analysis and strategy."
              table="reports"
            />
            <ScopeBanner account={acct} />
            <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />

            <div className="px-6 py-5 space-y-5 max-w-4xl">
              {tab === "preview" && (
                <>
                  {/* Mode toggle */}
                  <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5 w-fit">
                    <button
                      onClick={() => setMode("internal")}
                      aria-pressed={mode === "internal"}
                      className={cn("flex items-center gap-1.5 h-8 px-3 rounded text-[11px] font-medium transition-colors", mode === "internal" ? "bg-white/[0.06] text-foreground" : "text-muted-foreground/70 hover:text-foreground")}
                    >
                      <Building2 className="w-3 h-3" /> Internal dashboard
                    </button>
                    <button
                      onClick={() => setMode("client")}
                      aria-pressed={mode === "client"}
                      className={cn("flex items-center gap-1.5 h-8 px-3 rounded text-[11px] font-medium transition-colors", mode === "client" ? "bg-white/[0.06] text-foreground" : "text-muted-foreground/70 hover:text-foreground")}
                    >
                      <Users className="w-3 h-3" /> Client-facing
                    </button>
                  </div>

                  {/* Document preview */}
                  <div className="rounded-xl border border-border/40 bg-white/[0.015] overflow-hidden">
                    <div className="px-6 py-5 border-b border-border/30 bg-gradient-to-br from-primary/[0.05] to-transparent">
                      <div className="flex items-center gap-2 mb-3">
                        <Palette className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-foreground">{brandLabel}</span>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{brandSub}</span>
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">Creative Signal Report</div>
                      <h2 className="text-[18px] font-semibold text-foreground mt-1">{acct.name} · {acct.platform}</h2>
                    </div>

                    <div className="px-6 py-5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-3">Contents · {rb.report_sections.length} sections</div>
                      <ol className="space-y-1.5">
                        {rb.report_sections.map((s, i) => (
                          <li key={s} className="flex items-center gap-3 py-2 border-b border-border/15 last:border-b-0">
                            <span className="w-6 h-6 rounded-md bg-white/[0.04] border border-border/40 flex items-center justify-center text-[10px] font-mono text-muted-foreground/70 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                            <span className="text-[12px] font-medium text-foreground">{s}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground/70">
                    Preview reflects section order and branding only. Section content is composed from the account's analysis and strategy — no independent analysis is run here.
                  </p>

                  <CrossLink to="/app/reports/history" label="See previously generated reports" />
                </>
              )}

              {tab === "branding" && (
                <>
                  <SectionCard title="Branding" desc="Report white-labeling for client delivery.">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", "border-primary/25 bg-primary/8")}>
                        <Palette className="w-3.5 h-3.5 text-primary" />
                        <div>
                          <div className="text-[11px] font-medium text-foreground capitalize">{rb.default_branding} branding</div>
                          <div className="text-[10px] text-muted-foreground/70">Default on first load</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                        <Check className={cn("w-3.5 h-3.5", rb.white_label_supported ? "text-emerald-400" : "text-muted-foreground/70")} />
                        White-label {rb.white_label_supported ? "supported" : "unavailable"}
                      </div>
                    </div>
                    <div className="mt-3">
                      <CaveatNote text={rb.logo_policy} />
                    </div>
                  </SectionCard>

                  <SectionCard title="Export" desc="Deliver the composed report in the client's preferred format.">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rb.export_formats.map((f) => (
                        <button key={f} className="flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border/50 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                          <FileDown className="w-3.5 h-3.5" /> {FORMAT_LABEL[f] ?? f}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3">
                      <CrossLink to="/app/reports/exports" label="Manage export formats & destinations" />
                    </div>
                  </SectionCard>

                  <button
                    onClick={() => setTab("preview")}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> Back to report preview
                  </button>
                </>
              )}
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
