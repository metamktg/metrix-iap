import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "../Topbar";

const setTheme = vi.fn();
let theme: string | undefined = "dark";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme, setTheme }),
}));

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

beforeEach(() => {
  theme = "dark";
  document.documentElement.className = "dark";
  setTheme.mockReset();
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

describe("Account menu theme control", () => {
  it("names the current dark state and switches to light", () => {
    render(<AccountMenu initials="BO" email="user@example.test" onClose={vi.fn()} />);

    const toggle = screen.getByTestId("button-theme-toggle");
    expect(toggle.getAttribute("role")).toBe("menuitemcheckbox");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toContain("Theme: Dark");
    expect(screen.getByText("Dark")).toBeTruthy();

    fireEvent.click(toggle);
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("names the current light state and switches back to dark", () => {
    theme = "light";
    document.documentElement.className = "light";
    render(<AccountMenu initials="BO" email="user@example.test" onClose={vi.fn()} />);

    const toggle = screen.getByTestId("button-theme-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toContain("Theme: Light");
    expect(screen.getByText("Light")).toBeTruthy();

    fireEvent.click(toggle);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches an applied light theme to dark during theme-state hydration", () => {
    theme = undefined;
    document.documentElement.className = "light";
    render(<AccountMenu initials="BO" email="user@example.test" onClose={vi.fn()} />);

    const toggle = screen.getByTestId("button-theme-toggle");
    expect(toggle.getAttribute("aria-label")).toContain("Theme: Light");
    fireEvent.click(toggle);

    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});