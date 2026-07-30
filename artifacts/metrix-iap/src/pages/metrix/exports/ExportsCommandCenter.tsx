// ─── Exports · Command Center ───────────────────────────────────────────
// The parent /app/exports route. Agency-scoped, premium-gated: fully
// built but locked with upsell copy until the workspace's export
// entitlement is enabled (see Q8 — this is treated as a future paid
// feature partly to prevent white-label bypass via raw data handoff).

import { ModuleHeader, CrossLink } from "../shared";
import { useExportsEnabled, ExportsLocked } from "./exportsShared";
import { BarChart2, Compass, FileBarChart, FileText } from "lucide-react";

const SECTION = "Exports · 08";

const CHILDREN = [
  { to: "/app/exports/analysis", label: "Analysis", Icon: BarChart2, desc: "Findings, variable codes with plain-language labels, performance roll-ups." },
  { to: "/app/exports/strategy", label: "Strategy JSON", Icon: Compass, desc: "Message pillars, hypotheses, avatars/ICP/PMF." },
  { to: "/app/exports/reports", label: "Reports", Icon: FileBarChart, desc: "Rendered report deliverables, past exports." },
  { to: "/app/exports/brief", label: "Brief", Icon: FileText, desc: "Every brief generated for an account." },
];

export function ExportsCommandCenter() {
  const enabled = useExportsEnabled();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Exports"
        subtitle="Portable, IP-conscious handoffs of your analysis, strategy, briefs, and reports."
      />
      <div className="px-6 py-5 space-y-4 max-w-3xl">
        {!enabled ? (
          <ExportsLocked />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CHILDREN.map((c) => (
              <div key={c.to} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <c.Icon className="w-4 h-4 text-interactive shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-foreground">{c.label}</div>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{c.desc}</p>
                  </div>
                </div>
                <CrossLink to={c.to} label="Open" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
