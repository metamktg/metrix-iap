// ─── ?tab= URL state + durable account selection ──────────────────────
// In-module tabs live in the URL (useTabParam) so links reproduce the
// exact view; tab switches replace (never push) history. The active
// account persists in localStorage (survives new tabs), with a one-time
// sessionStorage fallback and a manager-mode fallback for stale ids.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/contexts/MetrixDataContext", async () => {
  const { seed } = await import("./seed");
  return {
    useMetrixSeed: () => seed,
    MetrixDataProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

import { renderAt, seedAccountSession, SESSION_KEY } from "./harness";

beforeEach(() => {
  cleanup();
  seedAccountSession();
});

function activeTab(container: HTMLElement): string {
  return container.querySelector('[aria-current="page"]')?.textContent ?? "";
}

describe("?tab= deep links", () => {
  it("a valid ?tab= selects that tab", async () => {
    const { container } = await renderAt("/app/analysis/library?tab=variables");
    expect(activeTab(container)).toContain("Creative DNA");
  });

  it("no ?tab= lands on the default tab", async () => {
    const { container } = await renderAt("/app/analysis/library");
    expect(activeTab(container)).toContain("Creative cells");
  });

  it("an unknown ?tab= falls back to the default tab", async () => {
    const { container } = await renderAt("/app/analysis/library?tab=bogus");
    expect(activeTab(container)).toContain("Creative cells");
  });

  it("switching tabs updates the URL by replace — Back never walks tab clicks", async () => {
    const { container, location } = await renderAt("/app/analysis/library");
    const historyLenBefore = location.history!.length;
    const target = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Creative DNA")
    );
    expect(target).toBeTruthy();
    fireEvent.click(target!);
    expect(location.history!.at(-1)).toContain("tab=variables");
    expect(location.history!.length).toBe(historyLenBefore);
    expect(activeTab(container)).toContain("Creative DNA");
  });

  it("switching back to the default tab removes the param (clean URL)", async () => {
    const { container, location } = await renderAt("/app/analysis/library?tab=variables");
    const target = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Creative cells")
    );
    fireEvent.click(target!);
    expect(location.history!.at(-1)).not.toContain("tab=");
    expect(activeTab(container)).toContain("Creative cells");
  });
});

describe("durable account selection", () => {
  it("a persisted id that no longer resolves falls back to manager mode", async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ type: "ad_account", adAccountId: "deleted-account" })
    );
    const { container } = await renderAt("/");
    // Manager overview, not the account overview and not a crash.
    expect(container.textContent).not.toContain("Account health");
    expect(
      JSON.parse(localStorage.getItem(SESSION_KEY)!).type
    ).toBe("manager");
  });

  it("a legacy sessionStorage selection is migrated to localStorage", async () => {
    localStorage.clear();
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
    );
    const { container } = await renderAt("/");
    expect(container.textContent).toContain("Account health");
    expect(
      JSON.parse(localStorage.getItem(SESSION_KEY)!).adAccountId
    ).toBe("bookster");
  });
});
