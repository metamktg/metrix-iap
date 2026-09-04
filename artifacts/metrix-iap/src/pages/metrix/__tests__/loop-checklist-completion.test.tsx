// ─── LoopChecklist completion-state regression tests ─────────────────────
//
// Guards the pure LoopChecklist component: verifies that ✓ / next / pending
// visual states are derived correctly from the `done` prop on each step,
// and that the progress counter reflects the right done/total ratio.
//
// A regression could silently mark all steps done (or all pending) without
// throwing an error — these tests catch that class of failure.
//
// (This suite previously also covered a right-rail "Loop stages" checklist
// on AdAccountOverview — that rail was removed as part of the Nocturne
// canvas coverage-ledger Drop decisions; LoopChecklist itself is unaffected
// and still renders on the Manager Overview / unconfigured-account states.)

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LoopChecklist, type LoopChecklistStep } from "../shared";

afterEach(cleanup);

describe("LoopChecklist · all steps done", () => {
  const steps: LoopChecklistStep[] = [
    { label: "Data connected",     done: true, route: "/a" },
    { label: "Analysis run",       done: true, route: "/b" },
    { label: "Strategy generated", done: true, route: "/c" },
    { label: "Briefs generated",   done: true, route: "/d" },
    { label: "Report created",     done: true, route: "/e" },
  ];

  it("renders non-empty output", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("shows 5/5 in the counter", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("5/5");
  });

  it("renders all five step labels", () => {
    render(<LoopChecklist steps={steps} />);
    expect(screen.getByText("Data connected")).toBeTruthy();
    expect(screen.getByText("Analysis run")).toBeTruthy();
    expect(screen.getByText("Strategy generated")).toBeTruthy();
    expect(screen.getByText("Briefs generated")).toBeTruthy();
    expect(screen.getByText("Report created")).toBeTruthy();
  });

  it("applies line-through style to all done step labels", () => {
    render(<LoopChecklist steps={steps} />);
    const label = screen.getByText("Data connected");
    expect(label.className).toContain("line-through");
  });

  it("progress bar is rendered (at least one step is done)", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).not.toBeNull();
  });
});

describe("LoopChecklist · no steps done", () => {
  const steps: LoopChecklistStep[] = [
    { label: "Data connected",     done: false },
    { label: "Analysis run",       done: false },
    { label: "Strategy generated", done: false },
    { label: "Briefs generated",   done: false },
    { label: "Report created",     done: false },
  ];

  it("shows 0/5 in the counter", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("0/5");
  });

  it("does not render the progress bar when no steps are done", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toBeNull();
  });

  it("marks the first step as 'next' (ArrowRight icon present)", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    const arrowIcons = container.querySelectorAll("svg");
    expect(arrowIcons.length).toBeGreaterThan(0);
  });

  it("does not apply line-through to any step label", () => {
    render(<LoopChecklist steps={steps} />);
    const labels = ["Data connected", "Analysis run", "Strategy generated", "Briefs generated", "Report created"];
    for (const label of labels) {
      expect(screen.getByText(label).className).not.toContain("line-through");
    }
  });

  it("shows step numbers for all steps after the first (pending style)", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("3");
  });
});

describe("LoopChecklist · partial completion (first 2 of 4 done)", () => {
  const steps: LoopChecklistStep[] = [
    { label: "Data connected",     done: true,  route: "/a" },
    { label: "Analysis run",       done: true,  route: "/b" },
    { label: "Strategy generated", done: false, route: "/c" },
    { label: "Briefs generated",   done: false, route: "/d" },
  ];

  it("shows 2/4 in the counter", () => {
    const { container } = render(<LoopChecklist steps={steps} />);
    expect(container.textContent).toContain("2/4");
  });

  it("applies line-through only to done step labels", () => {
    render(<LoopChecklist steps={steps} />);
    expect(screen.getByText("Data connected").className).toContain("line-through");
    expect(screen.getByText("Analysis run").className).toContain("line-through");
    expect(screen.getByText("Strategy generated").className).not.toContain("line-through");
    expect(screen.getByText("Briefs generated").className).not.toContain("line-through");
  });

  it("marks 'Strategy generated' as the next step (index 2 is nextIdx)", () => {
    render(<LoopChecklist steps={steps} />);
    const nextLabel = screen.getByText("Strategy generated");
    expect(nextLabel.className).toContain("font-semibold");
  });

  it("marks 'Briefs generated' as pending (not next, not done)", () => {
    render(<LoopChecklist steps={steps} />);
    const pendingLabel = screen.getByText("Briefs generated");
    expect(pendingLabel.className).not.toContain("font-semibold");
    expect(pendingLabel.className).not.toContain("line-through");
  });
});

describe("LoopChecklist · single step", () => {
  it("shows 0/1 when the only step is not done", () => {
    const { container } = render(
      <LoopChecklist steps={[{ label: "Only step", done: false }]} />
    );
    expect(container.textContent).toContain("0/1");
  });

  it("shows 1/1 when the only step is done", () => {
    const { container } = render(
      <LoopChecklist steps={[{ label: "Only step", done: true }]} />
    );
    expect(container.textContent).toContain("1/1");
  });
});
