// ─── The shell below 1024px ───────────────────────────────────────────
//
// The sidebar used to be a permanent rail at every width — 216px expanded,
// 56px collapsed, with no breakpoint anywhere in the shell. On a 390px phone
// that left the page 174px. Not cramped: unusable.
//
// Below lg it is a drawer, and a drawer is a set of behaviours, not a
// transform. These pin them. jsdom reports matches:false for every query via
// test-setup's stub, so the desktop path is what every other test still
// sees; this file overrides the stub for the compact query only.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { TaskTrayProvider } from "@/contexts/TaskTrayContext";
import { AppShell } from "../AppShell";

/** Drive the compact breakpoint on or off for the whole document. */
function setCompact(on: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: on && query.includes("max-width"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <TaskTrayProvider>
              <AppShell><div>page body</div></AppShell>
            </TaskTrayProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { cleanup(); document.body.style.overflow = ""; });

describe("compact shell — the drawer", () => {
  beforeEach(() => setCompact(true));

  it("offers a way to open navigation", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeTruthy();
  });

  it("starts closed, so the page is what you see first", () => {
    renderShell();
    expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull();
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("opens on press and reports its state", () => {
    renderShell();
    const open = screen.getByRole("button", { name: "Open navigation" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(open);
    expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on the backdrop", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull();
  });

  it("closes on Escape", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull();
  });

  it("stops the page scrolling underneath it while open", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("gives the page its scroll back on close", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("hides the drawer from assistive tech while it is off-canvas", () => {
    const { container } = renderShell();
    const drawer = container.querySelector('[aria-hidden="true"].fixed.inset-y-0');
    expect(drawer, "the closed drawer should be aria-hidden, not merely translated away").toBeTruthy();
  });
});

describe("desktop shell — no drawer at all", () => {
  beforeEach(() => setCompact(false));

  it("shows no menu button, because the rail is already there", () => {
    renderShell();
    expect(screen.queryByRole("button", { name: "Open navigation" })).toBeNull();
  });

  it("renders the page", () => {
    renderShell();
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("never locks body scroll", () => {
    renderShell();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
