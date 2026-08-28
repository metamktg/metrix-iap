// The ladder is the component. If depth does not change the plane, this is
// just an accordion with extra steps — so most of these tests assert the
// structure rather than the behaviour.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { LayeredDisclosure, LayeredDisclosureLeaf } from "../LayeredDisclosure";

afterEach(cleanup);

describe("the depth ladder", () => {
  it("steps the plane down for each level of nesting", () => {
    // The whole point of the reference pattern: you can see how deep you are
    // without reading anything. A nested layer that renders at its parent's
    // depth makes three levels look like one flat pile.
    render(
      <LayeredDisclosure label="Outer" defaultOpen data-testid="outer">
        <LayeredDisclosure label="Inner" defaultOpen data-testid="inner">
          <LayeredDisclosure label="Deepest" data-testid="deepest">
            <span>leaf</span>
          </LayeredDisclosure>
        </LayeredDisclosure>
      </LayeredDisclosure>,
    );
    expect(screen.getByTestId("outer").dataset["depth"]).toBe("0");
    expect(screen.getByTestId("inner").dataset["depth"]).toBe("1");
    expect(screen.getByTestId("deepest").dataset["depth"]).toBe("2");
  });

  it("gives each depth a different surface and radius", () => {
    render(
      <LayeredDisclosure label="Outer" defaultOpen data-testid="outer">
        <LayeredDisclosure label="Inner" defaultOpen data-testid="inner" />
      </LayeredDisclosure>,
    );
    const outer = screen.getByTestId("outer").className;
    const inner = screen.getByTestId("inner").className;
    expect(outer).not.toBe(inner);
    // Concentric: the parent's corner is larger than the child's. Mismatched
    // nested radii is the single most common thing that makes a surface feel
    // subtly wrong, and at three levels it stops being subtle.
    expect(outer).toContain("rounded-3xl");
    expect(inner).toContain("rounded-2xl");
  });

  it("stops the ladder rather than inventing a fourth plane", () => {
    // Three levels is already at the limit of what a reader holds. A surface
    // needing a fourth needs a different layout, not a smaller radius.
    render(
      <LayeredDisclosure label="0" defaultOpen data-testid="d0">
        <LayeredDisclosure label="1" defaultOpen data-testid="d1">
          <LayeredDisclosure label="2" defaultOpen data-testid="d2">
            <LayeredDisclosure label="3" data-testid="d3">
              <span>x</span>
            </LayeredDisclosure>
          </LayeredDisclosure>
        </LayeredDisclosure>
      </LayeredDisclosure>,
    );
    expect(screen.getByTestId("d2").className).toBe(screen.getByTestId("d3").className);
  });
});

describe("what it refuses to do", () => {
  it("renders a row with NO control when there is nothing to reveal", () => {
    // A chevron that opens onto blank space is a promise the data did not
    // keep. A caller with nothing to show gets a row, not a dead control.
    render(<LayeredDisclosure label="Nothing under here" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Nothing under here")).toBeTruthy();
  });

  it("keeps the summary visible while shut, so a closed stack still scans", () => {
    render(
      <LayeredDisclosure label="Creative 12" summary="4 variables">
        <span>detail</span>
      </LayeredDisclosure>,
    );
    expect(screen.getByText("4 variables")).toBeTruthy();
    expect(screen.queryByText("detail")).toBeNull();
  });
});

describe("behaviour", () => {
  it("opens and closes, and wires aria-expanded to the real state", () => {
    render(
      <LayeredDisclosure label="Row">
        <span>revealed</span>
      </LayeredDisclosure>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("revealed")).toBeTruthy();
  });

  it("honours controlled mode instead of tracking its own state", () => {
    // The review queue needs this: pressing Correct must force the layer
    // open, or the editor appears inside a collapsed panel and the button
    // looks broken.
    const { rerender } = render(
      <LayeredDisclosure label="Row" open={false} onOpenChange={() => {}}>
        <span>revealed</span>
      </LayeredDisclosure>,
    );
    expect(screen.queryByText("revealed")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    // Still closed — the parent owns the state and did not change it.
    expect(screen.queryByText("revealed")).toBeNull();
    rerender(
      <LayeredDisclosure label="Row" open onOpenChange={() => {}}>
        <span>revealed</span>
      </LayeredDisclosure>,
    );
    expect(screen.getByText("revealed")).toBeTruthy();
  });

  it("makes the whole row the control, not just the chevron", () => {
    // A chevron-sized hit area is a control most people miss on a phone.
    render(
      <LayeredDisclosure label="Row">
        <span>x</span>
      </LayeredDisclosure>,
    );
    const btn = screen.getByRole("button");
    expect(within(btn).getByText("Row")).toBeTruthy();
    expect(btn.className).toContain("w-full");
  });
});

describe("LayeredDisclosureLeaf", () => {
  it("takes the plane of the depth it is rendered at", () => {
    render(
      <LayeredDisclosure label="Outer" defaultOpen>
        <LayeredDisclosureLeaf className="leaf-probe">bottom</LayeredDisclosureLeaf>
      </LayeredDisclosure>,
    );
    const leaf = document.querySelector(".leaf-probe")!;
    expect(leaf.className).toContain("rounded-2xl");
    expect(leaf.textContent).toBe("bottom");
  });
});
