// Unit tests for the stale-stage detection logic.
// Runs against the pure function so every edge case is covered
// without React rendering overhead.
import { describe, it, expect } from "vitest";
import { computeStaleStages } from "../staleStageDetection";
import type { StaleStageInput } from "../staleStageDetection";

// Helpers
const T_OLD  = "2024-01-01T10:00:00.000Z"; // older timestamp
const T_MID  = "2024-01-02T10:00:00.000Z"; // middle timestamp
const T_NEW  = "2024-01-03T10:00:00.000Z"; // newest timestamp

function base(): StaleStageInput {
  return {
    analysisRun:      null,
    strategyLastRun:  null,
    briefsLastRun:    null,
    loopStatus:       null,
    analysisComplete: true,
    strategyComplete: true,
    briefsComplete:   true,
    strategyRunning:  false,
    briefsRunning:    false,
  };
}

// ── analysisFinishedAt derivation ─────────────────────────────────────────

describe("analysisFinishedAt", () => {
  it("is null when analysisRun is null", () => {
    const { analysisFinishedAt } = computeStaleStages({ ...base(), analysisRun: null });
    expect(analysisFinishedAt).toBeNull();
  });

  it("is null when analysisRun status is 'running'", () => {
    const { analysisFinishedAt } = computeStaleStages({
      ...base(),
      analysisRun: { status: "running", finished_at: null },
    });
    expect(analysisFinishedAt).toBeNull();
  });

  it("is null when analysisRun status is 'error'", () => {
    const { analysisFinishedAt } = computeStaleStages({
      ...base(),
      analysisRun: { status: "error", finished_at: T_OLD },
    });
    expect(analysisFinishedAt).toBeNull();
  });

  it("is null when analysisRun succeeded but finished_at is null", () => {
    const { analysisFinishedAt } = computeStaleStages({
      ...base(),
      analysisRun: { status: "success", finished_at: null },
    });
    expect(analysisFinishedAt).toBeNull();
  });

  it("is the timestamp when analysisRun succeeded with a timestamp", () => {
    const { analysisFinishedAt } = computeStaleStages({
      ...base(),
      analysisRun: { status: "success", finished_at: T_NEW },
    });
    expect(analysisFinishedAt).toBe(T_NEW);
  });
});

// ── strategyGeneratedAt derivation ────────────────────────────────────────

describe("strategyGeneratedAt", () => {
  it("is null when no sources exist", () => {
    const { strategyGeneratedAt } = computeStaleStages(base());
    expect(strategyGeneratedAt).toBeNull();
  });

  it("uses strategyLastRun when status is success", () => {
    const { strategyGeneratedAt } = computeStaleStages({
      ...base(),
      strategyLastRun: { status: "success", finished_at: T_NEW },
    });
    expect(strategyGeneratedAt).toBe(T_NEW);
  });

  it("ignores a failed strategyLastRun and falls back to loopStatus", () => {
    const { strategyGeneratedAt } = computeStaleStages({
      ...base(),
      strategyLastRun: { status: "error", finished_at: T_NEW },
      loopStatus: [{ stage: "strategy_map", generated_at: T_OLD }],
    });
    expect(strategyGeneratedAt).toBe(T_OLD);
  });

  it("ignores a running strategyLastRun and falls back to loopStatus", () => {
    const { strategyGeneratedAt } = computeStaleStages({
      ...base(),
      strategyLastRun: { status: "running", finished_at: null },
      loopStatus: [{ stage: "strategy_map", generated_at: T_OLD }],
    });
    expect(strategyGeneratedAt).toBe(T_OLD);
  });

  it("is null when strategyLastRun failed and loopStatus has no strategy_map entry", () => {
    const { strategyGeneratedAt } = computeStaleStages({
      ...base(),
      strategyLastRun: { status: "error", finished_at: T_NEW },
      loopStatus: [{ stage: "brief_builder", generated_at: T_OLD }],
    });
    expect(strategyGeneratedAt).toBeNull();
  });

  it("prefers in-memory run over loopStatus when both exist", () => {
    const { strategyGeneratedAt } = computeStaleStages({
      ...base(),
      strategyLastRun: { status: "success", finished_at: T_NEW },
      loopStatus: [{ stage: "strategy_map", generated_at: T_OLD }],
    });
    expect(strategyGeneratedAt).toBe(T_NEW);
  });

  it("falls back to loopStatus when strategyLastRun finished_at is null even though status is success", () => {
    const { strategyGeneratedAt } = computeStaleStages({
      ...base(),
      strategyLastRun: { status: "success", finished_at: null },
      loopStatus: [{ stage: "strategy_map", generated_at: T_OLD }],
    });
    expect(strategyGeneratedAt).toBe(T_OLD);
  });
});

// ── briefsGeneratedAt derivation ──────────────────────────────────────────

describe("briefsGeneratedAt", () => {
  it("is null when no sources exist", () => {
    const { briefsGeneratedAt } = computeStaleStages(base());
    expect(briefsGeneratedAt).toBeNull();
  });

  it("uses briefsLastRun when status is success", () => {
    const { briefsGeneratedAt } = computeStaleStages({
      ...base(),
      briefsLastRun: { status: "success", finished_at: T_NEW },
    });
    expect(briefsGeneratedAt).toBe(T_NEW);
  });

  it("ignores a failed briefsLastRun and falls back to loopStatus", () => {
    const { briefsGeneratedAt } = computeStaleStages({
      ...base(),
      briefsLastRun: { status: "error", finished_at: T_NEW },
      loopStatus: [{ stage: "brief_builder", generated_at: T_OLD }],
    });
    expect(briefsGeneratedAt).toBe(T_OLD);
  });
});

// ── strategyIsStale ────────────────────────────────────────────────────────

describe("strategyIsStale", () => {
  it("is false when all timestamps are missing", () => {
    const { strategyIsStale } = computeStaleStages(base());
    expect(strategyIsStale).toBe(false);
  });

  it("is false when analysisFinishedAt is missing (analysis failed)", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "error", finished_at: T_NEW },
      strategyLastRun: { status: "success", finished_at: T_OLD },
    });
    expect(strategyIsStale).toBe(false);
  });

  it("is false when strategyGeneratedAt is missing", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun: { status: "success", finished_at: T_NEW },
    });
    expect(strategyIsStale).toBe(false);
  });

  it("is false when analysis finished BEFORE strategy was generated (strategy is fresh)", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_OLD },
      strategyLastRun: { status: "success", finished_at: T_NEW },
    });
    expect(strategyIsStale).toBe(false);
  });

  it("is false when analysis and strategy timestamps are equal", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_MID },
      strategyLastRun: { status: "success", finished_at: T_MID },
    });
    expect(strategyIsStale).toBe(false);
  });

  it("is true when analysis finished AFTER strategy was generated", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_NEW },
      strategyLastRun: { status: "success", finished_at: T_OLD },
    });
    expect(strategyIsStale).toBe(true);
  });

  it("is false when strategyRunning is true, even though timestamps indicate stale", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_NEW },
      strategyLastRun: { status: "success", finished_at: T_OLD },
      strategyRunning: true,
    });
    expect(strategyIsStale).toBe(false);
  });

  it("is false when strategyComplete is false", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:      { status: "success", finished_at: T_NEW },
      strategyLastRun:  { status: "success", finished_at: T_OLD },
      strategyComplete: false,
    });
    expect(strategyIsStale).toBe(false);
  });

  it("is false when analysisComplete is false", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:      { status: "success", finished_at: T_NEW },
      strategyLastRun:  { status: "success", finished_at: T_OLD },
      analysisComplete: false,
    });
    expect(strategyIsStale).toBe(false);
  });

  it("is true using loopStatus timestamp when in-memory run failed", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_NEW },
      strategyLastRun: { status: "error",   finished_at: T_NEW },
      loopStatus: [{ stage: "strategy_map", generated_at: T_OLD }],
    });
    expect(strategyIsStale).toBe(true);
  });

  it("is false when analysis run failed even with matching loopStatus timestamps", () => {
    const { strategyIsStale } = computeStaleStages({
      ...base(),
      analysisRun: { status: "error", finished_at: T_NEW },
      loopStatus:  [{ stage: "strategy_map", generated_at: T_OLD }],
    });
    expect(strategyIsStale).toBe(false);
  });
});

// ── briefsIsStale ──────────────────────────────────────────────────────────

describe("briefsIsStale", () => {
  it("is false when all timestamps are missing", () => {
    const { briefsIsStale } = computeStaleStages(base());
    expect(briefsIsStale).toBe(false);
  });

  it("is false when briefsGeneratedAt is missing", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:  { status: "success", finished_at: T_NEW },
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is false when briefsComplete is false", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:    { status: "success", finished_at: T_NEW },
      briefsLastRun:  { status: "success", finished_at: T_OLD },
      briefsComplete: false,
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is false when analysisComplete is false", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:      { status: "success", finished_at: T_NEW },
      briefsLastRun:    { status: "success", finished_at: T_OLD },
      analysisComplete: false,
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is false when briefsRunning is true, even though timestamps indicate stale", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:   { status: "success", finished_at: T_NEW },
      briefsLastRun: { status: "success", finished_at: T_OLD },
      briefsRunning: true,
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is true when analysis finished AFTER briefs were generated", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:   { status: "success", finished_at: T_NEW },
      briefsLastRun: { status: "success", finished_at: T_OLD },
    });
    expect(briefsIsStale).toBe(true);
  });

  it("is false when briefs are fresh relative to analysis", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:   { status: "success", finished_at: T_OLD },
      briefsLastRun: { status: "success", finished_at: T_NEW },
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is false when briefs and analysis timestamps are equal", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:   { status: "success", finished_at: T_MID },
      briefsLastRun: { status: "success", finished_at: T_MID },
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is true when strategy was generated AFTER briefs, even if analysis is older than briefs", () => {
    // analysis < briefs but strategy > briefs → briefs are stale relative to strategy
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_OLD },
      strategyLastRun: { status: "success", finished_at: T_NEW },
      briefsLastRun:   { status: "success", finished_at: T_MID },
    });
    expect(briefsIsStale).toBe(true);
  });

  it("is false when analysis failed AND strategyGeneratedAt is also missing (no upstream anchor)", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:   { status: "error",   finished_at: T_NEW },
      briefsLastRun: { status: "success", finished_at: T_OLD },
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is false when analysis failed but strategy provides the upstream anchor yet briefs are fresh", () => {
    // Analysis failed (no analysisFinishedAt) but strategy ran after briefs → briefs stale via strategy
    // Here briefs NEWER than strategy → should NOT be stale
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "error",   finished_at: T_NEW },
      strategyLastRun: { status: "success", finished_at: T_OLD },
      briefsLastRun:   { status: "success", finished_at: T_NEW },
    });
    expect(briefsIsStale).toBe(false);
  });

  it("is true when analysis failed but strategy was generated AFTER briefs", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:     { status: "error",   finished_at: T_NEW },
      strategyLastRun: { status: "success", finished_at: T_NEW },
      briefsLastRun:   { status: "success", finished_at: T_OLD },
    });
    expect(briefsIsStale).toBe(true);
  });

  it("uses loopStatus fallback for briefsGeneratedAt when in-memory run failed", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:   { status: "success", finished_at: T_NEW },
      briefsLastRun: { status: "error",   finished_at: T_NEW },
      loopStatus: [{ stage: "brief_builder", generated_at: T_OLD }],
    });
    expect(briefsIsStale).toBe(true);
  });

  it("is false when analysis failed and briefs use loopStatus fallback with no strategy anchor", () => {
    const { briefsIsStale } = computeStaleStages({
      ...base(),
      analysisRun:   { status: "error", finished_at: T_NEW },
      briefsLastRun: { status: "error", finished_at: T_NEW },
      loopStatus: [{ stage: "brief_builder", generated_at: T_OLD }],
    });
    expect(briefsIsStale).toBe(false);
  });
});

// ── combined scenario: all three stages ───────────────────────────────────

describe("combined scenarios", () => {
  it("reports both strategy and briefs stale after a fresh analysis run", () => {
    const result = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_NEW },
      strategyLastRun: { status: "success", finished_at: T_OLD },
      briefsLastRun:   { status: "success", finished_at: T_OLD },
    });
    expect(result.strategyIsStale).toBe(true);
    expect(result.briefsIsStale).toBe(true);
  });

  it("reports neither stale when analysis is older than all generated outputs", () => {
    const result = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_OLD },
      strategyLastRun: { status: "success", finished_at: T_MID },
      briefsLastRun:   { status: "success", finished_at: T_NEW },
    });
    expect(result.strategyIsStale).toBe(false);
    expect(result.briefsIsStale).toBe(false);
  });

  it("reports only briefs stale when strategy was re-run after briefs but before analysis", () => {
    // analysis=T_OLD, strategy=T_MID, briefs=T_OLD → strategy fresh vs analysis, briefs stale vs strategy
    const result = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_OLD },
      strategyLastRun: { status: "success", finished_at: T_MID },
      briefsLastRun:   { status: "success", finished_at: T_OLD },
    });
    expect(result.strategyIsStale).toBe(false);
    expect(result.briefsIsStale).toBe(true);
  });

  it("suppresses all stale flags while any stage is running", () => {
    const result = computeStaleStages({
      ...base(),
      analysisRun:     { status: "success", finished_at: T_NEW },
      strategyLastRun: { status: "success", finished_at: T_OLD },
      briefsLastRun:   { status: "success", finished_at: T_OLD },
      strategyRunning: true,
      briefsRunning:   true,
    });
    expect(result.strategyIsStale).toBe(false);
    expect(result.briefsIsStale).toBe(false);
  });

  it("is entirely false when no data exists at all (fresh account)", () => {
    const result = computeStaleStages({
      analysisRun:      null,
      strategyLastRun:  null,
      briefsLastRun:    null,
      loopStatus:       null,
      analysisComplete: false,
      strategyComplete: false,
      briefsComplete:   false,
      strategyRunning:  false,
      briefsRunning:    false,
    });
    expect(result.analysisFinishedAt).toBeNull();
    expect(result.strategyGeneratedAt).toBeNull();
    expect(result.briefsGeneratedAt).toBeNull();
    expect(result.strategyIsStale).toBe(false);
    expect(result.briefsIsStale).toBe(false);
  });
});
