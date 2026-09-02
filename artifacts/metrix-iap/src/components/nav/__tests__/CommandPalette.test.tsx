// ─── ⌘K palette ───────────────────────────────────────────────────────
// Opens on the shortcut, lists every page the sidebar can reach plus the
// accounts, filters as you type, and Enter navigates. Placeholders are
// listed disabled with "Soon", never hidden.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CommandPalette, openCommandPalette } from "../CommandPalette";
import { recordNavigation, resetNavigationHistory } from "@/navigation/navHistory";
import { navTree, visibleChildren } from "@/navigation/navTree";

const selectAdAccount = vi.fn();
const selectManager = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "a@b.c", role: "admin" } }),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({
    manager: { id: "mgr", name: "Meta Marketing Agency" },
    adAccounts: [
      { id: "bookster", name: "Bookster", status: "configured" },
      { id: "kov", name: "KOV", status: "unconfigured" },
    ],
    selectedAccountType: "ad_account",
    activeAdAccountId: "bookster",
    selectManager,
    selectAdAccount,
  }),
}));

beforeEach(() => {
  resetNavigationHistory();
  selectAdAccount.mockReset();
  // cmdk scrolls the selected row into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState({}, "", "/app/analysis");
});
afterEach(() => cleanup());

function input() {
  return screen.getByPlaceholderText("Go to page, account…");
}

describe("CommandPalette", () => {
  it("is closed until asked, and opens on Ctrl+K / ⌘K", () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists every visible menu page and every account", () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    const dialog = screen.getByRole("dialog");
    for (const section of navTree) {
      for (const child of visibleChildren(section)) {
        expect(within(dialog).getAllByText(child.label).length).toBeGreaterThan(0);
      }
    }
    expect(within(dialog).getByText("Bookster")).toBeTruthy();
    expect(within(dialog).getByText("KOV")).toBeTruthy();
    expect(within(dialog).getByText("Needs setup")).toBeTruthy();
    // Placeholders (Agent, MST Direction) are listed, disabled, and say so.
    expect(within(dialog).getAllByText("Soon").length).toBeGreaterThanOrEqual(2);
  });

  it("filters as you type and Enter navigates", () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: "audien" } });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Audience")).toBeTruthy();
    expect(within(dialog).queryByText("Budget")).toBeNull();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(window.location.pathname).toBe("/app/analysis/audience");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches account without navigating away", () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: "KOV" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(selectAdAccount).toHaveBeenCalledWith("kov");
    expect(window.location.pathname).toBe("/app/analysis");
  });

  it("shows recently visited pages first, by name, excluding the current one", () => {
    recordNavigation("/app/analysis/library");
    recordNavigation("/app/strategy/map");
    recordNavigation("/app/analysis");
    render(<CommandPalette />);
    act(() => openCommandPalette());
    const dialog = screen.getByRole("dialog");
    const recent = within(dialog).getByText("Recent").parentElement!;
    expect(within(recent).getByText("Strategy Map")).toBeTruthy();
    expect(within(recent).getByText("IAP Library")).toBeTruthy();
  });

  it("nothing matching says so rather than showing an empty box", () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    fireEvent.change(input(), { target: { value: "zzzz-not-a-page" } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });
});
