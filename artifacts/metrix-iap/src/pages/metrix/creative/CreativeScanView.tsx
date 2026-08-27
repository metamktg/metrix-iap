// ─── Creative · Creative Scan — the canvas's pre-launch QA screen ─────
// The canvas creative.scan composition: a scan-stats strip and the
// pre-launch check grid, plus the existing real upload-and-map staging
// panel. The automated IAP-variable scan has never run for any account
// (loop_status: creative_scan = pending; the engine itself is a planned
// deepening) — so the stats render an honest zero state and the grid
// shows only WHAT the scan will check, never invented pass/fail rows.

import { useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ModuleScopeGate, SectionCard, CaveatNote, CrossLink, SectionInfoIcon, MetricTile, fmtNum } from "../shared";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { ScanSearch } from "lucide-react";
import { CreativeLibraryPanel } from "../ConnectAccountDialogs";

const SECTION = "Creative · 05";

// The QA dimensions the scan engine checks (MST_CREATIVE_SCAN reference:
// naming conventions, format ratios, safe zones, variable-stack
// alignment, claim clearance). Descriptive column heads only — results
// exist solely once a scan has actually run.
const SCAN_CHECKS = ["Naming convention", "Aspect ratio", "Safe zone", "Variable tag", "Claim cleared"];

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
        const libraryCount = getMST(seed, adAccountId)?.local_book2_library?.length ?? 0;
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Creative Scan"
              accountName={acct.name}
              subtitle="Pre-launch QA · upload & map staging"
              table="loop_status → creative_scan"
            />
            <div className="px-6 py-5 space-y-4 max-w-4xl">
              {/* Canvas scan-stats strip — honest zero state until the
                  automated pass exists and has run. */}
              <div className="grid grid-cols-dashboard-4 gap-3" data-testid="scan-stats">
                <MetricTile label="Assets scanned" value="0" sub="Scan not yet run" />
                <MetricTile label="Library assets" value={fmtNum(libraryCount)} sub="Awaiting first scan" />
                <MetricTile label="Blocking" value="—" sub="No results yet" />
                <MetricTile label="Requires" value="Scan engine" sub="Automated pass planned — not yet built" />
              </div>

              {/* Pre-launch check grid shell: shows what the scan checks;
                  rows appear only from a real scan run. */}
              <SectionCard
                title="Pre-launch scan"
                desc="What the automated pass checks per asset"
                right={<SectionInfoIcon tip="Each staged asset will be checked against these QA dimensions (naming convention, format ratio, safe zones, variable-stack alignment, claim clearance) once the automated scan pass ships. Results render here only from a real scan run." />}
              >
                <div className="overflow-x-auto">
                  <div className="grid gap-1 min-w-[660px]" style={{ gridTemplateColumns: "minmax(200px,1.6fr) repeat(5, minmax(82px, 1fr))" }} data-testid="scan-check-grid">
                    <span />
                    {SCAN_CHECKS.map((c) => (
                      <span key={c} className={cn(TYPE.label, "text-muted-foreground/60 text-center leading-tight pb-1.5")}>{c}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-foreground/[0.015] px-4 py-5 mt-1">
                  <ScanSearch className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  <p className={cn(TYPE.body, "text-muted-foreground/65")}>
                    No scan results yet — staged assets appear here, one row per asset, once the first scan runs.
                  </p>
                </div>
              </SectionCard>

              <CaveatNote text="An automated IAP-variable confidence pass against a suggested brief is planned but not yet built — today this page stages files and maps them to ad names." />

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
