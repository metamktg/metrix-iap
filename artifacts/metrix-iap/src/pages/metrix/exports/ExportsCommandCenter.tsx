// ─── Exports · Command Center ───────────────────────────────────────────
// The parent /app/exports route. Lets advanced users take this account's
// analysis, strategy, briefs, and reports out of Metrix — data-limited
// JSON for analysis/strategy/briefs (strictly what the interface already
// shows), real file exports for reports (already built, see
// ExportsReportsView). No premium gating during open beta.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, CrossLink } from "../shared";
import { BarChart3, FileJson, FileText, FileStack } from "lucide-react";

const SECTION = "Exports · 08";

const CHILDREN = [
  { to: "/app/exports/analysis", label: "Analysis", Icon: BarChart3, desc: "Performance-by-cell and variable-performance data, as data-limited JSON." },
  { to: "/app/exports/strategy", label: "Strategy JSON", Icon: FileJson, desc: "Message pillars and active hypotheses, as data-limited JSON." },
  { to: "/app/exports/reports", label: "Reports", Icon: FileText, desc: "PDF, HTML, and Google Doc export — already available from Report History." },
  { to: "/app/exports/brief", label: "Brief", Icon: FileStack, desc: "Draft creative briefs, as data-limited JSON." },
];

export function ExportsCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Exports" account={account}>
      {() => {
        const acct = account!;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Exports"
              subtitle="Take this account's analysis, strategy, briefs, and reports out of Metrix."
            />
            <ScopeBanner account={acct} />
            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CHILDREN.map((c) => (
                  <div key={c.to} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <c.Icon className="w-4 h-4 text-interactive shrink-0" />
                      <div className="min-w-0">
                        <div className="text-title font-semibold text-foreground">{c.label}</div>
                        <p className="text-caption text-muted-foreground/80 leading-relaxed">{c.desc}</p>
                      </div>
                    </div>
                    <CrossLink to={c.to} label="Open" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
