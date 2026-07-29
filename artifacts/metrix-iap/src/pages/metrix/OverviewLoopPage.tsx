// ─── Overview · IAP Loop ────────────────────────────────────────────────
// The full agency-wide loop status page. Every account's stage-by-stage
// completion, unrolled — never executes anything, only shows status and
// links into each stage's own command center.

import { ModuleHeader } from "./shared";
import { OverviewLoopSummary } from "./OverviewLoopHub";

export function OverviewLoopPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Overview · 01"
        title="IAP Loop"
        subtitle="Every account's progress through Analysis → Strategy → Creative → MST. Status only — run each stage from its own command center."
      />
      <div className="px-6 py-5 max-w-3xl">
        <OverviewLoopSummary full />
      </div>
    </div>
  );
}
