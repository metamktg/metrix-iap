// ─── Strategy · Avatars / ICP ─────────────────────────────────────────
// One scroll instead of disconnected tabs: matrix avatars (message angles
// per audience column), full strategy ICP profiles (theory + real
// performance side by side), and the demographic conversion signal.

import { useState, useRef, useCallback } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState,
  MetricTile, CrossLink, resultTerm, SectionCard, ConfidenceBadge, fmtUSD, fmtPct, fmtNum,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { VariableStackChips, VariableChip, familyLabel } from "./strategyShared";
import { computeAvatarDna, mergeAvatarDna, type AvatarDna, type DnaVariable } from "@/lib/creative-dna";
import { useDateRange } from "@/contexts/DateRangeContext";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { SegmentDrilldownModal } from "@/components/creative/SegmentDrilldownModal";
import type { SegmentId } from "@/lib/segment-analytics";
import { DemographicTable } from "../analysis/tables";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { Users, Fingerprint, DoorOpen, MessageSquareQuote, Compass, ArrowDownRight, ArrowUpRight, Dna } from "lucide-react";
import type { MSTMatrixColumn, MSTMatrixCell, ICPProfile } from "@/lib/data/seedTypes";

const SECTION = "Strategy · 04";

/** Labeled paragraph inside an ICP profile card. */
function IcpFact({
  label, value, Icon,
}: {
  label: string;
  value?: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  if (!value) return null;
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-2.5 h-2.5 text-muted-foreground/60" />
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
      </div>
      <p className="text-[11.5px] text-foreground/80 leading-relaxed">{value}</p>
    </div>
  );
}

/** One measured DNA variable with its evidence numbers. */
function DnaVariableLine({ v, resultNoun }: { v: DnaVariable; resultNoun: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/15 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <VariableChip code={v.code} />
        {v.family && (
          <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50">
            {familyLabel(v.family)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 tabular-nums">
        <span className="text-[10px] text-muted-foreground/70">{fmtUSD(v.spend, 0)}</span>
        <span className="text-[10px] text-muted-foreground/70">{fmtNum(v.results)} {resultNoun}</span>
        <span className="text-[10px] font-semibold text-foreground/85">
          {v.cpa != null ? `${fmtUSD(v.cpa)} CPA` : "no CPA"}
        </span>
      </div>
    </div>
  );
}

/** Compact "top measured DNA" chip strip (avatar cards, ICP cards). */
function DnaChipStrip({ variables, label, testId }: { variables: DnaVariable[]; label: string; testId: string }) {
  if (variables.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border/20" data-testid={testId}>
      <div className="flex items-center gap-1 mb-1.5">
        <Dna className="w-2.5 h-2.5 text-primary/70" />
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {variables.slice(0, 3).map((v) => (
          <span key={v.code} className="inline-flex items-center gap-1">
            <VariableChip code={v.code} showCode={false} />
            {v.cpa != null && (
              <span className="text-[9px] tabular-nums text-muted-foreground/70">{fmtUSD(v.cpa)}</span>
            )}
          </span>
        ))}
        {variables.length > 3 && (
          <span className="text-[9px] text-muted-foreground/60">+{variables.length - 3} more</span>
        )}
      </div>
    </div>
  );
}

/** Theory + performance side by side for one strategy ICP profile. */
function IcpProfileCard({
  profile, registerRef, flash, avatars, onAvatarClick, dna,
}: {
  profile: ICPProfile;
  registerRef?: (el: HTMLDivElement | null) => void;
  flash?: boolean;
  avatars?: MSTMatrixColumn[];
  onAvatarClick?: (columnId: string) => void;
  /** Measured creative DNA merged across this profile's avatars. */
  dna?: DnaVariable[];
}) {
  const perf = profile.performance_data ?? null;
  const hasPerf = perf != null && (perf.spend != null || perf.cpa != null || perf.cvr_link_pct != null);
  return (
    <div
      ref={registerRef}
      className={`rounded-xl border bg-white/[0.02] p-4 transition-colors duration-500 scroll-mt-24 ${
        flash ? "border-primary/70 bg-primary/[0.06]" : "border-border/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-tight">{profile.profile_name}</p>
          <span className="text-[9px] font-mono text-muted-foreground/60">{profile.profile_id}</span>
        </div>
        {profile.confidence_level && <ConfidenceBadge value={profile.confidence_level} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
        {/* Theory: who they are */}
        <div className="space-y-2.5">
          <IcpFact label="Demographics" value={profile.demographic_foundation} Icon={Users} />
          <IcpFact label="Psychographics" value={profile.psychographic_profile} Icon={Fingerprint} />
          <IcpFact label="Behavioral signals" value={profile.behavioral_signals} Icon={Compass} />
          <IcpFact label="Funnel entry" value={profile.funnel_entry_point} Icon={DoorOpen} />
        </div>

        {/* Evidence: how they actually performed */}
        <div className="space-y-2.5">
          {hasPerf && (
            <div className="rounded-lg border border-border/30 bg-white/[0.015] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">Real performance</span>
                {perf?.confidence && <ConfidenceBadge value={perf.confidence} />}
              </div>
              <div className="flex items-center gap-5">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">Spend</div>
                  <div className="text-[14px] font-bold text-foreground tabular-nums">{perf?.spend != null ? fmtUSD(perf.spend, 0) : "—"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">CPA</div>
                  <div className="text-[14px] font-bold text-foreground tabular-nums">{perf?.cpa != null ? fmtUSD(perf.cpa) : "—"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">Link CVR</div>
                  <div className="text-[14px] font-bold text-foreground tabular-nums">{perf?.cvr_link_pct != null ? fmtPct(perf.cvr_link_pct) : "—"}</div>
                </div>
              </div>
            </div>
          )}
          <IcpFact label="Message resonance" value={profile.message_resonance} Icon={MessageSquareQuote} />
          {profile.strategic_recommendation && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.05] p-3">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-primary/80 mb-0.5">Recommendation</div>
              <p className="text-[11.5px] text-foreground/85 leading-relaxed">{profile.strategic_recommendation}</p>
            </div>
          )}
        </div>
      </div>

      {avatars && avatars.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/20 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Targeted by avatar{avatars.length === 1 ? "" : "s"}
          </span>
          {avatars.map((col) => (
            <button
              key={col.id}
              onClick={() => onAvatarClick?.(col.id)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              data-testid={`link-icp-avatar-${col.id}`}
            >
              {col.name.replace(/\n/g, " ")}
              <ArrowUpRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {dna && dna.length > 0 && (
        <DnaChipStrip
          variables={dna}
          label="Creative DNA · measured via avatars"
          testId={`icp-dna-${profile.profile_id}`}
        />
      )}
    </div>
  );
}

export function AvatarsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [detail, setDetail] = useState<{ column: MSTMatrixColumn; cells: MSTMatrixCell[] } | null>(null);
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const [audienceSegment, setAudienceSegment] = useState<SegmentId | null>(null);
  const { rangeHasData } = useDateRange();
  const profileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashProfile, setFlashProfile] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToProfile = useCallback((profileId: string) => {
    const el = profileRefs.current[profileId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashProfile(profileId);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashProfile(null), 1600);
  }, []);
  const avatarRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashAvatar, setFlashAvatar] = useState<string | null>(null);
  const avatarFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToAvatar = useCallback((columnId: string) => {
    const el = avatarRefs.current[columnId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashAvatar(columnId);
    if (avatarFlashTimer.current) clearTimeout(avatarFlashTimer.current);
    avatarFlashTimer.current = setTimeout(() => setFlashAvatar(null), 1600);
  }, []);

  return (
    <ModuleScopeGate section={SECTION} title="Avatars" account={account}>
      {() => {
        const acct = account!;
        const term = resultTerm(acct);
        const mst = getMST(seed, adAccountId);
        const matrix = mst?.historical_matrix_4x4;
        const analysis = getAnalysisData(seed, adAccountId);
        const demo = analysis?.demographic_registration_signal ?? [];
        const icpProfiles = getStrategyData(seed, adAccountId)?.icp_profiles ?? [];

        if (!matrix && icpProfiles.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Avatars" />
              <ScopeBanner account={acct} />
              <PendingState title="No avatars yet" message="Avatars are derived from the MST matrix and strategy ICP profiles once they exist for this account." icon={Users} />
            </div>
          );
        }

        const cellsFor = (colId: string) => (matrix ? matrix.cells.filter((c) => c.column_id === colId) : []);
        const profileById = new Map(icpProfiles.map((p) => [p.profile_id, p]));
        // Only surface links to profiles that both a brief maps to AND that
        // actually render on this page — never a dangling reference.
        const matchedProfilesFor = (col: MSTMatrixColumn): ICPProfile[] =>
          (col.matched_profile_ids ?? [])
            .map((id) => profileById.get(id))
            .filter((p): p is ICPProfile => p != null);
        // Inverse of matched_profile_ids: which matrix avatars target a given
        // profile. Same brief-derived mapping, read the other direction — no
        // fabricated joins.
        const avatarsForProfile = (profileId: string): MSTMatrixColumn[] =>
          matrix ? matrix.columns.filter((col) => (col.matched_profile_ids ?? []).includes(profileId)) : [];
        // Measured creative DNA per avatar: only cells that actually ran
        // contribute — planned-but-unmeasured angles never fabricate numbers.
        const dnaByColumn = new Map<string, AvatarDna>(
          matrix ? matrix.columns.map((col) => [col.id, computeAvatarDna(col.id, matrix, analysis, mst)]) : []
        );
        const dnaForProfile = (profileId: string): DnaVariable[] =>
          mergeAvatarDna(
            avatarsForProfile(profileId)
              .map((col) => dnaByColumn.get(col.id))
              .filter((d): d is AvatarDna => d != null)
          );

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Avatars / ICP"
              subtitle="Who this account targets: matrix avatars, full ICP profiles, and the real audience signal — in one place."
              table="historical_matrix_4x4, icp_profiles, demographic_registration_signal"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Avatars come from the historical matrix; audience signal aggregates full flight windows — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="avatar data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Avatars" value={String(matrix?.columns.length ?? 0)} />
              <MetricTile label="Message angles" value={String(matrix?.cells.length ?? 0)} sub="matrix cells across avatars" />
              <MetricTile label="ICP profiles" value={String(icpProfiles.length)} sub="from the strategy map" />
              <MetricTile label="Audience rows" value={String(demo.length)} sub={`${term.singular} signal`} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {matrix && (
                <SectionCard
                  title="Matrix avatars"
                  desc="Audience columns from the historical MST matrix, with the message angles built for each."
                  table="historical_matrix_4x4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {matrix.columns.map((col) => {
                      const cells = cellsFor(col.id);
                      const matched = matchedProfilesFor(col);
                      return (
                        <div
                          key={col.id}
                          ref={(el) => { avatarRefs.current[col.id] = el; }}
                          className={`rounded-xl border bg-white/[0.02] transition-colors duration-500 scroll-mt-24 ${
                            flashAvatar === col.id ? "border-primary/70 bg-primary/[0.06]" : "border-border/40 hover:border-border/60"
                          }`}
                        >
                          <button
                            onClick={() => setDetail({ column: col, cells })}
                            className="w-full text-left p-4 hover:bg-white/[0.03] transition-colors rounded-xl"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 rounded-lg border border-primary/25 bg-primary/[0.08] flex items-center justify-center">
                                <Users className="w-4 h-4 text-primary/70" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-foreground leading-tight whitespace-pre-line">{col.name}</p>
                                <span className="text-[9px] font-mono text-muted-foreground/60">{col.icp}</span>
                              </div>
                            </div>
                            <div className="space-y-1.5 mt-3">
                              {cells.slice(0, 2).map((c) => (
                                <p key={c.cell_id} className="text-[11px] text-muted-foreground/70 leading-snug">
                                  <span className="font-mono text-[9px] text-muted-foreground/60 mr-1">{c.cell_id}</span>
                                  {c.plain_text.headline ?? c.concept_code}
                                </p>
                              ))}
                            </div>
                            {(() => {
                              const dna = dnaByColumn.get(col.id);
                              return dna && dna.variables.length > 0 ? (
                                <DnaChipStrip
                                  variables={dna.variables}
                                  label={`Creative DNA · measured from ${dna.measuredCellIds.length} angle${dna.measuredCellIds.length === 1 ? "" : "s"}`}
                                  testId={`avatar-dna-${col.id}`}
                                />
                              ) : null;
                            })()}
                            <div className="mt-3 pt-3 border-t border-border/20 text-[10px] text-muted-foreground/60">
                              {cells.length} message angle{cells.length === 1 ? "" : "s"} · tap for details
                            </div>
                          </button>
                          {matched.length > 0 && (
                            <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                ICP profile{matched.length === 1 ? "" : "s"}
                              </span>
                              {matched.map((p) => (
                                <button
                                  key={p.profile_id}
                                  onClick={() => scrollToProfile(p.profile_id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                                  data-testid={`link-avatar-icp-${p.profile_id}`}
                                >
                                  {p.profile_name}
                                  <ArrowDownRight className="w-3 h-3" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {icpProfiles.length > 0 && (
                <SectionCard
                  title="ICP profiles"
                  desc="Full customer profiles from the strategy map — who they are, and how they actually performed."
                  table="icp_profiles"
                >
                  <div className="space-y-3">
                    {icpProfiles.map((p) => (
                      <IcpProfileCard
                        key={p.profile_id}
                        profile={p}
                        registerRef={(el) => { profileRefs.current[p.profile_id] = el; }}
                        flash={flashProfile === p.profile_id}
                        avatars={avatarsForProfile(p.profile_id)}
                        onAvatarClick={scrollToAvatar}
                        dna={dnaForProfile(p.profile_id)}
                      />
                    ))}
                  </div>
                </SectionCard>
              )}

              <SectionCard
                title="Audience signal"
                desc={`Demographic ${term.singular} signal from this account's analysis.`}
                table="demographic_registration_signal"
              >
                {demo.length ? (
                  <DemographicTable rows={demo} onSegmentClick={analysis ? setAudienceSegment : undefined} />
                ) : (
                  <PendingState title="No audience signal" message={`Demographic ${term.singular} signal appears once analysis is available.`} icon={Users} />
                )}
              </SectionCard>
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4 flex-wrap">
                    {analysis && <SegmentDrilldownButton onClick={() => setSegmentsOpen(true)} />}
                    {matchedProfilesFor(detail.column).map((p) => (
                      <button
                        key={p.profile_id}
                        onClick={() => { setDetail(null); setTimeout(() => scrollToProfile(p.profile_id), 60); }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                        data-testid={`link-drawer-icp-${p.profile_id}`}
                      >
                        View ICP: {p.profile_name}
                        <ArrowDownRight className="w-3 h-3" />
                      </button>
                    ))}
                    <CrossLink to="/app/mst" label="Open MST matrix" />
                    <CrossLink to="/app/creative" label="Open Creative" />
                  </div>
                }
              >
                {(() => {
                  const dna = dnaByColumn.get(detail.column.id);
                  if (!dna) return null;
                  return (
                    <DrawerField label="Creative DNA — measured makeup">
                      {dna.variables.length > 0 ? (
                        <>
                          <p className="text-[10px] text-muted-foreground/70 leading-relaxed mb-1.5">
                            Aggregated from {dna.measuredCellIds.length} measured angle{dna.measuredCellIds.length === 1 ? "" : "s"} ({dna.measuredCellIds.join(", ")})
                            {dna.extensionCellIds.length > 0 ? ` — ${dna.extensionCellIds.length} beyond the planned grid` : ""}. Planned angles without performance data are excluded. Variables share angles, so rows overlap and are not additive.
                          </p>
                          <div data-testid={`drawer-dna-${detail.column.id}`}>
                            {dna.variables.slice(0, 10).map((v) => (
                              <DnaVariableLine key={v.code} v={v} resultNoun={term.plural} />
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/70">
                          No measured creative DNA yet — none of this avatar's angles have performance data.
                        </p>
                      )}
                    </DrawerField>
                  );
                })()}
                {detail.cells.map((c) => (
                  <DrawerField key={c.cell_id} label={`${c.cell_id} · ${c.concept_code}`}>
                    {c.plain_text.headline && <p className="font-semibold text-foreground">{c.plain_text.headline}</p>}
                    {c.plain_text.primary && <p className="mt-1">{c.plain_text.primary}</p>}
                    <div className="mt-2">
                      <VariableStackChips stack={c.variable_stack} />
                    </div>
                  </DrawerField>
                ))}
              </InfoDrawer>
            )}

            {analysis && (
              <SegmentDrilldownModal
                open={audienceSegment != null}
                onClose={() => setAudienceSegment(null)}
                segment={audienceSegment}
                analysis={analysis}
                cellIds={null}
                kicker="Audience signal"
              />
            )}

            {detail && analysis && (
              <SegmentGridModal
                open={segmentsOpen}
                onClose={() => setSegmentsOpen(false)}
                kicker={`Avatar · ${detail.column.icp}`}
                title={detail.column.name.replace(/\n/g, " ")}
                analysis={analysis}
                cellIds={detail.cells.map((c) => c.cell_id)}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
