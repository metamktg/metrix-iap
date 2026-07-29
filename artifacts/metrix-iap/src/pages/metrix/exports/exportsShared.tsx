// ─── Shared building blocks for the Exports section ────────────────────

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
import { PendingState } from "../shared";
import { Lock, Sparkles } from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

/** True once this user's workspace has the (future premium) export entitlement enabled. */
export function useExportsEnabled(): boolean {
  const { user } = useAuth();
  return Boolean(user?.export_data);
}

/** Renders the locked/upsell state in place of export content when the entitlement is off. */
export function ExportsLocked() {
  return (
    <PendingState
      title="Exports is a premium feature"
      message="Portable JSON/CSV handoffs of your analysis, strategy, briefs, and reports — built to feed your own AI tooling or hand to a CMO — are gated behind a plan entitlement that isn't enabled for this workspace yet."
      icon={Lock}
    />
  );
}

/** Simple account picker for export target selection — Exports is agency-scoped, not tied to the active account switcher. */
export function useExportAccountPicker(): {
  accounts: AdAccount[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  picker: React.ReactNode;
} {
  const { adAccounts } = useAccount();
  const configured = adAccounts.filter((a) => a.status === "configured");
  const [selectedId, setSelectedId] = useState<string | null>(configured[0]?.id ?? null);

  const picker = (
    <div className="flex items-center gap-2">
      <Sparkles className="w-3.5 h-3.5 text-muted-foreground/60" />
      <select
        value={selectedId ?? ""}
        onChange={(e) => setSelectedId(e.target.value)}
        className="h-8 px-2.5 rounded-md border border-border/40 bg-white/[0.03] text-[12px] text-foreground/85"
      >
        {configured.length === 0 && <option value="">No configured accounts</option>}
        {configured.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );

  return { accounts: configured, selectedId, setSelectedId, picker };
}
