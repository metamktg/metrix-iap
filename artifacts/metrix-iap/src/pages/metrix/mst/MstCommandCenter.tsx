// ─── MST · Command Center ────────────────────────────────────────────
// The parent /app/mst route. No execution control here — no backend job
// exists yet to "run" a sprint (MST is populated by the importer, not an
// in-app action). Hard-gated on this account having at least one
// generated brief. Analytical depth lives only in the child pages.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PrerequisiteGate, CrossLink,
  StageLoopHub, buildLoopStages,
} from "../shared";
import { Network, Grid3x3, TrendingUp, Compass } from "lucide-react";

const SECTION = "MST · 06";

const CHILDREN = [
  { to: "/app/mst/cross-map", label: "Cross-Map", Icon: Network, desc: "Concepts mapped to strategy pillars, and planned cells crossmapped to observed performance." },
  { to: "/app/mst/sprints", label: "Sprints", Icon: Grid3x3, desc: "The 4×4 test matrix for this account." },
  { to: "/app/mst/performance", label: "Performance", Icon: TrendingUp, desc: "Universal vs avatar-specific winners." },
  { to: "/app/mst/direction", label: "Direction", Icon: Compass, desc: "The Optimization Loop — next-sprint priorities." },
];

export function MstCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);

  return (
    <ModuleScopeGate section={SECTION} title="MST" account={account}>
      {() => {
        const acct = account!;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="MST"
              subtitle="Matrix Sprint Test results for this account's briefed creative."
            />
            <ScopeBanner account={acct} />
            <StageLoopHub stages={buildLoopStages(status)} current="mst" />

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <PrerequisiteGate
                met={status.mst.unlocked}
                title="Generate briefs first"
                message="MST reads matrix cells briefed for this account — this account doesn't have any generated briefs yet."
                ctaLabel="Go to Creative"
                ctaTo="/app/creative"
              >
                {() => (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {CHILDREN.map((c) => (
                      <div key={c.to} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <c.Icon className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-foreground">{c.label}</div>
                            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{c.desc}</p>
                          </div>
                        </div>
                        <CrossLink to={c.to} label="Open" />
                      </div>
                    ))}
                  </div>
                )}
              </PrerequisiteGate>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
