// ─── Bulk backfill target selection ────────────────────────────────────
// The backfill must target exactly the creative_asset imports with no
// non-discarded classification: never-classified imports and discarded
// ones are in; auto_filed, needs_review, user_overridden, and unsupported
// are out (they already have a live classification or explicit outcome).

import { describe, it, expect } from "vitest";
import { selectUnclassifiedImportIds } from "../deconstructionEngine";

describe("selectUnclassifiedImportIds", () => {
  it("targets never-classified and discarded imports only", () => {
    const imports = [
      { id: "a" }, // never classified
      { id: "b" }, // discarded → reclassify
      { id: "c" }, // auto_filed → skip
      { id: "d" }, // needs_review → skip (already in queue)
      { id: "e" }, // user_overridden → skip
      { id: "f" }, // unsupported → skip (explicit outcome, re-running won't help)
    ];
    const decs = [
      { manual_import_id: "b", status: "discarded" },
      { manual_import_id: "c", status: "auto_filed" },
      { manual_import_id: "d", status: "needs_review" },
      { manual_import_id: "e", status: "user_overridden" },
      { manual_import_id: "f", status: "unsupported" },
    ];
    expect(selectUnclassifiedImportIds(imports, decs)).toEqual(["a", "b"]);
  });

  it("returns empty when everything is classified", () => {
    expect(
      selectUnclassifiedImportIds(
        [{ id: "a" }],
        [{ manual_import_id: "a", status: "auto_filed" }],
      ),
    ).toEqual([]);
  });

  it("ignores classifications for imports that no longer exist", () => {
    expect(
      selectUnclassifiedImportIds([{ id: "a" }], [{ manual_import_id: "gone", status: "auto_filed" }]),
    ).toEqual(["a"]);
  });
});
