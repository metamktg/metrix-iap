// ─── MST · Direction ────────────────────────────────────────────────
// The Optimization Loop: re-weighted variables, scale/optimize/validate/
// retire classifications, and next-sprint priorities derived from MST
// results, feeding back into Strategy defaults. No automated job exists
// yet to compute this (the metrix-optimization-loop skill runs it
// manually today) — this page states the plan honestly rather than
// fabricating a re-weighting we haven't actually run.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, SectionCard, CrossLink } from "../shared";
import { Compass, TrendingUp, ShieldCheck, ArrowUpRight, Ban } from "lucide-react";

const SECTION = "MST · 06";

const STAGES = [
  { label: "Scale", desc: "Winning variables get more budget and broader placement.", Icon: ArrowUpRight },
  { label: "Optimize", desc: "Promising but unproven variables get a tighter next test.", Icon: TrendingUp },
  { label: "Validate", desc: "Early signal needs a confirming sprint before scaling.", Icon: ShieldCheck },
  { label: "Retire", desc: "Consistently underperforming variables drop from rotation.", Icon: Ban },
];

export function MstDirectionView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Direction" account={account}>
      {() => (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <ModuleHeader
            section={SECTION}
            title="Direction"
            subtitle="The Optimization Loop — turns MST results into re-weighted variables and next-sprint priorities."
          />
          <ScopeBanner account={account!} />
          <div className="px-6 py-5 space-y-4 max-w-3xl">
            <PendingState
              title="Not yet automated"
              message="Re-weighting variables and classifying scale/optimize/validate/retire from this account's MST Performance results is not yet a running job in the app. Review Performance for the raw winners this stage would act on."
              icon={Compass}
              action={<CrossLink to="/app/mst/performance" label="Open Performance" />}
            />
            <SectionCard title="What Direction will do" desc="The four classifications every variable will land in once this is built.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {STAGES.map((s) => (
                  <div key={s.label} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <s.Icon className="w-3.5 h-3.5 text-interactive" />
                      <span className="text-[13px] font-semibold text-foreground">{s.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </ModuleScopeGate>
  );
}
