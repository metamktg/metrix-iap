// The single-series tokens exist because three charts each spelled the
// accent as `hsl(var(--interactive))` — a token index.css does not define —
// and painted black bars over the navy card. These assertions pin the shape
// of the fix rather than its colour: a bare var() of a token that exists,
// nothing under the 11px chrome floor, no rank in a fill, no animation on a
// page chart, no black literal in the brush.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AXIS, CHART_TYPE, MARK, SERIES, SERIES_VARS } from "../chartTokens";

const INDEX_CSS = fs.readFileSync(
  path.resolve(__dirname, "../../../index.css"),
  "utf-8",
);

describe("SERIES — the single-series accents", () => {
  it("is a bare var() of a token index.css actually defines", () => {
    expect(SERIES.interactive).toBe("var(--color-interactive)");
    expect(SERIES.interactive.startsWith("hsl(")).toBe(false);
    // `--interactive` does not exist; `--color-interactive` does. A fill
    // that points at the former resolves to nothing and paints black.
    expect(INDEX_CSS).toMatch(/--color-interactive:/);
    expect(INDEX_CSS).not.toMatch(/^\s*--interactive:/m);
  });

  it("gives cost a categorical slot that is neither amber nor purple", () => {
    expect(SERIES_VARS).toContain(SERIES.cost);
    expect(SERIES.cost).not.toBe(SERIES.interactive);
    // Slot 3 is purple in the dark theme and the owner ruled it out.
    expect(SERIES.cost).not.toBe(SERIES_VARS[2]);
    expect(SERIES.cost).not.toMatch(/amber/);
  });
});

describe("CHART_TYPE — nothing inside a chart sits under the chrome floor", () => {
  it("ticks are at the 11px micro step and value labels at the 12px label step", () => {
    expect(CHART_TYPE.tick).toBe(11);
    expect(CHART_TYPE.label).toBe(12);
    expect(AXIS.tick.fontSize).toBe(CHART_TYPE.tick);
    expect(MARK.valueLabel.fontSize).toBe(CHART_TYPE.label);
    expect(MARK.valueLabel.fontWeight).toBe(600);
  });

  it("matches the roles index.css ships (the ramp is read, not duplicated)", () => {
    const px = (role: string) => {
      const m = new RegExp(`\\.${role}\\s*\\{[^}]*font-size:\\s*([0-9.]+)rem`).exec(INDEX_CSS);
      return m ? Math.round(Number(m[1]) * 16) : null;
    };
    expect(px("text-micro")).toBe(CHART_TYPE.tick);
    expect(px("text-label")).toBe(CHART_TYPE.label);
    expect(px("text-caption")).toBe(CHART_TYPE.caption);
    expect(px("text-body")).toBe(CHART_TYPE.body);
  });
});

describe("MARK / AXIS — the shared mark and frame", () => {
  it("noAnimation spreads to a recharts prop that turns the 1500ms grow-in off", () => {
    expect(MARK.noAnimation).toEqual({ isAnimationActive: false });
  });

  it("carries no black literal — the brush and cursor come from the ground", () => {
    for (const v of [AXIS.brush.fill, AXIS.brush.stroke, AXIS.cursorFill.fill, AXIS.gridSoft.stroke, AXIS.labelDim]) {
      expect(v).not.toMatch(/0 0% 0%|#000|rgba?\(/);
      expect(v).toMatch(/var\(--/);
    }
  });
});
