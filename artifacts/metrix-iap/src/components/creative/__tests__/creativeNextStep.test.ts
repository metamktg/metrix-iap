// The next-step nudge suggests exactly one of two runnable steps, from real
// state, or nothing. Pinned here so the suggestion can never fire for an
// account with no creatives, never asks to deconstruct what is already
// deconstructed, and only asks for a re-run when a deconstruction is newer
// than the run that would read it.
import { describe, expect, it } from "vitest";
import { deriveCreativeNextStep } from "../CreativeNextStepNudge";

describe("deriveCreativeNextStep", () => {
  it("suggests nothing when the account has no staged creatives", () => {
    expect(
      deriveCreativeNextStep({
        creativeImportIds: [],
        deconstructedImportIds: [],
        newestDeconstructionAt: null,
        latestSuccessfulRunAt: "2026-09-02T11:00:00Z",
      }),
    ).toBeNull();
  });

  it("asks to deconstruct the creatives that have not been", () => {
    expect(
      deriveCreativeNextStep({
        creativeImportIds: ["a", "b", "c"],
        deconstructedImportIds: ["a"],
        newestDeconstructionAt: "2026-09-02T10:00:00Z",
        latestSuccessfulRunAt: "2026-09-02T11:00:00Z",
      }),
    ).toEqual({ kind: "deconstruct", pending: 2 });
  });

  it("asks for a re-run once every creative is deconstructed and the newest one postdates the run", () => {
    expect(
      deriveCreativeNextStep({
        creativeImportIds: ["a", "b"],
        deconstructedImportIds: ["a", "b"],
        newestDeconstructionAt: "2026-09-02T12:00:00Z",
        latestSuccessfulRunAt: "2026-09-02T11:00:00Z",
      }),
    ).toEqual({ kind: "reanalyze", deconstructed: 2 });
  });

  it("is quiet once a run has already read the deconstructions", () => {
    expect(
      deriveCreativeNextStep({
        creativeImportIds: ["a"],
        deconstructedImportIds: ["a"],
        newestDeconstructionAt: "2026-09-02T10:00:00Z",
        latestSuccessfulRunAt: "2026-09-02T11:00:00Z",
      }),
    ).toBeNull();
  });
});
