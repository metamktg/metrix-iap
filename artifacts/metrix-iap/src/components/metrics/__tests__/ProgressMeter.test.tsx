// ─── ProgressMeter ────────────────────────────────────────────────────
//
// Three things the eight bars this replaced all got wrong.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProgressMeter, progressText } from "../ProgressMeter";

afterEach(cleanup);

describe("ProgressMeter · it is a value, not two divs", () => {
  it("exposes the ratio to assistive tech", () => {
    render(<ProgressMeter value={30} total={120} label="Matrix coverage" />);
    const m = screen.getByRole("meter", { name: /Matrix coverage/ });
    expect(m.getAttribute("aria-valuenow")).toBe("25");
  });
});

describe("ProgressMeter · a missing denominator is not a zero", () => {
  it("draws no fill and says why when the total is zero", () => {
    render(<ProgressMeter value={5} total={0} label="Result share" />);
    const m = screen.getByRole("meter");
    expect(m.children).toHaveLength(0);
    expect(m.getAttribute("title")).toContain("Nothing to compare against");
    expect(m.getAttribute("aria-valuenow")).toBeNull();
  });

  it("draws no fill when the value was never measured", () => {
    render(<ProgressMeter value={null} total={120} label="Result share" />);
    const m = screen.getByRole("meter");
    expect(m.children).toHaveLength(0);
    expect(m.getAttribute("title")).toBe("Not measured");
  });

  it("draws an empty fill for a real zero, which IS a measurement", () => {
    render(<ProgressMeter value={0} total={120} label="Result share" />);
    const m = screen.getByRole("meter");
    expect(m.children).toHaveLength(1);
    expect((m.firstElementChild as HTMLElement).style.width).toBe("0%");
  });
});

describe("ProgressMeter · an overrun is clamped in the bar, not in the number", () => {
  it("clamps the bar, because it has nowhere to go", () => {
    render(<ProgressMeter value={168} total={120} label="Budget" />);
    expect((screen.getByRole("meter").firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("reports the real ratio in the accessibility tree", () => {
    render(<ProgressMeter value={168} total={120} label="Budget" />);
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("140");
  });

  it("reports the real ratio as text", () => {
    expect(progressText(168, 120)).toBe("140%");
  });

  it("distinguishes unmeasured from no-denominator in text too", () => {
    expect(progressText(null, 120)).toBe("–");
    expect(progressText(5, 0)).toBe("n/a");
  });
});

describe("ProgressMeter · an ordinal renders as steps, not a fake percentage", () => {
  it("fills the tier's own step count and no more", () => {
    render(<ProgressMeter value={2} total={3} segments={3} label="Confidence · Medium" />);
    const m = screen.getByRole("meter");
    expect(m.children).toHaveLength(3);
    expect(m.getAttribute("aria-valuenow")).toBe("2");
    expect(m.getAttribute("aria-valuemax")).toBe("3");
  });

  it("names the position rather than a percentage", () => {
    render(<ProgressMeter value={3} total={3} segments={3} label="Confidence · High" />);
    expect(screen.getByRole("meter").getAttribute("aria-label")).toBe("Confidence · High: 3 of 3");
  });

  it("leaves every step empty when the tier is unknown", () => {
    render(<ProgressMeter value={null} total={3} segments={3} label="Confidence" />);
    const m = screen.getByRole("meter");
    expect(m.getAttribute("aria-valuenow")).toBeNull();
    expect(m.getAttribute("title")).toBe("Not measured");
  });
});
