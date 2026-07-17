// ─── Settings · Notifications ─────────────────────────────────────────
// Workspace-wide notification channels, per-event preferences, digest.
// Toggles persist via the API; seed values act as defaults until
// overridden.

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, PendingState } from "../shared";
import { cn } from "@/lib/utils";
import { Bell, Mail, MonitorSmartphone, CalendarClock, Check, Minus } from "lucide-react";
import {
  useGetNotificationPrefs,
  useUpdateNotificationPrefs,
  getGetNotificationPrefsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const SECTION = "Settings · 09";

function PrefToggle({
  on,
  onToggle,
  disabled,
  label,
  testId,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded border transition-colors",
        on
          ? "border-emerald-400/25 bg-emerald-400/10 hover:bg-emerald-400/20"
          : "border-border/40 bg-white/[0.02] hover:bg-white/[0.06]",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {on ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Minus className="w-3 h-3 text-muted-foreground/70" />
      )}
    </button>
  );
}

export function NotificationsView() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const ws = getWorkspaceSettings(seed);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: prefs } = useGetNotificationPrefs(manager.id);
  const { mutate: updatePrefs, isPending } = useUpdateNotificationPrefs({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetNotificationPrefsQueryKey(manager.id), result);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Couldn't save notification setting",
          description: "The change was not saved. Please try again.",
        });
      },
    },
  });

  if (!ws) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Notifications" />
        <PendingState title="No workspace settings" message="Notification settings are not available for this workspace yet." icon={Bell} />
      </div>
    );
  }

  const { notifications } = ws;

  const channelOverrides = new Map((prefs?.channels ?? []).map((c) => [c.id, c]));
  const eventOverrides = new Map((prefs?.events ?? []).map((e) => [e.id, e]));

  const channels = notifications.channels.map((c) => ({
    ...c,
    enabled: channelOverrides.get(c.id)?.enabled ?? c.enabled,
  }));
  const events = notifications.events.map((e) => {
    const o = eventOverrides.get(e.id);
    return { ...e, email: o?.email ?? e.email, in_app: o?.in_app ?? e.in_app };
  });

  const toggleChannel = (id: string, enabled: boolean) => {
    updatePrefs({
      workspaceId: manager.id,
      data: { channels: [{ id, enabled: !enabled }] },
    });
  };

  const toggleEvent = (id: string, field: "email" | "in_app") => {
    const current = events.find((e) => e.id === id);
    if (!current) return;
    updatePrefs({
      workspaceId: manager.id,
      data: {
        events: [
          {
            id,
            email: field === "email" ? !current.email : current.email,
            in_app: field === "in_app" ? !current.in_app : current.in_app,
          },
        ],
      },
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Notifications"
        subtitle="Workspace-wide · signals · alerts · reports"
      />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SectionCard title="Channels" desc="Delivery channels · click to toggle">
          <div className="grid grid-cols-dashboard-2 gap-3">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
                {c.id === "email" ? <Mail className="w-4 h-4 text-muted-foreground/70 shrink-0" /> : <MonitorSmartphone className="w-4 h-4 text-muted-foreground/70 shrink-0" />}
                <div className="flex-1 text-[12px] font-medium text-foreground">{c.label}</div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.enabled}
                  onClick={() => toggleChannel(c.id, c.enabled)}
                  disabled={isPending}
                  data-testid={`toggle-channel-${c.id}`}
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none transition-colors",
                    c.enabled
                      ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10 hover:bg-emerald-400/20"
                      : "text-muted-foreground/70 border-border/40 bg-white/[0.03] hover:bg-white/[0.08]",
                    isPending && "opacity-60 pointer-events-none"
                  )}
                >
                  {c.enabled ? "On" : "Off"}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Events" desc="Events per channel · click a mark to toggle">
          <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-[1fr_56px_56px] gap-2 px-3 py-2 border-b border-border/30">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Event</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-center">Email</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-center">In-app</span>
            </div>
            <div className="divide-y divide-border/20">
              {events.map((e) => (
                <div key={e.id} className="grid grid-cols-[1fr_56px_56px] gap-2 px-3 py-2.5 items-center">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground">{e.label}</div>
                    <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{e.description}</div>
                  </div>
                  <div className="flex justify-center">
                    <PrefToggle
                      on={e.email}
                      onToggle={() => toggleEvent(e.id, "email")}
                      disabled={isPending}
                      label={`${e.label} via email`}
                      testId={`toggle-event-${e.id}-email`}
                    />
                  </div>
                  <div className="flex justify-center">
                    <PrefToggle
                      on={e.in_app}
                      onToggle={() => toggleEvent(e.id, "in_app")}
                      disabled={isPending}
                      label={`${e.label} in-app`}
                      testId={`toggle-event-${e.id}-in_app`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Digest" desc="Scheduled summary · all ad accounts">
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
