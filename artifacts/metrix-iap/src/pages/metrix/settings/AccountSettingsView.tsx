// ─── Settings · Account ───────────────────────────────────────────────
// Account-scoped settings: data connection, white-label, data isolation,
// plus the workspace-wide Metrix Agent waitlist admin section.

import { TYPE } from "../typography";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@workspace/api-client-react";
import { useScopedAdAccountId, useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAdAccount, getReportBuilder } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, SectionCard, CaveatNote, PendingState, useFocusParam, DetailReveal } from "../shared";
import { ConnectMetaDialog, ManualImportDialog, CreativeLibraryDialog } from "../ConnectAccountDialogs";
import { AnalysisControls } from "../ManualAnalysisControls";
import { AgentWaitlistSection } from "./AgentWaitlistSection";
import { cn } from "@/lib/utils";
import { Plug, FileUp, Palette, ShieldCheck, CheckCircle2, Circle, UserCircle2, LogOut, Loader2, KeyRound, Images } from "lucide-react";

const SECTION = "Settings · 09";

function SessionSection() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SectionCard title="Your session" desc="Currently signed-in account">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-white/[0.02]">
        <UserCircle2 className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate" data-testid="text-session-email">{user.email}</div>
          <div className="text-[10px] text-muted-foreground/85">Signed in</div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
          data-testid="button-sign-out"
        >
          {signingOut ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
          Sign out
        </button>
      </div>
    </SectionCard>
  );
}

const inputClass =
  "w-full h-9 px-3 rounded-md bg-white/[0.03] border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/40";

function PasswordSection() {
  const { changePassword } = useAuth();
  const focus = useFocusParam();
  const cardRef = useRef<HTMLDivElement>(null);
  // Latch the arrival state: the URL param is cleared right away (so
  // refreshes behave like normal visits), which would otherwise flip the
  // hook value mid-highlight.
  const arrivedFocused = useRef(focus === "password");
  const [highlighted, setHighlighted] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Arriving from a /forgot-password redirect: the URL carries
  // ?focus=password, so scroll this card into view and briefly highlight
  // it. Normal visits (no param) are unchanged.
  useEffect(() => {
    if (!arrivedFocused.current) return;
    // Drop only the focus param — other params (e.g. account scope) stay.
    const params = new URLSearchParams(window.location.search);
    params.delete("focus");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    const t1 = setTimeout(() => {
      cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      setHighlighted(true);
    }, 100);
    const t2 = setTimeout(() => setHighlighted(false), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(err.message || "Could not change password. Check your current password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={cardRef}
      id="password"
      className={cn(
        "rounded-xl transition-shadow duration-500",
        highlighted && "ring-2 ring-primary/60 shadow-[0_0_24px_rgba(120,170,255,0.25)]",
      )}
      data-testid="section-password"
    >
      <SectionCard title="Password" desc="Change password · signs you out everywhere else">
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm" data-testid="form-account-change-password">
          <div className="space-y-1.5">
            <label htmlFor="account-current-password" className="text-[11px] font-medium text-muted-foreground">
              Current password
            </label>
            <input
              id="account-current-password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              data-testid="input-account-current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="account-new-password" className="text-[11px] font-medium text-muted-foreground">
              New password <span className="text-muted-foreground/80">(min. 8 characters)</span>
            </label>
            <input
              id="account-new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              data-testid="input-account-new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="account-confirm-password" className="text-[11px] font-medium text-muted-foreground">
              Confirm new password
            </label>
            <input
              id="account-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              data-testid="input-account-confirm-password"
            />
          </div>
          {error && (
            <div className="text-[11px] text-red-400/90" data-testid="text-account-change-password-error">
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90" data-testid="text-account-change-password-success">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Password updated. Other sessions have been signed out.
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            data-testid="button-account-change-password"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            {isSubmitting ? "Saving…" : "Update password"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

export function AccountSettingsView() {
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
        <ModuleHeader section={SECTION} title="Account" />
        <PendingState title="No ad account selected" message="Choose an ad account to manage its settings." />
        <div className="px-6 py-5 space-y-5 max-w-3xl">
          <SessionSection />
          <PasswordSection />
          <AgentWaitlistSection />
        </div>
      </div>
    );
  }

  const configured = account.status === "configured";
  const rb = configured ? getReportBuilder(seed, adAccountId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section={SECTION} title="Account" subtitle={`Configuration for ${account.name} under ${manager.name}.`} />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        {/* Session */}
        <SessionSection />

        {/* Password */}
        <PasswordSection />

        {/* Data connection */}
        <SectionCard title="Data connection" desc="Meta connection · manual import status">
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
                  className="flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-primary border border-primary text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/25"
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
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-primary border border-primary text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/25"
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
                  className="flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-primary border border-primary text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/25"
                  data-testid="button-upload-creatives"
                >
                  <Images className="w-3 h-3" /> Upload creatives
                </button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Analysis — the only place a date range is chosen, and analysis is
            only ever triggered by this explicit button. */}
        <SectionCard title="Run analysis" desc="Pick a date range · never runs automatically">
          <AnalysisControls accountId={account.id} />
        </SectionCard>

        {/* White-label */}
        {rb && (
          <SectionCard title="White-label & branding" desc="Client-facing report branding">
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

        {/* Data isolation */}
        <SectionCard title="Data isolation" desc="Account data scoping">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <DetailReveal
              label={<>All data isolated to <span className="font-medium text-foreground">{account.name}</span></>}
              labelClassName={TYPE.caption}
              eyebrow="Data isolation"
              sections={[
                {
                  render: () => (
                    <>
                      All analysis, strategy, briefs, reports, and MST data are isolated to{" "}
                      <span className="font-medium text-foreground">{account.name}</span>. Only bottom-line
                      performance totals roll up to the{" "}
                      <span className="font-medium text-foreground">{manager.name}</span> overview. Approving a
                      recommendation creates a manual task and never auto-edits a live campaign.
                    </>
                  ),
                },
              ]}
            />
          </div>
        </SectionCard>

        {/* Metrix Agent waitlist (admin, manager-wide) */}
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
