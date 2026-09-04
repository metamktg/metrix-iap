// ─── Settings · Billing ───────────────────────────────────────────────
// Metrix is currently open beta, invite-only — no live billing or
// subscription plans yet. Honest pending state instead of mock plan/
// usage/invoice data (same "never fabricate" pattern as every other
// not-yet-available state in this app); real billing lands post-beta.

import { useAccount } from "@/contexts/AccountContext";
import { ModuleHeader, PendingState } from "../shared";
import { CreditCard } from "lucide-react";

const SECTION = "Settings · 10";

export function BillingView() {
  const { manager } = useAccount();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Billing"
        subtitle={`Workspace-wide · ${manager.name}.`}
      />
      <PendingState
        title="Metrix is in open beta"
        message="Metrix is currently invite-only open beta. There's no billing or subscription plan to manage yet. Plans and pricing launch after the beta period."
        icon={CreditCard}
      />
    </div>
  );
}
