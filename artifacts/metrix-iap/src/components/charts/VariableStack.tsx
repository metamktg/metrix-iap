// ─── Variable stack ───────────────────────────────────────────────────
//
// What a creative or a message pillar is BUILT from: one slot per variable
// family, in the order the creative is read in — hook, hook position, tone,
// framework, structure, concept, awareness, proof, CTA.
//
// The obvious version of this chart is a stacked contribution bar: "the hook
// drove 40% of performance, the tone 35%, the framework 25%". It is not built
// that way, because nothing in this platform measures that. Performance is
// recorded against a CREATIVE. A creative carries a whole stack. Splitting
// its result across the stack's members needs an attribution model, and there
// is no attribution model — so the split would be arithmetic invented to fill
// a chart.
//
// What IS measured is per-variable performance across every creative that
// carries the variable (v3_variable_performance). That is a real number and a
// different claim: not "this variable contributed X here" but "this variable
// averages X wherever it appears". The stack shows it as a MARGINAL read,
// labelled as such, and every slot is the same width because every slot is
// one variable — the width says "present", not "responsible for this much".
//
// A family the stack does not fill renders as an explicit gap. It used to be
// omitted, so a four-variable stack and a nine-variable stack looked like the
// same kind of object with different lengths, and there was no way to see
// that a pillar had no proof variable at all.

import { VARIABLE_FAMILIES, resolveVariableLabel, PREFIX_COLORS } from "@/lib/variable-registry";
import { HEADING } from "@/pages/metrix/typography";

export interface VariableStackProps {
  /** The pillar's variable_stack: family key -> variable code. */
  stack: Record<string, string | null | undefined>;
  /**
   * Marginal performance per variable code, when the caller has it. Keyed by
   * code. Absent codes simply carry no read — never a zero.
   */
  marginal?: Map<string, { label: string; value: string }>;
  /** Names what the marginal read measures, e.g. "CPA across all creatives". */
  marginalLabel?: string;
  onSelect?: (code: string, familyKey: string) => void;
  /** Families with no variable are shown as gaps by default. */
  hideEmpty?: boolean;
}

export function VariableStack({
  stack,
  marginal,
  marginalLabel,
  onSelect,
  hideEmpty = false,
}: VariableStackProps) {
  const slots = VARIABLE_FAMILIES.map((f) => ({ family: f, code: stack[f.key] ?? null })).filter(
    (s) => !hideEmpty || s.code,
  );
  const filled = slots.filter((s) => s.code).length;

  if (slots.length === 0) {
    return <p className="text-caption font-body text-muted-foreground/70">No variable stack recorded.</p>;
  }

  return (
    <div className="w-full">
      <ul className="flex flex-col gap-1" aria-label="Variable stack">
        {slots.map(({ family, code }) => {
          const read = code ? marginal?.get(code) : undefined;
          const inner = (
            <>
              <span
                className={`${HEADING.h6} w-11 shrink-0 tabular-nums`}
                title={family.label}
              >
                {family.abbrev}
              </span>
              <span
                className={`flex-1 min-w-0 truncate rounded-lg border px-2 py-1.5 text-caption font-body
                            ${code ? PREFIX_COLORS[family.prefix] : "border-dashed border-border/35 text-muted-foreground/45"}`}
                title={code ? `${resolveVariableLabel(code)} (${code})` : undefined}
              >
                {code ? resolveVariableLabel(code) : "not set"}
              </span>
              {marginal && (
                <span
                  className="shrink-0 w-16 text-right text-caption font-body tabular-nums text-muted-foreground"
                  // The number belongs to the VARIABLE, not to this stack's
                  // performance. Saying so on the element itself is the only
                  // thing standing between a marginal read and an attribution.
                  title={
                    read
                      ? `${read.label} — measured across every creative carrying ${code}, not this stack's own result`
                      : code
                        ? "No measurement for this variable in the current window."
                        : undefined
                  }
                >
                  {read?.value ?? (code ? "—" : "")}
                </span>
              )}
            </>
          );

          return (
            <li key={family.key}>
              {code && onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(code, family.key)}
                  aria-label={`${family.label}: ${resolveVariableLabel(code)}`}
                  className="w-full min-h-10 flex items-center gap-2 text-left rounded-lg
                             hover:bg-foreground/[0.04] active:scale-[0.99]
                             transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {inner}
                </button>
              ) : (
                <div className="w-full min-h-10 flex items-center gap-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-micro font-mono text-muted-foreground/55 mt-2">
        <span className="tabular-nums">{filled}</span> of{" "}
        <span className="tabular-nums">{VARIABLE_FAMILIES.length}</span> families set
        {marginalLabel && (
          <>
            {" · "}
            <span title="Each read is that variable's own measurement across every creative carrying it. This platform records performance against a creative, which carries a whole stack, so no share of a result is attributable to one variable in it.">
              {marginalLabel} · marginal, not attributed
            </span>
          </>
        )}
      </p>
    </div>
  );
}
