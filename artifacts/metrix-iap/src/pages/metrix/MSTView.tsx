// ─── MST (Message-Strategy Testing matrix) ────────────────────────────
// Bookster → active: local library + 4×4 historical matrix + variable library.
// No Pass/Fail. SKOV → not_available: setup state.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getMST } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, CaveatNote, UnconfiguredState, PendingState, readableVariables } from "./shared";
import { cn } from "@/lib/utils";
import { Grid3x3, Library, Tags } from "lucide-react";
import type { MSTMatrix } from "@/lib/data/seedTypes";

const ROW_COLOR: Record<string, string> = {
  "var(--green)": "border-emerald-400/30 bg-emerald-400/[0.04]",
  "var(--blue)": "border-blue-400/30 bg-blue-400/[0.04]",
  "var(--amber)": "border-amber-400/30 bg-amber-400/[0.04]",
  "var(--purple)": "border-purple-400/30 bg-purple-400/[0.04]",
};

function Matrix({ matrix }: { matrix: MSTMatrix }) {
  const cellOf = (col: string, row: string) => matrix.cells.find((c) => c.column_id === col && c.row_id === row);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid" style={{ gridTemplateColumns: `120px repeat(${matrix.columns.length}, 1fr)` }}>
          {/* Corner */}
          <div className="p-2" />
          {/* Column headers */}
          {matrix.columns.map((c) => (
            <div key={c.id} className="p-2 text-center">
              <div className="text-[11px] font-semibold text-foreground leading-tight whitespace-pre-line">{c.name}</div>
              <div className="text-[9px] font-mono text-muted-foreground/40 mt-1">{c.id}</div>
            </div>
          ))}

          {/* Rows */}
          {matrix.rows.map((row) => (
            <div key={row.id} className="contents">
              <div className={cn("p-2 flex flex-col justify-center rounded-l-lg border-l-2 my-0.5", ROW_COLOR[row.color] ?? "border-border/40")}>
                <div className="text-[11px] font-semibold text-foreground">{row.id}</div>
                <div className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{readableVariables(row.shared)}</div>
                <div className="text-[9px] font-mono text-muted-foreground/35 mt-0.5">{row.shared}</div>
              </div>
              {matrix.columns.map((col) => {
                const cell = cellOf(col.id, row.id);
                const diag = cell?.diagonal_role;
                return (
                  <div
                    key={col.id + row.id}
                    className={cn(
                      "m-0.5 p-2.5 rounded-lg border bg-white/[0.02] min-h-[112px]",
                      diag === "diag_down" && "border-primary/40 ring-1 ring-primary/15",
                      diag === "diag_up" && "border-teal-400/40 ring-1 ring-teal-400/15",
                      !diag && "border-border/40"
                    )}
                  >
                    {cell ? (
                      <>
                        <div className="text-[10px] font-semibold text-primary/80 leading-tight">{readableVariables(cell.concept_code)}</div>
                        {cell.plain_text.headline && <div className="text-[11px] font-medium text-foreground mt-1 leading-tight">{cell.plain_text.headline}</div>}
                        {cell.plain_text.primary && <div className="text-[10px] text-muted-foreground/60 mt-1 leading-snug line-clamp-3">{cell.plain_text.primary}</div>}
                        <div className="text-[8px] font-mono text-muted-foreground/35 mt-1.5">{cell.cell_id}</div>
                      </>
                    ) : (
                      <div className="text-[10px] text-muted-foreground/30">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type View = "matrix" | "library" | "variables";

export function MSTView() {
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(adAccountId);
  const [view, setView] = useState<View>("matrix");

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="MST · 05" title="MST" />
        <PendingState title="No ad account selected" message="Choose an ad account to view its MST." />
      </div>
    );
  }
  if (account.status !== "configured") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="MST · 05" title="MST" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const mst = getMST(adAccountId);
  if (!mst || mst.status !== "active") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="MST · 05" title="MST" />
        <ScopeBanner account={account} />
        <PendingState title="MST not available" message={mst?.render_policy ?? "MST becomes available once historical data or imports exist."} icon={Grid3x3} />
      </div>
    );
  }

  const library = mst.local_book2_library ?? [];
  const matrix = mst.historical_matrix_4x4;

  // ── Variable library: distinct variable codes by family, with usage count ──
  const VAR_FAMILIES: { label: string; get: (c: (typeof library)[number]) => string | null | undefined }[] = [
    { label: "Hook", get: (c) => c.hook_variable },
    { label: "Tone", get: (c) => c.tone_variable },
    { label: "Framework", get: (c) => c.framework_variable },
    { label: "Concept", get: (c) => c.concept_variable },
    { label: "Proof", get: (c) => c.proof_variable },
    { label: "CTA", get: (c) => c.cta_variable },
  ];
  const variableGroups = VAR_FAMILIES.map((f) => {
    const counts = new Map<string, number>();
    for (const c of library) {
      const raw = f.get(c);
      if (!raw) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
    const items = [...counts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
    return { label: f.label, items };
  }).filter((g) => g.items.length > 0);
  const distinctVarCount = variableGroups.reduce((n, g) => n + g.items.length, 0);

  const btn = (v: View, Icon: React.ComponentType<{ className?: string }>, label: string, count?: number) => (
    <button onClick={() => setView(v)} className={cn("flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium transition-colors", view === v ? "bg-white/[0.06] text-foreground" : "text-muted-foreground/60 hover:text-foreground")}>
      <Icon className="w-3 h-3" /> {label} {count != null && <span className="font-mono text-muted-foreground/40">{count}</span>}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="MST · 05"
        title="Message-Strategy Testing"
        subtitle="Concept × shared-variable matrix, the local creative library, and the variable library for this account."
        table="mst_matrices"
        right={
          <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5">
            {btn("matrix", Grid3x3, "Matrix")}
            {btn("library", Library, "Concept library", library.length)}
            {btn("variables", Tags, "Variable library", distinctVarCount)}
          </div>
        }
      />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-4">
        <CaveatNote text={mst.render_policy} />

        {view === "matrix" && matrix && <Matrix matrix={matrix} />}
        {view === "matrix" && matrix && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-primary/40 ring-1 ring-primary/15 inline-block" /> Primary diagonal (↘)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-teal-400/40 ring-1 ring-teal-400/15 inline-block" /> Counter diagonal (↗)</span>
          </div>
        )}

        {view === "library" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {library.map((c) => (
              <div key={c.cell_id + c.book2_concept_name} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[9px] font-mono text-muted-foreground/50 border border-border/40 px-1.5 py-0.5 rounded leading-none">{c.cell_id}{c.stage ? ` · ${c.stage}` : ""}</span>
                  {c.mapping_confidence && <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400/80 border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 rounded leading-none">{c.mapping_confidence} confidence</span>}
                </div>
                <p className="text-[12px] font-semibold text-foreground leading-tight">{c.book2_concept_name}</p>
                <p className="text-[12px] text-foreground/80 mt-1.5">{c.primary_message}</p>
                {c.secondary_message && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{c.secondary_message}</p>}
                <p className="text-[10px] text-muted-foreground/50 mt-2 leading-snug">{c.visual_system}</p>
                {c.iap_read && <p className="text-[10px] text-primary/70 mt-2 leading-snug border-t border-border/20 pt-2">{c.iap_read}</p>}
                <div className="mt-2.5 pt-2.5 border-t border-border/20 flex flex-wrap gap-1">
                  {[c.hook_variable, c.tone_variable, c.framework_variable, c.concept_variable, c.proof_variable, c.cta_variable].filter(Boolean).map((v, i) => (
                    <span key={i} className="text-[9px] text-foreground/70 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{readableVariables(v)}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "variables" && (
          distinctVarCount === 0 ? (
            <PendingState title="No variables yet" message="The variable library aggregates from concepts in the local library." icon={Tags} />
          ) : (
            <div className="space-y-5">
              <p className="text-[11px] text-muted-foreground/55">Distinct creative variables in use across this account's concept library, grouped by family. The count shows how many concepts use each variable.</p>
              {variableGroups.map((g) => (
                <div key={g.label}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40">{g.label}</h3>
                    <span className="text-[9px] font-mono text-muted-foreground/35">{g.items.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.items.map((it) => (
                      <div key={it.code} className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                        <div>
                          <div className="text-[11px] font-medium text-foreground/85 leading-tight">{readableVariables(it.code)}</div>
                          <div className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">{it.code}</div>
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground/50 border border-border/40 rounded px-1.5 py-0.5 leading-none">×{it.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
