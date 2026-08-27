// ─── Settings · Integrations · Live Meta connection ────────────────────
// Direct OAuth connection to Meta ad accounts is not yet available in the
// UI. This is a deliberate product decision, not a missing feature: the
// real OAuth flow, token encryption, and report-pull routes stay fully
// implemented server-side (see api-server's meta routes + generationEngine
// callers) for a focused future effort to build a proper interface around.
// Until then this surface only ever shows an honest "coming soon" state —
// manual CSV import (Settings → Integrations → per-account panel, or the
// Add Ad Account dialog) is the supported, fully-functional way to bring
// in performance data today.

import { Plug, FileUp } from "lucide-react";
import { SectionCard } from "../shared";

export function MetaLiveConnection() {
  return (
    <SectionCard
      title="Live Meta connection"
      desc="Direct OAuth connection to Meta ad accounts"
    >
      <div className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-foreground/[0.02]">
        <div className="w-9 h-9 rounded-lg border border-border/30 bg-foreground/[0.03] flex items-center justify-center shrink-0">
          <Plug className="w-4 h-4 text-muted-foreground/60" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body font-semibold text-foreground/85">Live Meta connection</span>
            <span className="text-label font-semibold uppercase tracking-widest border border-primary/25 bg-primary/[0.08] text-interactive/80 px-1.5 py-0.5 rounded shrink-0">
              Coming soon
            </span>
          </div>
          <p className="text-caption text-muted-foreground/70 leading-relaxed">
            Direct OAuth connection to Meta ad accounts is in active development and isn't available
            yet. Manual CSV import is the supported way to bring in performance data today.
          </p>
          <div className="flex items-start gap-2 pt-1">
            <FileUp className="w-3.5 h-3.5 text-interactive/70 shrink-0 mt-0.5" />
            <p className="text-caption text-foreground/70">
              Use <span className="font-medium">Manual import</span> from an ad account's Integrations
              panel, or the Add Ad Account dialog, to upload exported Meta reports now.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
