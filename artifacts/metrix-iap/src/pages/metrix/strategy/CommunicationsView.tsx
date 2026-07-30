// ─── Strategy · Communications ──────────────────────────────────────────
// Who's responding, to what, and why — recombines the account's existing
// message pillars + ICP profiles through that lens rather than
// introducing a new data source. P1 scaffold: real data, not yet its own
// dedicated analysis pass (that's P2).

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, SectionCard } from "../shared";
import { VariableStackChips, icpName } from "./strategyShared";
import { MessageSquare, Users, Lightbulb } from "lucide-react";

const SECTION = "Strategy · 04";

export function CommunicationsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Communications" account={account}>
      {() => {
        const strategy = getStrategyData(seed, adAccountId);
        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Communications" />
              <ScopeBanner account={account!} />
              <PendingState title="No communications data yet" message="Communications derive from generated message pillars — generate strategy first." icon={MessageSquare} />
            </div>
          );
        }
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Communications"
              subtitle="Who's responding, to what, and why — per message pillar."
              table="message_pillars, historical_matrix_4x4"
            />
            <ScopeBanner account={account!} />
            <div className="px-6 py-5 space-y-4 max-w-4xl">
              {strategy.message_pillars.map((p) => {
                const icps = (p.target_icps ?? []).map((id) => {
                  const profile = (strategy.icp_profiles ?? []).find((pr) => pr.profile_id === id);
                  return { id, name: icpName(strategy.icp_profiles, id), profile };
                });
                return (
                  <SectionCard key={p.id} title={p.label} desc={p.plain_descriptor}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Users className="w-3 h-3 text-primary/70" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Who's responding</span>
                        </div>
                        {icps.length > 0 ? (
                          <ul className="space-y-1.5">
                            {icps.map((i) => (
                              <li key={i.id} className="text-[12px] text-foreground/85">
                                {i.name}
                                {i.profile?.demographic_foundation && (
                                  <p className="text-[10.5px] text-muted-foreground/75 leading-relaxed mt-0.5">{i.profile.demographic_foundation}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/70">No ICP linked to this pillar yet.</p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MessageSquare className="w-3 h-3 text-primary/70" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">What they're responding to</span>
                        </div>
                        <VariableStackChips stack={p.variable_stack} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Lightbulb className="w-3 h-3 text-primary/70" />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Why</span>
                        </div>
                        <p className="text-[11.5px] text-foreground/80 leading-relaxed">{p.why_it_matters}</p>
                        {icps.some((i) => i.profile?.message_resonance) && (
                          <p className="text-[10.5px] text-muted-foreground/75 leading-relaxed mt-1.5">
                            {icps.find((i) => i.profile?.message_resonance)?.profile?.message_resonance}
                          </p>
                        )}
                      </div>
                    </div>
                  </SectionCard>
                );
              })}
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
