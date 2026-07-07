// ─── Overview (adaptive) ──────────────────────────────────────────────
// A single "Overview" surface driven by the active account selection.
//   Manager selected   → agency-level blended overview.
//   Ad account selected → that account's scoped overview.
// Mounted at both "/" and "/app/account" so selecting either from the
// account switcher lands on the correct overview.

import { useAccount } from "@/contexts/AccountContext";
import { ManagerOverview } from "./ManagerOverview";
import { AdAccountOverview } from "./AdAccountOverview";

export function Overview() {
  const { selectedAccountType } = useAccount();
  return selectedAccountType === "manager" ? <ManagerOverview /> : <AdAccountOverview />;
}
