// ─── Settings · General · account rename (E4) ─────────────────────────
// Asserts the RENDERED affordance, not just the validation arithmetic —
// the surface is where the previous phase's propagation bugs actually lived
// (handoff §2g), so a pure-function test would be testing the wrong layer.
//
// The guarantee under test: renaming moves the DISPLAY name only. The
// account's generated id is the stable key every table joins on, so it is
// shown alongside the field and never edited here.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

const mutate = vi.fn();
let pending = false;

vi.mock("@workspace/api-client-react", () => ({
  useSetAccountDisplayName: () => ({ mutate, isPending: pending }),
  getGetMetrixSeedQueryKey: () => ["seed"],
  ApiError: class ApiError extends Error {},
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@workspace/command-deck/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { AccountNameSection } = await import("../GeneralView");

const NAME = "Fresh Import 1786839868960";
const ID = "manual_9JGXU_AQJjxJ";

const mount = (name = NAME) =>
  render(<AccountNameSection accountId={ID} currentName={name} />);

describe("account rename", () => {
  beforeEach(() => {
    cleanup();
    mutate.mockClear();
    pending = false;
  });

  it("shows the current name and the id that will NOT change", () => {
    mount();
    expect((screen.getByTestId("input-account-name") as HTMLInputElement).value).toBe(NAME);
    expect(screen.getByText(`id · ${ID}`)).toBeTruthy();
  });

  it("cannot save until the name actually changes", () => {
    mount();
    const save = screen.getByTestId("button-save-account-name") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-account-name"), { target: { value: "AAFE" } });
    expect((screen.getByTestId("button-save-account-name") as HTMLButtonElement).disabled).toBe(false);
  });

  it("refuses an empty or whitespace-only name", () => {
    mount();
    fireEvent.change(screen.getByTestId("input-account-name"), { target: { value: "   " } });
    expect((screen.getByTestId("button-save-account-name") as HTMLButtonElement).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("refuses a name over 80 characters and says why, rather than failing at the server", () => {
    mount();
    fireEvent.change(screen.getByTestId("input-account-name"), { target: { value: "x".repeat(81) } });
    expect((screen.getByTestId("button-save-account-name") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("81/80, too long")).toBeTruthy();
  });

  it("submits the trimmed name against the unchanged account id", () => {
    mount();
    fireEvent.change(screen.getByTestId("input-account-name"), { target: { value: "  AAFE Live  " } });
    fireEvent.click(screen.getByTestId("button-save-account-name"));
    expect(mutate).toHaveBeenCalledWith({ accountId: ID, data: { name: "AAFE Live" } });
  });
});
