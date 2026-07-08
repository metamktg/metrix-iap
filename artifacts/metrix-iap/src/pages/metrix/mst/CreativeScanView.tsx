// ─── MST · Creative Scan ──────────────────────────────────────────────
// Scanned local creative library: every mapped concept with its message
// system, variable stack, mapping confidence, and the variable library
// aggregated across the account's concepts.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ModuleScopeGate, ModuleTabs, CaveatNote, PendingState, readableVariables } from "../shared";
import { Library, Tags } from "lucide-react";

const SECTION = "MST · 07";

export function CreativeScanView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<string>("library");

  return (
    <ModuleScopeGate section={SECTION} title="Creative Scan" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);

        if (!mst || mst.status !== "active" || !mst.local_book2_library?.length) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Creative Scan" />
              <ScopeBanner account={acct} />
              <PendingState title="No scanned creatives" message={mst?.render_policy ?? "The creative scan populates once the local library is mapped."} icon={Library} />
            </div>
          );
        }

        const library = mst.local_book2_library;

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

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Creative Scan"
              subtitle="The scanned local creative library and the variable library it produces."
              table="local_book2_library"
            />
            <ScopeBanner account={acct} />
            <ModuleTabs
              tabs={[
                { id: "library", label: "Concept library", count: library.length, Icon: Library },
                { id: "variables", label: "Variable library", count: distinctVarCount, Icon: Tags },
              ]}
              active={tab}
              onChange={setTab}
            />

            <div className="px-6 py-5 space-y-4">
              <CaveatNote text={mst.render_policy} />

              {tab === "library" && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {library.map((c) => (
                    <div key={c.cell_id + c.book2_concept_name} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground/75 border border-border/40 px-1.5 py-0.5 rounded leading-none">{c.cell_id}{c.stage ? ` · ${c.stage}` : ""}</span>
                        {c.mapping_confidence && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 rounded leading-none">{c.mapping_confidence} confidence</span>}
                      </div>
                      <p className="text-[13px] font-semibold text-foreground leading-tight">{c.book2_concept_name}</p>
                      <p className="text-[12px] text-foreground/85 mt-1.5">{c.primary_message}</p>
                      {c.secondary_message && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{c.secondary_message}</p>}
                      <p className="text-[11px] text-muted-foreground/70 mt-2 leading-snug">{c.visual_system}</p>
                      {c.iap_read && <p className="text-[11px] text-primary/90 mt-2 leading-snug border-t border-border/20 pt-2">{c.iap_read}</p>}
                      <div className="mt-2.5 pt-2.5 border-t border-border/20 flex flex-wrap gap-1">
                        {[c.hook_variable, c.tone_variable, c.framework_variable, c.concept_variable, c.proof_variable, c.cta_variable].filter(Boolean).map((v, i) => (
                          <span key={i} className="text-[10px] text-foreground/80 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{readableVariables(v)}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "variables" && (
                distinctVarCount === 0 ? (
                  <PendingState title="No variables yet" message="The variable library aggregates from concepts in the local library." icon={Tags} />
                ) : (
                  <div className="space-y-5">
                    <p className="text-[12px] text-muted-foreground/80">Distinct creative variables in use across this account's concept library, grouped by family. The count shows how many concepts use each variable.</p>
                    {variableGroups.map((g) => (
                      <div key={g.label}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">{g.label}</h3>
                          <span className="text-[10px] font-mono text-muted-foreground/60">{g.items.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.items.map((it) => (
                            <div key={it.code} className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                              <div>
                                <div className="text-[12px] font-medium text-foreground/90 leading-tight">{readableVariables(it.code)}</div>
                                <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{it.code}</div>
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground/75 border border-border/40 rounded px-1.5 py-0.5 leading-none">×{it.count}</span>
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
      }}
    </ModuleScopeGate>
  );
}
