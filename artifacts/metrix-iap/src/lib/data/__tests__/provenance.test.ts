// The provenance reader has one job — say what the seed said, and nothing
// it did not say. Every test below is written against a way of failing that
// would look fine on screen.

import { describe, it, expect } from "vitest";
import {
  flattenFacts,
  readSeedProvenance,
  sourceFileCoverage,
} from "../provenance";

import { humanizeFactPath } from "../provenance";

describe("humanizeFactPath", () => {
  it("reads a dotted path as words", () => {
    expect(humanizeFactPath("bundle_metadata.client_id")).toBe("bundle metadata · client id");
    expect(humanizeFactPath("loop_run.client")).toBe("loop run · client");
  });
  it("names a list index as the nth item of the list", () => {
    expect(humanizeFactPath("manual_uploads[0].verification")).toBe("manual uploads · upload 1 · verification");
    expect(humanizeFactPath("source_files[2]")).toBe("source files · file 3");
  });
  it("keeps a plain key and never returns an empty label", () => {
    expect(humanizeFactPath("client")).toBe("client");
    expect(humanizeFactPath("")).toBe("");
  });
});
import type { MetrixSeed } from "../seedTypes";

function seed(patch: Partial<MetrixSeed> = {}): MetrixSeed {
  return {
    schema_version: "2.0.0-supabase",
    generated_at: "2026-08-15",
    integrity_note: "Assembled from Supabase tables. Do not fabricate missing values.",
    app_defaults: {} as never,
    manager_account: {} as never,
    ad_accounts: [],
    ...patch,
  } as MetrixSeed;
}

describe("flattenFacts", () => {
  it("reaches leaves the caller never named", () => {
    // The whole point: a key added upstream after this code was written
    // still lands on screen. A pick-list implementation passes every other
    // test in this file and fails this one.
    const facts = flattenFacts({
      loop_run: { date_range: { start: "2026-05-02", end: "2026-07-07" } },
      a_key_nobody_planned_for: "still visible",
    });
    const paths = facts.map((f) => f.path);
    expect(paths).toContain("loop_run.date_range.start");
    expect(paths).toContain("a_key_nobody_planned_for");
  });

  it("keeps null as a stated value rather than dropping the key", () => {
    // "source_zip: null" and "source_zip absent" mean different things to
    // someone auditing an import. Dropping the key erases the difference.
    const facts = flattenFacts({ source_zip: null });
    expect(facts).toEqual([{ path: "source_zip", value: "null" }]);
  });

  it("renders false and 0 rather than treating them as missing", () => {
    const facts = flattenFacts({ local_library_found: false, retries: 0 });
    expect(facts).toEqual([
      { path: "local_library_found", value: "false" },
      { path: "retries", value: "0" },
    ]);
  });

  it("joins a primitive list into one line instead of indexing it", () => {
    const facts = flattenFacts({ books: ["BOOK0", "BOOK2"] });
    expect(facts).toEqual([{ path: "books", value: "BOOK0, BOOK2" }]);
  });

  it("indexes a list of objects so each row keeps its own address", () => {
    const facts = flattenFacts({ runs: [{ id: "a" }, { id: "b" }] });
    expect(facts.map((f) => f.path)).toEqual(["runs[0].id", "runs[1].id"]);
  });

  it("marks empty containers instead of returning nothing for them", () => {
    expect(flattenFacts({ tags: [], opts: {} })).toEqual([
      { path: "tags", value: "(empty list)" },
      { path: "opts", value: "(empty)" },
    ]);
  });

  it("stops at a depth cap without throwing", () => {
    let deep: unknown = "bottom";
    for (let i = 0; i < 40; i++) deep = { down: deep };
    expect(() => flattenFacts(deep)).not.toThrow();
    expect(flattenFacts(deep).length).toBeGreaterThan(0);
  });
});

describe("readSeedProvenance", () => {
  it("reports an absent integrity note as absent, never as a default", () => {
    // The server substitutes a fallback sentence when config carries none.
    // If the CLIENT also substitutes one, a seed with no provenance
    // statement is indistinguishable from a seed with a real one.
    expect(readSeedProvenance(seed({ integrity_note: "" })).integrityNote).toBeNull();
    expect(readSeedProvenance(seed({ integrity_note: "   " })).integrityNote).toBeNull();
    expect(readSeedProvenance(null).integrityNote).toBeNull();
  });

  it("carries the integrity note through verbatim", () => {
    const note = "Assembled from Supabase tables. Do not fabricate missing values.";
    expect(readSeedProvenance(seed()).integrityNote).toBe(note);
  });

  it("flags every family that is not active, including a status it has never seen", () => {
    const p = readSeedProvenance(
      seed({
        variable_registry: [
          { prefix: "CN", family: "Concept", status: "active", note: null },
          { prefix: "AW", family: "Awareness level", status: "registry_missing", note: "Known gap." },
          { prefix: "ZZ", family: "Invented later", status: "deprecated_2027", note: null },
        ],
      }),
    );
    expect(p.unbackedFamilies).toBe(2);
    expect(p.registry.find((r) => r.prefix === "CN")!.unbacked).toBe(false);
    // The load-bearing assertion: an unknown status fails toward "flag it".
    expect(p.registry.find((r) => r.prefix === "ZZ")!.unbacked).toBe(true);
  });

  it("keeps the registry gap note, which is the only explanation of the gap", () => {
    const p = readSeedProvenance(
      seed({
        variable_registry: [
          { prefix: "ST", family: "Structure", status: "registry_missing", note: "Confirmed known gap." },
        ],
      }),
    );
    expect(p.registry[0]!.note).toBe("Confirmed known gap.");
  });

  it("reads each loop stage's source file and leaves an unnamed one null", () => {
    const p = readSeedProvenance(
      seed({
        ad_accounts: [
          {
            id: "act_1",
            name: "Bookster",
            status: "configured",
            iap: {
              metadata: {},
              loop_status: [
                {
                  stage: "bundle_prep",
                  status: "complete",
                  source_file: "normalized_data_bundle.json",
                  window_start: "2026-05-02",
                  window_end: "2026-07-07",
                },
                { stage: "creative_scan", status: "pending", source_file: null },
              ],
            },
          } as never,
        ],
      }),
    );
    const stages = p.accounts[0]!.stages;
    expect(stages[0]!.sourceFile).toBe("normalized_data_bundle.json");
    expect(stages[0]!.window).toBe("2026-05-02 → 2026-07-07");
    expect(stages[1]!.sourceFile).toBeNull();
    // A half-open window is not a window — rendering "2026-05-02 → " would
    // read as a live range that has not ended.
    expect(sourceFileCoverage(p)).toEqual({ named: 1, total: 2 });
  });

  it("survives an account with no iap block at all", () => {
    const p = readSeedProvenance(
      seed({ ad_accounts: [{ id: "act_2", name: "Unconfigured", status: "unconfigured" } as never] }),
    );
    expect(p.accounts[0]!.facts).toEqual([]);
    expect(p.accounts[0]!.stages).toEqual([]);
    expect(p.accounts[0]!.mstArtifacts).toEqual([]);
  });

  it("reads mst.source_artifacts, which no other surface in the app does", () => {
    const p = readSeedProvenance(
      seed({
        ad_accounts: [
          {
            id: "act_1",
            name: "Bookster",
            status: "configured",
            mst: { status: "complete", render_policy: "x", source_artifacts: ["library_v1.xlsx", ""] },
          } as never,
        ],
      }),
    );
    expect(p.accounts[0]!.mstArtifacts).toEqual(["library_v1.xlsx"]);
  });
});
