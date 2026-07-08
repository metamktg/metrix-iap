// ─── Creative Briefs · Brief Builder ──────────────────────────────────
// Draft briefs derived from strategy pillars, organized by asset format
// (Static / Video / UGC). Drill-down drawer with cross-links back into
// Strategy. Video and UGC formats have no source-backed briefs yet.

import { useState, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData, getAnalysisData, getMST } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleTabs, ModuleScopeGate, PendingState,
  MetricTile, CaveatNote, CrossLink, useFocusParam,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { FileText, Sparkles, Video, Users } from "lucide-react";
import type { DraftBrief } from "@/lib/data/seedTypes";

const SECTION = "Creative Briefs · 05";

const STATUS_LABEL: Record<string, string> = {
  draft_from_seed: "Draft",
  validation_draft_from_seed: "Validation draft",
  control_refresh_from_seed: "Control refresh",
};

type FormatTab = "static" | "video" | "ugc";

function formatOf(assetType: string): FormatTab {
  const t = assetType.toLowerCase();
  if (t.includes("ugc")) return "ugc";
  if (t.includes("video")) return "video";
  return "static";
}

export function BriefBuilderView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<FormatTab>("static");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<DraftBrief | null>(null);
  const { rangeHasData } = useDateRange();

  const bb = getBriefBuilder(seed, adAccountId);

  // Deep-link: ?focus=<brief id> opens the drawer
  useEffect(() => {
    if (focus && bb) {
      const match = bb.draft_briefs.find((b) => b.id === focus);
      if (match) {
        setTab(formatOf(match.asset_type));
        setDetail(match);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, adAccountId]);

  return (
    <ModuleScopeGate section={SECTION} title="Brief Builder" account={account}>
      {() => {
        const acct = account!;
        const briefs = bb?.draft_briefs ?? [];
        const strategy = getStrategyData(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const mst = getMST(seed, adAccountId);
        const pillarOf = (id: string) => strategy?.message_pillars.find((p) => p.id === id);

        const byFormat = (f: FormatTab) => briefs.filter((b) => formatOf(b.asset_type) === f);
        const shown = byFormat(tab);
        const pillarsCovered = new Set(briefs.map((b) => b.source_pillar)).size;

        const TABS: { id: FormatTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = [
          { id: "static", label: "Static", count: byFormat("static").length, Icon: FileText },
          { id: "video", label: "Video", count: byFormat("video").length, Icon: Video },
          { id: "ugc", label: "UGC", count: byFormat("ugc").length, Icon: Users },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Brief Builder"
              subtitle="Creative briefs generated from strategy message pillars, by asset format."
              table="draft_briefs, message_pillars"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Briefs derive from the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="draft briefs" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Draft briefs" value={String(briefs.length)} />
              <MetricTile label="Pillars covered" value={String(pillarsCovered)} sub={`of ${strategy?.message_pillars.length ?? 0} message pillars`} />
              <MetricTile label="Static" value={String(byFormat("static").length)} />
              <MetricTile label="Video + UGC" value={String(byFormat("video").length + byFormat("ugc").length)} sub="no source-backed drafts yet" />
            </div>

            <div className="mt-4">
              <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-4xl">
              {bb?.source_policy && <CaveatNote text={bb.source_policy} />}

              {shown.length === 0 ? (
                <PendingState
                  title={`No ${tab === "ugc" ? "UGC" : tab} briefs yet`}
                  message={
                    tab === "static"
                      ? "Draft briefs appear here once strategy pillars are ready."
                      : `No source-backed ${tab === "ugc" ? "UGC" : "video"} briefs exist for this account yet. Briefs are only generated from validated strategy — nothing is fabricated.`
                  }
                  icon={tab === "video" ? Video : tab === "ugc" ? Users : FileText}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {shown.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setDetail(b)}
                      className="text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col hover:border-border/60 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 border border-border/40 px-1.5 py-0.5 rounded leading-none">
                          <FileText className="w-2.5 h-2.5" /> {b.asset_type}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-300 border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-3 h-3 text-primary/60" />
                        <span className="text-[11px] text-muted-foreground/60">From pillar</span>
                        <span className="text-[11px] font-medium text-foreground">{pillarOf(b.source_pillar)?.label ?? b.source_pillar}</span>
                      </div>

                      <p className="text-[12px] text-foreground/80 leading-relaxed flex-1">{b.human_direction}</p>

                      <div className="mt-3 pt-3 border-t border-border/20">
                        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-1.5">Creative direction</div>
                        <div className="flex flex-wrap gap-1.5">
                          {b.plain_variable_descriptors.map((d) => (
                            <span key={d} className="text-[10px] text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{d}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker={`Brief · ${detail.asset_type}`}
                title={pillarOf(detail.source_pillar)?.label ?? detail.id}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4">
                    <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
                    <CrossLink to="/app/briefs/history" label="View brief history" />
                  </div>
                }
              >
                <DrawerField label="Status">{STATUS_LABEL[detail.status] ?? detail.status}</DrawerField>
                <DrawerField label="Human direction">{detail.human_direction}</DrawerField>
                <DrawerField label="Creative direction">
                  <div className="flex flex-wrap gap-1.5">
                    {detail.plain_variable_descriptors.map((d) => (
                      <span key={d} className="text-[10px] text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{d}</span>
                    ))}
                  </div>
                </DrawerField>
                {pillarOf(detail.source_pillar) && (
                  <DrawerField label="Source pillar">
                    <p className="font-semibold text-foreground">{pillarOf(detail.source_pillar)!.label}</p>
                    <p className="italic text-primary/80 mt-0.5">"{pillarOf(detail.source_pillar)!.plain_descriptor}"</p>
                    <div className="mt-2 flex items-center gap-2">
                      {pillarOf(detail.source_pillar)!.source_cells.map((c) => (
                        <CrossLink key={c} to={`/app/analysis/library?focus=${c}`} label={`Cell ${c}`} />
                      ))}
                    </div>
                  </DrawerField>
                )}
                {analysis && pillarOf(detail.source_pillar) && pillarOf(detail.source_pillar)!.source_cells.length > 0 && (
                  <DrawerField label="Source creatives">
                    <div className="grid grid-cols-2 gap-2">
                      {pillarOf(detail.source_pillar)!.source_cells.map((c) => (
                        <CreativeCard
                          key={c}
                          data={cardFromCell(c, {
                            perfRows: analysis.performance_by_cell,
                            mst,
                            adAccountId,
                          })}
                        />
                      ))}
                    </div>
                  </DrawerField>
                )}
              </InfoDrawer>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
