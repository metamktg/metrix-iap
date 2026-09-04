// ─── Resizable column: the contract three panels now share ────────────
//
// Sidebar and TaskTray already built this on useDragResize. StrategyMapView
// hand-rolled a third version that was mouse-only (inert on touch), left no
// cursor or text-selection lock during the drag, kept its widths in plain
// useState so every navigation threw the layout away, and carried
// role="separator" with no tabIndex and no key handler — announced to
// assistive tech as an operable splitter, and not operable.
//
// These pin the parts that were missing.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizableColumn } from "../useResizableColumn";

const KEY = "metrix.test.column";

const OPTS = {
  storageKey: KEY,
  defaultWidth: 260,
  minWidth: 180,
  maxWidth: 380,
  edge: "left" as const,
  collapseBelow: 150,
};

beforeEach(() => {
  localStorage.clear();
});

describe("useResizableColumn · accessibility contract", () => {
  it("is focusable and exposes the splitter's value range", () => {
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    const h = result.current.handleProps;
    expect(h.role).toBe("separator");
    expect(h.tabIndex).toBe(0);
    // role="separator" promises these; without them a screen reader
    // announces an operable splitter with no position.
    expect(h["aria-valuenow"]).toBe(260);
    expect(h["aria-valuemax"]).toBe(380);
    expect(h["aria-label"]).toBe("Resize panel");
    expect(typeof h.onKeyDown).toBe("function");
  });

  it("resizes with arrow keys, which the role commits it to", () => {
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    const press = (key: string) =>
      act(() => {
        result.current.handleProps.onKeyDown({ key, preventDefault: () => {} } as never);
      });

    // Left-edge handle: ArrowLeft grows the column it sizes.
    press("ArrowLeft");
    expect(result.current.width).toBe(276);
    press("ArrowRight");
    expect(result.current.width).toBe(260);
  });

  it("never lets a key press push the column outside its clamps", () => {
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    for (let i = 0; i < 40; i += 1) {
      act(() => result.current.handleProps.onKeyDown({ key: "ArrowLeft", preventDefault: () => {} } as never));
    }
    expect(result.current.width).toBe(380);
    for (let i = 0; i < 80; i += 1) {
      act(() => result.current.handleProps.onKeyDown({ key: "ArrowRight", preventDefault: () => {} } as never));
    }
    expect(result.current.width).toBe(180);
  });

  it("toggles collapse from the keyboard when the column can collapse", () => {
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.handleProps.onKeyDown({ key: "Enter", preventDefault: () => {} } as never));
    expect(result.current.collapsed).toBe(true);
  });

  it("reopens on an arrow key rather than trapping the user in a collapsed rail", () => {
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    act(() => result.current.setCollapsed(true));
    act(() => result.current.handleProps.onKeyDown({ key: "ArrowLeft", preventDefault: () => {} } as never));
    expect(result.current.collapsed).toBe(false);
  });
});

describe("useResizableColumn · the width survives navigation", () => {
  it("persists a keyboard resize", () => {
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    act(() => result.current.handleProps.onKeyDown({ key: "ArrowLeft", preventDefault: () => {} } as never));
    expect(localStorage.getItem(KEY)).toBe("276");
  });

  it("restores a stored width on remount", () => {
    localStorage.setItem(KEY, "300");
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    expect(result.current.width).toBe(300);
  });

  it("ignores a stored width that no longer fits the clamps", () => {
    // Stale config from an older layout must not restore an unusable panel.
    localStorage.setItem(KEY, "9999");
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    expect(result.current.width).toBe(260);
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem(KEY, "not-a-number");
    const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
    expect(result.current.width).toBe(260);
  });

  it("remembers that the column was collapsed", () => {
    const first = renderHook(() => useResizableColumn("Resize panel", OPTS));
    act(() => first.result.current.setCollapsed(true));
    first.unmount();
    const second = renderHook(() => useResizableColumn("Resize panel", OPTS));
    expect(second.result.current.collapsed).toBe(true);
  });

  it("survives localStorage being unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      const { result } = renderHook(() => useResizableColumn("Resize panel", OPTS));
      expect(result.current.width).toBe(260);
      expect(result.current.collapsed).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("useResizableColumn · a column that must not disappear", () => {
  const NO_COLLAPSE = { ...OPTS, collapseBelow: undefined, edge: "right" as const };

  it("reports a floor of minWidth, not zero, when it cannot collapse", () => {
    const { result } = renderHook(() => useResizableColumn("Resize list", NO_COLLAPSE));
    expect(result.current.handleProps["aria-valuemin"]).toBe(180);
  });

  it("does not toggle collapse on Enter", () => {
    const { result } = renderHook(() => useResizableColumn("Resize list", NO_COLLAPSE));
    act(() => result.current.handleProps.onKeyDown({ key: "Enter", preventDefault: () => {} } as never));
    expect(result.current.collapsed).toBe(false);
  });

  it("resets to its default width on double-click instead of collapsing", () => {
    const { result } = renderHook(() => useResizableColumn("Resize list", NO_COLLAPSE));
    act(() => result.current.handleProps.onKeyDown({ key: "ArrowRight", preventDefault: () => {} } as never));
    expect(result.current.width).not.toBe(260);
    act(() => result.current.handleProps.onDoubleClick());
    expect(result.current.width).toBe(260);
    expect(result.current.collapsed).toBe(false);
  });
});
