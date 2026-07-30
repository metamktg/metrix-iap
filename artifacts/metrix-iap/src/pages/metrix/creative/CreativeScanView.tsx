// ─── Creative · Creative Scan ────────────────────────────────────────
// Upload your own creative (UGC, ad-hoc production) and map it to an ad
// in this account's analysis — it's staged immediately and joins the
// Creative Library. Today this does file staging + ad-name mapping; an
// automated IAP-variable confidence/integrity pass against a suggested
// brief (the fuller "scan") is a planned deepening, not yet built — we
// say so rather than pretending it exists.

import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, SectionCard, CaveatNote, CrossLink } from "../shared";
import { CreativeLibraryPanel } from "../ConnectAccountDialogs";

const SECTION = "Creative · 05";

export function CreativeScanView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const availableAdNames = useMemo(
    () => Array.from(new Set((account?.ads ?? []).map((a) => a.ad_name))).sort(),
    [account?.ads],
  );

  return (
    <ModuleScopeGate section={SECTION} title="Creative Scan" account={account}>
      {() => {
        const acct = account!;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Creative Scan"
              subtitle="Upload a creative and map it to an ad — it's staged immediately and added to the Creative Library."
            />
            <ScopeBanner account={acct} />
            <div className="px-6 py-5 space-y-4 max-w-2xl">
              <CaveatNote text="An automated IAP-variable confidence pass against a suggested brief is planned but not yet built — this stages the file and maps it to an ad name." />
              <SectionCard title="Upload & map">
                <CreativeLibraryPanel accountId={acct.id} availableAdNames={availableAdNames} />
              </SectionCard>
              <div className="flex items-center gap-4">
                <CrossLink to="/app/creative/library" label="View Creative Library" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
