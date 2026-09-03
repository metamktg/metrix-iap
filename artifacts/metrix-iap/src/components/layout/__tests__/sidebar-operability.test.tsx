// The two things the sidebar told users it could do and could not.
//
// 1. The resize handle carried role="separator", aria-orientation and an
//    aria-label, and had exactly one event: onPointerDown. It announced
//    itself to a screen reader as a control that resizes the sidebar and
//    then could not be reached by Tab, let alone operated. A control that
//    promises an affordance it does not have is worse than an unlabelled
//    one.
//
// 2. Below 1024px the sidebar becomes a drawer that is translated off-screen
//    rather than unmounted — deliberately, so its expanded-section state
//    survives closing. It was marked aria-hidden, which hides a subtree from
//    assistive tech and does NOTHING about focus, so every link inside the
//    closed drawer stayed in the tab order. Tabbing off the menu button on a
//    phone walked through ~20 invisible controls before reaching the page.
//
// Both are the same class of defect: the accessibility attribute that
// describes the intent was present, and the one that implements it was not.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
import { Sidebar } from "../Sidebar";

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <TaskTrayProvider>
              <Sidebar />
            </TaskTrayProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

function handle(): HTMLElement {
  return screen.getByRole("separator", { name: /sidebar width/i });
}

describe("the sidebar resize handle is a real control", () => {
  it("is reachable by keyboard", () => {
    renderSidebar();
    // tabIndex 0 = one tab stop. -1 or absent means the label was a promise
    // nothing could act on.
    expect(handle().getAttribute("tabindex")).toBe("0");
  });

  it("reports the width it is separating on", () => {
    renderSidebar();
    const h = handle();
    // A focusable separator without a value is a splitter that cannot say
    // where it is. min/max/now are what make the arrow keys meaningful.
    expect(h.getAttribute("aria-valuemin")).toBe("56");
    expect(h.getAttribute("aria-valuemax")).toBe("216");
    expect(h.getAttribute("aria-valuenow")).toBeTruthy();
  });

  it("collapses on Home and expands on End", () => {
    renderSidebar();
    fireEvent.keyDown(handle(), { key: "Home" });
    expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
    fireEvent.keyDown(handle(), { key: "End" });
    expect(handle().getAttribute("aria-valuetext")).toBe("Expanded");
  });

  it("toggles on Enter, matching a plain click", () => {
    renderSidebar();
    const before = handle().getAttribute("aria-valuetext");
    fireEvent.keyDown(handle(), { key: "Enter" });
    expect(handle().getAttribute("aria-valuetext")).not.toBe(before);
  });

  it("steps with the arrow keys and never leaves the two bounds", () => {
    renderSidebar();
    // Walk left well past the collapsed width; it must clamp, not go negative.
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle(), { key: "ArrowLeft" });
    const now = Number(handle().getAttribute("aria-valuenow"));
    expect(now).toBeGreaterThanOrEqual(56);
    expect(now).toBeLessThanOrEqual(216);
  });
});
