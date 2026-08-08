// ─── TaskTrayContext tests ──────────────────────────────────────────────
// Covers the open/closed persistence pattern (mirrors the sidebar's
// collapse-preference storage): default state, toggle/close/openTray
// persistence, and restoring a previously stored preference on mount.

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { TaskTrayProvider, useTaskTray } from "../TaskTrayContext";

const STORAGE_KEY = "metrix_tray_open";

function Probe() {
  const { open, toggle, close, openTray } = useTaskTray();
  return (
    <div>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={close}>close</button>
      <button onClick={openTray}>open</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <TaskTrayProvider>
      <Probe />
    </TaskTrayProvider>
  );
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
});

describe("TaskTrayContext: open-state persistence", () => {
  it("defaults to closed when nothing is stored", () => {
    renderProbe();
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("toggle flips state and persists it", () => {
    renderProbe();
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("state").textContent).toBe("open");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");

    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("state").textContent).toBe("closed");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("0");
  });

  it("close() persists closed even when already closed", () => {
    renderProbe();
    fireEvent.click(screen.getByText("close"));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("0");
  });

  it("openTray() persists open", () => {
    renderProbe();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByTestId("state").textContent).toBe("open");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("restores a previously persisted open preference on mount", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    renderProbe();
    expect(screen.getByTestId("state").textContent).toBe("open");
  });

  it("restores a previously persisted closed preference on mount", () => {
    localStorage.setItem(STORAGE_KEY, "0");
    renderProbe();
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });
});
