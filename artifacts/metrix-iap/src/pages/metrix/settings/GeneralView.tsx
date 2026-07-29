// ─── Settings · General ────────────────────────────────────────────────
// Lands here by default. Account-scoped data connection/white-label/
// isolation info, plus workspace-wide notification delivery preferences
// (folded in from the old Notifications page — see Q9) and the Metrix
// Agent waitlist admin section. Session + password moved to Security.

import { useState } from "react";
import { useScopedAdAccountId, useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder, getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, SectionCard, CaveatNote, PendingState, CrossLink } from "../shared";
import { ConnectMetaDialog, ManualImportDialog, CreativeLibraryDialog } from "../ConnectAccountDialogs";
import { AgentWaitlistSection } from "./AgentWaitlistSection";
import { cn } from "@/lib/utils";
import { Plug, FileUp, Palette, ShieldCheck, CheckCircle2, Circle, Images, Bell, Mail, MonitorSmartphone, CalendarClock, Check, Minus } from "lucide-react";
import {
  useGetNotificationPrefs,
  useUpdateNotificationPrefs,
  getGetNotificationPrefsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const SECTION = "Settings · 10";

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

/** Workspace-wide notification delivery preferences — independent of account selection. */
function NotificationPrefsSections() {
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

  if (!ws) return null;
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
    updatePrefs({ workspaceId: manager.id, data: { channels: [{ id, enabled: !enabled }] } });
  };

  const toggleEvent = (id: string, field: "email" | "in_app") => {
    const current = events.find((e) => e.id === id);
    if (!current) return;
    updatePrefs({
      workspaceId: manager.id,
      data: {
        events: [{
          id,
          email: field === "email" ? !current.email : current.email,
          in_app: field === "in_app" ? !current.in_app : current.in_app,
        }],
      },
    });
  };

  return (
    <>
      <SectionCard title="Notification channels" desc="Where notifications are delivered. Click to toggle.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <SectionCard title="Notification events" desc="Which product events notify the workspace, per channel. Click a mark to toggle.">
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
                  <PrefToggle on={e.email} onToggle={() => toggleEvent(e.id, "email")} disabled={isPending} label={`${e.label} via email`} testId={`toggle-event-${e.id}-email`} />
                </div>
                <div className="flex justify-center">
                  <PrefToggle on={e.in_app} onToggle={() => toggleEvent(e.id, "in_app")} disabled={isPending} label={`${e.label} in-app`} testId={`toggle-event-${e.id}-in_app`} />
                </div>
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
    </>
  );
}

export function GeneralView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const { manager } = useAccount();
  const account = getAdAccount(seed, adAccountId);
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [creativeLibraryOpen, setCreativeLibraryOpen] = useState(false);

  if (!account) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <ModuleHeader section={SECTION} title="General" />
        <PendingState title="No ad account selected" message="Choose an ad account to manage its settings." icon={Bell} />
        <div className="px-6 py-5 space-y-5 max-w-3xl">
          <NotificationPrefsSections />
          <AgentWaitlistSection />
        </div>
      </div>
    );
  }

  const configured = account.status === "configured";
  const rb = configured ? getReportBuilder(seed, adAccountId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section={SECTION} title="General" subtitle={`Configuration for ${account.name} under ${manager.name}.`} />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SectionCard title="Data connection" desc="Meta ad account connection and manual import status.">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/80 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground">Meta ad account</div>
                <div className="text-[10px] text-muted-foreground/85">{configured ? `${account.platform} · connected` : "Not connected"}</div>
              </div>
              {!configured && (
                <button
                  onClick={() => setConnectOpen(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
                  data-testid="button-connect-account"
                >
                  <Plug className="w-3 h-3" /> Connect
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              <FileUp className="w-4 h-4 text-muted-foreground/85 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground">Manual import</div>
                <div className="text-[10px] text-muted-foreground/85">Upload exported performance data</div>
              </div>
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                data-testid="button-add-import"
              >
                <FileUp className="w-3 h-3" /> Add import
              </button>
            </div>
            {configured && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
                <Images className="w-4 h-4 text-muted-foreground/85 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-foreground">Creative library</div>
                  <div className="text-[10px] text-muted-foreground/85">
                    Add creative files after the fact, mapped to existing ads — no CSV re-upload needed
                  </div>
                </div>
                <button
                  onClick={() => setCreativeLibraryOpen(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  data-testid="button-upload-creatives"
                >
                  <Images className="w-3 h-3" /> Upload creatives
                </button>
              </div>
            )}
          </div>
        </SectionCard>

        {configured && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground">Run analysis</div>
              <div className="text-[10px] text-muted-foreground/85">Moved to the Analysis command center.</div>
            </div>
            <CrossLink to="/app/analysis" label="Go to Analysis" />
          </div>
        )}

        {rb && (
          <SectionCard title="White-label & branding" desc="How reports are branded when delivered to this account's client.">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
              <Palette className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground capitalize">{rb.default_branding} branding</div>
                <div className="text-[10px] text-muted-foreground/85">White-label {rb.white_label_supported ? "supported" : "unavailable"} · formats: {rb.export_formats.join(", ")}</div>
              </div>
            </div>
            <div className="mt-2.5">
              <CaveatNote text={rb.logo_policy} />
            </div>
          </SectionCard>
        )}

        <SectionCard title="Data isolation" desc="How this account's data is scoped within the manager.">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground/75 leading-relaxed">
              All analysis, strategy, briefs, reports, and MST data are isolated to <span className="font-medium text-foreground">{account.name}</span>.
              Only bottom-line performance totals roll up to the {manager.name} overview. Approving a recommendation creates a manual task and never auto-edits a live campaign.
            </p>
          </div>
        </SectionCard>

        <NotificationPrefsSections />

        <AgentWaitlistSection />

        <div className={cn("text-[10px] font-mono text-muted-foreground/80", "px-1")}>
          Account ID · {account.id}
        </div>
      </div>

      <ConnectMetaDialog account={account} open={connectOpen} onOpenChange={setConnectOpen} />
      <ManualImportDialog account={account} open={importOpen} onOpenChange={setImportOpen} />
      <CreativeLibraryDialog account={account} open={creativeLibraryOpen} onOpenChange={setCreativeLibraryOpen} />
    </div>
  );
}
