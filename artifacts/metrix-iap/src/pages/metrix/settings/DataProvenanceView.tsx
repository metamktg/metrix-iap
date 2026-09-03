// ─── Settings · Data provenance ───────────────────────────────────────
// "Where did this number come from?" — answered inside the product.
//
// WHY THIS PAGE EXISTS
// Every other honesty mechanism in Metrix is about a value that is MISSING:
// pending states, null-not-zero, unconfigured accounts, caveat notes. This
// one is about a value that is PRESENT. A number on screen is an assertion,
// and until this page there was no way for the person acting on it to check
// the assertion's basis without asking us.
//
// The seed has always carried the basis. `integrity_note` states how the
// bundle was assembled and says outright that missing values must not be
// fabricated. `iap.metadata` names the source package, the source zip, the
// loop run and its date range. `loop_status[].source_file` names the file
// behind each stage's output. `mst.source_artifacts` names the documents an
// MST traces to. `variable_registry` says which variable families have no
// registry definition behind them. A field-coverage pass found that not one
// of those reached a screen.
//
// WHAT IS DELIBERATELY NOT HERE
// No score, no grade, no "provenance: 94%". A chain of custody is a set of
// facts a reader checks, not a number they trust. The one figure on the page
// is source-file coverage, stated as a fraction with both terms visible, so
// an incomplete chain reads as incomplete rather than as no chain at all.

import { useMemo } from "react";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useAccount } from "@/contexts/AccountContext";
import { readSeedProvenance, sourceFileCoverage } from "@/lib/data/provenance";
import type { AccountProvenance, RegistryFamily } from "@/lib/data/provenance";
import { ModuleHeader, SectionCard, CaveatNote, PendingState, DenseText, CrossLink } from "../shared";
import { TYPE, HEADING } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import { FileSearch, AlertTriangle, CheckCircle2, FileText, Minus } from "lucide-react";

const SECTION = "Settings · 10";

/** A label/value pair. The label is chrome; the value is the evidence. */
function Fact({ label, value, mutedWhenAbsent = true }: { label: string; value: string | null; mutedWhenAbsent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0 py-2">
      <div className={cn(TYPE.microLabel, "truncate")} title={label}>
        {label}
      </div>
      {value === null ? (
        <div className={cn(TYPE.caption, mutedWhenAbsent && "text-muted-foreground/75 italic")}>
          not stated by the seed
        </div>
      ) : (
        // `break-words` rather than truncate: a source path or a package
        // name is the whole point of the row, so it wraps instead of being
        // cut off behind an ellipsis the reader cannot expand.
        <div className={cn(TYPE.caption, "text-foreground/85 break-words tabular-nums")}>{value}</div>
      )}
    </div>
  );
}

// ─── The assembly statement ───────────────────────────────────────────

function AssemblyStatement({
  schemaVersion,
  generatedAt,
  integrityNote,
  coverage,
}: {
  schemaVersion: string | null;
  generatedAt: string | null;
  integrityNote: string | null;
  coverage: { named: number; total: number };
}) {
  return (
    <SectionCard
      title="Assembly statement"
      desc="How this bundle was built · what it promises about missing values"
      table="app_config → integrity_note"
      collapsible={false}
    >
      {integrityNote === null ? (
        // Not a styling choice — a seed with no assembly statement is a
        // seed nobody can vouch for, and it must not look the same as one
        // that carries a real note.
        <CaveatNote text="This seed carries no assembly statement. Nothing here explains how its numbers were produced." />
      ) : (
        <p className={cn(TYPE.body, "text-foreground/90 max-w-prose")}>{integrityNote}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 mt-3 pt-3 border-t border-border/30">
        <Fact label="Schema version" value={schemaVersion} />
        <Fact label="Bundle generated" value={generatedAt} />
        <Fact
          label="Loop stages naming a source file"
          value={coverage.total === 0 ? null : `${coverage.named} of ${coverage.total}`}
        />
      </div>
    </SectionCard>
  );
}

// ─── Variable registry backing ────────────────────────────────────────

function RegistryRow({ r }: { r: RegistryFamily }) {
  const Icon = r.unbacked ? AlertTriangle : CheckCircle2;
  return (
    <li
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        r.unbacked ? "border-status-warning/30 bg-status-warning/[0.06]" : "border-border/30 bg-foreground/[0.02]",
      )}
    >
      <Icon
        className={cn("w-4 h-4 mt-0.5 shrink-0", r.unbacked ? "text-status-warning" : "text-status-success")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn(TYPE.caption, "font-semibold text-foreground tabular-nums")}>{r.prefix}_</span>
          <span className={cn(TYPE.caption, "text-foreground/80")}>{r.family}</span>
          <span className={cn(TYPE.microLabel, r.unbacked && "text-status-warning")}>
            {r.unbacked ? "no registry definition" : "backed"}
          </span>
        </div>
        {r.note && (
          <DenseText text={r.note} className={cn(TYPE.caption, "text-muted-foreground mt-1")} />
        )}
      </div>
      <span className="sr-only">{r.unbacked ? "Unbacked variable family" : "Backed variable family"}</span>
    </li>
  );
}

function RegistrySection({ registry, unbacked }: { registry: RegistryFamily[]; unbacked: number }) {
  if (registry.length === 0) {
    return (
      <SectionCard title="Variable registry backing" desc="Which variable families have a definition behind them">
        <CaveatNote text="This seed carries no variable registry. Variable codes rendered elsewhere in the app cannot be checked against a definition." />
      </SectionCard>
    );
  }
  // Unbacked first: the reader came here for the gaps, and a list sorted
  // alphabetically buries them among the six that are fine.
  const sorted = [...registry].sort((a, b) => Number(b.unbacked) - Number(a.unbacked) || a.prefix.localeCompare(b.prefix));
  return (
    <SectionCard
      title="Variable registry backing"
      desc={`${registry.length} families · ${unbacked} with no registry definition`}
      table="variable_registry"
    >
      {unbacked > 0 && (
        <CaveatNote
          text={`${unbacked} of ${registry.length} variable families have no registry definition behind them. Codes from those families still appear on creative and strategy surfaces — they are named in the source material, but nothing in the client library defines what they mean.`}
        />
      )}
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2">
        {sorted.map((r) => (
          <RegistryRow key={r.prefix} r={r} />
        ))}
      </ul>
    </SectionCard>
  );
}

// ─── Per-account source chain ─────────────────────────────────────────

function StageTable({ stages }: { stages: AccountProvenance["stages"] }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full border-collapse">
        <caption className="sr-only">IAP loop stages and the source file behind each</caption>
        <thead>
          <tr className="border-b border-border/40">
            <th scope="col" className={cn(HEADING.h4, "text-left py-2 pr-3")}>
              Stage
            </th>
            <th scope="col" className={cn(HEADING.h4, "text-left py-2 pr-3")}>
              Status
            </th>
            <th scope="col" className={cn(HEADING.h4, "text-left py-2 pr-3")}>
              Source file
            </th>
            <th scope="col" className={cn(HEADING.h4, "text-left py-2 pr-3")}>
              Window
            </th>
            <th scope="col" className={cn(HEADING.h4, "text-left py-2")}>
              Generated
            </th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => (
            <tr key={s.stage} className="border-b border-border/20 last:border-0 align-top">
              <td className={cn(TYPE.caption, "py-2 pr-3 text-foreground/90 font-medium whitespace-nowrap")}>
                {s.stage}
              </td>
              <td className={cn(TYPE.caption, "py-2 pr-3 text-foreground/70 whitespace-nowrap")}>{s.status}</td>
              <td className={cn(TYPE.caption, "py-2 pr-3 break-words")}>
                {s.sourceFile ? (
                  <span className="inline-flex items-start gap-1.5 text-foreground/85">
                    <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/75" aria-hidden />
                    {s.sourceFile}
                  </span>
                ) : (
                  // An em dash alone reads as "zero". The word says which
                  // of the two it is: the stage produced no file, or the
                  // seed did not record one.
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground/75 italic">
                    <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    no source file recorded
                  </span>
                )}
              </td>
              <td className={cn(TYPE.caption, "py-2 pr-3 text-foreground/70 whitespace-nowrap tabular-nums")}>
                {s.window ?? "—"}
              </td>
              <td className={cn(TYPE.caption, "py-2 text-foreground/70 whitespace-nowrap tabular-nums")}>
                {s.generatedAt ? s.generatedAt.slice(0, 10) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountChain({ a }: { a: AccountProvenance }) {
  const hasAnything = a.facts.length > 0 || a.stages.length > 0 || a.mstArtifacts.length > 0;
  return (
    <SectionCard
      title={a.name}
      desc={`${a.status} · ${a.stages.length} loop stages · ${a.facts.length} recorded facts`}
      table="ad_accounts → iap.metadata"
      defaultOpen={hasAnything}
    >
      {!hasAnything ? (
        <CaveatNote text="No provenance recorded for this account. It has not been through an IAP loop run." />
      ) : (
        <div className="space-y-4">
          {a.stages.length > 0 && <StageTable stages={a.stages} />}

          {a.mstArtifacts.length > 0 && (
            <div>
              <h3 className={cn(HEADING.h6, "mb-1.5")}>MST source artifacts</h3>
              <ul className="space-y-1">
                {a.mstArtifacts.map((x) => (
                  <li key={x} className={cn(TYPE.caption, "text-foreground/85 break-words")}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.facts.length > 0 && (
            <div>
              <h3 className={cn(HEADING.h6, "mb-1.5")}>Recorded run facts</h3>
              {/* Two columns of label/value rather than a table: these are
                  arbitrary key/value pairs from an untyped record, so there
                  is no column set that stays correct as the package
                  evolves. Every leaf is shown under its own dotted path. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 divide-y divide-border/20 md:divide-y-0">
                {a.facts.map((f) => (
                  <Fact key={f.path} label={f.path} value={f.value} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ─── View ─────────────────────────────────────────────────────────────

export function DataProvenanceView() {
  const seed = useMetrixSeed();
  const { manager } = useAccount();
  const prov = useMemo(() => readSeedProvenance(seed), [seed]);
  const coverage = useMemo(() => sourceFileCoverage(prov), [prov]);

  const nothingAtAll =
    prov.integrityNote === null && prov.registry.length === 0 && prov.accounts.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Data provenance"
        subtitle={`Workspace-wide · ${manager.name} · where every number in Metrix came from.`}
        table="integrity_note · variable_registry · loop_status"
      />
      {nothingAtAll ? (
        <PendingState
          title="No provenance recorded"
          message="This workspace's data bundle carries no assembly statement, registry or loop history yet. Provenance appears once an IAP loop run has produced output."
          icon={FileSearch}
        />
      ) : (
        <div className="p-6 space-y-4">
          <AssemblyStatement
            schemaVersion={prov.schemaVersion}
            generatedAt={prov.generatedAt}
            integrityNote={prov.integrityNote}
            coverage={coverage}
          />
          <RegistrySection registry={prov.registry} unbacked={prov.unbackedFamilies} />
          {prov.accounts.map((a) => (
            <AccountChain key={a.id} a={a} />
          ))}
          {/* A page that ends in a wall of lineage and no way forward is a
              dead end (N-5). Provenance is read for one of two reasons —
              checking what an analysis rests on, or finding what is missing —
              and both continue on the analysis centre. */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <CrossLink to="/app/analysis" label="Open the analysis centre" srNote="run or re-run analysis for an account" />
            <CrossLink to="/app/analysis/library" label="Read the IAP Library" srNote="the rows this provenance describes" />
          </div>
        </div>
      )}
    </div>
  );
}
