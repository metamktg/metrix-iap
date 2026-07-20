// ─── MST · Hub (/app/mst) ─────────────────────────────────────────────
// Command center for the MST (Metrix Sprint Test) layer:
// matrix stats, concept health, winning paths, quick links.

import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader,
  ModuleScopeGate,
  PendingState,
  CrossLink,
  InfoTooltip,
} from "../shared";
import { cn } from "@/lib/utils";
import {
  Layers,
  ArrowUpRight,
  PlusCircle,
  Trophy,
  CheckCircle2,
  Activity,
  AlertCircle,
} from "lucide-react";

const SECTION = "MST · 07";

export function MSTHub() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="MST" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);

        const library = mst?.local_book2_library ?? [];
        const matrix = mst?.historical_matrix_4x4;
        const matrixCells = matrix?.cells ?? [];

        // Deduplicate library by cell_id (multi-aspect-ratio rows)
        const uniqueLibraryCells = [
          ...new Map(library.map((c) => [c.cell_id, c])).values(),
        ];

        const totalCells = uniqueLibraryCells.length;
        const matrixCellCount = matrixCells.length;

        // Derive signal from library cells (stage field where available)
        const winningCells = uniqueLibraryCells.filter(
          (c) => c.iap_read && /win|top|tier.?1/i.test(c.iap_read),
        ).length;
        const atRiskCells = uniqueLibraryCells.filter(
          (c) => c.iap_read && /risk|stop|tier.?4|low/i.test(c.iap_read),
        ).length;

        const loopStatus = acct.iap?.loop_status ?? [];
        const mstStage = loopStatus.find((s) => s.stage === "mst");
        const hasMST = totalCells > 0 || matrixCellCount > 0;

        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ModuleHeader
              section={SECTION}
              title="MST"
              account={acct}
            />

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-5xl">
              {/* Action row */}
              <div className="flex items-center justify-between gap-4">
                <p className={cn(TYPE.caption, "text-muted-foreground")}>
                  {totalCells} library cell{totalCells !== 1 ? "s" : ""} · {matrixCellCount} matrix cell{matrixCellCount !== 1 ? "s" : ""}
                </p>
                <a
                  href="/app/mst/concept-map"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> New MST Session
                </a>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: "Library Cells", value: totalCells, color: "text-foreground" },
                  { label: "Matrix Cells", value: matrixCellCount, color: "text-primary" },
                  { label: "Winning Signals", value: winningCells, color: "text-[hsl(var(--metrix-success))]" },
                  { label: "At Risk", value: atRiskCells, color: atRiskCells > 0 ? "text-destructive" : "text-foreground" },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-card/60 border border-border/60 rounded-xl px-4 py-3"
                  >
                    <p className={cn(TYPE.label, "text-muted-foreground/70 mb-1")}>
                      {kpi.label}
                    </p>
                    <div className={cn("text-2xl font-bold tabular-nums", kpi.color)}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stage status */}
              {mstStage && (
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border",
                    mstStage.status === "complete"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-primary/5 border-primary/20",
                  )}
                >
                  {mstStage.status === "complete" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Activity className="w-4 h-4 text-primary shrink-0" />
                  )}
                  <p className={cn(TYPE.body, "text-foreground font-semibold")}>
                    Stage: <span className="capitalize">{mstStage.status}</span>
                  </p>
                </div>
              )}

              {/* Winning path callout */}
              {winningCells > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[hsl(var(--metrix-gold)/0.06)] border border-[hsl(var(--metrix-gold)/0.2)]">
                  <Trophy className="w-3.5 h-3.5 text-[hsl(var(--metrix-gold))] shrink-0 mt-0.5" />
                  <p className={cn(TYPE.caption, "text-muted-foreground leading-relaxed")}>
                    <span className="text-foreground font-semibold">
                      {winningCells} winning signal{winningCells !== 1 ? "s" : ""}
                    </span>{" "}
                    identified — view the crossmap to see transferable variable stacks.
                  </p>
                  <a
                    href="/app/mst/crossmap"
                    className={cn(
                      TYPE.caption,
                      "text-[hsl(var(--metrix-gold))] hover:opacity-80 transition-opacity whitespace-nowrap ml-auto",
                    )}
                  >
                    View crossmap →
                  </a>
                </div>
              )}

              {/* At-risk callout */}
              {atRiskCells > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/20">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className={cn(TYPE.caption, "text-muted-foreground leading-relaxed")}>
                    <span className="text-foreground font-semibold">
                      {atRiskCells} cell{atRiskCells !== 1 ? "s" : ""}
                    </span>{" "}
                    at risk — review in Creative Scan.
                  </p>
                  <a
                    href="/app/mst/creative-scan"
                    className={cn(
                      TYPE.caption,
                      "text-destructive hover:opacity-80 transition-opacity whitespace-nowrap ml-auto",
                    )}
                  >
                    Review →
                  </a>
                </div>
              )}

              {/* No data state */}
              {!hasMST && (
                <PendingState
                  title="MST not yet started"
                  message="Complete the Analysis and Strategy stages first, then start your first Metrix Sprint Test from the Concept Map."
                  icon={Layers}
                  action={
                    <CrossLink to="/app/mst/concept-map" label="Go to Concept Map" />
                  }
                />
              )}

              {/* Quick links */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "Concept Map", desc: "2D variable lineage grid", href: "/app/mst/concept-map" },
                  { label: "Matrix Builder", desc: "Construct + refine test matrices", href: "/app/mst/matrix" },
                  { label: "Creative Scan", desc: "Variable pattern analysis", href: "/app/mst/creative-scan" },
                  { label: "Crossmap Results", desc: "Cross-concept performance", href: "/app/mst/crossmap" },
                ].map((l) => (
                  <div
                    key={l.href}
                    className="bg-card/60 border border-border/60 rounded-xl hover:border-primary/30 hover:bg-card transition-colors group"
                  >
                    <div className="flex items-center gap-1 px-4 py-3">
                      <a
                        href={l.href}
                        className="flex-1 flex items-center justify-between gap-1 min-w-0"
                      >
                        <span className={cn(TYPE.body, "font-semibold text-foreground truncate")}>
                          {l.label}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                      </a>
                      <InfoTooltip content={l.desc} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
