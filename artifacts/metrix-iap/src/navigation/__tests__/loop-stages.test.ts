// ─── One loop shape ─────────────────────────────────────────────────────
// Four surfaces render the IAP loop. Each used to hand-type it and they
// disagreed (six stages ending at Reports, five ending at Report, four).
// Every one now derives from navTree's LOOP_STAGES; these tests pin that
// the derived shapes are subsets of it, in its order, and that Action is
// offered as the stage after MST.

import { describe, it, expect } from "vitest";
import { navTree, LOOP_STAGES, loopStageById, sectionLandingRoute } from "../navTree";
import { buildLoopStages, withFrom, type StageStatusLike } from "@/pages/metrix/shared";
import { accountLoopStages } from "@/pages/metrix/OverviewLoopHub";
import { fromOriginTarget } from "../navHistory";
import type { AdAccount } from "@/lib/data/seedTypes";

const LOOP_IDS = ["listen", "analysis", "strategy", "creative", "mst", "action"];

describe("LOOP_STAGES", () => {
  it("is the six loop sections in loopStage order, each pointing at its command center", () => {
    expect(LOOP_STAGES.map((s) => s.id)).toEqual(LOOP_IDS);
    expect(LOOP_STAGES.map((s) => s.loopStage)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const stage of LOOP_STAGES) {
      const section = navTree.find((s) => s.id === stage.id)!;
      expect(section.group).toBe("loop");
      expect(stage.label).toBe(section.label);
      expect(stage.purpose).toBe(section.purpose);
      expect(stage.to).toBe(sectionLandingRoute(section));
    }
  });

  it("does not include Reports or Exports — outputs, not stages", () => {
    expect(loopStageById("reports")).toBeNull();
    expect(loopStageById("exports")).toBeNull();
    expect(loopStageById("mst")?.label).toBe("MST");
  });
});

describe("buildLoopStages derives from LOOP_STAGES", () => {
  const status: StageStatusLike = {
    analysis: { status: "success", validated: true },
    strategy: { status: "success" },
    briefs: { status: "none", count: 0 },
    mst: { unlocked: false },
  };

  it("renders exactly the six loop stages, in order, with navTree labels and routes", () => {
    const stages = buildLoopStages(status);
    expect(stages.map((s) => s.id)).toEqual(LOOP_IDS);
    expect(stages.map((s) => s.label)).toEqual(LOOP_STAGES.map((s) => s.label));
    expect(stages.map((s) => s.to)).toEqual(LOOP_STAGES.map((s) => s.to));
  });

  it("offers Action after MST once analysis has validated, and locks it before", () => {
    const open = buildLoopStages(status);
    expect(open[open.length - 1]).toMatchObject({ id: "action", to: "/app/act/queue", status: "none" });
    const locked = buildLoopStages({ ...status, analysis: { status: "none" } });
    expect(locked.find((s) => s.id === "action")!.status).toBe("locked");
  });
});

describe("accountLoopStages (Manager Overview rollup) is a subset of LOOP_STAGES", () => {
  it("keeps LOOP_STAGES order and labels for the stages it counts", () => {
    const account = { id: "x", name: "X", status: "unconfigured" } as unknown as AdAccount;
    const stages = accountLoopStages({} as never, account);
    const ids = stages.map((s) => s.id);
    // In loop order, and every id is a loop stage.
    const positions = ids.map((id) => LOOP_IDS.indexOf(id));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const s of stages) {
      expect(s.label).toBe(loopStageById(s.id)!.label);
      expect(s.to).toBe(loopStageById(s.id)!.to);
      expect(s.done).toBe(false);
    }
  });
});

describe("?from= origin table", () => {
  it("unwinds analysis and strategy origins one hop at a time", () => {
    expect(fromOriginTarget({ from: "analysis", fromCell: "C2B", fromHyp: null })).toEqual({
      to: "/app/analysis/library?focus=C2B",
      label: "Back to cell C2B",
      crumb: "Analysis · C2B",
    });
    expect(fromOriginTarget({ from: "strategy", fromCell: "C2B", fromHyp: null })?.to).toBe(
      "/app/strategy/map?from=analysis&fromCell=C2B",
    );
    expect(fromOriginTarget({ from: "strategy", fromCell: null, fromHyp: "H1" })).toEqual({
      to: "/app/strategy/hypotheses?focus=H1",
      label: "Back to Hypothesis",
      crumb: "Strategy · H1",
    });
  });

  it("produces a crumb for every navTree section, not only analysis and strategy", () => {
    for (const section of navTree) {
      const target = fromOriginTarget({ from: section.id, fromCell: null, fromHyp: null });
      expect(target, section.id).not.toBeNull();
      expect(target!.crumb.length).toBeGreaterThan(0);
      expect(target!.to.startsWith("/")).toBe(true);
    }
    expect(fromOriginTarget({ from: "creative", fromCell: null, fromHyp: null })).toEqual({
      to: "/app/creative",
      label: "Back to Creative",
      crumb: "Creative",
    });
    expect(fromOriginTarget({ from: "mst", fromCell: null, fromHyp: null })?.to).toBe("/app/mst");
  });

  it("returns null without a param or for an unknown origin", () => {
    expect(fromOriginTarget({ from: null, fromCell: null, fromHyp: null })).toBeNull();
    expect(fromOriginTarget({ from: "nowhere", fromCell: null, fromHyp: null })).toBeNull();
  });

  it("withFrom threads the origin onto a link and preserves its query string", () => {
    const fp = { from: "analysis", fromCell: "C2B", fromHyp: null };
    expect(withFrom("/app/creative/builder", fp)).toBe("/app/creative/builder?from=analysis&fromCell=C2B");
    expect(withFrom("/app/creative/builder?focus=b1", fp)).toBe("/app/creative/builder?focus=b1&from=analysis&fromCell=C2B");
    expect(withFrom("/app/creative/builder", { from: null, fromCell: null, fromHyp: null })).toBe("/app/creative/builder");
  });
});
