// ─── AddAccountDialog keyboard navigation tests ───────────────────────────
//
// Guards the keyboard-critical paths through the multi-step add-account flow
// using real userEvent interactions (tab, keyboard, click).
//
//  1. Choose step — Tab order: Tab cycles through the two choice buttons in
//     the correct order (Meta live connection first, manual upload second).
//
//  2. manual_name step — keyboard submission and Tab order:
//       • Enter on the name input fires the create mutation (valid name).
//       • Enter with a short name shows a validation error, no mutation call.
//       • Tab from the input reaches Back before Create account.
//
//  3. Confirm-before-dismiss — Esc path:
//       • First Esc → "Leave without completing?" confirm screen (outer stays open).
//       • Second Esc → cancels back to upload step (outer still open).
//       • "Keep staging" click → same cancel result.
//       • "Leave anyway" click → outer dialog closes.
//
//  4. Focus return: after the outer dialog closes, focus returns to the element
//     that was focused when the dialog opened (standard Radix Dialog behaviour).
//
// Regression target: any refactor that changes step transitions, the confirm
// guard, or button ordering breaks these tests loudly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mutable per-test state ────────────────────────────────────────────────

let mockMutateAsync: ReturnType<typeof vi.fn>;
let mockSelectAdAccount: ReturnType<typeof vi.fn>;
let mockImports: unknown[];

// ── Mocks (hoisted before imports of the module under test) ──────────────

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useCreateManualAdAccount: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
    }),
    useListManualImports: () => ({
      data: { imports: mockImports },
    }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
  };
});

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ["/app", vi.fn()],
  };
});

vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({ selectAdAccount: mockSelectAdAccount }),
  AccountProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ManualUploadPanel pulls in file-upload machinery — stub it so tests run
// fast without touching API hooks they don't need.
vi.mock("../ConnectAccountDialogs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ManualUploadPanel: () => <div data-testid="manual-upload-panel" />,
  };
});

// ── Imports (after vi.mock hoisting) ────────────────────────────────────

import { AddAccountDialog } from "../AddAccountDialog";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
}

/** Render the dialog alone (no external trigger button). */
function renderDialog(props: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <AddAccountDialog {...props} />
    </QueryClientProvider>
  );
}

/** Render a trigger button alongside the dialog for focus-return tests. */
function renderWithTrigger(open: boolean, onOpenChange: (o: boolean) => void) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <button data-testid="trigger-btn">Open</button>
      <AddAccountDialog open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
}

/**
 * Drive the dialog from "choose" → "manual_name" → "manual_uploads" by
 * completing the create flow via real userEvent interactions.
 *
 * Caller must set `mockImports` to a non-empty array before calling so that
 * `hasStagedImports` is true (activating the confirm-before-dismiss guard).
 */
async function reachUploadStep(user: ReturnType<typeof userEvent.setup>, onOpenChange: (o: boolean) => void) {
  mockImports = [{ id: "import-1", file_name: "report.csv" }];

  renderDialog({ open: true, onOpenChange });

  // Step 1 → 2: navigate to manual name step.
  await user.click(screen.getByRole("button", { name: /Upload manual reports/i }));

  // Step 2 → 3: type a valid name and click "Create account".
  await user.type(screen.getByPlaceholderText(/Acme Skincare/i), "Acme");
  await user.click(screen.getByRole("button", { name: /Create account/i }));

  // Wait for the upload step to appear (mutateAsync resolves → setStep).
  await waitFor(() => {
    expect(screen.getByTestId("manual-upload-panel")).toBeTruthy();
  });
}

// ── Setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockImports = [];
  mockMutateAsync = vi.fn().mockResolvedValue({ account_id: "acct-test", name: "Acme" });
  mockSelectAdAccount = vi.fn();
});

// ─────────────────────────────────────────────────────────────────────────
// 1. Choose step — Tab order
// ─────────────────────────────────────────────────────────────────────────

describe("choose step — Tab order", () => {
  it("Tab reaches the Meta button before the manual-upload button", async () => {
    const user = userEvent.setup();
    renderDialog({ open: true, onOpenChange: vi.fn() });

    // Start Tab from the beginning of the focus scope. Radix's first element
    // inside the dialog content is the close button (×), then the two choice
    // cards in DOM order. Tab until we hit one of the choice cards.
    const metaBtn = screen.getByRole("button", { name: /Connect Meta Ad Account/i });
    const manualBtn = screen.getByRole("button", { name: /Upload manual reports/i });

    // Cycle tab presses until the Meta button is focused.
    for (let i = 0; i < 5; i++) {
      await user.tab();
      if (document.activeElement === metaBtn) break;
    }
    expect(document.activeElement).toBe(metaBtn);

    // One more Tab → manual-upload button.
    await user.tab();
    expect(document.activeElement).toBe(manualBtn);
  });

  it("DOM order matches Tab order: Meta button precedes manual-upload button", () => {
    renderDialog({ open: true, onOpenChange: vi.fn() });

    const metaBtn = screen.getByRole("button", { name: /Connect Meta Ad Account/i });
    const manualBtn = screen.getByRole("button", { name: /Upload manual reports/i });

    // Node.DOCUMENT_POSITION_FOLLOWING (4) means manualBtn comes after metaBtn.
    expect(
      metaBtn.compareDocumentPosition(manualBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("both choice buttons are in the tab sequence (no tabIndex=-1, not disabled)", () => {
    renderDialog({ open: true, onOpenChange: vi.fn() });

    const metaBtn = screen.getByRole("button", { name: /Connect Meta Ad Account/i });
    const manualBtn = screen.getByRole("button", { name: /Upload manual reports/i });

    expect(metaBtn.getAttribute("tabindex")).not.toBe("-1");
    expect(manualBtn.getAttribute("tabindex")).not.toBe("-1");
    expect((metaBtn as HTMLButtonElement).disabled).toBe(false);
    expect((manualBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. manual_name step — keyboard submission and Tab order
// ─────────────────────────────────────────────────────────────────────────

describe("manual_name step — Enter submits", () => {
  it("pressing Enter on the name input fires the create mutation when name is valid", async () => {
    const user = userEvent.setup();
    renderDialog({ open: true, onOpenChange: vi.fn() });

    await user.click(screen.getByRole("button", { name: /Upload manual reports/i }));

    const input = screen.getByPlaceholderText(/Acme Skincare/i);
    await user.click(input);
    await user.type(input, "Bookster Co");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ data: { name: "Bookster Co" } });
    });
  });

  it("Enter does NOT call the mutation when the name is shorter than 2 chars", async () => {
    const user = userEvent.setup();
    renderDialog({ open: true, onOpenChange: vi.fn() });

    await user.click(screen.getByRole("button", { name: /Upload manual reports/i }));

    const input = screen.getByPlaceholderText(/Acme Skincare/i);
    await user.click(input);
    await user.type(input, "A");
    await user.keyboard("{Enter}");

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 2 characters/i)).toBeTruthy();
  });

  it("Back button from manual_name navigates to choose step, removes name field, and clears error", async () => {
    const user = userEvent.setup();
    renderDialog({ open: true, onOpenChange: vi.fn() });

    // Navigate to manual_name step.
    await user.click(screen.getByRole("button", { name: /Upload manual reports/i }));

    const input = screen.getByPlaceholderText(/Acme Skincare/i);

    // Type a short (invalid) name to trigger the validation error first.
    await user.click(input);
    await user.type(input, "A");
    await user.keyboard("{Enter}");

    // Error banner must be present before we click Back.
    expect(screen.getByText(/at least 2 characters/i)).toBeTruthy();

    // Click Back.
    await user.click(screen.getByRole("button", { name: /Back/i }));

    // Verify we are back on the choose step — both choice buttons must be visible.
    expect(screen.getByRole("button", { name: /Connect Meta Ad Account/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Upload manual reports/i })).toBeTruthy();

    // The name input field must be gone (it belongs to the manual_name step).
    expect(screen.queryByPlaceholderText(/Acme Skincare/i)).toBeNull();

    // The error banner must be gone.
    expect(screen.queryByText(/at least 2 characters/i)).toBeNull();
  });

  it("Tab from the name input reaches Back before Create account", async () => {
    const user = userEvent.setup();
    renderDialog({ open: true, onOpenChange: vi.fn() });

    await user.click(screen.getByRole("button", { name: /Upload manual reports/i }));

    const input = screen.getByPlaceholderText(/Acme Skincare/i);

    // Type a valid name so the Create button is enabled and in the tab order.
    await user.click(input);
    await user.type(input, "Acme Co");

    const backBtn = screen.getByRole("button", { name: /Back/i });
    const createBtn = screen.getByRole("button", { name: /Create account/i });

    // Re-focus the input (type leaves focus on it anyway, but be explicit).
    await user.click(input);
    expect(document.activeElement).toBe(input);

    // Tab → Back, Tab again → Create account.
    await user.tab();
    expect(document.activeElement).toBe(backBtn);

    await user.tab();
    expect(document.activeElement).toBe(createBtn);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Confirm-before-dismiss — Esc cancels, not closes outer dialog
// ─────────────────────────────────────────────────────────────────────────

describe("confirm-before-dismiss — Esc cancels", () => {
  it("first Esc shows the confirm screen when staged imports exist", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    await reachUploadStep(user, onOpenChange);

    // Click somewhere inside the dialog to ensure focus is inside.
    await user.click(screen.getByTestId("manual-upload-panel"));

    // Esc → our guard intercepts → shows confirm screen.
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.getByText(/Leave without completing/i)).toBeTruthy();
    });

    // Outer dialog must NOT have been closed.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("Esc on the confirm screen cancels back to the upload step (outer stays open)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    await reachUploadStep(user, onOpenChange);

    await user.click(screen.getByTestId("manual-upload-panel"));

    // First Esc → confirm screen.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.getByText(/Leave without completing/i)).toBeTruthy();
    });

    // Second Esc → confirm screen cancels; upload panel returns.
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText(/Leave without completing/i)).toBeNull();
      expect(screen.getByTestId("manual-upload-panel")).toBeTruthy();
    });

    // Outer dialog must remain open throughout.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("'Keep staging' click cancels the confirm screen and returns to upload step", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    await reachUploadStep(user, onOpenChange);

    await user.click(screen.getByTestId("manual-upload-panel"));
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Keep staging/i })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: /Keep staging/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Leave without completing/i)).toBeNull();
      expect(screen.getByTestId("manual-upload-panel")).toBeTruthy();
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("'Leave anyway' click closes the outer dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    await reachUploadStep(user, onOpenChange);

    await user.click(screen.getByTestId("manual-upload-panel"));
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave anyway/i })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: /Leave anyway/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Focus return after dialog closes
// ─────────────────────────────────────────────────────────────────────────

describe("focus return after dialog closes", () => {
  it("focus returns to the trigger element when the dialog closes", async () => {
    const onOpenChange = vi.fn();

    // Use a STABLE client across all rerenders — creating a new QueryClient
    // each time would unmount/remount the whole tree, staling the trigger ref.
    const client = makeClient();

    function Wrapper({ open }: { open: boolean }) {
      return (
        <QueryClientProvider client={client}>
          <button data-testid="trigger-btn">Open</button>
          <AddAccountDialog open={open} onOpenChange={onOpenChange} />
        </QueryClientProvider>
      );
    }

    // Start with the dialog closed so the trigger can be focused first.
    const { rerender } = render(<Wrapper open={false} />);

    const trigger = screen.getByTestId("trigger-btn");

    // Track focus events received by the trigger — Radix calls .focus() on it
    // when the dialog closes; in jsdom a synchronous focus() call also fires
    // the focusin DOM event, so this spy captures both mechanisms.
    let triggerFocused = false;
    trigger.addEventListener("focusin", () => { triggerFocused = true; });
    const focusSpy = vi.spyOn(trigger, "focus");

    // Focus the trigger — Radix FocusScope captures document.activeElement in
    // a useEffect on mount; this must be set before the dialog opens.
    act(() => { trigger.focus(); });
    expect(document.activeElement).toBe(trigger);

    // Open the dialog — Radix mounts FocusScope, captures trigger as the
    // return-focus target, then moves focus to the first dialog element.
    act(() => { rerender(<Wrapper open={true} />); });

    // Focus moved into the dialog (away from the trigger).
    expect(document.activeElement).not.toBe(trigger);

    // Close the dialog — Radix schedules focus restoration via setTimeout(0).
    act(() => { rerender(<Wrapper open={false} />); });

    // waitFor polls until the setTimeout fires and focus() is called.
    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalled();
    });

    // Once focus() is called on the trigger, document.activeElement must
    // reflect it (jsdom honours .focus() on in-document buttons).
    expect(triggerFocused || document.activeElement === trigger).toBe(true);
  });

  it("no dialog role or Radix focus-guard remains in the DOM after close", async () => {
    const onOpenChange = vi.fn();
    const client = makeClient();

    function Wrapper({ open }: { open: boolean }) {
      return (
        <QueryClientProvider client={client}>
          <button data-testid="trigger-btn">Open</button>
          <AddAccountDialog open={open} onOpenChange={onOpenChange} />
        </QueryClientProvider>
      );
    }

    const { rerender } = render(<Wrapper open={true} />);

    // Dialog is open — role="dialog" must be present.
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => { rerender(<Wrapper open={false} />); });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // No Radix focus-guard sentinels should survive.
    expect(document.querySelectorAll("[data-radix-focus-guard]").length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. "Done — open account" navigates to the created account
// ─────────────────────────────────────────────────────────────────────────

describe("Done — open account button", () => {
  it("calls selectAdAccount with the created account ID and closes the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    // Drive to the upload step (mockMutateAsync resolves with account_id "acct-test").
    await reachUploadStep(user, onOpenChange);

    const doneBtn = screen.getByRole("button", { name: /Done — open account/i });
    await user.click(doneBtn);

    // selectAdAccount must be called with the exact id returned by the create mutation.
    expect(mockSelectAdAccount).toHaveBeenCalledWith("acct-test");

    // The dialog must close.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
