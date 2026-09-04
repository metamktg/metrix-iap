// Chain of custody for every number in the product.
//
// WHAT THIS EXISTS FOR
// The seed bundle carries a complete account of where its numbers came
// from — which package was imported, which file produced each loop stage,
// which variable families have no registry definition behind them, and one
// assembly statement that says outright "do not fabricate missing values".
// The server computes all of it on every seed build. Until this module, not
// one field of it was reachable from the interface.
//
// That is the worst class of gap in a data product. It is not a wrong
// number — it is a correct number that cannot be checked. An agency putting
// its client's spend behind a Metrix recommendation has no way, inside the
// app, to answer "where did this come from?". They have to ask us.
//
// So: the chain of custody is a first-class, reachable surface, and this
// module is the part of it that can be tested without a browser.
//
// THE RULES IT ENFORCES
//   1. Nothing is invented. A seed that carries no integrity note reports
//      "no statement" — it does not get given the server's default string.
//   2. Nothing is dropped. `IAPData.metadata` is an untyped record whose
//      shape the client does not control, so it is FLATTENED rather than
//      picked from: every leaf reaches the screen under its own dotted
//      path, including keys added after this code was written.
//   3. A known gap reads as a gap. The three `registry_missing` variable
//      families (ST_, AW_, CTA_) are the ones whose codes already render
//      as chips all over the app with nothing marking them unbacked.

import type { MetrixSeed, AdAccount, LoopStageStatus, VariableRegistryEntry } from "./seedTypes";

/** One leaf of an untyped metadata record, addressed by its full path. */
export interface ProvenanceFact {
  /** Dotted path from the record root — "loop_run.date_range.start". */
  path: string;
  /** The leaf, rendered. Never an object; never the string "undefined". */
  value: string;
}

export interface StageProvenance {
  stage: string;
  status: string;
  sourceFile: string | null;
  generatedAt: string | null;
  window: string | null;
  note: string | null;
}

export interface AccountProvenance {
  id: string;
  name: string;
  status: string;
  /** Flattened `iap.metadata`. Empty when the account carries none. */
  facts: ProvenanceFact[];
  /** One row per IAP loop stage, carrying the file that produced it. */
  stages: StageProvenance[];
  /** `mst.source_artifacts` — the documents an MST traces back to. */
  mstArtifacts: string[];
}

export interface RegistryFamily {
  prefix: string;
  family: string;
  status: string;
  /** True for any status that is not "active" — the family is not backed. */
  unbacked: boolean;
  note: string | null;
}

export interface SeedProvenance {
  schemaVersion: string | null;
  generatedAt: string | null;
  /** The assembly statement, verbatim. Null when the seed carried none. */
  integrityNote: string | null;
  registry: RegistryFamily[];
  /** How many registry families are declared but not backed. */
  unbackedFamilies: number;
  accounts: AccountProvenance[];
}

/** Trimmed string, or null. Empty and whitespace-only are both "absent". */
function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Flatten an untyped record to addressable leaves.
 *
 * `metadata` is `Record<string, unknown>` because its shape is decided by
 * the IAP package, not by this app. Picking known keys out of it would mean
 * every future key added upstream silently stops reaching the screen — the
 * exact failure this whole surface exists to prevent. So the traversal is
 * total: objects recurse, arrays join, primitives render, and `null`
 * survives as the word null rather than vanishing.
 *
 * Depth is capped because the input is external data, not because any real
 * package nests that far.
 */
/**
 * A fact's dotted path as words, for the label a reader scans:
 * "manual_uploads[0].verification" reads "manual uploads · upload 1 ·
 * verification", "bundle_metadata.client_id" reads "bundle metadata ·
 * client id". The path itself stays in the row's title attribute; it is
 * the key the record uses and the one an operator would grep for.
 */
export function humanizeFactPath(path: string): string {
  const segments = path.split(".").filter((s) => s.length > 0);
  const out: string[] = [];
  for (const seg of segments) {
    const m = /^(.*?)\[(\d+)\]$/.exec(seg);
    const name = (m ? m[1] : seg).replace(/_/g, " ").trim();
    if (name) out.push(name);
    if (m) {
      // "manual_uploads[0]" is the first upload: the noun is the list
      // name's last word, singular when it ends in "s".
      const last = name.split(" ").pop() ?? "";
      const noun = last.endsWith("s") ? last.slice(0, -1) : last;
      out.push(`${noun || "item"} ${Number(m[2]) + 1}`);
    }
  }
  return out.length > 0 ? out.join(" · ") : path;
}

export function flattenFacts(input: unknown, prefix = "", depth = 0): ProvenanceFact[] {
  if (depth > 6) return prefix ? [{ path: prefix, value: "…(nested too deep to display)" }] : [];
  if (input === null) return prefix ? [{ path: prefix, value: "null" }] : [];
  if (input === undefined) return [];

  if (Array.isArray(input)) {
    if (input.length === 0) return prefix ? [{ path: prefix, value: "(empty list)" }] : [];
    // A list of primitives reads better as one line than as n indexed rows.
    if (input.every((v) => v === null || typeof v !== "object")) {
      return [{ path: prefix, value: input.map((v) => String(v)).join(", ") }];
    }
    return input.flatMap((v, i) => flattenFacts(v, `${prefix}[${i}]`, depth + 1));
  }

  if (typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return prefix ? [{ path: prefix, value: "(empty)" }] : [];
    return entries.flatMap(([k, v]) => flattenFacts(v, prefix ? `${prefix}.${k}` : k, depth + 1));
  }

  return [{ path: prefix, value: String(input) }];
}

function accountProvenance(a: AdAccount): AccountProvenance {
  const stages: LoopStageStatus[] = a.iap?.loop_status ?? [];
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    facts: flattenFacts(a.iap?.metadata ?? null).filter((f) => f.path.length > 0),
    stages: stages.map((s) => ({
      stage: s.stage,
      status: s.status,
      sourceFile: str(s.source_file),
      generatedAt: str(s.generated_at),
      window:
        str(s.window_start) && str(s.window_end) ? `${s.window_start} → ${s.window_end}` : null,
      note: str(s.note),
    })),
    mstArtifacts: (a.mst?.source_artifacts ?? []).map((x) => String(x)).filter((x) => x.length > 0),
  };
}

function registryFamily(e: VariableRegistryEntry): RegistryFamily {
  return {
    prefix: e.prefix,
    family: e.family,
    status: e.status,
    // Anything that is not literally "active" is treated as unbacked. The
    // seed ships "registry_missing" today; a future status this code has
    // never seen must fail toward "flag it", never toward "looks fine".
    unbacked: e.status !== "active",
    note: str(e.note),
  };
}

export function readSeedProvenance(seed: MetrixSeed | null | undefined): SeedProvenance {
  const registry = (seed?.variable_registry ?? []).map(registryFamily);
  return {
    schemaVersion: str(seed?.schema_version),
    generatedAt: str(seed?.generated_at),
    integrityNote: str(seed?.integrity_note),
    registry,
    unbackedFamilies: registry.filter((r) => r.unbacked).length,
    accounts: (seed?.ad_accounts ?? []).map(accountProvenance),
  };
}

/**
 * How many stages across the whole seed can name the file that produced
 * them. Shown as a coverage figure so an incomplete chain reads as
 * incomplete instead of reading as no chain at all.
 */
export function sourceFileCoverage(p: SeedProvenance): { named: number; total: number } {
  const stages = p.accounts.flatMap((a) => a.stages);
  return { named: stages.filter((s) => s.sourceFile !== null).length, total: stages.length };
}
