import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "../Topbar";
import { MetrixThemeProvider } from "../../theme/MetrixThemeProvider";
import {
  initializeMetrixTheme,
  METRIX_THEME_STORAGE_KEY,
} from "../../theme/themePreference";

vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocation: () => ["/app/analysis/overview", vi.fn()],
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn(), user: null }),
}));
vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({
    manager: { name: "Agency" },
    selectedAccountType: "manager",
    activeAdAccount: null,
  }),
}));
vi.mock("@/contexts/TaskTrayContext", () => ({
  useTaskTray: () => ({ open: false, toggle: vi.fn() }),
}));
vi.mock("../TaskTray", () => ({
  useTaskTrayCount: () => 0,
}));

function renderMenu() {
  return render(
    <MetrixThemeProvider>
      <AccountMenu initials="BO" email="user@example.test" onClose={vi.fn()} />
    </MetrixThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  initializeMetrixTheme();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
});

describe("real account-menu theme integration", () => {
  it("toggles dark to light to dark and persists both explicit choices", async () => {
    renderMenu();
    const toggle = screen.getByTestId("button-theme-toggle");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(document.documentElement.className).toBe("light");
      expect(localStorage.getItem(METRIX_THEME_STORAGE_KEY)).toBe("light");
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    });

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(document.documentElement.className).toBe("dark");
      expect(localStorage.getItem(METRIX_THEME_STORAGE_KEY)).toBe("dark");
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });
  });

  it("restores a past light preference and switches it back to dark", async () => {
    cleanup();
    localStorage.setItem(METRIX_THEME_STORAGE_KEY, "light");
    initializeMetrixTheme();
    renderMenu();

    const toggle = await screen.findByTestId("button-theme-toggle");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.documentElement.className).toBe("dark");
      expect(localStorage.getItem(METRIX_THEME_STORAGE_KEY)).toBe("dark");
    });
  });

  it("supports keyboard activation for non-pointer users", async () => {
    const user = userEvent.setup();
    renderMenu();
    const toggle = screen.getByTestId("button-theme-toggle");
    toggle.focus();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.documentElement.className).toBe("light"));
    await user.keyboard(" ");
    await waitFor(() => expect(document.documentElement.className).toBe("dark"));
  });
});