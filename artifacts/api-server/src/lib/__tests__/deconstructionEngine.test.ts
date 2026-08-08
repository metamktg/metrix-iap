// ─── Creative deconstruction engine — pure helper tests ────────────────
// Locks in the 80% confidence gate, registry-prefix validation, dedupe on
// re-classification of the same creative, historical (brief-less) grid
// alignment, brief variable extraction, and video-unsupported detection.

import { describe, it, expect } from "vitest";
import {
  CONFIDENCE_GATE,
  isRegistryValidVariable,
  sanitizeDetectedVariables,
  overallConfidence,
  gateDecision,
  alignCellId,
  briefCellCode,
  briefIntendedVariables,
  libraryPayloadFromDeconstruction,
  supportedImageMediaType,
  isVideoCreative,
  type DetectedVariable,
} from "../deconstructionEngine";
import { keyframeTimestamps } from "../videoKeyframes";

const v = (family: string, code: string, confidence: number): DetectedVariable => ({
  family,
  code,
  confidence,
});

describe("isRegistryValidVariable", () => {
  it("accepts prefix-consistent registry codes", () => {
    expect(isRegistryValidVariable(v("concept", "CN_UGC", 0.9))).toBe(true);
    expect(isRegistryValidVariable(v("tonality", "TN_Warm", 0.9))).toBe(true);
    expect(isRegistryValidVariable(v("hook", "HK_Problem", 0.9))).toBe(true);
  });
  it("rejects family/prefix mismatches, unknown families, and malformed codes", () => {
    expect(isRegistryValidVariable(v("concept", "TN_Warm", 0.9))).toBe(false);
    expect(isRegistryValidVariable(v("vibe", "VB_Cool", 0.9))).toBe(false);
    expect(isRegistryValidVariable(v("framework", "FW_", 0.9))).toBe(false);
    expect(isRegistryValidVariable(v("framework", "framework_pas", 0.9))).toBe(false);
  });
});

describe("sanitizeDetectedVariables", () => {
  it("drops invalid entries, clamps confidence, dedupes by code keeping the best", () => {
    const out = sanitizeDetectedVariables([
      v("concept", "CN_UGC", 0.4),
      v("concept", "CN_UGC", 0.9), // duplicate — higher wins
      v("concept", "XX_Bad", 0.9), // invalid prefix
      v("tonality", "TN_Warm", 1.7), // clamped to 1
    ]);
    expect(out.map((x) => x.code).sort()).toEqual(["CN_UGC", "TN_Warm"]);
    expect(out.find((x) => x.code === "CN_UGC")!.confidence).toBe(0.9);
    expect(out.find((x) => x.code === "TN_Warm")!.confidence).toBe(1);
  });
});

describe("overallConfidence + gateDecision (the 80% gate)", () => {
  it("is the deterministic mean of per-variable confidences", () => {
    expect(overallConfidence([{ confidence: 0.9 }, { confidence: 0.7 }])).toBe(0.8);
    expect(overallConfidence([])).toBeNull();
  });
  it("files at or above the gate, reviews below it", () => {
    expect(CONFIDENCE_GATE).toBe(0.8);
    expect(gateDecision(0.8)).toBe("auto_filed");
    expect(gateDecision(0.95)).toBe("auto_filed");
    expect(gateDecision(0.799)).toBe("needs_review");
    expect(gateDecision(null)).toBe("needs_review");
  });
});

describe("alignCellId (historical grid conventions)", () => {
  it("prefers the mapped ad's grid cell", () => {
    expect(alignCellId({ adCell: "c2b", briefCell: "C3A", existingCellIds: ["C1A"] })).toBe("C2B");
  });
  it("falls back to the linked brief's matrix cell", () => {
    expect(alignCellId({ adCell: null, briefCell: "C3A", existingCellIds: ["C1A"] })).toBe("C3A");
  });
  it("brief-less historical creatives get a NEW column beyond the grid — never an existing one", () => {
    const id = alignCellId({ adCell: null, briefCell: null, existingCellIds: ["C1A", "C4D", "C2B"] });
    expect(id).toBe("C5A");
    expect(["C1A", "C4D", "C2B"]).not.toContain(id);
  });
  it("starts at C1A on an empty library", () => {
    expect(alignCellId({ existingCellIds: [] })).toBe("C1A");
  });
});

describe("briefCellCode + briefIntendedVariables", () => {
  it("extracts the leading matrix cell code", () => {
    expect(briefCellCode("C2B_UGC_Warm")).toBe("C2B");
    expect(briefCellCode("no-cell-here")).toBeNull();
  });
  it("walks a brief payload and extracts registry codes from variable-ish keys", () => {
    const codes = briefIntendedVariables({
      strategic_foundation: { message_pillar: "P1" },
      testing_framework: { matrix_position: "C2B_x" },
      angle_stack: "CN_UGC + TN_Warm + HK_Problem",
      design_system: { concept_code: "FW_PAS" },
    });
    expect(codes!.sort()).toEqual(["CN_UGC", "FW_PAS", "HK_Problem", "TN_Warm"]);
  });
  it("returns null when nothing variable-shaped exists (historical path)", () => {
    expect(briefIntendedVariables({ title: "old brief" })).toBeNull();
    expect(briefIntendedVariables(null)).toBeNull();
  });
});

describe("libraryPayloadFromDeconstruction", () => {
  const payload = libraryPayloadFromDeconstruction({
    cellId: "C5A",
    conceptId: "CN_UGC",
    conceptName: null,
    adNames: ["ad_1"],
    filename: "creative.png",
    variables: [v("concept", "CN_UGC", 0.9), v("tonality", "TN_Warm", 0.85), v("hook", "HK_Problem", 0.8)],
    detectedCopy: { primary_message: "Stop wasting spend", cta: "Get started" },
    overall: 0.85,
    status: "auto_filed",
    manualImportId: "imp-1",
    deconstructionId: "dec-1",
    runId: "run-1",
  });
  it("maps families onto MSTLibraryCell variable slots", () => {
    expect(payload["cell_id"]).toBe("C5A");
    expect(payload["concept_variable"]).toBe("CN_UGC");
    expect(payload["tone_variable"]).toBe("TN_Warm");
    expect(payload["hook_variable"]).toBe("HK_Problem");
    expect(payload["primary_message"]).toBe("Stop wasting spend");
    expect(payload["mapped_ad_names"]).toEqual(["ad_1"]);
  });
  it("carries provenance for dedupe + cleanup", () => {
    expect(payload["source"]).toBe("deconstructed");
    expect(payload["deconstruction_of"]).toBe("imp-1");
    expect(payload["deconstruction_id"]).toBe("dec-1");
    expect(payload["deconstruction_run_id"]).toBe("run-1");
  });
});

describe("supportedImageMediaType (video → unsupported)", () => {
  it("accepts images by content-type or extension", () => {
    expect(supportedImageMediaType("image/png", "x.png")).toBe("image/png");
    expect(supportedImageMediaType("application/octet-stream", "x.JPG")).toBe("image/jpeg");
    expect(supportedImageMediaType(null, "x.webp")).toBe("image/webp");
  });
  it("returns null for video and unknown formats", () => {
    expect(supportedImageMediaType("video/mp4", "x.mp4")).toBeNull();
    expect(supportedImageMediaType(null, "x.mov")).toBeNull();
    expect(supportedImageMediaType(null, "x.psd")).toBeNull();
  });
});

describe("isVideoCreative (video → keyframe classification)", () => {
  it("detects videos by content-type or extension", () => {
    expect(isVideoCreative("video/mp4", "x.mp4")).toBe(true);
    expect(isVideoCreative("video/quicktime; codecs=avc1", "clip")).toBe(true);
    expect(isVideoCreative("application/octet-stream", "x.MOV")).toBe(true);
    expect(isVideoCreative(null, "x.webm")).toBe(true);
  });
  it("rejects images and unknown formats", () => {
    expect(isVideoCreative("image/png", "x.png")).toBe(false);
    expect(isVideoCreative(null, "x.psd")).toBe(false);
    expect(isVideoCreative(null, "noext")).toBe(false);
  });
});

describe("keyframeTimestamps", () => {
  it("samples opening, middle, and closing frames for a normal-length video", () => {
    const pts = keyframeTimestamps(30);
    expect(pts.map((p) => p.timestamp)).toEqual([0.5, 15, 29]);
    expect(pts[2]!.label).toContain("closing");
  });
  it("collapses near-duplicate points on very short clips", () => {
    const pts = keyframeTimestamps(0.4);
    expect(pts.length).toBeLessThan(3);
    for (const p of pts) expect(p.timestamp).toBeGreaterThanOrEqual(0);
  });
  it("falls back to the opening frame when duration is unknown", () => {
    expect(keyframeTimestamps(null)).toEqual([{ label: "opening frame", timestamp: 0 }]);
    expect(keyframeTimestamps(NaN)).toEqual([{ label: "opening frame", timestamp: 0 }]);
  });
});
