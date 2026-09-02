// ─── The topbar Back control ──────────────────────────────────────────
// Every non-landing route has one. It walks the session's own in-app
// history when there is one and the section's command center when there
// is not (a deep link arrives with nothing behind it), and it NAMES its
// destination so a reader knows which before pressing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Topbar } from "../Topbar";
import { recordNavigation, resetNavigationHistory } from "@/navigation/navHistory";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn(), user: null }) }));
vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({
    manager: { name: "Agency" },
    selectedAccountType: "ad_account",
    activeAdAccount: { name: "Bookster", status: "configured" },
  }),
}));
vi.mock("@/contexts/TaskTrayContext", () => ({ useTaskTray: () => ({ open: false, toggle: vi.fn() }) }));
vi.mock("../TaskTray", () => ({ useTaskTrayCount: () => 0 }));
vi.mock("@/navigation/useNavBadges", () => ({
  useNavBadges: () => ({ signals: 3, briefs: null, mst: null, agent: null }),
}));

function at(path: string) {
  window.history.replaceState({}, "", path);
  return render(<Topbar />);
}

beforeEach(() => resetNavigationHistory());
afterEach(() => cleanup());

describe("Back", () => {
  it("is absent on the overview — there is nothing above home", () => {
    at("/");
    expect(screen.queryByTestId("topbar-back")).toBeNull();
  });

  it("on a deep link with no history, goes to the section's command center and says so", () => {
    at("/app/analysis/audience");
    const back = screen.getByTestId("topbar-back");
    expect(back.getAttribute("data-back-to")).toBe("/app/analysis");
    expect(back.getAttribute("aria-label")).toBe("Back to Analysis");

    fireEvent.click(back);
    expect(window.location.pathname).toBe("/app/analysis");
  });

  it("from a command center with no history, goes to the overview", () => {
    at("/app/strategy");
    const back = screen.getByTestId("topbar-back");
    expect(back.getAttribute("data-back-to")).toBe("/");
    expect(back.getAttribute("aria-label")).toBe("Back to Account Overview");
  });

  it("with in-app history, targets the previous page by name", () => {
    recordNavigation("/app/analysis/library");
    recordNavigation("/app/strategy/map");
    at("/app/strategy/map");
    const back = screen.getByTestId("topbar-back");
    expect(back.getAttribute("data-back-to")).toBe("/app/analysis/library");
    expect(back.getAttribute("aria-label")).toBe("Back to IAP Library");
  });

  it("a page outside the nav tree still has a Back (to the overview)", () => {
    at("/app/not-in-the-tree");
    expect(screen.getByTestId("topbar-back").getAttribute("data-back-to")).toBe("/");
  });
});

describe("Topbar controls that used to be dead or duplicated", () => {
  it("the bell is a link to Listen · Alerts and carries the signal count", () => {
    at("/app/analysis");
    const bell = screen.getByLabelText("Alerts (3 signals)");
    expect(bell.getAttribute("href")).toBe("/app/listen/alerts");
  });

  it("offers the command palette with its shortcut", () => {
    at("/app/analysis");
    const trigger = screen.getByTestId("topbar-search");
    expect(trigger.getAttribute("aria-keyshortcuts")).toContain("Meta+K");
  });
});
