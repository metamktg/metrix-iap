// ─── Settings ─────────────────────────────────────────────────────────
// Account-scoped settings: data connection, white-label, data isolation.

import { useScopedAdAccountId, useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, SectionCard, CaveatNote, PendingState } from "./shared";
import { cn } from "@/lib/utils";
import { Plug, FileUp, Palette, ShieldCheck, CheckCircle2, Circle, Users, Download } from "lucide-react";
import { useListAgentWaitlist } from "@workspace/api-client-react";

function AgentWaitlistSection() {
  const { data, isLoading, isError } = useListAgentWaitlist();

  const handleExport = () => {
    if (!data || data.entries.length === 0) return;
    const escapeCsv = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const header = "email,joined_at";
    const lines = data.entries.map((e) => `${escapeCsv(e.email)},${e.joined_at}`);
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metrix-agent-waitlist.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionCard
      title="Metrix Agent waitlist"
      desc="Emails collected from the Metrix Agent waitlist signup, newest first."
      right={
        <button
          onClick={handleExport}
          disabled={!data || data.entries.length === 0}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          data-testid="button-export-waitlist"
        >
          <Download className="w-3 h-3" /> Export CSV
        </button>
      }
    >
      {isLoading ? (
        <div className="text-[11px] text-muted-foreground/60 p-3">Loading waitlist…</div>
      ) : isError ? (
        <div className="text-[11px] text-red-400/80 p-3">Could not load waitlist signups. Check that the API server is running.</div>
      ) : !data || data.entries.length === 0 ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
          <Users className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          <div className="text-[11px] text-muted-foreground/60">No waitlist signups yet.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden" data-testid="list-waitlist-entries">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-medium">Email</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-medium">Joined</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border/20">
            {data.entries.map((entry) => (
              <div key={entry.email} className="flex items-center justify-between px-3 py-2" data-testid={`row-waitlist-${entry.email}`}>
                <span className="text-[12px] text-foreground truncate mr-3">{entry.email}</span>
                <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                  {new Date(entry.joined_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border/30 text-[10px] text-muted-foreground/50">
            {data.total} signup{data.total === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function SettingsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const { manager } = useAccount();
  const account = getAdAccount(seed, adAccountId);

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Settings" title="Settings" />
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
      <ModuleHeader section="Settings" title="Settings" subtitle={`Configuration for ${account.name} under ${manager.name}.`} />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        {/* Data connection */}
        <SectionCard title="Data connection" desc="Meta ad account connection and manual import status.">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground">Meta ad account</div>
                <div className="text-[10px] text-muted-foreground/50">{configured ? `${account.platform} · connected` : "Not connected"}</div>
              </div>
              {!configured && (
                <button className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors">
                  <Plug className="w-3 h-3" /> Connect
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              <FileUp className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground">Manual import</div>
                <div className="text-[10px] text-muted-foreground/50">Upload exported performance data</div>
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
                <div className="text-[10px] text-muted-foreground/50">White-label {rb.white_label_supported ? "supported" : "unavailable"} · formats: {rb.export_formats.join(", ")}</div>
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

        <div className={cn("text-[10px] font-mono text-muted-foreground/35", "px-1")}>
          Account ID · {account.id}
        </div>
      </div>
    </div>
  );
}
