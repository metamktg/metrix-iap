// ─── Settings · Account ───────────────────────────────────────────────
// Account-scoped settings: data connection, white-label, data isolation,
// plus the workspace-wide Metrix Agent waitlist admin section.

import { useScopedAdAccountId, useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, SectionCard, CaveatNote, PendingState } from "../shared";
import { AgentWaitlistSection } from "./AgentWaitlistSection";
import { cn } from "@/lib/utils";
import { Plug, FileUp, Palette, ShieldCheck, CheckCircle2, Circle } from "lucide-react";

const SECTION = "Settings · 09";

export function AccountSettingsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const { manager } = useAccount();
  const account = getAdAccount(seed, adAccountId);

  if (!account) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <ModuleHeader section={SECTION} title="Account" />
        <PendingState title="No ad account selected" message="Choose an ad account to manage its settings." />
        <div className="px-6 py-5 space-y-5 max-w-3xl">
          <AgentWaitlistSection />
        </div>
      </div>
    );
  }

  const configured = account.status === "configured";
  const rb = configured ? getReportBuilder(seed, adAccountId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section={SECTION} title="Account" subtitle={`Configuration for ${account.name} under ${manager.name}.`} />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        {/* Data connection */}
        <SectionCard title="Data connection" desc="Meta ad account connection and manual import status.">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/60 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground">Meta ad account</div>
                <div className="text-[10px] text-muted-foreground/70">{configured ? `${account.platform} · connected` : "Not connected"}</div>
              </div>
              {!configured && (
                <button className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors">
                  <Plug className="w-3 h-3" /> Connect
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              <FileUp className="w-4 h-4 text-muted-foreground/70 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground">Manual import</div>
                <div className="text-[10px] text-muted-foreground/70">Upload exported performance data</div>
              </div>
              <button className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                <FileUp className="w-3 h-3" /> Add import
              </button>
            </div>
          </div>
        </SectionCard>

        {/* White-label */}
        {rb && (
          <SectionCard title="White-label & branding" desc="How reports are branded when delivered to this account's client.">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              <Palette className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground capitalize">{rb.default_branding} branding</div>
                <div className="text-[10px] text-muted-foreground/70">White-label {rb.white_label_supported ? "supported" : "unavailable"} · formats: {rb.export_formats.join(", ")}</div>
              </div>
            </div>
            <div className="mt-2.5">
              <CaveatNote text={rb.logo_policy} />
            </div>
          </SectionCard>
        )}

        {/* Data isolation */}
        <SectionCard title="Data isolation" desc="How this account's data is scoped within the manager.">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground/75 leading-relaxed">
              All analysis, strategy, briefs, reports, and MST data are isolated to <span className="font-medium text-foreground">{account.name}</span>.
              Only bottom-line performance totals roll up to the {manager.name} overview. Approving a recommendation creates a manual task and never auto-edits a live campaign.
            </p>
          </div>
        </SectionCard>

        {/* Metrix Agent waitlist (admin, manager-wide) */}
        <AgentWaitlistSection />

        <div className={cn("text-[10px] font-mono text-muted-foreground/60", "px-1")}>
          Account ID · {account.id}
        </div>
      </div>
    </div>
  );
}
