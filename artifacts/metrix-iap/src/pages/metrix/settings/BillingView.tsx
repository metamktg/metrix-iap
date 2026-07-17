// ─── Settings · Billing ───────────────────────────────────────────────
// Workspace-wide plan, usage against limits, and invoice history.

import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getWorkspaceSettings } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, SectionCard, PendingState, MetricTile, fmtUSD } from "../shared";
import { cn } from "@/lib/utils";
import { CreditCard, Check } from "lucide-react";

const SECTION = "Settings · 09";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-foreground/90 font-medium">{label}</span>
        <span className="text-muted-foreground/80 tabular-nums">{used} / {limit}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-amber-400/60" : "bg-primary/50")} style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
  );
}

export function BillingView() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const ws = getWorkspaceSettings(seed);

  if (!ws) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section={SECTION} title="Billing" />
        <PendingState title="No workspace settings" message="Billing details are not available for this workspace yet." icon={CreditCard} />
      </div>
    );
  }

  const { billing } = ws;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Billing"
        subtitle={`Workspace-wide · plan and payment for ${manager.name}.`}
      />

      <div className="px-6 pt-5 grid grid-cols-dashboard-3 gap-3 max-w-3xl">
        <MetricTile label="Plan" value={billing.plan} sub={`Billed ${billing.billing_cycle}`} />
        <MetricTile label="Price" value={`${fmtUSD(billing.price_usd_month, 0)}/mo`} />
        <MetricTile label="Renews" value={fmtDate(billing.renews_at)} sub={billing.payment_method} />
      </div>

      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <SectionCard title="Usage" desc="Workspace usage vs plan limits">
          <div className="space-y-3">
            <UsageBar label="Connected ad accounts" used={billing.usage.connected_ad_accounts} limit={billing.usage.ad_account_limit} />
            <UsageBar label="Team seats" used={billing.usage.seats_used} limit={billing.usage.seat_limit} />
          </div>
        </SectionCard>

        <SectionCard title="Plan includes" desc={`What the ${billing.plan} plan covers.`}>
          <ul className="space-y-1.5">
            {billing.included.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[12px] text-foreground/85">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {item}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Invoices" desc="Past invoices · newest first">
          <div className="rounded-lg border border-border/30 bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 border-b border-border/30">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">Invoice</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-right w-20">Amount</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium text-right w-16">Status</span>
            </div>
            <div className="divide-y divide-border/20">
              {billing.invoices.map((inv) => (
                <div key={inv.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2.5 items-center">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground">{inv.id}</div>
                    <div className="text-[10px] font-mono text-muted-foreground/70">{fmtDate(inv.date)}</div>
                  </div>
                  <span className="text-[12px] text-foreground/90 tabular-nums text-right w-20">{fmtUSD(inv.amount_usd)}</span>
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none text-right w-16 justify-self-end",
                    inv.status === "paid" ? "text-emerald-400 border-emerald-400/25 bg-emerald-400/10" : "text-amber-400 border-amber-400/25 bg-amber-400/10"
                  )}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
