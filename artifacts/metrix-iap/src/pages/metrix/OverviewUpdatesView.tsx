// ─── Overview · Updates ─────────────────────────────────────────────────
// Platform changelog, curated Meta platform updates, and a getting-started
// guide. No backend content source exists yet for changelog/Meta updates
// (that needs an editorial table + admin authoring — P2) — this shows an
// honest empty state for those rather than fabricating entries. The
// getting-started guide is static onboarding copy, not editorial content,
// so it ships now.

import { ModuleHeader, SectionCard, PendingState } from "./shared";
import { Sparkles, Newspaper, BookOpen, Plug, LineChart, Compass, FileText } from "lucide-react";

const GUIDE_STEPS = [
  { Icon: Plug, title: "Connect or import an account", desc: "Connect a live Meta ad account (Settings → Integrations) or add a manual import — every module scopes to one account at a time." },
  { Icon: LineChart, title: "Run analysis", desc: "From the Analysis command center, pick a date range and run analysis on the staged data. Nothing runs automatically." },
  { Icon: Compass, title: "Generate strategy", desc: "Once analysis succeeds, generate message pillars and hypotheses from the Strategy command center." },
  { Icon: FileText, title: "Generate briefs, then test", desc: "Creative turns strategy into briefs; MST reads back what those briefs produced once they've run." },
];

export function OverviewUpdatesView() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Overview · 01"
        title="Updates"
        subtitle="Platform changes, curated Meta platform news, and how to get started."
      />
      <div className="px-6 py-5 space-y-4 max-w-3xl">
        <SectionCard title="Getting started">
          <div className="space-y-2.5">
            {GUIDE_STEPS.map((s, i) => (
              <div key={s.title} className="flex items-start gap-3 rounded-xl border border-border/40 bg-foreground/[0.02] p-3.5">
                <div className="w-6 h-6 rounded border border-border/40 bg-foreground/[0.03] flex items-center justify-center shrink-0 text-label text-muted-foreground/75">{i + 1}</div>
                <s.Icon className="w-3.5 h-3.5 text-interactive shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-body font-medium text-foreground">{s.title}</div>
                  <p className="text-caption text-muted-foreground/75 leading-relaxed mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Product updates">
          <PendingState title="No updates yet" message="Platform changelog entries will appear here once published." icon={Sparkles} />
        </SectionCard>

        <SectionCard title="Meta platform updates">
          <PendingState title="Nothing curated yet" message="Curated Meta Ads platform news will appear here once published." icon={Newspaper} />
        </SectionCard>

        <SectionCard title="Knowledge base">
          <PendingState title="Coming soon" message="A searchable knowledge base is planned but not yet built." icon={BookOpen} />
        </SectionCard>
      </div>
    </div>
  );
}
