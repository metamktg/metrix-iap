// ─── VariableStack: the number belongs to the variable, not the stack ──
//
// The obvious version of this chart is a stacked contribution bar — "the hook
// drove 40%, the tone 35%". Nothing in this platform measures that: results
// are recorded against a CREATIVE, which carries a whole stack, and splitting
// one across the other needs an attribution model that does not exist.
//
// These pin the two things that keep it honest: an unfilled family is visible
// as a gap, and a marginal read never presents itself as a contribution.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariableStack } from "../VariableStack";
import { VARIABLE_FAMILIES } from "@/lib/variable-registry";

afterEach(cleanup);

const STACK = { hook: "HK_ProofFirst", tone: "TN_Direct", cta: "CTA_StartFree" };

describe("VariableStack — an unset family is a gap, not an omission", () => {
  it("renders every family, filled or not", () => {
    render(<VariableStack stack={STACK} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(VARIABLE_FAMILIES.length);
  });

  it("marks the unfilled ones explicitly", () => {
    render(<VariableStack stack={STACK} />);
    // Six of nine families are unset in this stack.
    expect(screen.getAllByText("not set")).toHaveLength(VARIABLE_FAMILIES.length - 3);
  });

  it("says how many families are set, so a short stack reads as short", () => {
    // Without this a three-variable stack and a nine-variable stack are the
    // same kind of object at different lengths, and there is no way to see
    // that a pillar has no proof variable at all.
    const { container } = render(<VariableStack stack={STACK} />);
    expect(container.textContent).toContain("3");
    expect(container.textContent).toMatch(/of\s*9\s*families set/);
  });

  it("can drop the gaps when the caller only wants what is there", () => {
    render(<VariableStack stack={STACK} hideEmpty />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("says so plainly when there is no stack at all", () => {
    render(<VariableStack stack={{}} hideEmpty />);
    expect(screen.getByText("No variable stack recorded.")).toBeTruthy();
  });
});

describe("VariableStack — a marginal read is not an attribution", () => {
  const marginal = new Map([["HK_ProofFirst", { label: "CPA", value: "$18.40" }]]);

  it("shows the read for a variable that has one", () => {
    render(<VariableStack stack={STACK} marginal={marginal} marginalLabel="CPA" />);
    expect(screen.getByText("$18.40")).toBeTruthy();
  });

  it("says on the number itself that it is not this stack's result", () => {
    render(<VariableStack stack={STACK} marginal={marginal} marginalLabel="CPA" />);
    const t = screen.getByText("$18.40").getAttribute("title") ?? "";
    expect(t).toContain("across every creative");
    expect(t).toContain("not this stack's own result");
  });

  it("labels the whole row marginal rather than attributed", () => {
    const { container } = render(<VariableStack stack={STACK} marginal={marginal} marginalLabel="CPA" />);
    expect(container.textContent).toContain("marginal, not attributed");
  });

  it("shows no number for a variable with no read — never a zero", () => {
    render(<VariableStack stack={STACK} marginal={marginal} marginalLabel="CPA" />);
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("VariableStack — selection", () => {
  it("names the family and the variable in the button", async () => {
    const u = userEvent.setup();
    const onSelect = vi.fn();
    render(<VariableStack stack={STACK} onSelect={onSelect} />);
    await u.click(screen.getByRole("button", { name: /^Hook:/ }));
    expect(onSelect).toHaveBeenCalledWith("HK_ProofFirst", "hook");
  });

  it("makes an unfilled family unclickable — there is nothing to open", () => {
    const onSelect = vi.fn();
    render(<VariableStack stack={STACK} onSelect={onSelect} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});
