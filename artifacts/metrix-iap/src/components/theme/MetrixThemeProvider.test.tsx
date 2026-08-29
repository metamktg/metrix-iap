import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "next-themes";
import {
  METRIX_THEME_STORAGE_KEY,
  MetrixThemeProvider,
} from "./MetrixThemeProvider";

function ThemeProbe() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <>
      <output data-testid="theme">{resolvedTheme}</output>
      <button type="button" onClick={() => setTheme("light")}>Use light</button>
      <button type="button" onClick={() => setTheme("dark")}>Use dark</button>
    </>
  );
}

function renderProbe() {
  return render(
    <MetrixThemeProvider>
      <ThemeProbe />
    </MetrixThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
});

describe("Metrix theme preference", () => {
  it("defaults a first launch to dark", async () => {
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("theme").textContent).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("persists an explicit light choice and can switch back to dark", async () => {
    const firstRender = renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "Use light" }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(localStorage.getItem(METRIX_THEME_STORAGE_KEY)).toBe("light");
    });

    firstRender.unmount();
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("theme").textContent).toBe("light");
      expect(document.documentElement.classList.contains("light")).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Use dark" }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(localStorage.getItem(METRIX_THEME_STORAGE_KEY)).toBe("dark");
    });
  });
});