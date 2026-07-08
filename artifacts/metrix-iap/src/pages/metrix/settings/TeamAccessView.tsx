// ─── Settings · Team & Access ─────────────────────────────────────────
// Workspace-wide: members, roles, and the account-level access policy.

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, PendingState, CaveatNote } from "../shared";
import { cn } from "@/lib/utils";
import { Users, UserPlus, ShieldCheck } from "lucide-react";

const SECTION = "Settings · 09";

export function TeamAccessView() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const ws = getWorkspaceSettings(seed);

  if (!ws) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Team & Access" />
        <PendingState title="No workspace settings" message="Team and access settings are not available for this workspace yet." icon={Users} />
      </div>
    );
  }

  const { team } = ws;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Team & Access"
        subtitle={`Workspace-wide · who can access ${manager.name} and what they can do.`}
        right={
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors">
            <UserPlus className="w-3 h-3" /> Invite member
          </button>
        }
      />

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SectionCard
          title="Members"
          desc={`${team.members.length} of ${team.seat_limit} seats in use.`}
        >
          <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 border-b border-border/30">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Member</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Role</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-right w-24">Last active</span>
            </div>
            <div className="divide-y divide-border/20">
              {team.members.map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2.5 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-foreground truncate">{m.name}</span>
                      {m.status === "invited" && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">Invited</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 truncate">{m.email}</div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none",
                    m.role === "owner" ? "text-primary border-primary/25 bg-primary/10" : "text-foreground/75 border-border/40 bg-white/[0.03]"
                  )}>
                    {m.role}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/70 text-right w-24">
                    {m.last_active
                      ? new Date(m.last_active).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Roles" desc="What each role can see and do.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {team.roles.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/40 bg-white/[0.02] p-3.5">
                <div className="text-[12px] font-semibold text-foreground capitalize">{r.label}</div>
                <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{r.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Access policy" desc="How ad-account access is granted across the workspace.">
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground/75 leading-relaxed">{team.access_policy}</p>
          </div>
          <div className="mt-2.5">
            <CaveatNote text="Data isolation still applies per ad account regardless of role — no member sees cross-account analysis." />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
