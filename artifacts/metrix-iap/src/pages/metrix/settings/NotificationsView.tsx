// ─── Settings · Notifications ─────────────────────────────────────────
// Workspace-wide notification channels, per-event preferences, digest.

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, PendingState } from "../shared";
import { cn } from "@/lib/utils";
import { Bell, Mail, MonitorSmartphone, CalendarClock, Check, Minus } from "lucide-react";

const SECTION = "Settings · 09";

function PrefMark({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-emerald-400/25 bg-emerald-400/10" aria-label="Enabled">
      <Check className="w-3 h-3 text-emerald-400" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-border/40 bg-white/[0.02]" aria-label="Disabled">
      <Minus className="w-3 h-3 text-muted-foreground/70" />
    </span>
  );
}

export function NotificationsView() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const ws = getWorkspaceSettings(seed);

  if (!ws) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Notifications" />
        <PendingState title="No workspace settings" message="Notification settings are not available for this workspace yet." icon={Bell} />
      </div>
    );
  }

  const { notifications } = ws;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Notifications"
        subtitle={`Workspace-wide · how ${manager.name} hears about signals, alerts, and reports.`}
      />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SectionCard title="Channels" desc="Where notifications are delivered.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {notifications.channels.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
                {c.id === "email" ? <Mail className="w-4 h-4 text-muted-foreground/70 shrink-0" /> : <MonitorSmartphone className="w-4 h-4 text-muted-foreground/70 shrink-0" />}
                <div className="flex-1 text-[12px] font-medium text-foreground">{c.label}</div>
                <span className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none",
                  c.enabled ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10" : "text-muted-foreground/70 border-border/40 bg-white/[0.03]"
                )}>
                  {c.enabled ? "On" : "Off"}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Events" desc="Which product events notify the workspace, per channel.">
          <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-[1fr_56px_56px] gap-2 px-3 py-2 border-b border-border/30">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Event</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-center">Email</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-center">In-app</span>
            </div>
            <div className="divide-y divide-border/20">
              {notifications.events.map((e) => (
                <div key={e.id} className="grid grid-cols-[1fr_56px_56px] gap-2 px-3 py-2.5 items-center">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground">{e.label}</div>
                    <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{e.description}</div>
                  </div>
                  <div className="flex justify-center"><PrefMark on={e.email} /></div>
                  <div className="flex justify-center"><PrefMark on={e.in_app} /></div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Digest" desc="The scheduled summary across all ad accounts.">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
            <CalendarClock className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-foreground capitalize">{notifications.digest.frequency} · {notifications.digest.day}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">{notifications.digest.description}</div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
