// ─── Creative · Brief Builder ────────────────────────────────────────
// Per-brief workspace: takes one already-generated brief and lets you
// build out its production package — full direction, source evidence,
// and real assign/export/email-to-production handoff actions. Generation
// and the full brief gallery live one level up, in the Creative command
// center (/app/creative) — this page is reached by opening a brief there.

import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData, getAnalysisData, getMST, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState,
  CrossLink, useFocusParam, FlowCrumb, useFromParam, SectionCard, ConfidenceBadge,
} from "../shared";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import { FileText, Sparkles, Download, Mail, ClipboardCheck } from "lucide-react";
import type { DraftBrief } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";

const SECTION = "Creative · 05";

const STATUS_LABEL: Record<string, string> = {
  draft_from_seed: "Draft",
  validation_draft_from_seed: "Validation draft",
  control_refresh_from_seed: "Control refresh",
};

const UGC_CHECKLIST = [
  "Talent brief: who's on camera and why they fit the avatar",
  "Filming environment (native, not studio)",
  "Hook delivered in the first 2 seconds, verbatim or paraphrased",
  "Proof/demo moment called out explicitly",
  "On-screen CTA text, not just voiceover",
];
const STATIC_CHECKLIST = [
  "Primary text (hook + body) matching the human direction",
  "Headline pulled from the creative direction chips",
  "Visual treatment notes for the design/production team",
  "CTA button copy",
];

function downloadBriefJson(brief: DraftBrief, accountName: string) {
  const payload = { account: accountName, exported_at: new Date().toISOString(), brief };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metrix-brief-${brief.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function mailtoForBrief(brief: DraftBrief, pillarLabel: string): string {
  const subject = `Creative brief — ${pillarLabel} (${brief.asset_type})`;
  const body = [
    `Brief: ${brief.id}`,
    `Asset type: ${brief.asset_type}`,
    `Pillar: ${pillarLabel}`,
    "",
    "Direction:",
    brief.human_direction,
    "",
    "Creative direction:",
    ...brief.plain_variable_descriptors.map((d) => `- ${d}`),
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function CreativeBriefBuilderView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const focus = useFocusParam();
  const fp = useFromParam();
  const bb = getBriefBuilder(seed, adAccountId);
  const briefs = useMemo(() => bb?.draft_briefs ?? [], [bb]);
  const detail = focus ? briefs.find((b) => b.id === focus) ?? null : null;

  return (
    <ModuleScopeGate section={SECTION} title="Brief Builder" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const mst = getMST(seed, adAccountId);
        const pillarOf = (id: string) => strategy?.message_pillars.find((p) => p.id === id);

        if (!detail) {
          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader section={SECTION} title="Brief Builder" subtitle="Choose a brief from Creative to open its workspace." />
              <p className="sr-only">Choose a brief from Creative</p>
              <ScopeBanner account={acct} />
              {briefs.length === 0 ? (
                <PendingState title="No briefs yet" message="Generate briefs from the Creative command center first." icon={FileText} action={<CrossLink to="/app/creative" label="Go to Creative" />} />
              ) : (
                <div className="px-6 py-5 space-y-2.5 max-w-3xl">
                  {briefs.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-foreground leading-tight">{pillarOf(b.source_pillar)?.label ?? b.source_pillar}</p>
                        <p className="text-label text-muted-foreground/70 mt-0.5">{b.asset_type} · {STATUS_LABEL[b.status] ?? b.status}</p>
                      </div>
                      <CrossLink to={`/app/creative/builder?focus=${b.id}`} label="Open" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        const pillar = pillarOf(detail.source_pillar);
        const checklist = detail.asset_type.toLowerCase().includes("ugc") ? UGC_CHECKLIST : STATIC_CHECKLIST;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title={pillar?.label ?? detail.id}
              subtitle={`${detail.asset_type} brief · ${STATUS_LABEL[detail.status] ?? detail.status}`}
              right={<CrossLink to="/app/creative" label="Back to Creative" />}
            />
            <ScopeBanner account={acct} />
            <FlowCrumb {...fp} />

            <div className="px-6 py-5 space-y-4 max-w-3xl">
              <div className="flex items-center gap-2 flex-wrap -mb-1">
                <p className="text-caption text-muted-foreground/60">
                  {detail.asset_type} · {STATUS_LABEL[detail.status] ?? detail.status}
                  {detail.book && ` · ${detail.book}`}
                  {detail.mode && ` · ${detail.mode}`}
                  {detail.voice && ` · ${detail.voice}`}
                </p>
                {detail.confidence && <ConfidenceBadge value={detail.confidence} />}
              </div>
              <SectionCard title="Direction" desc="What to build.">
                <p className="text-title text-foreground/85 leading-relaxed"><TokenizedConceptText text={detail.human_direction} /></p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {detail.plain_variable_descriptors.map((d) => (
                    <span key={d} className="text-label text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{d}</span>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="What to include" desc={`Checklist for a ${detail.asset_type.toLowerCase().includes("ugc") ? "UGC" : "static"} handoff.`}>
                <ul className="space-y-1.5">
                  {checklist.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-body text-foreground/80">
                      <ClipboardCheck className="w-3.5 h-3.5 text-interactive/60 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </SectionCard>

              {pillar && (
                <SectionCard title="Source pillar" desc={pillar.plain_descriptor}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-interactive/60" />
                    <span className="text-body font-medium text-foreground">{pillar.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pillar.source_cells.map((c) => (
                      <CrossLink key={c} to={`/app/analysis/library?focus=${c}`} label={`Cell ${c}`} />
                    ))}
                  </div>
                  {analysis && pillar.source_cells.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {pillar.source_cells.map((c) => (
                        <CreativeCard
                          key={c}
                          data={cardFromCell(c, {
                            perfRows: analysis.performance_by_cell,
                            mst,
                            ...getCreativeLinkContext(seed, adAccountId),
                          })}
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>
              )}

              <SectionCard title="Assign for production" desc="Hand this brief off to whoever is building the asset.">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => downloadBriefJson(detail, acct.name)}
                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border/50 text-body font-medium text-foreground hover:bg-white/5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download brief (JSON)
                  </button>
                  <a
                    href={mailtoForBrief(detail, pillar?.label ?? detail.source_pillar)}
                    className="flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary/15 border border-primary/30 text-body font-medium text-interactive hover:bg-primary/25 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" /> Email to production
                  </a>
                </div>
              </SectionCard>

              <div className="flex items-center gap-4">
                <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
