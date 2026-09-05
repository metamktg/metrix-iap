// ─── StageLayout · the Execution Layer shell ───────────────────────────
// Sweep spec §3. Every Execution Layer page composes this: the page
// supplies content, the shell supplies order, width and the slots, top to
// bottom: header · spine · pages · notice · status hub · execution card ·
// direction rail · content. The pages strip (owner, 2026-09-05) puts the
// stage's subpages at the top, where a reader landing on the centre looks
// for them, with each page's purpose and lineage behind an info tooltip;
// the explore grid at the foot of the page is gone. Fixed rules: one column, max-w-5xl,
// the execution card always above the direction rail (a reader looks for
// the button before the advice), the status hub always between the spine
// and the execution card so the run's state is read before the run is
// started again. The gates (ModuleScopeGate, PrerequisiteGate) stay
// outside the shell, exactly where each page keeps them today (§3.3).
//
// Notice policy (§3.4): at most one contextual notice per page, rendered
// in the notice slot; a second is dropped and reported in development.

import { useEffect } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { ModuleHeader, StageLoopHub, buildLoopStages, HubNavStrip, type HubNavItem, type StageStatusLike } from "./shared";
import { StatusHub } from "@/components/loop/StatusHub";
import { RecommendationSlider } from "@/components/deck/RecommendationSlider";
import type { DerivedRecommendation } from "@/lib/data/recommendations";
import type { StatusHubModel } from "@/lib/loop/statusHub";

export type StageId = "listen" | "analysis" | "strategy" | "creative" | "mst" | "action" | "reports" | "exports";

export interface StageLayoutProps {
  /** The loop stage the spine highlights. */
  stage: StageId;
  /** ModuleHeader's section eyebrow source, e.g. "Analysis · 03". */
  section: string;
  title: string;
  accountName?: string;
  /** One-line purpose, rendered as the header's info tooltip. */
  subtitle?: string;
  headerRight?: React.ReactNode;
  /** The stage-status hook's shape; the spine is built from it. */
  status: StageStatusLike;
  /** At most one; the shell renders the first and warns in development on more. */
  notice?: React.ReactNode | React.ReactNode[];
  /** The status hub's model (§4); absent on stages without one. */
  hub?: StatusHubModel | null;
  /** Accessible name of the hub region, e.g. "Analysis status". */
  hubLabel?: string;
  /** The run trigger and its parameters; absent on stages without a run. */
  execution?: React.ReactNode;
  /** The stage's direction rail; rendered only when there is something to say. */
  recommendations?: DerivedRecommendation[];
  /** The stage's own modules. */
  children?: React.ReactNode;
  /** The stage's subpages, rendered as the pages strip under the spine. */
  explore?: HubNavItem[];
  exploreLabel?: string;
  /** Anything that belongs after the content (a hidden page's cross-link). */
  footer?: React.ReactNode;
}

function firstNotice(notice: StageLayoutProps["notice"]): React.ReactNode | null {
  if (notice == null) return null;
  if (!Array.isArray(notice)) return notice;
  const present = notice.filter((n) => n != null && n !== false);
  return present.length > 0 ? present[0] : null;
}

export function StageLayout({
  stage,
  section,
  title,
  accountName,
  subtitle,
  headerRight,
  status,
  notice,
  hub,
  hubLabel,
  execution,
  recommendations = [],
  children,
  explore = [],
  exploreLabel = "Pages",
  footer,
}: StageLayoutProps) {
  const shown = firstNotice(notice);
  const offered = Array.isArray(notice) ? notice.filter((n) => n != null && n !== false).length : notice != null ? 1 : 0;
  useEffect(() => {
    if (import.meta.env.DEV && offered > 1) {
      console.warn(`StageLayout(${stage}): ${offered} notices offered; the policy is one per page and only the first rendered.`);
    }
  }, [offered, stage]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" data-testid="stage-layout" data-stage={stage}>
      <ModuleHeader section={section} title={title} accountName={accountName} subtitle={subtitle} right={headerRight} />
      <StageLoopHub stages={buildLoopStages(status)} current={stage} />
      {/* One column width across every command centre (MST's, the widest
          content, sets it): a reader walking the loop must never see the
          content column jump between widths. */}
      <div className={cn("px-6 py-5 space-y-4 max-w-5xl")} data-testid="stage-layout-column">
        {explore.length > 0 && (
          <div data-slot="pages">
            <HubNavStrip items={explore} label={exploreLabel} />
          </div>
        )}
        {shown && <div data-slot="notice">{shown}</div>}
        {hub && (
          <div data-slot="hub">
            <StatusHub model={hub} label={hubLabel ?? `${title} status`} />
          </div>
        )}
        {execution && <div data-slot="execution" className="space-y-4">{execution}</div>}
        {recommendations.length > 0 && (
          <div data-slot="direction">
            <RecommendationSlider recs={recommendations} title="Next best actions" />
          </div>
        )}
        {children && <div data-slot="content" className="space-y-4">{children}</div>}
        {footer && <div data-slot="footer">{footer}</div>}
      </div>
    </div>
  );
}
