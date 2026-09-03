// One preference record per panel kind, validated against the kind's bounds,
// read through the hook every panel uses.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { clampWidth, usePanelSize } from "@/lib/panel-prefs";

const B = { min: 320, max: 760, default: 560 };
let n = 0;
const kind = () => `test-${++n}`;

beforeEach(() => { localStorage.clear(); });

describe("usePanelSize", () => {
  it("starts at the default, clamps a set width into bounds and persists it", () => {
    const k = kind();
    const { result } = renderHook(() => usePanelSize(k, B));
    expect(result.current.width).toBe(560);
    expect(result.current.expanded).toBe(false);
    act(() => result.current.setWidth(900));
    expect(result.current.width).toBe(760);
    expect(result.current.expanded).toBe(true);
    expect(JSON.parse(localStorage.getItem(`metrix.panel.v1::${k}`)!).width).toBe(760);
  });
  it("restores a stored width inside the bounds and throws away one outside them", () => {
    const k1 = kind();
    localStorage.setItem(`metrix.panel.v1::${k1}`, JSON.stringify({ width: 400, expanded: false }));
    expect(renderHook(() => usePanelSize(k1, B)).result.current.width).toBe(400);
    const k2 = kind();
    localStorage.setItem(`metrix.panel.v1::${k2}`, JSON.stringify({ width: 100 }));
    expect(renderHook(() => usePanelSize(k2, B)).result.current.width).toBe(560);
    const k3 = kind();
    localStorage.setItem(`metrix.panel.v1::${k3}`, "not json");
    expect(renderHook(() => usePanelSize(k3, B)).result.current).toMatchObject({ width: 560, expanded: false });
  });
  it("expand goes to the maximum and collapse returns to the width the reader had", () => {
    const k = kind();
    const { result } = renderHook(() => usePanelSize(k, B));
    act(() => result.current.setWidth(480));
    act(() => result.current.toggleExpanded());
    expect(result.current).toMatchObject({ width: 760, expanded: true });
    act(() => result.current.toggleExpanded());
    expect(result.current).toMatchObject({ width: 480, expanded: false });
  });
  it("clamps into bounds and rounds", () => {
    expect(clampWidth(10, B)).toBe(320);
    expect(clampWidth(999, B)).toBe(760);
    expect(clampWidth(500.6, B)).toBe(501);
  });
});
