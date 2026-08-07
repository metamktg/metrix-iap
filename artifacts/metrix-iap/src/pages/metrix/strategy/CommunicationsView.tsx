// ─── Strategy · Communications ──────────────────────────────────────────
// Who's responding, to what, and why — recombines the account's existing
// message pillars + ICP profiles through that lens rather than
// introducing a new data source. P1 scaffold: real data, not yet its own
// dedicated analysis pass (that's P2).

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, SectionCard, ConfidenceBadge, DetailReveal, deriveLabel } from "../shared";
import { TYPE } from "../typography";
import { cn } from "@/lib/utils";
import { VariableStackChips, IcpChips, HypothesisLabel, pillarHasDetails, PillarDetailSections } from "./strategyShared";
import { MessageSquare, Users, Lightbulb, FlaskConical } from "lucide-react";

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
                const targetIcps = p.target_icps ?? [];
                const matchedProfiles = targetIcps
                  .map((id) => strategy.icp_profiles?.find((pr) => pr.profile_id === id))
                  .filter((pr): pr is NonNullable<typeof pr> => Boolean(pr));
                const hypotheses = strategy.active_hypotheses.filter((h) => h.pillar_id === p.id);
                const bestConfidence = matchedProfiles.map((pr) => pr.confidence_level).find(Boolean);
                const messageResonance = matchedProfiles.map((pr) => pr.message_resonance).find(Boolean);

                return (
                  <SectionCard key={p.id} title={p.label} desc={deriveLabel(p.plain_descriptor, 72)}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3 h-3 text-interactive/70" />
                            <span className={cn(TYPE.label, "text-muted-foreground/70")}>Who&apos;s responding</span>
                          </div>
                          {bestConfidence && <ConfidenceBadge value={bestConfidence} />}
                        </div>
                        {matchedProfiles.length > 0 ? (
                          <div className="space-y-2">
                            <IcpChips ids={targetIcps} profiles={strategy.icp_profiles} />
                            {matchedProfiles.map((pr) =>
                              pr.demographic_foundation ? (
                                <DetailReveal
                                  key={pr.profile_id}
                                  label={deriveLabel(pr.demographic_foundation, 60)}
                                  labelClassName={cn(TYPE.caption, "text-muted-foreground/75")}
                                  eyebrow={pr.profile_name}
                                  sections={[{ text: pr.demographic_foundation }]}
                                />
                              ) : null,
                            )}
                          </div>
                        ) : (
                          <p className={cn(TYPE.caption, "text-muted-foreground/70")}>No ICP linked to this pillar yet.</p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MessageSquare className="w-3 h-3 text-interactive/70" />
                          <span className={cn(TYPE.label, "text-muted-foreground/70")}>What they&apos;re responding to</span>
                        </div>
                        <VariableStackChips stack={p.variable_stack} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Lightbulb className="w-3 h-3 text-interactive/70" />
                          <span className={cn(TYPE.label, "text-muted-foreground/70")}>Why</span>
                        </div>
                        <DetailReveal
                          label={deriveLabel(p.why_it_matters, 72)}
                          labelClassName={cn(TYPE.body, "text-foreground/85")}
                          eyebrow="Why it matters"
                          sections={[
                            { text: p.why_it_matters },
                            { label: "Message resonance", text: messageResonance },
                          ]}
                        />
                      </div>
                    </div>

                    {hypotheses.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/20">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FlaskConical className="w-3 h-3 text-interactive/70" />
                          <span className={cn(TYPE.label, "text-muted-foreground/70")}>Testing hypotheses</span>
                        </div>
                        <ul className="space-y-1.5">
                          {hypotheses.map((h) => (
                            <li key={h.id}>
                              <HypothesisLabel label={h.label} isolated={h.isolated_variable} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {pillarHasDetails(p) && (
                      <div className="mt-3 pt-3 border-t border-border/20">
                        <PillarDetailSections pillar={p} profiles={strategy.icp_profiles} />
                      </div>
                    )}
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
