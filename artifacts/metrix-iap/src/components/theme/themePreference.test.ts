import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeMetrixTheme,
  METRIX_THEME_STORAGE_KEY,
} from "./themePreference";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("theme bootstrap compatibility", () => {
  it("uses dark for a new browser without persisting an implicit choice", () => {
    expect(initializeMetrixTheme()).toBe("dark");
    expect(document.documentElement.className).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(METRIX_THEME_STORAGE_KEY)).toBeNull();
  });

  it.each(["light", "dark"] as const)("restores an explicit %s preference", (theme) => {
    localStorage.setItem(METRIX_THEME_STORAGE_KEY, theme);
    document.documentElement.className = theme === "light" ? "dark light" : "light dark";

    expect(initializeMetrixTheme()).toBe(theme);
    expect(document.documentElement.className).toBe(theme);
  });

  it("repairs an invalid legacy value to the dark default", () => {
    localStorage.setItem(METRIX_THEME_STORAGE_KEY, "system");
    document.documentElement.className = "light old-theme";

    expect(initializeMetrixTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.classList.contains("old-theme")).toBe(true);
    expect(localStorage.getItem(METRIX_THEME_STORAGE_KEY)).toBeNull();
  });

  it("still applies dark when browser storage is unavailable", () => {
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new DOMException("Access denied", "SecurityError");
      }),
      removeItem: vi.fn(),
    };

    expect(initializeMetrixTheme(document.documentElement, unavailableStorage)).toBe("dark");
    expect(document.documentElement.className).toBe("dark");
  });
});