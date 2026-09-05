// ─── Settings · General ────────────────────────────────────────────────
// Lands here by default. Account-scoped data connection/white-label/
// isolation info, plus workspace-wide notification delivery preferences
// (folded in from the old Notifications page — see Q9) and the Metrix
// Agent waitlist admin section. Session + password moved to Security.

import { useState } from "react";
import { useScopedAdAccountId, useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getReportBuilder, getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, PendingState, CrossLink, DetailReveal, InfoTooltip, deriveLabel } from "../shared";
import { TYPE } from "../typography";
import { describeAccountSource } from "@/lib/data/accountSource";
import type { MetrixSeed } from "@/lib/data/seedTypes";
import { ConnectMetaDialog, ManualImportDialog, CreativeLibraryDialog } from "../ConnectAccountDialogs";
import { AgentWaitlistSection } from "./AgentWaitlistSection";
import { cn } from "@workspace/command-deck/lib/utils";
import { Plug, FileUp, Palette, ShieldCheck, CheckCircle2, Circle, Images, Bell, Mail, MonitorSmartphone, CalendarClock, Check, Minus, Loader2 } from "lucide-react";
import {
  useGetNotificationPrefs,
  useUpdateNotificationPrefs,
  getGetNotificationPrefsQueryKey,
  useSetAccountDisplayName,
  getGetMetrixSeedQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@workspace/command-deck/hooks/use-toast";
import { DataSourceBadgeToggle } from "@/components/ui/DataSourceBadge";

const SECTION = "Settings · 10";

/** "Aug 15, 2026" from the seed's generated_at (a date or an ISO timestamp). */
function fmtSeedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Build/data-source info — moved here from the sidebar footer so the
 * global chrome stays clean (canvas parity); this is real, honest
 * information (the running build tag and what the seed was assembled
 * from), it just belongs in Settings rather than cluttering every screen's
 * nav rail. It read a static "SAMPLE / DEMO DATA" on every account,
 * including a real client's manual account (audit round 5): the line now
 * names the seed and the note the assembler wrote about it.
 */
function SystemInfoSection({ seed }: { seed: MetrixSeed }) {
  const assembled = fmtSeedDate(seed.generated_at);
  return (
    <SectionCard title="System" desc="Build and data source">
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.02]">
        <div className="space-y-0.5 min-w-0">
          <div className="text-caption font-medium text-foreground/80">METRIX IAP v2.0-rc</div>
          <div className="flex items-center gap-1.5 text-label text-muted-foreground/75" data-testid="system-data-source">
            <span>Supabase seed {seed.schema_version}{assembled ? ` · assembled ${assembled}` : ""}</span>
            {seed.integrity_note && <InfoTooltip content={seed.integrity_note} label="About this data" />}
          </div>
        </div>
        <DataSourceBadgeToggle />
      </div>
    </SectionCard>
  );
}

/**
 * Display name (E4).
 *
 * Manual accounts are created as "Fresh Import 1786839868960" and every page
 * title inherits that. Renaming touches ONLY the display name — the account's
 * generated id stays the stable key every table joins on, and is shown here
 * so the rename never reads as changing the account's identity.
 */
export function AccountNameSection({ accountId, currentName }: { accountId: string; currentName: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState(currentName);
  const mutation = useSetAccountDisplayName({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
        toast({ title: "Account renamed" });
      },
      onError: (err: unknown) => {
        toast({
          variant: "destructive",
          title: "Couldn't rename the account",
          description: err instanceof ApiError ? err.message : "Please try again.",
        });
      },
    },
  });

  const trimmed = draft.trim();
  // Same rule the server enforces, stated here so the button explains itself
  // rather than the user discovering it through a 400.
  const tooLong = trimmed.length > 80;
  const dirty = trimmed !== currentName.trim();
  const canSave = dirty && trimmed.length > 0 && !tooLong && !mutation.isPending;

  return (
    <SectionCard title="Account name" desc="Display name only · the account id never changes">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            data-testid="input-account-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={mutation.isPending}
            aria-label="Account display name"
            aria-invalid={tooLong || undefined}
            className={cn(
              "w-full rounded-lg border bg-foreground/[0.02] px-3 py-2 text-body text-foreground",
              "placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/45 disabled:opacity-60",
              tooLong ? "border-status-danger/50" : "border-border/40"
            )}
          />
          <div className="text-label text-muted-foreground/75">
            {tooLong ? `${trimmed.length}/80, too long` : `id · ${accountId}`}
          </div>
        </div>
        <button
          data-testid="button-save-account-name"
          onClick={() => mutation.mutate({ accountId, data: { name: trimmed } })}
          disabled={!canSave}
          className={cn(
            "pressable shrink-0 rounded-lg border px-3 py-2 text-body transition-colors",
            canSave
              ? "border-primary/45 bg-primary/[0.06] hover:bg-primary/[0.1] text-foreground"
              : "border-border/40 bg-foreground/[0.02] text-muted-foreground/75 cursor-not-allowed"
          )}
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </button>
      </div>
    </SectionCard>
  );
}

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
        "pressable inline-flex items-center justify-center w-5 hit-target-24 h-5 rounded border transition-colors",
        on
          ? "border-status-success/25 bg-status-success/10 hover:bg-status-success/20"
          : "border-border/40 bg-foreground/[0.02] hover:bg-foreground/[0.06]",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {on ? (
        <Check className="w-3 h-3 text-status-success" />
      ) : (
        <Minus className="w-3 h-3 text-muted-foreground/75" />
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
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.02]">
              {c.id === "email" ? <Mail className="w-4 h-4 text-muted-foreground/75 shrink-0" /> : <MonitorSmartphone className="w-4 h-4 text-muted-foreground/75 shrink-0" />}
              <div className="flex-1 text-body font-medium text-foreground">{c.label}</div>
              <button
                type="button"
                role="switch"
                aria-checked={c.enabled}
                onClick={() => toggleChannel(c.id, c.enabled)}
                disabled={isPending}
                data-testid={`toggle-channel-${c.id}`}
                className={cn(
                  "pressable text-label font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none transition-colors",
                  c.enabled
                    ? "text-status-success border-status-success/25 bg-status-success/10 hover:bg-status-success/20"
                    : "text-muted-foreground/75 border-border/40 bg-foreground/[0.03] hover:bg-foreground/[0.08]",
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
        <div className="rounded-lg border border-border/30 bg-foreground/[0.02] overflow-hidden">
          <div className="grid grid-cols-[1fr_56px_56px] gap-2 px-3 py-2 border-b border-border/30">
            <span className="text-label uppercase tracking-wide text-muted-foreground/75 font-medium">Event</span>
            <span className="text-label uppercase tracking-wide text-muted-foreground/75 font-medium text-center">Email</span>
            <span className="text-label uppercase tracking-wide text-muted-foreground/75 font-medium text-center">In-app</span>
          </div>
          <div className="divide-y divide-border/20">
            {events.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_56px_56px] gap-2 px-3 py-2.5 items-center">
                <div className="min-w-0">
                  <div className="text-body font-medium text-foreground">{e.label}</div>
                  <div className="text-label text-muted-foreground/75 leading-tight mt-0.5">{e.description}</div>
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
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.02]">
          <CalendarClock className="w-4 h-4 text-interactive shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-body font-medium text-foreground capitalize">{notifications.digest.frequency} · {notifications.digest.day}</div>
            <div className="text-label text-muted-foreground/75 mt-0.5">{notifications.digest.description}</div>
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
          <SystemInfoSection seed={seed} />
        </div>
      </div>
    );
  }

  const configured = account.status === "configured";
  const rb = configured ? getReportBuilder(seed, adAccountId) : null;
  // The source is the source, not the platform (accountSource.ts): this
  // card said "Meta Ads · connected" with a check on a manual account.
  const source = describeAccountSource(account);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section={SECTION} title="General" subtitle={`Configuration for ${account.name} under ${manager.name}.`} />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SectionCard title="Data connection" desc="Meta ad account connection and manual import status.">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.02]">
              {configured ? <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/80 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-body font-medium text-foreground" data-testid="data-source-label">{source.label}</div>
                <div className="text-label text-muted-foreground/85">
                  {configured ? `${account.platform} · analysis data on file` : `${account.platform} · no successful run yet`}
                </div>
              </div>
              {!configured && (
                <button
                  onClick={() => setConnectOpen(true)}
                  className="pressable flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-caption font-medium text-interactive hover:bg-primary/25 transition-colors"
                  data-testid="button-connect-account"
                >
                  <Plug className="w-3 h-3" /> Connect
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.02]">
              <FileUp className="w-4 h-4 text-muted-foreground/85 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-body font-medium text-foreground">Manual import</div>
                <div className="text-label text-muted-foreground/85">Upload exported performance data</div>
              </div>
              <button
                onClick={() => setImportOpen(true)}
                className="pressable flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-caption font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                data-testid="button-add-import"
              >
                <FileUp className="w-3 h-3" /> Add import
              </button>
            </div>
            {configured && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.02]">
                <Images className="w-4 h-4 text-muted-foreground/85 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium text-foreground">Creative library</div>
                  <div className="text-label text-muted-foreground/85">
                    Add creative files after the fact, mapped to existing ads. No CSV re-upload needed
                  </div>
                </div>
                <button
                  onClick={() => setCreativeLibraryOpen(true)}
                  className="pressable flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-caption font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                  data-testid="button-upload-creatives"
                >
                  <Images className="w-3 h-3" /> Upload creatives
                </button>
              </div>
            )}
          </div>
        </SectionCard>

        <AccountNameSection accountId={account.id} currentName={String(account.name ?? account.id)} />

        {rb && (
          <SectionCard title="White-label & branding" desc="How reports are branded when delivered to this account's client.">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-foreground/[0.02]">
              <Palette className="w-4 h-4 text-interactive shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-body font-medium text-foreground capitalize">{rb.default_branding} branding</div>
                <div className="text-label text-muted-foreground/85">White-label {rb.white_label_supported ? "supported" : "unavailable"} · formats: {rb.export_formats.join(", ")}</div>
              </div>
            </div>
            {/* A branding rule is a fact about the account, not a warning. */}
            <p className={cn(TYPE.caption, "text-muted-foreground/85 mt-2.5 leading-snug")}>
              <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/75">Logo policy</span>{" "}
              {rb.logo_policy}
            </p>
          </SectionCard>
        )}

        <SectionCard title="Data isolation" desc="How this account's data is scoped within the manager.">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-status-success/15 bg-status-success/[0.03]">
            <ShieldCheck className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
            <DetailReveal
              label={deriveLabel(`All analysis, strategy, briefs, reports, and MST data are isolated to ${account.name}.`, 72)}
              labelClassName="text-caption text-foreground/75 leading-relaxed"
              eyebrow="Data isolation"
              sections={[{
                text: `All analysis, strategy, briefs, reports, and MST data are isolated to ${account.name}. Only bottom-line performance totals roll up to the ${manager.name} overview. Approving a recommendation creates a manual task and never auto-edits a live campaign.`,
              }]}
            />
          </div>
        </SectionCard>

        <NotificationPrefsSections />

        <AgentWaitlistSection />

        <SystemInfoSection seed={seed} />

        <div className={cn("text-label text-muted-foreground/80", "px-1")}>
          Account ID · {account.id}
        </div>
      </div>

      <ConnectMetaDialog account={account} open={connectOpen} onOpenChange={setConnectOpen} />
      <ManualImportDialog account={account} open={importOpen} onOpenChange={setImportOpen} />
      <CreativeLibraryDialog account={account} open={creativeLibraryOpen} onOpenChange={setCreativeLibraryOpen} />
    </div>
  );
}
