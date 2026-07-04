import { cn } from "@/lib/utils";
import {
  Building2, Users, Database, Cpu, ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  ORG, WORKSPACES, WORKSPACE_MEMBERS, USERS, AD_ACCOUNTS,
  PROMPT_VERSIONS,
} from "@/lib/mock-data";

// ─── Section wrapper ───────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/50 bg-muted/10">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <div className="text-xs font-semibold text-foreground">{title}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Read-only field ───────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-border/30 last:border-none px-5">
      <div className="w-36 shrink-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-[11px] text-foreground">{value}</div>
    </div>
  );
}

// ─── Role badge ────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const roleColors: Record<string, string> = {
    "Master Admin": "text-primary border-primary/20 bg-primary/10",
    "Workspace Admin": "text-purple-400 border-purple-500/20 bg-purple-500/10",
    Strategist: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    "Media Buyer": "text-blue-400 border-blue-500/20 bg-blue-500/10",
    "Creative Strategist": "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
    "Client Viewer": "text-muted-foreground border-border/40 bg-muted/20",
    "Read Only": "text-muted-foreground border-border/40 bg-muted/10",
  };
  return (
    <span className={cn(
      "text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none",
      roleColors[role] ?? "text-muted-foreground border-border/40"
    )}>
      {role}
    </span>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────

export function Settings() {
  const { currentWorkspace } = useWorkspace();

  const ws = currentWorkspace ?? WORKSPACES[0];
  const members = WORKSPACE_MEMBERS.filter(m => m.workspace_id === ws.id);
  const accounts = AD_ACCOUNTS.filter(a => a.workspace_id === ws.id);
  const allUsers = USERS;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ws.name} — org, workspace, members, accounts
          </p>
        </div>

        {/* Read-only notice */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 bg-muted/20 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          Settings are read-only in this prototype. Edit functionality will be available in the live build.
        </div>

        {/* Organisation */}
        <Section icon={<Building2 className="w-3.5 h-3.5" />} title="Organisation" subtitle="Top-level org configuration">
          <Field label="Name" value={ORG.name} />
          <Field label="Slug" value={ORG.slug} />
          <Field label="ID" value={ORG.id} />
          <Field label="Created" value={ORG.created_at} />
          <Field label="Workspaces" value={WORKSPACES.length} />
          <Field label="Ad Accounts" value={AD_ACCOUNTS.length} />
          <Field label="Team Members" value={USERS.length} />
        </Section>

        {/* Workspace */}
        <Section icon={<Database className="w-3.5 h-3.5" />} title="Workspace" subtitle={`${ws.name} settings`}>
          <Field label="Name" value={ws.name} />
          <Field label="Type" value={ws.type} />
          <Field label="Slug" value={ws.slug} />
          <Field label="Health" value={ws.health_status} />
          <Field label="ID" value={ws.id} />
          <Field label="Created" value={ws.created_at} />
          <Field label="Updated" value={ws.updated_at} />
          {ws.client_name && <Field label="Client" value={ws.client_name} />}
          {ws.description && <Field label="Description" value={ws.description} />}
        </Section>

        {/* Members */}
        <Section icon={<Users className="w-3.5 h-3.5" />} title="Team Members" subtitle={`${members.length} member${members.length !== 1 ? "s" : ""} in ${ws.name}`}>
          <div className="divide-y divide-border/30">
            {members.map(m => {
              const user = allUsers.find(u => u.id === m.user_id);
              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                    {user?.avatar_initials ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-foreground">{user?.name ?? m.user_id}</div>
                    <div className="text-[10px] text-muted-foreground">{user?.email ?? ""}</div>
                  </div>
                  <RoleBadge role={m.role} />
                  <div className="text-[10px] text-muted-foreground shrink-0">Joined {m.joined_at}</div>
                </div>
              );
            })}
            {members.length === 0 && (
              <div className="px-5 py-4 text-[11px] text-muted-foreground">No members in this workspace.</div>
            )}
          </div>
        </Section>

        {/* Ad Accounts */}
        <Section icon={<Database className="w-3.5 h-3.5" />} title="Ad Accounts" subtitle={`${accounts.length} account${accounts.length !== 1 ? "s" : ""} connected`}>
          <div className="divide-y divide-border/30">
            {accounts.map(aa => (
              <div key={aa.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="text-[11px] font-medium text-foreground">{aa.account_name}</div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{aa.platform}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span>{aa.account_id_external}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span>${(aa.spend_analyzed_usd / 1000).toFixed(1)}K spend analyzed</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-[10px] text-muted-foreground">Quality</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 bg-border/30 rounded-full h-1.5">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          aa.data_quality_score >= 70 ? "bg-emerald-500" : aa.data_quality_score >= 50 ? "bg-yellow-400" : "bg-red-400"
                        )}
                        style={{ width: `${aa.data_quality_score}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-[10px] font-mono font-semibold",
                      aa.data_quality_score >= 70 ? "text-emerald-400" : aa.data_quality_score >= 50 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {aa.data_quality_score}
                    </span>
                  </div>
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none",
                    aa.status === "Connected" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                    : "text-muted-foreground border-border/40"
                  )}>
                    {aa.status}
                  </span>
                </div>
              </div>
            ))}
            {accounts.length === 0 && (
              <div className="px-5 py-4 text-[11px] text-muted-foreground">No ad accounts connected.</div>
            )}
          </div>
        </Section>

        {/* Prompt Versions */}
        <Section icon={<Cpu className="w-3.5 h-3.5" />} title="Prompt Versions" subtitle="Active IAP analysis prompts">
          <div className="divide-y divide-border/30">
            {PROMPT_VERSIONS.map(pv => (
              <div key={pv.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="text-[11px] font-medium text-foreground">{pv.name}</div>
                  <div className="text-[10px] text-muted-foreground">{pv.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">
                    {pv.phase}
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-primary">{pv.version}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Workspace selector hint */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border/50 bg-card text-[11px] text-muted-foreground">
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          Switch workspaces using the selector in the top-left sidebar to view settings for another client.
        </div>
      </div>
    </div>
  );
}
