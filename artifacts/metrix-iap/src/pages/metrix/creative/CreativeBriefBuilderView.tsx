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

import { ActionConfirmButton } from "@/components/widgets/CopyConfirmButton";
import { briefStatusLabel } from "@/lib/normalize";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData, getAnalysisData, getMST, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  CrossLink, useFocusParam, FlowCrumb, useFromParam, SectionCard, ConfidenceBadge,
} from "../shared";
import { TYPE, HEADING } from "../typography";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import { FileText, Sparkles, Download, Mail, ChevronDown, ClipboardCheck } from "lucide-react";
import type { DraftBrief } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { AddToTrayButton } from "@/components/tray/AddToTrayButton";
import { cn } from "@workspace/command-deck/lib/utils";

const SECTION = "Creative · 05";

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

/**
 * The emailed brief must be the brief on screen. It used to carry the
 * direction and the variable descriptors only — a writer receiving it got
 * neither the copy architecture nor what the test isolates, both of which
 * the engine had already written. Sections are omitted when empty rather
 * than emitted as blank headings.
 */
function mailtoForBrief(brief: DraftBrief, pillarLabel: string): string {
  const subject = `Creative brief — ${pillarLabel} (${brief.asset_type})`;
  const sec = (k: string) => {
    const v = brief.full_brief?.[k];
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  };
  const str = (o: Record<string, unknown> | null, k: string) => {
    const v = o?.[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const foundation = sec("strategic_foundation");
  const copy = sec("copy_architecture");
  const testing = sec("testing_framework");
  const specs = sec("creative_specifications");

  const part = (heading: string, ...lines: (string | null)[]) => {
    const kept = lines.filter((l): l is string => Boolean(l));
    return kept.length > 0 ? ["", `${heading}:`, ...kept] : [];
  };

  const body = [
    `Brief: ${brief.id}`,
    `Asset type: ${brief.asset_type}`,
    `Pillar: ${pillarLabel}`,
    ...part("Direction", brief.human_direction),
    // NOT data_insight — human_direction above already IS it (the seed
    // adapter maps one onto the other), so emitting both mails the same
    // sentence twice.
    ...part(
      "Evidence",
      str(foundation, "target_icp") && `Target: ${str(foundation, "target_icp")}${
        str(foundation, "avatar_basis") === "exploratory" ? " (exploratory — no historical avatar data)" : ""
      }`,
      str(foundation, "performance_benchmark") && `Benchmark: ${str(foundation, "performance_benchmark")}`,
    ),
    ...part(
      "Copy architecture",
      str(copy, "hook") && `Hook: ${str(copy, "hook")}`,
      str(copy, "problem_agitation_or_value_setup") && `Setup: ${str(copy, "problem_agitation_or_value_setup")}`,
      str(copy, "product_solution") && `Solution: ${str(copy, "product_solution")}`,
      str(copy, "proof") && `Proof: ${str(copy, "proof")}`,
      str(copy, "cta") && `CTA: ${str(copy, "cta")}`,
    ),
    ...part(
      "Testing framework",
      str(testing, "hypothesis") && `Hypothesis: ${str(testing, "hypothesis")}`,
      str(testing, "isolated_variable") && `Isolates: ${str(testing, "isolated_variable")}`,
      str(testing, "control_reference") && `Against control: ${str(testing, "control_reference")}`,
      str(testing, "success_criteria") && `Success criteria: ${str(testing, "success_criteria")}`,
    ),
    ...part(
      "Production",
      str(specs, "dimensions") && `Dimensions: ${str(specs, "dimensions")}`,
      str(specs, "placement") && `Placement: ${str(specs, "placement")}`,
      str(specs, "production_requirements"),
    ),
    ...part("Creative direction", ...brief.plain_variable_descriptors.map((d) => `- ${d}`)),
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ─── Detail sub-blocks ─────────────────────────────────────────────────

function FieldPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 bg-foreground/[0.015] px-3.5 py-3">
      <div className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-1")}>{label}</div>
      {children}
    </div>
  );
}

function SpecCell({ label, value, caption }: { label: string; value: string; caption?: string | null }) {
  return (
    <div>
      <div className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{label}</div>
      <div className={cn(TYPE.body, "font-medium text-foreground/90 mt-0.5")}>{value}</div>
      {caption && <div className={cn(TYPE.label, "text-muted-foreground/75 mt-0.5")}>{caption}</div>}
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
              <ModuleHeader section={SECTION} title="Brief Builder" accountName={acct.name} subtitle="Draft briefs · production workspace" />
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

        // ── Fields the engine writes on every brief that reached no screen ──
        // Audited 2026-09-01: the generator persists 34 fields per brief and
        // this page named 8. The copy architecture is the sharpest case — a
        // brief promises a writer the problem setup, the product solution and
        // the proof, and only the hook and CTA were rendered.
        const problemSetup = fbString(copy, "problem_agitation_or_value_setup");
        const productSolution = fbString(copy, "product_solution");
        const proof = fbString(copy, "proof");
        const hasCopyBody = problemSetup != null || productSolution != null || proof != null;

        // NOTE: strategic_foundation.data_insight is NOT read here — the seed
        // adapter already maps it onto DraftBrief.human_direction, which the
        // "Why this brief exists" panel renders. Reading it again would print
        // the same sentence twice.
        const targetIcp = fbString(foundation, "target_icp");
        const avatarBasis = fbString(foundation, "avatar_basis");
        const generatedAt = fbString(meta, "generated_at");
        const generatedBy = fbString(meta, "model");
        const conceptCode = fbString(foundation, "concept_code");
        const designSystem = fbString(foundation, "design_system");
        const ctaType = fbString(foundation, "cta_type");
        const perfBenchmark = fbString(foundation, "performance_benchmark");

        const isolatedVariable = fbString(testing, "isolated_variable");
        const controlReference = fbString(testing, "control_reference");
        const learningObjective = fbString(testing, "learning_objective");
        const matrixPosition = fbString(testing, "matrix_position");
        const hasTestingDetail =
          isolatedVariable != null || controlReference != null || learningObjective != null;

        const productionReqs = fbString(specs, "production_requirements");
        const placement = fbString(specs, "placement");
        const creativeName = fbString(specs, "creative_name");

        const hasProductionDetail =
          visual != null || stack != null || successCriteria != null || checklist.length > 0 ||
          hasTestingDetail || productionReqs != null || placement != null;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Brief Builder"
              accountName={acct.name}
              subtitle="Draft briefs · production workspace"
              table="brief_builder.draft_briefs"
              right={<CrossLink to="/app/creative" label="Back to Creative" />}
            />
            <FlowCrumb {...fp} />

            <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-4 items-start max-w-6xl">
              {/* ── Left: brief list ── */}
              <div className="space-y-2.5" data-testid="brief-list">
                <p className={cn(TYPE.caption, "text-muted-foreground/75")}>
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
                        "pressable-lg w-full text-left rounded-xl border p-3.5 transition-colors",
                        selected
                          ? "border-primary/45 bg-primary/[0.05]"
                          : "border-border/40 bg-foreground/[0.02] hover:border-primary/30 hover:bg-foreground/[0.04]",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn(TYPE.body, "font-semibold text-foreground leading-tight truncate")}>
                          {pillarOf(b.source_pillar)?.label ?? b.source_pillar}
                        </span>
                        <span className={cn(TYPE.label, "shrink-0 inline-flex border border-border/40 bg-foreground/[0.04] rounded-full px-2 py-0.5 text-foreground/70")}>
                          {briefStatusLabel(b.status)}
                        </span>
                      </span>
                      {/* VALUES, not labels — so no label role. TYPE.label uppercases
                          whatever wears it, and here that was shouting the brief's
                          voice ("WARM, ASPIRATIONAL…") and format back at the reader
                          as if the data itself were written in caps. Caption role:
                          reading floor, sentence case, exactly as the seed wrote it. */}
                      <span className={cn(TYPE.caption, "flex gap-1.5 flex-wrap text-muted-foreground/75 mt-1.5")}>
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
                <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="min-w-0">
                      <span className={cn(TYPE.label, "block font-semibold uppercase tracking-[0.14em] text-interactive/75")}>
                        {detail.id}{detail.book ? ` · ${detail.book}` : ""}
                      </span>
                      {/* Provenance: when this brief was written and by what.
                          Both are on every generated brief and reached no
                          screen — a reader deciding whether to trust a brief
                          should not have to open the JSON to see its age. */}
                      {(generatedAt || generatedBy) && (
                        <span className={cn(TYPE.caption, "block text-muted-foreground/75 mt-0.5")}>
                          {[
                            generatedAt ? `Generated ${new Date(generatedAt).toLocaleDateString()}` : null,
                            generatedBy,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      )}
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
                  <h2 className={HEADING.h2}>{pillarLabel}</h2>

                  <FieldPanel label="Why this brief exists">
                    <p className={cn(TYPE.body, "text-foreground/85 leading-relaxed")}>
                      <TokenizedConceptText text={detail.human_direction} />
                    </p>
                    {/* NOT data_insight — the seed adapter already maps
                        strategic_foundation.data_insight onto human_direction
                        above, so rendering it here would print the same
                        sentence twice. What IS unrendered is the benchmark it
                        was measured against, and who the brief is aimed at. */}
                    {(perfBenchmark || targetIcp) && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/25 space-y-1">
                        {targetIcp && (
                          <p className={cn(TYPE.caption, "text-muted-foreground/85 leading-relaxed")}>
                            <span className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mr-1.5")}>
                              Target
                            </span>{" "}
                            {targetIcp}
                            {/* Honesty label from the generator: an exploratory
                                matrix column is a data-less hypothesis and must
                                never read as a real avatar link. */}
                            {avatarBasis === "exploratory" && (
                              <span className={cn(TYPE.label, "ml-1.5 text-status-warning/85 border border-status-warning/25 bg-status-warning/[0.06] rounded px-1.5 py-0.5")}>
                                exploratory — no historical avatar data
                              </span>
                            )}
                          </p>
                        )}
                        {perfBenchmark && (
                          <p className={cn(TYPE.caption, "text-muted-foreground/85 leading-relaxed")}>
                            <span className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mr-1.5")}>
                              Benchmark
                            </span>{" "}
                            {perfBenchmark}
                          </p>
                        )}
                      </div>
                    )}
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

                  {/* The rest of the copy architecture. A brief that shows a
                      hook and a CTA and withholds the setup, the solution and
                      the proof is not a brief a writer can execute. Rendered
                      in narrative order — the order the ad is read in. */}
                  {hasCopyBody && (
                    <FieldPanel label="Copy architecture">
                      <div className="space-y-3">
                        {problemSetup && (
                          <div>
                            <div className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mb-0.5")}>
                              Problem / value setup
                            </div>
                            <p className={cn(TYPE.body, "text-foreground/85 leading-relaxed")}>{problemSetup}</p>
                          </div>
                        )}
                        {productSolution && (
                          <div>
                            <div className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mb-0.5")}>
                              Product solution
                            </div>
                            <p className={cn(TYPE.body, "text-foreground/85 leading-relaxed")}>{productSolution}</p>
                          </div>
                        )}
                        {proof && (
                          <div>
                            <div className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mb-0.5")}>
                              Proof
                            </div>
                            <p className={cn(TYPE.body, "text-foreground/85 leading-relaxed")}>{proof}</p>
                          </div>
                        )}
                      </div>
                    </FieldPanel>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SpecCell label="Format" value={fbString(specs, "format") ?? detail.asset_type} caption={fbString(specs, "dimensions")} />
                    {priority && <SpecCell label="Priority" value={priority} />}
                    {detail.mode && <SpecCell label="Mode" value={detail.mode} />}
                    {detail.voice && <SpecCell label="Voice" value={detail.voice} />}
                    {/* Written on every brief, previously unshown. Concept code
                        is the creative's identity; placement and CTA type are
                        production-defining, not trivia. */}
                    {conceptCode && <SpecCell label="Concept" value={conceptCode} />}
                    {matrixPosition && <SpecCell label="Matrix cell" value={matrixPosition} />}
                    {placement && <SpecCell label="Placement" value={placement} />}
                    {ctaType && <SpecCell label="CTA type" value={ctaType} />}
                    {designSystem && <SpecCell label="Design system" value={designSystem} />}
                    {creativeName && <SpecCell label="Creative name" value={creativeName} />}
                  </div>

                  {detail.plain_variable_descriptors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.plain_variable_descriptors.map((d) => (
                        <span key={d} className={cn(TYPE.label, "text-foreground/75 border border-border/40 bg-foreground/[0.03] px-1.5 py-0.5 rounded leading-none")}>{d}</span>
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
                        className={cn("pressable", TYPE.caption, "flex items-center gap-1.5 font-medium text-muted-foreground/75 hover:text-foreground/90 transition-colors")}
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
                                <p className={cn(TYPE.label, "text-status-warning/75 mt-1.5")}>Avoid: {avoidList.join(" · ")}</p>
                              )}
                            </FieldPanel>
                          )}
                          {stack && (
                            <FieldPanel label="Variable stack">
                              <p className={cn(TYPE.body, " text-foreground/80")}>{stack}</p>
                            </FieldPanel>
                          )}
                          {successCriteria && (
                            <FieldPanel label="Success criteria">
                              <div className="flex items-start justify-between gap-3">
                                <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>{successCriteria}</p>
                                {hypothesisId && (
                                  <span className={cn(TYPE.label, "shrink-0 text-muted-foreground/75 border border-border/40 rounded px-1.5 py-0.5")}>{hypothesisId}</span>
                                )}
                              </div>
                            </FieldPanel>
                          )}

                          {/* What this brief actually tests. Without the
                              isolated variable and its control, a "test" is
                              just another ad — these three fields are what
                              make the brief part of a matrix. */}
                          {hasTestingDetail && (
                            <FieldPanel label="Testing framework">
                              <div className="space-y-2">
                                {isolatedVariable && (
                                  <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>
                                    <span className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mr-1.5")}>
                                      Isolates
                                    </span>{" "}
                                    {isolatedVariable}
                                  </p>
                                )}
                                {controlReference && (
                                  <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>
                                    <span className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mr-1.5")}>
                                      Against control
                                    </span>{" "}
                                    {controlReference}
                                  </p>
                                )}
                                {learningObjective && (
                                  <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>
                                    <span className={cn(TYPE.label, "font-semibold uppercase tracking-widest text-muted-foreground/75 mr-1.5")}>
                                      Learning objective
                                    </span>{" "}
                                    {learningObjective}
                                  </p>
                                )}
                              </div>
                            </FieldPanel>
                          )}

                          {productionReqs && (
                            <FieldPanel label="Production requirements">
                              <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>{productionReqs}</p>
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
                    <ActionConfirmButton
                      onAction={() => downloadBriefJson(detail, acct.name)}
                      icon={Download}
                      label="Download brief (JSON)"
                      confirmedLabel="Saved"
                      className={TYPE.body}
                    />
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
