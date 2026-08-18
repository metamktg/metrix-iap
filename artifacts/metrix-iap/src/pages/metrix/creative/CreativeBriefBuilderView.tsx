// ─── Creative · Brief Builder — the canvas's master-detail layout ─────
// The canvas creative.briefs screen: brief list on the left (title,
// status tag, asset-type/priority/voice meta), the selected brief's
// workspace on the right — "Why this brief exists" panel, hook + CTA,
// spec grid, variable descriptors, a production-detail fold (visual
// direction, variable stack, success criteria, the brief's own real
// production checklist), source-pillar evidence, and the assign/export
// handoff actions. Everything shown is read from the brief document —
// no editable fields are faked and no boilerplate checklists are
// invented. Selection is driven by ?focus=<brief id> (deep links keep
// working); without one, the first brief is selected like the canvas.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData, getAnalysisData, getMST, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  CrossLink, useFocusParam, FlowCrumb, useFromParam, SectionCard, ConfidenceBadge,
} from "../shared";
import { TYPE } from "../typography";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import { FileText, Sparkles, Download, Mail, ChevronDown, ClipboardCheck } from "lucide-react";
import type { DraftBrief } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { AddToTrayButton } from "@/components/tray/AddToTrayButton";
import { cn } from "@workspace/command-deck/lib/utils";

const SECTION = "Creative · 05";

const STATUS_LABEL: Record<string, string> = {
  draft_from_seed: "Draft",
  validation_draft_from_seed: "Validation draft",
  control_refresh_from_seed: "Control refresh",
  generated_p1: "Generated · P1",
  generated_p2: "Generated · P2",
};

// ─── full_brief accessors ──────────────────────────────────────────────
// full_brief is a loosely-typed loop-output document; these read one
// section/field defensively and return null/[] rather than guessing.

function fbSection(b: DraftBrief, key: string): Record<string, unknown> | null {
  const sec = b.full_brief?.[key];
  return sec && typeof sec === "object" && !Array.isArray(sec) ? (sec as Record<string, unknown>) : null;
}

function fbString(sec: Record<string, unknown> | null, key: string): string | null {
  const v = sec?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function fbStringList(b: DraftBrief, key: string): string[] {
  const v = b.full_brief?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

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

// ─── Detail sub-blocks ─────────────────────────────────────────────────

function FieldPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.015] px-3.5 py-3">
      <div className={cn(TYPE.microLabel, "text-muted-foreground/55 mb-1")}>{label}</div>
      {children}
    </div>
  );
}

function SpecCell({ label, value, caption }: { label: string; value: string; caption?: string | null }) {
  return (
    <div>
      <div className={cn(TYPE.microLabel, "text-muted-foreground/50")}>{label}</div>
      <div className={cn(TYPE.body, "font-medium text-foreground/90 mt-0.5")}>{value}</div>
      {caption && <div className={cn(TYPE.label, "text-muted-foreground/50 mt-0.5")}>{caption}</div>}
    </div>
  );
}

export function CreativeBriefBuilderView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const focus = useFocusParam();
  const fp = useFromParam();
  const [, navigate] = useLocation();
  const [prodOpen, setProdOpen] = useState(false);
  const bb = getBriefBuilder(seed, adAccountId);
  const briefs = useMemo(() => bb?.draft_briefs ?? [], [bb]);
  // Canvas behavior: a valid ?focus selects that brief; otherwise the
  // first brief is selected (unknown ids fall back rather than 404-ing).
  const detail = (focus ? briefs.find((b) => b.id === focus) : null) ?? briefs[0] ?? null;

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
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Brief Builder" subtitle="Draft briefs · production workspace" />
              <PendingState title="No briefs yet" message="Generate briefs from the Creative command center first." icon={FileText} action={<CrossLink to="/app/creative" label="Go to Creative" />} />
            </div>
          );
        }

        const pillar = pillarOf(detail.source_pillar);
        const pillarLabel = pillar?.label ?? detail.source_pillar;
        const meta = fbSection(detail, "brief_metadata");
        const copy = fbSection(detail, "copy_architecture");
        const specs = fbSection(detail, "creative_specifications");
        const visual = fbSection(detail, "visual_direction");
        const foundation = fbSection(detail, "strategic_foundation");
        const testing = fbSection(detail, "testing_framework");
        const checklist = fbStringList(detail, "production_checklist");
        const priority = fbString(meta, "priority");
        const hook = fbString(copy, "hook");
        const cta = fbString(copy, "cta");
        const stack = fbString(foundation, "angle_stack");
        const successCriteria = fbString(testing, "success_criteria");
        const hypothesisId = fbString(testing, "hypothesis");
        const avoidList = (visual?.["avoid_list"] as unknown[] | undefined)?.filter((x): x is string => typeof x === "string") ?? [];
        const hasProductionDetail = visual != null || stack != null || successCriteria != null || checklist.length > 0;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Brief Builder"
              subtitle="Draft briefs · production workspace"
              table="brief_builder.draft_briefs"
              right={<CrossLink to="/app/creative" label="Back to Creative" />}
            />
            <FlowCrumb {...fp} />

            <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-4 items-start max-w-6xl">
              {/* ── Left: brief list ── */}
              <div className="space-y-2.5" data-testid="brief-list">
                <p className={cn(TYPE.caption, "text-muted-foreground/60")}>
                  {briefs.length} brief{briefs.length === 1 ? "" : "s"} · draft_briefs
                </p>
                {briefs.map((b) => {
                  const selected = b.id === detail.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => navigate(`/app/creative/builder?focus=${b.id}`)}
                      data-testid={`brief-list-item-${b.id}`}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "w-full text-left rounded-xl border p-3.5 transition-colors",
                        selected
                          ? "border-primary/45 bg-primary/[0.05]"
                          : "border-border/40 bg-white/[0.02] hover:border-primary/30 hover:bg-white/[0.04]",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn(TYPE.body, "font-semibold text-foreground leading-tight truncate")}>
                          {pillarOf(b.source_pillar)?.label ?? b.source_pillar}
                        </span>
                        <span className={cn(TYPE.label, "shrink-0 inline-flex border border-border/40 bg-white/[0.04] rounded-full px-2 py-0.5 text-foreground/70")}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </span>
                      <span className={cn(TYPE.label, "flex gap-1.5 flex-wrap text-muted-foreground/60 mt-1.5")}>
                        <span>{b.asset_type}</span>
                        {fbString(fbSection(b, "brief_metadata"), "priority") && (
                          <>
                            <span>·</span>
                            <span>{fbString(fbSection(b, "brief_metadata"), "priority")}</span>
                          </>
                        )}
                        {b.voice && (
                          <>
                            <span>·</span>
                            <span className="truncate">{b.voice}</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ── Right: selected brief workspace ── */}
              <div className="space-y-4 min-w-0" data-testid="brief-detail">
                <div className="rounded-xl border border-border/50 bg-white/[0.02] p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={cn(TYPE.label, "font-semibold uppercase tracking-[0.14em] text-interactive/75")}>
                      {detail.id}{detail.book ? ` · ${detail.book}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      {detail.confidence && <ConfidenceBadge value={detail.confidence} />}
                      <AddToTrayButton
                        scopeId={adAccountId ?? ""}
                        item={{
                          id: detail.id,
                          kind: "brief",
                          title: `${pillarLabel} — ${detail.asset_type} brief`,
                          sub: detail.human_direction,
                          href: `/app/creative/builder?focus=${detail.id}`,
                        }}
                        compact
                      />
                    </span>
                  </div>
                  <h3 className="text-cardtitle font-semibold text-foreground">{pillarLabel}</h3>

                  <FieldPanel label="Why this brief exists">
                    <p className={cn(TYPE.body, "text-foreground/85 leading-relaxed")}>
                      <TokenizedConceptText text={detail.human_direction} />
                    </p>
                  </FieldPanel>

                  {hook && (
                    <FieldPanel label="Hook">
                      <div className="flex items-start justify-between gap-3">
                        <p className={cn(TYPE.body, "text-foreground/85 leading-relaxed")}>{hook}</p>
                        {cta && (
                          <span className={cn(TYPE.label, "shrink-0 inline-flex border border-primary/35 bg-primary/10 text-interactive rounded-full px-2 py-0.5 font-medium")}>
                            {cta}
                          </span>
                        )}
                      </div>
                    </FieldPanel>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SpecCell label="Format" value={fbString(specs, "format") ?? detail.asset_type} caption={fbString(specs, "dimensions")} />
                    {priority && <SpecCell label="Priority" value={priority} />}
                    {detail.mode && <SpecCell label="Mode" value={detail.mode} />}
                    {detail.voice && <SpecCell label="Voice" value={detail.voice} />}
                  </div>

                  {detail.plain_variable_descriptors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.plain_variable_descriptors.map((d) => (
                        <span key={d} className={cn(TYPE.label, "text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none")}>{d}</span>
                      ))}
                    </div>
                  )}

                  {/* Production detail fold — the canvas's advanced section,
                      filled from the brief's own full_brief document. */}
                  {hasProductionDetail && (
                    <>
                      <button
                        type="button"
                        onClick={() => setProdOpen((v) => !v)}
                        aria-expanded={prodOpen}
                        data-testid="brief-production-fold"
                        className={cn(TYPE.caption, "flex items-center gap-1.5 font-medium text-muted-foreground/70 hover:text-foreground/90 transition-colors")}
                      >
                        Production detail
                        <ChevronDown className={cn("w-3 h-3 transition-transform", prodOpen && "rotate-180")} />
                      </button>
                      {prodOpen && (
                        <div className="space-y-3">
                          {visual && (
                            <FieldPanel label="Visual direction">
                              <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>
                                {[fbString(visual, "imagery"), fbString(visual, "composition"), fbString(visual, "typography")].filter(Boolean).join(" · ")}
                              </p>
                              {avoidList.length > 0 && (
                                <p className={cn(TYPE.label, "text-amber-300/75 mt-1.5")}>Avoid: {avoidList.join(" · ")}</p>
                              )}
                            </FieldPanel>
                          )}
                          {stack && (
                            <FieldPanel label="Variable stack">
                              <p className={cn(TYPE.body, "font-mono text-foreground/80")}>{stack}</p>
                            </FieldPanel>
                          )}
                          {successCriteria && (
                            <FieldPanel label="Success criteria">
                              <div className="flex items-start justify-between gap-3">
                                <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>{successCriteria}</p>
                                {hypothesisId && (
                                  <span className={cn(TYPE.label, "shrink-0 font-mono text-muted-foreground/60 border border-border/40 rounded px-1.5 py-0.5")}>{hypothesisId}</span>
                                )}
                              </div>
                            </FieldPanel>
                          )}
                          {checklist.length > 0 && (
                            <FieldPanel label="Production checklist">
                              <ul className="space-y-1.5">
                                {checklist.map((item) => (
                                  <li key={item} className={cn(TYPE.body, "flex items-start gap-2 text-foreground/80")}>
                                    <ClipboardCheck className="w-3.5 h-3.5 text-interactive/60 shrink-0 mt-0.5" />
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </FieldPanel>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Handoff actions — real exports, no dead save buttons. */}
                  <div className="flex flex-wrap items-center gap-2 justify-end pt-1">
                    <button
                      onClick={() => downloadBriefJson(detail, acct.name)}
                      className={cn(TYPE.body, "flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border/50 font-medium text-foreground hover:bg-white/5 transition-colors")}
                    >
                      <Download className="w-3.5 h-3.5" /> Download brief (JSON)
                    </button>
                    <a
                      href={mailtoForBrief(detail, pillarLabel)}
                      className={cn(TYPE.body, "flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary/15 border border-primary/30 font-medium text-interactive hover:bg-primary/25 transition-colors")}
                    >
                      <Mail className="w-3.5 h-3.5" /> Email to production
                    </a>
                  </div>
                </div>

                {pillar && (
                  <SectionCard title="Source pillar" desc={pillar.plain_descriptor}>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-interactive/60" />
                      <span className={cn(TYPE.body, "font-medium text-foreground")}>{pillar.label}</span>
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

                <div className="flex items-center gap-4">
                  <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
