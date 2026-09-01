// ─── Seed contract fuzzing ────────────────────────────────────────────
//
// The entire client reads one bundle. Every "honest pending state" in this
// codebase is a claim about what happens when part of that bundle is absent
// — and every one of those claims has only ever been tested against the one
// shape the fixture happens to have. Production has produced others: an
// account created seconds ago has no analysis, a failed run leaves arrays
// empty rather than missing, an older import omits keys a newer one sets.
//
// So rather than hand-writing a few degraded shapes and hoping they are the
// ones that occur, this mutates the REAL fixture systematically: every key
// path in an account, each one deleted, nulled, and emptied in turn, then
// the whole adapter and derivation surface driven over the result.
//
// The assertion is that nothing THROWS. A throw here is not a caught error
// with a friendly message — the derivation layer runs during render, so it
// is a blank screen. Returning null, [], or an empty state is fine and is
// what the pending-state design promises; crashing is not.
//
// ── What counts as a finding ──────────────────────────────────────────
//
// Only a crash on an input some PRODUCER can emit. A fuzzer that reports
// crashes on impossible inputs is worse than one that finds nothing: it
// manufactures work, and the noise buries the one real result. So every
// crash this sweep produced was traced back to `metrixSeedAssembly.ts` to
// see whether the server can actually send that shape. Exactly one could
// (`app_defaults: null` — see the targeted test at the bottom); the rest are
// listed in UNPRODUCIBLE with the line of the assembler that rules them out,
// and each exclusion is asserted to still be live so a stale one is caught.

import { describe, expect, it } from "vitest";

import seedBundle from "../../../test-fixtures/metrix_seed_bundle.json";
import * as adapter from "../metrixSeedAdapter";
import {
  listBreakdownDimensions,
  buildAccountBreakdown,
  buildManagerBreakdown,
  accountTotalsForMetric,
  accountReportingWindow,
  sortBreakdownRows,
  formatBreakdownValue,
} from "../kpiBreakdown";
import { STATIC_METRIC_IDS } from "../metricsCatalog";

type Any = Record<string, any>;
type How = "delete" | "null" | "empty";

const ACCOUNT_ID = "bookster";
const HOWS = ["delete", "null", "empty"] as const;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ─── Shapes with no producer ──────────────────────────────────────────
//
// Each entry names the assembler code that makes the shape unreachable.
// `path` matches one exact key path; `prefix` matches any path beneath it.

interface Exclusion {
  path?: string;
  prefix?: string;
  how: readonly How[];
  why: string;
}

const UNPRODUCIBLE: Exclusion[] = [
  {
    path: "iap.campaign_summary",
    how: ["empty"],
    why:
      "metrixSeedAssembly.ts:860 builds campaign_summary as a single object literal " +
      "that always sets bottom_line_totals. A partial one has no producer.",
  },
  {
    path: "iap.campaign_summary.bottom_line_totals",
    how: ["delete", "null"],
    why:
      "Same literal (metrixSeedAssembly.ts:861, `bottom_line_totals: byEvent`) — the key is " +
      "unconditional and byEvent is always an object. `{}` IS producible (an account whose " +
      "ad_performance table is empty) and is therefore still swept.",
  },
  {
    prefix: "iap.campaign_summary.bottom_line_totals.",
    how: ["null"],
    why:
      "byEvent[event] is only ever assigned an object literal of six numbers " +
      "(metrixSeedAssembly.ts:359 and zeroEventTotals at :1362). A null event total " +
      "has no producer.",
  },
];

function exclusionFor(path: string[], how: How): Exclusion | null {
  const joined = path.join(".");
  for (const ex of UNPRODUCIBLE) {
    if (!ex.how.includes(how)) continue;
    if (ex.path !== undefined && ex.path === joined) return ex;
    if (ex.prefix !== undefined && joined.startsWith(ex.prefix)) return ex;
  }
  return null;
}

/**
 * Every key path inside one account, to a bounded depth.
 *
 * Depth 4 reaches iap.analysis.<array>.<field>, which is where the shapes
 * that actually vary live. Going deeper multiplies cases without reaching
 * anything a different producer would plausibly change.
 */
function keyPaths(obj: unknown, prefix: string[] = [], depth = 0): string[][] {
  if (depth >= 4 || obj === null || typeof obj !== "object") return [];
  const out: string[][] = [];
  const entries = Array.isArray(obj)
    ? // For arrays, descend into the first element only — the shape is what
      // matters, and every element shares it.
      obj.length > 0 ? [["0", obj[0]] as const] : []
    : Object.entries(obj as Any);
  for (const [k, v] of entries) {
    const path = [...prefix, k];
    out.push(path);
    out.push(...keyPaths(v, path, depth + 1));
  }
  return out;
}

/**
 * Apply one mutation, restricted to shapes a JSON producer can actually emit.
 *
 * The first version of this used `delete` on array indices, which leaves a
 * SPARSE HOLE — a thing JSON has no syntax for and no server can send. It
 * reported 19 crashes on inputs that cannot occur. An array element is
 * removed by splicing (a shorter array, which is ordinary) instead.
 */
function mutate(account: Any, path: string[], how: How): Any {
  const next = clone(account);
  let cur: Any = next;
  for (const seg of path.slice(0, -1)) {
    if (cur === null || typeof cur !== "object") return next;
    cur = cur[seg];
  }
  if (cur === null || typeof cur !== "object") return next;
  const last = path[path.length - 1]!;

  if (Array.isArray(cur)) {
    const i = Number(last);
    if (!Number.isInteger(i)) return next;
    // delete → the row is absent (shorter array). null/empty on an element
    // are skipped: this server maps rows through shaping functions that
    // cannot yield null, so those shapes are not reachable and asserting on
    // them would be speculative hardening, not a defect.
    if (how === "delete") cur.splice(i, 1);
    return next;
  }

  if (how === "delete") delete cur[last];
  else if (how === "null") cur[last] = null;
  else cur[last] = Array.isArray(cur[last]) ? [] : typeof cur[last] === "object" && cur[last] !== null ? {} : "";
  return next;
}

/**
 * Drive every reader a page would call. Returns the error if one throws.
 *
 * This is deliberately the WHOLE surface rather than a sample: the point is
 * to find the one reader that assumes a field is always there.
 */
function driveEverything(bundle: Any): Error | null {
  try {
    const id = ACCOUNT_ID;
    adapter.getAppDefaults(bundle as any);
    adapter.getForbiddenTerms(bundle as any);
    adapter.getManagerOverview(bundle as any);
    adapter.getAdAccounts(bundle as any);
    const account = adapter.getAdAccount(bundle as any, id);
    adapter.getAdAccountOverview(bundle as any, id);
    adapter.getAds(bundle as any, id);
    adapter.getCoreControls(bundle as any, id);
    adapter.getCampaignSummary(bundle as any, id);
    adapter.getListenSignals(bundle as any, id);
    const analysis = adapter.getAnalysisData(bundle as any, id);
    adapter.getStrategyData(bundle as any, id);
    adapter.getBriefBuilder(bundle as any, id);
    adapter.getReportBuilder(bundle as any, id);
    adapter.getOptimizationLoop(bundle as any, id);
    adapter.getMST(bundle as any, id);

    // Derivations the dashboards run during render.
    if (account) {
      accountReportingWindow(account as any);
      for (const metric of STATIC_METRIC_IDS) {
        accountTotalsForMetric(account as any, metric);
      }
    }
    buildManagerBreakdown((bundle["ad_accounts"] ?? []) as any, "spend");
    if (analysis) {
      const dims = listBreakdownDimensions(analysis);
      for (const dim of dims) {
        for (const metric of STATIC_METRIC_IDS) {
          const rows = buildAccountBreakdown(analysis, dim.id, metric);
          sortBreakdownRows(rows, "desc");
          for (const r of rows) formatBreakdownValue(metric, r.value);
        }
      }
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

const baseBundle = seedBundle as unknown as Any;
const baseAccount = (baseBundle["ad_accounts"] as Any[]).find(
  (a) => a["id"] === ACCOUNT_ID,
)!;

// The sweep runs ~600 cases and the fixture is ~2 MB, so deep-cloning the
// whole bundle per case was 1.2 GB of JSON round-tripping and pushed the test
// past its timeout. Every reader here is pure, and `mutate` already hands back
// a freshly cloned account, so the untouched remainder of the bundle can be
// shared across cases: only the one account slot is swapped.
const sweepAccounts = [...(baseBundle["ad_accounts"] as Any[])];
const sweepBundle: Any = { ...baseBundle, ad_accounts: sweepAccounts };
const SWEEP_SLOT = sweepAccounts.findIndex((a) => a["id"] === ACCOUNT_ID);

function bundleWithAccount(account: Any): Any {
  sweepAccounts[SWEEP_SLOT] = account;
  return sweepBundle;
}

describe("seed contract fuzzing — the client must degrade, never crash", () => {
  // ── harness guards ───────────────────────────────────────────────────
  // Two mistakes this suite could make silently: throwing on the untouched
  // fixture (so every "finding" is mine), or generating no cases (so it
  // passes over nothing). Both are checked before any result is trusted.

  it("does not throw on the UNMUTATED fixture", () => {
    const err = driveEverything(baseBundle);
    expect(
      err?.message ?? null,
      "the harness itself fails on good data — every finding below would be mine, not the app's",
    ).toBeNull();
  });

  it("generates a non-trivial number of mutations", () => {
    expect(keyPaths(baseAccount).length).toBeGreaterThan(40);
  });

  it("actually changes the account it claims to mutate", () => {
    // Without this, a `mutate` that silently returned its input would turn the
    // whole sweep into ~600 runs over good data.
    expect(baseAccount["status"], "fixture no longer has the key this checks").toBeTruthy();
    expect(mutate(baseAccount, ["status"], "delete")).not.toHaveProperty("status");
    expect(mutate(baseAccount, ["status"], "null")["status"]).toBeNull();
    expect(mutate(baseAccount, ["iap", "analysis"], "empty")["iap"]["analysis"]).toEqual({});
    expect(baseAccount["status"], "mutate wrote through to the shared fixture").toBeTruthy();
  });

  // ── the sweep ────────────────────────────────────────────────────────

  it("survives every key of an account being deleted, nulled, or emptied", () => {
    const paths = keyPaths(baseAccount);
    const crashes: string[] = [];
    const usedExclusions = new Set<Exclusion>();
    let cases = 0;
    let applied = 0;

    for (const path of paths) {
      for (const how of HOWS) {
        const excluded = exclusionFor(path, how);
        if (excluded) {
          usedExclusions.add(excluded);
          continue;
        }
        cases += 1;
        const mutant = mutate(baseAccount, path, how);
        const bundle = bundleWithAccount(mutant);
        // Guard the guard. If bundleWithAccount ever stops installing the
        // mutant, this sweep drives ~600 copies of the untouched fixture and
        // passes over nothing — a vacuous green that looks identical to a real
        // one. An identity check per case makes that impossible.
        if ((bundle["ad_accounts"] as Any[])[SWEEP_SLOT] === mutant) applied += 1;
        const err = driveEverything(bundle);
        if (err) {
          crashes.push(`${how.padEnd(6)} ${path.join(".")}  →  ${err.message.split("\n")[0]}`);
        }
      }
    }

    expect(applied, "the sweep drove bundles that were never mutated").toBe(cases);

    expect(
      crashes,
      `${crashes.length} of ${cases} producible mutations crashed the data layer.\n` +
        `Each one is a blank screen for an account whose data happens to have that shape:\n\n` +
        crashes.slice(0, 40).join("\n") +
        (crashes.length > 40 ? `\n… and ${crashes.length - 40} more` : ""),
    ).toEqual([]);

    // A stale exclusion is a silently shrinking sweep — if a path is renamed
    // away, the entry stops matching and stops protecting anything, but the
    // suite keeps passing. Fail instead.
    const stale = UNPRODUCIBLE.filter((ex) => !usedExclusions.has(ex));
    expect(
      stale.map((ex) => ex.path ?? ex.prefix),
      "exclusions that no longer match any path — the shape they excused is gone, so delete them",
    ).toEqual([]);
    // ~600 cases x the full adapter+derivation surface. Measured at ~16 s on
    // the CI runner, so the file-wide 15 s default is not enough; the timeout
    // is set per-test rather than raised globally, which would hide a genuine
    // hang in every other suite.
  }, 120_000);

  it("survives an account that is entirely absent", () => {
    const empty = clone(baseBundle);
    empty["ad_accounts"] = [];
    expect(driveEverything(empty)?.message ?? null).toBeNull();
  });

  it("survives a bundle whose top-level keys are missing", () => {
    // Version skew: an older producer that never wrote a key a newer reader
    // expects. `ad_accounts` is excluded — metrixSeedAssembly.ts:1424 returns
    // it as `ad_accounts: accountObjects`, unconditionally an array, and the
    // empty-array case has its own test above.
    const crashes: string[] = [];
    for (const key of Object.keys(baseBundle)) {
      if (key === "ad_accounts") continue;
      const next = clone(baseBundle);
      delete next[key];
      const err = driveEverything(next);
      if (err) crashes.push(`delete ${key} → ${err.message.split("\n")[0]}`);
    }
    expect(crashes, `Top-level deletions:\n${crashes.join("\n")}`).toEqual([]);
  });

  it("survives app_defaults being null, which a project without the config row sends", () => {
    // The one crash this sweep found that a producer can actually emit.
    // metrixSeedAssembly.ts:1407 is `app_defaults: config.get("app_defaults") ?? null`,
    // and that row is written by the importer (scripts/src/metrix-supabase/import.ts:1797)
    // — so any Supabase project the importer has not fully run against sends null.
    // `seedTypes.ts` declared the field non-nullable, and `getForbiddenTerms`
    // dereferenced it, which threw.
    const next = clone(baseBundle);
    next["app_defaults"] = null;
    expect(driveEverything(next)?.message ?? null).toBeNull();
    expect(adapter.getForbiddenTerms(next as any)).toEqual([]);
    expect(adapter.getAppDefaults(next as any)).toBeNull();
  });

  it("survives a brand-new account carrying nothing but an id", () => {
    // Exactly what `POST /api/metrix/accounts` creates before any analysis:
    // the seed builds an "honest pending shape". This is that shape.
    const next = clone(baseBundle);
    (next["ad_accounts"] as Any[]).push({ id: "acct_brand_new" });
    expect(driveEverything(next)?.message ?? null).toBeNull();
  });
});
