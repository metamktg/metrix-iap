// ─── Performance Intelligence panels ─────────────────────────────────
// Hub-level decision-ready panels: TLDR card, top creative / avatar /
// copy / variable strips, strategy direction, tip signals, hypothesis
// queue. All panels read from the seed via the adapter — no network
// calls. Each panel self-guards (returns null when its data is absent)
// so caller hubs need no extra guard logic.
//
// Exported panels:
//   HubTldrCard             — collapsible TLDR per account (localStorage)
//   TopCreativeStrip        — top 3 cells by result rate (AnalysisHub)
//   TopAvatarPanel          — top 3 ICP profiles by CPA w/ age+gender filter (AnalysisHub)
//   TopCopyStrip            — top 3 pillars by spend, opens InfoDrawer (AnalysisHub)
//   TopVariableStackStrip   — top 3 combos by CPA      (AnalysisHub)
//   StrategyDirectionStrip  — 4-lane playbook strip     (StrategyHub)
//   TipSignalsStrip         — top 3 opt-loop signals    (StrategyHub)
//   HypothesisQueuePanel    — top 5 hypotheses           (Strategy+Brief)

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TYPE } from "./typography";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount,
  getAnalysisData,
  getStrategyData,
  getOptimizationLoop,
  getListenSignals,
  getMST,
  getCreativeLinkContext,
  getCoreControls,
  getCampaignSummary,
} from "@/lib/data/metrixSeedAdapter";
import {
  SectionCard,
  ConfidenceBadge,
  fmtUSD,
  fmtPct,
  deriveLabel,
  resultTerm,
} from "./shared";
import {
  HypothesisStatusBadge,
  HypothesisCodeChipsRow,
  playbookHasContent,
} from "./strategy/strategyShared";
import { normalizeConfidence } from "@/lib/normalize";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { CreativeExpandDialog } from "@/components/creative/CreativeExpandDialog";
import { VariableDrilldownModal } from "@/components/creative/VariableDrilldownModal";
import { cardFromCell } from "@/lib/creative-assembly";
import {
  ChevronDown,
  X,
  ArrowUpRight,
  Zap,
  Users,
  ImageOff,
} from "lucide-react";
import type {
  ICPProfile,
  ActiveHypothesis,
  CellPerformanceRow,
  MessagePillar,
  DemographicRow,
  PlacementRow,
  VariablePerformanceRow,
} from "@/lib/data/seedTypes";

// ─── HorizontalStrip ─────────────────────────────────────────────────
// Wraps Carousel to show `visibleCount` items at a time with prev/next
// arrow buttons and a "Showing X of Y" count badge. Buttons are rendered
// only when there are more items than the visible count.

function HorizontalStrip({
  items,
  totalCount,
  visibleCount = 3,
  ariaLabel,
}: {
  items: React.ReactNode[];
  totalCount: number;
  visibleCount?: number;
  ariaLabel?: string;
}) {
  const hasMore = items.length > visibleCount;
  const basisClass =
    visibleCount === 4 ? "basis-1/4" :
    visibleCount === 2 ? "basis-1/2" : "basis-1/3";

  return (
    <Carousel opts={{ align: "start" }} aria-label={ariaLabel}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn(TYPE.label, "normal-case text-muted-foreground/50 tracking-normal")}>
          Showing {Math.min(visibleCount, totalCount)} of {totalCount}
        </span>
        {hasMore && (
          <div className="flex items-center gap-1">
            <CarouselPrevious
              aria-label="Previous"
              className="static h-6 w-6 left-auto top-auto translate-y-0"
            />
            <CarouselNext
              aria-label="Next"
              className="static h-6 w-6 right-auto top-auto translate-y-0"
            />
          </div>
        )}
      </div>
      <CarouselContent className="-ml-2.5">
        {items.map((item, i) => (
          <CarouselItem key={i} className={cn("pl-2.5", basisClass)}>
            {item}
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}

// ─── TLDR card ──────────────────────────────────────────────────────

export function HubTldrCard({ accountId }: { accountId: string }) {
  const storageKey = `hub-tldr-dismissed-${accountId}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const [collapsed, setCollapsed] = useState(false);

  const seed = useMetrixSeed();
  const controls = getCoreControls(seed, accountId);
  const summary = getCampaignSummary(seed, accountId);
  const account = getAdAccount(seed, accountId);
  const rTerm = resultTerm(account);

  if (dismissed || !controls?.primary_control) return null;

  const totalSpend = summary?.total_spend_usd;
  const spendNote =
    totalSpend != null && totalSpend > 0
      ? `${fmtUSD(totalSpend, 0)} total spend.`
      : null;
  const controlRead = controls.primary_control_read
    ? deriveLabel(controls.primary_control_read, 160)
    : null;

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary/15">
        <Zap className="w-3.5 h-3.5 text-interactive shrink-0" />
        <span className={cn(TYPE.label, "text-interactive flex-1")}>
          TL;DR · {rTerm.Plural} signal
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="p-0.5 text-interactive/50 hover:text-interactive transition-colors"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform duration-150",
              collapsed && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="p-0.5 text-interactive/50 hover:text-interactive transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {!collapsed && (
        <div className="px-4 py-3 space-y-1.5">
          <p className={cn(TYPE.body, "text-foreground/90 leading-relaxed font-medium")}>
            {controls.primary_control}
          </p>
          {controlRead && (
            <p className={cn(TYPE.caption, "text-muted-foreground/70 leading-relaxed")}>
              {controlRead}
            </p>
          )}
          {spendNote && (
            <p className={cn(TYPE.caption, "text-muted-foreground/50 tabular-nums")}>
              {spendNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Top Creative strip ──────────────────────────────────────────────

function cellResultRate(row: CellPerformanceRow): number {
  if (!row.Impressions || row.Impressions <= 0) return 0;
  return (row.Results / row.Impressions) * 100;
}

function primaryCellRows(rows: CellPerformanceRow[]): CellPerformanceRow[] {
  const byCell = new Map<string, CellPerformanceRow>();
  for (const row of rows) {
    const prev = byCell.get(row.cell_id);
    if (!prev || row["Amount spent (USD)"] > prev["Amount spent (USD)"]) {
      byCell.set(row.cell_id, row);
    }
  }
  return Array.from(byCell.values());
}

function CreativeThumbnail({ assetUrl, title }: { assetUrl: string | null | undefined; title: string }) {
  const [failed, setFailed] = useState(false);

  if (!assetUrl || failed) {
    return (
      <div className="w-full h-14 rounded mb-2 bg-white/[0.04] border border-border/20 flex items-center justify-center">
        <ImageOff className="w-4 h-4 text-muted-foreground/30" />
      </div>
    );
  }
  return (
    <div className="w-full h-14 rounded mb-2 overflow-hidden bg-black/20">
      <img
        src={assetUrl}
        alt={title}
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function TopCreativeStrip({ accountId }: { accountId: string }) {
  const seed = useMetrixSeed();
  const analysis = getAnalysisData(seed, accountId);
  const mst = getMST(seed, accountId);
  const { ads, metaAdAccountId } = getCreativeLinkContext(seed, accountId);

  const [expandData, setExpandData] = useState<ReturnType<
    typeof cardFromCell
  > | null>(null);
  const [expandDemographic, setExpandDemographic] = useState<DemographicRow[]>(
    [],
  );
  const [expandPlacements, setExpandPlacements] = useState<PlacementRow[]>([]);

  // Compute top cells + pre-build cards so we have assetUrl for thumbnails
  const topCellCards = useMemo(() => {
    const perfRows = analysis?.performance_by_cell ?? [];
    const topRows = primaryCellRows(perfRows)
      .sort((a, b) => cellResultRate(b) - cellResultRate(a));
    return topRows.map((row) => ({
      row,
      card: cardFromCell(row.cell_id, { perfRows, mst, ads, metaAdAccountId }),
    }));
  }, [analysis, mst, ads, metaAdAccountId]);

  if (!analysis || topCellCards.length === 0) return null;

  function openExpand(cellId: string) {
    const perfRows = analysis!.performance_by_cell;
    const data = cardFromCell(cellId, { perfRows, mst, ads, metaAdAccountId });
    const demographic = (analysis!.demographic_registration_signal ?? []).filter(
      (r) => r.cell_id === cellId,
    );
    const placements = (analysis!.v3_placement_signal ?? []) as PlacementRow[];
    setExpandData(data);
    setExpandDemographic(demographic);
    setExpandPlacements(placements);
  }

  return (
    <>
      <SectionCard
        title="Top Creative"
        desc="Top cells by result rate (results ÷ impressions) from the latest analysis run"
      >
        <HorizontalStrip
          items={topCellCards.map(({ row, card }) => {
            const rate = cellResultRate(row);
            const cpa = row.CPA_result;
            const spend = row["Amount spent (USD)"];
            return (
              <button
                key={row.cell_id}
                onClick={() => openExpand(row.cell_id)}
                className="w-full text-left rounded-lg border border-border/40 bg-white/[0.02] p-3 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors"
              >
                <CreativeThumbnail
                  assetUrl={card.assetUrl}
                  title={row.book2_concept_name || row.cell_id}
                />
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={cn(
                      TYPE.label,
                      "font-mono text-muted-foreground/60 normal-case tracking-tight",
                    )}
                  >
                    {row.cell_id}
                  </span>
                  <ArrowUpRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                </div>
                <p
                  className={cn(
                    TYPE.body,
                    "font-semibold text-foreground truncate mb-2.5",
                  )}
                >
                  {row.book2_concept_name || row.cell_id}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>
                      CVR
                    </p>
                    <p className="text-body font-semibold tabular-nums text-foreground/85">
                      {fmtPct(rate, 2)}
                    </p>
                  </div>
                  <div>
                    <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>
                      CPA
                    </p>
                    <p className="text-body font-semibold tabular-nums text-foreground/85">
                      {cpa != null ? fmtUSD(cpa) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>
                      Spend
                    </p>
                    <p className="text-body font-semibold tabular-nums text-foreground/85">
                      {fmtUSD(spend, 0)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
          totalCount={topCellCards.length}
          ariaLabel="Top Creative"
        />
      </SectionCard>

      {expandData && (
        <CreativeExpandDialog
          open={true}
          onOpenChange={(v) => {
            if (!v) setExpandData(null);
          }}
          data={expandData}
          demographic={expandDemographic}
          placements={expandPlacements}
        />
      )}
    </>
  );
}

// ─── Top Avatar panel ────────────────────────────────────────────────
// Age-band detection: parse common patterns from demographic_foundation.
// Canonical bands: 18-24, 25-34, 35-44, 45-54, 55+.

type GenderFilter = "all" | "male" | "female";

const CANONICAL_AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
type AgeBand = (typeof CANONICAL_AGE_BANDS)[number] | "other";

function detectProfileGender(profile: ICPProfile): "male" | "female" | "both" {
  const text = [
    profile.profile_name,
    profile.demographic_foundation ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const hasMale = /\bmale\b|\bmen\b|\bman\b/.test(text);
  const hasFemale = /\bfemale\b|\bwomen\b|\bwoman\b/.test(text);
  if (hasMale && hasFemale) return "both";
  if (hasMale) return "male";
  if (hasFemale) return "female";
  return "both";
}

function detectProfileAgeBand(profile: ICPProfile): AgeBand | null {
  const text = (profile.demographic_foundation ?? "").toLowerCase();
  // Check each canonical band (normalise en-dash to hyphen)
  for (const band of CANONICAL_AGE_BANDS) {
    const normalized = text.replace(/[–—]/g, "-");
    if (normalized.includes(band)) return band;
  }
  // Fallback: any NN-NN or NN+ pattern
  const m = normalized_age(text);
  return m ?? null;
}

function normalized_age(text: string): AgeBand | null {
  const norm = text.replace(/[–—]/g, "-");
  if (/\b55\+|\b55\s*(?:and|or)\s*(?:over|above|older)\b/.test(norm)) return "55+";
  const rangeM = norm.match(/\b(\d{2})\s*-\s*(\d{2})\b/);
  if (rangeM) {
    const lo = parseInt(rangeM[1]);
    const hi = parseInt(rangeM[2]);
    for (const band of CANONICAL_AGE_BANDS) {
      if (band === "55+") continue;
      const [bLo, bHi] = band.split("-").map(Number);
      if (lo >= bLo && hi <= bHi) return band;
    }
    return "other";
  }
  return null;
}

function IcpDrawerContent({ profile }: { profile: ICPProfile }) {
  const perf = profile.performance_data;
  return (
    <>
      {profile.confidence_level && (
        <div>
          <ConfidenceBadge value={profile.confidence_level} />
        </div>
      )}
      {perf && (perf.spend != null || perf.cpa != null || perf.cvr_link_pct != null) && (
        <DrawerField label="Performance">
          <div className="grid grid-cols-3 gap-2 mt-1">
            {perf.spend != null && (
              <div>
                <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>Spend</p>
                <p className="text-body font-semibold text-foreground/85">{fmtUSD(perf.spend, 0)}</p>
              </div>
            )}
            {perf.cpa != null && (
              <div>
                <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>CPA</p>
                <p className="text-body font-semibold text-foreground/85">{fmtUSD(perf.cpa)}</p>
              </div>
            )}
            {perf.cvr_link_pct != null && (
              <div>
                <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>CVR</p>
                <p className="text-body font-semibold text-foreground/85">{fmtPct(perf.cvr_link_pct)}</p>
              </div>
            )}
          </div>
        </DrawerField>
      )}
      {profile.demographic_foundation && (
        <DrawerField label="Demographics">{profile.demographic_foundation}</DrawerField>
      )}
      {profile.psychographic_profile && (
        <DrawerField label="Psychographic">{profile.psychographic_profile}</DrawerField>
      )}
      {profile.behavioral_signals && (
        <DrawerField label="Behavioral signals">{profile.behavioral_signals}</DrawerField>
      )}
      {profile.funnel_entry_point && (
        <DrawerField label="Funnel entry">{profile.funnel_entry_point}</DrawerField>
      )}
      {profile.message_resonance && (
        <DrawerField label="Message resonance">{profile.message_resonance}</DrawerField>
      )}
      {profile.strategic_recommendation && (
        <DrawerField label="Strategic recommendation">{profile.strategic_recommendation}</DrawerField>
      )}
    </>
  );
}

export function TopAvatarPanel({ accountId }: { accountId: string }) {
  const seed = useMetrixSeed();
  const strategy = getStrategyData(seed, accountId);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [ageBandFilter, setAgeBandFilter] = useState<AgeBand | "all">("all");
  const [detail, setDetail] = useState<ICPProfile | null>(null);

  const { sortedProfiles, ageBands } = useMemo(() => {
    const profiles = strategy?.icp_profiles ?? [];
    const sorted = [...profiles].sort(
      (a, b) =>
        (a.performance_data?.cpa ?? Infinity) -
        (b.performance_data?.cpa ?? Infinity),
    );
    // Collect distinct age bands that appear in at least one profile
    const bandSet = new Set<AgeBand>();
    for (const p of sorted) {
      const b = detectProfileAgeBand(p);
      if (b) bandSet.add(b);
    }
    // Order canonical bands first, then "other"
    const orderedBands: AgeBand[] = [
      ...CANONICAL_AGE_BANDS.filter((b) => bandSet.has(b)),
      ...(bandSet.has("other") ? (["other"] as AgeBand[]) : []),
    ];
    return { sortedProfiles: sorted, ageBands: orderedBands };
  }, [strategy]);

  const filtered = useMemo(() => {
    return sortedProfiles
      .filter((p) => {
        if (genderFilter !== "all") {
          const g = detectProfileGender(p);
          if (g !== genderFilter && g !== "both") return false;
        }
        if (ageBandFilter !== "all") {
          const b = detectProfileAgeBand(p);
          if (b !== ageBandFilter) return false;
        }
        return true;
      });
  }, [sortedProfiles, genderFilter, ageBandFilter]);

  if ((strategy?.icp_profiles ?? []).length === 0) return null;

  const showAgeBands = ageBands.length >= 2;

  return (
    <>
      <SectionCard
        title="Top Avatars"
        desc="Top ICP profiles ranked by CPA (lowest = most efficient)"
        right={
          <div className="flex items-center gap-1.5">
            {/* Gender filter */}
            <div className="flex items-center gap-0.5 border border-border/40 rounded-md overflow-hidden">
              {(["all", "male", "female"] as GenderFilter[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenderFilter(g)}
                  className={cn(
                    "px-2 py-0.5 text-label font-semibold transition-colors",
                    genderFilter === g
                      ? "bg-primary/15 text-interactive"
                      : "text-muted-foreground/60 hover:text-foreground/80",
                  )}
                >
                  {g === "all" ? "All" : g === "male" ? "M" : "F"}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {/* Age band filter row — shown only when ≥2 distinct bands are detected */}
        {showAgeBands && (
          <div className="flex items-center gap-1 flex-wrap mb-3">
            <button
              type="button"
              onClick={() => setAgeBandFilter("all")}
              className={cn(
                "px-2 py-0.5 rounded text-label font-semibold border transition-colors",
                ageBandFilter === "all"
                  ? "bg-primary/15 text-interactive border-primary/25"
                  : "border-border/40 text-muted-foreground/60 hover:text-foreground/80",
              )}
            >
              All ages
            </button>
            {ageBands.map((band) => (
              <button
                key={band}
                type="button"
                onClick={() => setAgeBandFilter(band)}
                className={cn(
                  "px-2 py-0.5 rounded text-label font-semibold border transition-colors",
                  ageBandFilter === band
                    ? "bg-primary/15 text-interactive border-primary/25"
                    : "border-border/40 text-muted-foreground/60 hover:text-foreground/80",
                )}
              >
                {band === "other" ? "Other age" : band}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className={cn(TYPE.caption, "py-2 italic")}>
            No profiles match this filter.
          </p>
        ) : (
          <HorizontalStrip
            items={filtered.map((profile) => {
              const perf = profile.performance_data;
              return (
                <button
                  key={profile.profile_id}
                  onClick={() => setDetail(profile)}
                  className="w-full text-left rounded-lg border border-border/40 bg-white/[0.02] p-3 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg border border-primary/25 bg-primary/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="w-3.5 h-3.5 text-interactive/70" />
                    </div>
                    <p
                      className={cn(
                        TYPE.body,
                        "font-semibold text-foreground leading-tight line-clamp-2",
                      )}
                    >
                      {profile.profile_name}
                    </p>
                  </div>
                  {perf && (
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>CPA</p>
                        <p className="text-body font-semibold tabular-nums text-foreground/85">
                          {perf.cpa != null ? fmtUSD(perf.cpa) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>CVR</p>
                        <p className="text-body font-semibold tabular-nums text-foreground/85">
                          {perf.cvr_link_pct != null ? fmtPct(perf.cvr_link_pct) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>Spend</p>
                        <p className="text-body font-semibold tabular-nums text-foreground/85">
                          {perf.spend != null ? fmtUSD(perf.spend, 0) : "—"}
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.confidence_level && (
                    <div className="mt-2">
                      <ConfidenceBadge value={profile.confidence_level} />
                    </div>
                  )}
                </button>
              );
            })}
            totalCount={filtered.length}
            ariaLabel="Top Avatars"
          />
        )}
      </SectionCard>

      {detail && (
        <InfoDrawer
          kicker={`ICP Profile · ${detail.profile_id}`}
          title={detail.profile_name}
          onClose={() => setDetail(null)}
        >
          <IcpDrawerContent profile={detail} />
        </InfoDrawer>
      )}
    </>
  );
}

// ─── Top Copy strip ──────────────────────────────────────────────────
// Ranked by spend across source cells; clicking opens a pillar InfoDrawer.

function pillarSpend(pillar: MessagePillar, perfRows: CellPerformanceRow[]): number {
  const cellSet = new Set(pillar.source_cells ?? []);
  if (cellSet.size === 0) return 0;
  return perfRows
    .filter((r) => cellSet.has(r.cell_id))
    .reduce((s, r) => s + r["Amount spent (USD)"], 0);
}

function PillarDrawerContent({ pillar, spend }: { pillar: MessagePillar; spend: number }) {
  return (
    <>
      {spend > 0 && (
        <DrawerField label="Matched spend">{fmtUSD(spend, 0)}</DrawerField>
      )}
      {pillar.plain_descriptor && (
        <DrawerField label="Descriptor">{pillar.plain_descriptor}</DrawerField>
      )}
      {pillar.why_it_matters && (
        <DrawerField label="Why it matters">{pillar.why_it_matters}</DrawerField>
      )}
      {pillar.funnel_application && (
        <DrawerField label="Funnel application">{pillar.funnel_application}</DrawerField>
      )}
      {pillar.execution_specifications && (
        <DrawerField label="Execution specs">{pillar.execution_specifications}</DrawerField>
      )}
      {(pillar.source_cells ?? []).length > 0 && (
        <DrawerField label="Source cells">
          {pillar.source_cells!.join(", ")}
        </DrawerField>
      )}
    </>
  );
}

export function TopCopyStrip({ accountId }: { accountId: string }) {
  const seed = useMetrixSeed();
  const strategy = getStrategyData(seed, accountId);
  const analysis = getAnalysisData(seed, accountId);
  const [detail, setDetail] = useState<{ pillar: MessagePillar; spend: number } | null>(null);

  const topPillars = useMemo(() => {
    const pillars = strategy?.message_pillars ?? [];
    const perfRows = analysis?.performance_by_cell ?? [];
    return [...pillars]
      .map((p) => ({ pillar: p, spend: pillarSpend(p, perfRows) }))
      .sort((a, b) => b.spend - a.spend);
  }, [strategy, analysis]);

  if (!strategy || topPillars.length === 0) return null;

  return (
    <>
      <SectionCard
        title="Top Copy"
        desc="Top message pillars ranked by matched spend across their source cells"
      >
        <HorizontalStrip
          items={topPillars.map(({ pillar, spend }) => (
            <button
              key={pillar.id}
              onClick={() => setDetail({ pillar, spend })}
              className="w-full text-left rounded-lg border border-border/40 bg-white/[0.02] p-3 flex flex-col gap-2 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors"
            >
              <div className="flex items-start justify-between gap-1">
                <p
                  className={cn(TYPE.body, "font-semibold text-foreground line-clamp-2 flex-1")}
                >
                  {pillar.label}
                </p>
                <ArrowUpRight className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
              </div>
              {pillar.plain_descriptor && (
                <p
                  className={cn(TYPE.caption, "line-clamp-2 text-muted-foreground/65")}
                >
                  {deriveLabel(pillar.plain_descriptor, 72)}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-border/20">
                <div>
                  <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>Spend</p>
                  <p className="text-body font-semibold tabular-nums text-foreground/85">
                    {spend > 0 ? fmtUSD(spend, 0) : "—"}
                  </p>
                </div>
                <span className={cn(TYPE.label, "text-muted-foreground/40")}>
                  {(pillar.source_cells ?? []).length} cell
                  {(pillar.source_cells ?? []).length !== 1 ? "s" : ""}
                </span>
              </div>
            </button>
          ))}
          totalCount={topPillars.length}
          ariaLabel="Top Copy"
        />
      </SectionCard>

      {detail && (
        <InfoDrawer
          kicker={`Message Pillar · ${detail.pillar.id}`}
          title={detail.pillar.label}
          onClose={() => setDetail(null)}
        >
          <PillarDrawerContent pillar={detail.pillar} spend={detail.spend} />
        </InfoDrawer>
      )}
    </>
  );
}

// ─── Top Variable Stack strip ────────────────────────────────────────

const RECO_BADGE: Record<string, string> = {
  scale:
    "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  optimize:
    "bg-amber-400/10 text-amber-300 border-amber-400/20",
  validate:
    "bg-[#16d9ff]/10 text-[#62e6ff] border-[#16d9ff]/20",
  avoid:
    "bg-red-400/10 text-red-300 border-red-400/20",
};

export function TopVariableStackStrip({ accountId }: { accountId: string }) {
  const seed = useMetrixSeed();
  const strategy = getStrategyData(seed, accountId);
  const analysis = getAnalysisData(seed, accountId);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const topCombos = useMemo(() => {
    const combos = strategy?.variable_combinations ?? [];
    return [...combos]
      .filter((c) => c.cpa != null)
      .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  }, [strategy]);

  if (!strategy || topCombos.length === 0) return null;

  return (
    <>
      <SectionCard
        title="Top Variable Stacks"
        desc="Top variable combinations by CPA (best performing first)"
      >
        <HorizontalStrip
          items={topCombos.map((combo, i) => {
            const codes = combo.combination.split(/\s*\+\s*/).filter(Boolean);
            const firstCode = codes[0] ?? null;
            const recoKey = combo.recommendation?.toLowerCase() ?? "";
            return (
              <button
                key={`${combo.combination}-${i}`}
                onClick={() => {
                  if (firstCode && analysis) setOpenCode(firstCode);
                }}
                disabled={!firstCode || !analysis}
                className="w-full text-left rounded-lg border border-border/40 bg-white/[0.02] p-3 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors disabled:opacity-60 disabled:cursor-default"
              >
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {codes.slice(0, 4).map((code) => (
                    <span
                      key={code}
                      className="text-label font-mono text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none"
                    >
                      {code}
                    </span>
                  ))}
                  {codes.length > 4 && (
                    <span className="text-label text-muted-foreground/50">
                      +{codes.length - 4}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>CPA</p>
                    <p className="text-body font-semibold tabular-nums text-foreground/85">
                      {fmtUSD(combo.cpa)}
                    </p>
                  </div>
                  {combo.cvr_pct != null && (
                    <div>
                      <p className={cn(TYPE.label, "normal-case tracking-tight mb-0.5")}>CVR</p>
                      <p className="text-body font-semibold tabular-nums text-foreground/85">
                        {fmtPct(combo.cvr_pct)}
                      </p>
                    </div>
                  )}
                </div>
                {combo.recommendation && (
                  <span
                    className={cn(
                      "mt-2 inline-flex text-label font-semibold uppercase tracking-wide border px-1.5 py-0.5 rounded leading-none",
                      RECO_BADGE[recoKey] ??
                        "bg-muted text-muted-foreground/60 border-border/40",
                    )}
                  >
                    {combo.recommendation}
                  </span>
                )}
              </button>
            );
          })}
          totalCount={topCombos.length}
          ariaLabel="Top Variable Stacks"
        />
      </SectionCard>

      {openCode && analysis && (
        <VariableDrilldownModal
          open={true}
          onClose={() => setOpenCode(null)}
          code={openCode}
          analysis={analysis}
          variableRows={
            (analysis.v3_variable_performance ?? []) as VariablePerformanceRow[]
          }
        />
      )}
    </>
  );
}

// ─── Strategy Direction strip ────────────────────────────────────────

const DIRECTION_LANES = [
  {
    key: "scale_now" as const,
    label: "Scale",
    accent: "text-emerald-400",
    border: "border-emerald-500/20 bg-emerald-500/[0.04]",
  },
  {
    key: "optimize" as const,
    label: "Optimize",
    accent: "text-amber-300",
    border: "border-amber-500/20 bg-amber-500/[0.04]",
  },
  {
    key: "validate" as const,
    label: "Validate",
    accent: "text-[#62e6ff]",
    border: "border-[#16d9ff]/20 bg-[#16d9ff]/[0.04]",
  },
  {
    key: "avoid_combinations" as const,
    label: "Avoid",
    accent: "text-red-300",
    border: "border-red-500/20 bg-red-500/[0.04]",
  },
] as const;

export function StrategyDirectionStrip({ accountId }: { accountId: string }) {
  const seed = useMetrixSeed();
  const strategy = getStrategyData(seed, accountId);
  const playbook = strategy?.scaling_playbook;

  if (!playbook || !playbookHasContent(playbook)) return null;

  return (
    <SectionCard
      title="Strategy Direction"
      desc="Scale / Optimize / Validate / Avoid signals from the scaling playbook"
    >
      <div className="grid grid-cols-4 gap-2.5">
        {DIRECTION_LANES.map(({ key, label, accent, border }) => {
          const items = (playbook[key] as string[] | undefined) ?? [];
          return (
            <div key={key} className={cn("rounded-lg border p-3", border)}>
              <p className={cn(TYPE.label, "mb-2", accent)}>{label}</p>
              {items.length === 0 ? (
                <p className={cn(TYPE.caption, "italic text-muted-foreground/40")}>
                  —
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {items.slice(0, 3).map((item, i) => (
                    <li
                      key={i}
                      className={cn(
                        TYPE.caption,
                        "text-foreground/75 leading-snug line-clamp-2",
                      )}
                    >
                      {deriveLabel(item, 55)}
                    </li>
                  ))}
                  {items.length > 3 && (
                    <li className={cn(TYPE.label, "text-muted-foreground/50")}>
                      +{items.length - 3} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Tip Signals strip ───────────────────────────────────────────────
// Sources from optimization_loop.recommendation_cards first, then
// falls back to listen.signal_cards (same runtime shape, different type).

interface TipSignalShape {
  id: string;
  title: string;
  rationale?: string | null;
  confidence: string;
}

export function TipSignalsStrip({ accountId }: { accountId: string }) {
  const seed = useMetrixSeed();
  const loop = getOptimizationLoop(seed, accountId);
  const listenSignals = getListenSignals(seed, accountId);

  const signals = useMemo((): TipSignalShape[] => {
    const cards = loop?.recommendation_cards ?? [];
    if (cards.length > 0) return cards.slice(0, 3);
    return (listenSignals as unknown as TipSignalShape[]).slice(0, 3);
  }, [loop, listenSignals]);

  if (signals.length === 0) return null;

  return (
    <SectionCard
      title="Tip Signals"
      desc="Top optimization signals from the loop for this account"
    >
      <div className="space-y-2">
        {signals.map((signal) => {
          const conf = normalizeConfidence(signal.confidence);
          const badgeCls =
            conf.polarity === "negative"
              ? "bg-red-400/10 text-red-300 border-red-400/20"
              : conf.level === "high"
                ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                : "bg-primary/10 text-interactive border-primary/20";

          return (
            <div
              key={signal.id}
              className="flex items-start gap-3 rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2.5"
            >
              <span
                className={cn(
                  "shrink-0 text-label font-semibold border px-1.5 py-0.5 rounded leading-none mt-0.5",
                  badgeCls,
                )}
              >
                {conf.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className={cn(TYPE.body, "font-semibold text-foreground leading-tight")}>
                  {signal.title}
                </p>
                {signal.rationale && (
                  <p
                    className={cn(
                      TYPE.caption,
                      "text-muted-foreground/65 leading-relaxed line-clamp-2 mt-0.5",
                    )}
                  >
                    {deriveLabel(signal.rationale, 90)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Hypothesis Queue panel ──────────────────────────────────────────

const HYP_STATUS_ORDER: Record<string, number> = {
  ready_for_brief_builder: 0,
  validation_required: 1,
  high: 2,
  p1: 2,
  proposed: 3,
  medium: 4,
  p2: 4,
  testing: 5,
  low: 6,
  p3: 6,
  validated: 7,
  rejected: 8,
};

function hypOrder(status: string): number {
  return HYP_STATUS_ORDER[status.toLowerCase()] ?? 99;
}

export function HypothesisQueuePanel({ accountId }: { accountId: string }) {
  const seed = useMetrixSeed();
  const strategy = getStrategyData(seed, accountId);
  const [detail, setDetail] = useState<ActiveHypothesis | null>(null);

  const topHypotheses = useMemo(() => {
    const hyps = strategy?.active_hypotheses ?? [];
    return [...hyps]
      .sort((a, b) => hypOrder(a.status) - hypOrder(b.status))
      .slice(0, 5);
  }, [strategy]);

  if ((strategy?.active_hypotheses ?? []).length === 0) return null;

  return (
    <>
      <SectionCard
        title="Hypothesis Queue"
        desc="Top 5 active hypotheses ordered by status priority"
      >
        <div className="space-y-1.5">
          {topHypotheses.map((hyp) => (
            <button
              key={hyp.id}
              onClick={() => setDetail(hyp)}
              className="w-full text-left flex items-start gap-2.5 rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2.5 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <HypothesisCodeChipsRow label={hyp.label} />
                <p
                  className={cn(
                    TYPE.body,
                    "text-foreground/80 leading-snug line-clamp-1",
                  )}
                >
                  {deriveLabel(hyp.label, 80)}
                </p>
              </div>
              <HypothesisStatusBadge status={hyp.status} />
            </button>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border/20">
          <a
            href="/app/briefs"
            className="inline-flex items-center gap-1 text-body font-semibold text-interactive/80 hover:text-interactive transition-colors"
          >
            View all in Briefs
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </SectionCard>

      {detail && (
        <InfoDrawer
          kicker={`Hypothesis · ${detail.id}`}
          title={detail.label}
          onClose={() => setDetail(null)}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <HypothesisStatusBadge status={detail.status} />
          </div>
          {detail.source && (
            <DrawerField label="Source / control">{detail.source}</DrawerField>
          )}
          {detail.test_variant && (
            <DrawerField label="Test variant">{detail.test_variant}</DrawerField>
          )}
          {detail.isolated_variable && (
            <DrawerField label="Isolated variable">
              {detail.isolated_variable}
            </DrawerField>
          )}
          {detail.success_criteria && (
            <DrawerField label="Success criteria">
              {detail.success_criteria}
            </DrawerField>
          )}
          {detail.expected_impact && (
            <DrawerField label="Expected impact">
              {detail.expected_impact}
            </DrawerField>
          )}
          {detail.risk && (
            <DrawerField label="Risk">{detail.risk}</DrawerField>
          )}
        </InfoDrawer>
      )}
    </>
  );
}
