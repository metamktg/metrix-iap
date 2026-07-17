// ─── useColumnSort + SortableTh tests ─────────────────────────────────────
// Covers the bi-state sort contract introduced when tri-state was removed:
//   · first click → correct default direction per column type
//   · second click → flips direction (bi-state, not reset)
//   · reset() → clears sort state
//   · null values always sort last (asc and desc)
// Integration tests for SortableTh:
//   · × button renders only for the active column
//   · clicking × calls onReset and does NOT also fire the sort toggle

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useColumnSort, SortableTh } from "../tables";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = { value: number | null; label: string | null };

const ACCESSORS = {
  cost: { get: (r: Row) => r.value, defaultDir: "asc" as const },
  volume: { get: (r: Row) => r.value, defaultDir: "desc" as const },
  label: { get: (r: Row) => r.label, defaultDir: "asc" as const },
};

const NUMERIC_ROWS: Row[] = [
  { value: 3, label: "c" },
  { value: 1, label: "a" },
  { value: 2, label: "b" },
];

const NULL_ROWS: Row[] = [
  { value: null, label: null },
  { value: 5,    label: "e" },
  { value: null, label: null },
  { value: 1,    label: "a" },
];

// ---------------------------------------------------------------------------
// useColumnSort — hook unit tests
// ---------------------------------------------------------------------------

describe("useColumnSort · first click", () => {
  it("applies defaultDir=asc for a cost-type column", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    act(() => result.current.toggle("cost"));
    expect(result.current.sort).toEqual({ key: "cost", dir: "asc" });
    expect(result.current.sorted.map((r) => r.value)).toEqual([1, 2, 3]);
  });

  it("applies defaultDir=desc for a volume-type column", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    act(() => result.current.toggle("volume"));
    expect(result.current.sort).toEqual({ key: "volume", dir: "desc" });
    expect(result.current.sorted.map((r) => r.value)).toEqual([3, 2, 1]);
  });
});

describe("useColumnSort · second click", () => {
  it("flips asc → desc on a cost column (bi-state, no reset)", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    act(() => result.current.toggle("cost"));
    act(() => result.current.toggle("cost"));
    expect(result.current.sort).toEqual({ key: "cost", dir: "desc" });
    expect(result.current.sorted.map((r) => r.value)).toEqual([3, 2, 1]);
  });

  it("flips desc → asc on a volume column", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    act(() => result.current.toggle("volume"));
    act(() => result.current.toggle("volume"));
    expect(result.current.sort).toEqual({ key: "volume", dir: "asc" });
    expect(result.current.sorted.map((r) => r.value)).toEqual([1, 2, 3]);
  });

  it("does NOT clear the sort (third click would require × button)", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    act(() => result.current.toggle("cost"));
    act(() => result.current.toggle("cost"));
    act(() => result.current.toggle("cost"));
    expect(result.current.sort).not.toBeNull();
    expect(result.current.sort?.key).toBe("cost");
  });
});

describe("useColumnSort · reset()", () => {
  it("clears sort state and restores original row order", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    act(() => result.current.toggle("cost"));
    expect(result.current.sort).not.toBeNull();
    act(() => result.current.reset());
    expect(result.current.sort).toBeNull();
    expect(result.current.sorted).toEqual(NUMERIC_ROWS);
  });

  it("can be called safely when no sort is active", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    expect(() => act(() => result.current.reset())).not.toThrow();
    expect(result.current.sort).toBeNull();
  });
});

describe("useColumnSort · switching columns", () => {
  it("resets to the new column's defaultDir when a different column is clicked", () => {
    const { result } = renderHook(() => useColumnSort(NUMERIC_ROWS, ACCESSORS));
    act(() => result.current.toggle("volume"));
    expect(result.current.sort?.dir).toBe("desc");
    act(() => result.current.toggle("cost"));
    expect(result.current.sort).toEqual({ key: "cost", dir: "asc" });
  });
});

describe("useColumnSort · null-last behaviour", () => {
  it("puts nulls last when sorting ascending", () => {
    const { result } = renderHook(() => useColumnSort(NULL_ROWS, ACCESSORS));
    act(() => result.current.toggle("cost"));
    const values = result.current.sorted.map((r) => r.value);
    const nullIdx = values.indexOf(null);
    const lastNonNull = values.filter((v) => v !== null).length - 1;
    expect(nullIdx).toBeGreaterThan(lastNonNull);
  });

  it("puts nulls last when sorting descending", () => {
    const { result } = renderHook(() => useColumnSort(NULL_ROWS, ACCESSORS));
    act(() => result.current.toggle("volume"));
    const values = result.current.sorted.map((r) => r.value);
    const nullCount = values.filter((v) => v === null).length;
    const nonNullCount = values.length - nullCount;
    // All non-null values must appear before any null value
    for (let i = 0; i < nonNullCount; i++) {
      expect(values[i]).not.toBeNull();
    }
    for (let i = nonNullCount; i < values.length; i++) {
      expect(values[i]).toBeNull();
    }
    // Non-null values should be in descending order
    const nonNulls = values.slice(0, nonNullCount) as number[];
    for (let i = 0; i < nonNulls.length - 1; i++) {
      expect(nonNulls[i]).toBeGreaterThanOrEqual(nonNulls[i + 1]);
    }
  });

  it("puts null strings last when sorting ascending", () => {
    const { result } = renderHook(() => useColumnSort(NULL_ROWS, ACCESSORS));
    act(() => result.current.toggle("label"));
    const labels = result.current.sorted.map((r) => r.label);
    const firstNull = labels.indexOf(null);
    const nonNullCount = labels.filter((l) => l !== null).length;
    expect(firstNull).toBeGreaterThanOrEqual(nonNullCount);
  });
});

// ---------------------------------------------------------------------------
// SortableTh — integration tests
// ---------------------------------------------------------------------------

function renderSortableTh({
  sortKey = "spend",
  activeKey = null as string | null,
  dir = "desc" as "asc" | "desc",
  onToggle = vi.fn(),
  onReset = vi.fn(),
} = {}) {
  const sort = activeKey ? { key: activeKey, dir } : null;
  return render(
    <table>
      <thead>
        <tr>
          <SortableTh
            sortKey={sortKey}
            sort={sort}
            onToggle={onToggle}
            onReset={onReset}
          >
            Spend
          </SortableTh>
        </tr>
      </thead>
    </table>
  );
}

describe("SortableTh · × reset button visibility", () => {
  it("does NOT render the × button when no column is sorted", () => {
    renderSortableTh({ activeKey: null });
    expect(screen.queryByTestId("sort-reset-spend")).toBeNull();
  });

  it("does NOT render the × button when a different column is active", () => {
    renderSortableTh({ activeKey: "cpa" });
    expect(screen.queryByTestId("sort-reset-spend")).toBeNull();
  });

  it("DOES render the × button when this column is the active sort", () => {
    renderSortableTh({ activeKey: "spend" });
    expect(screen.getByTestId("sort-reset-spend")).toBeTruthy();
  });
});

describe("SortableTh · × button calls onReset", () => {
  it("clicking × invokes onReset exactly once", () => {
    const onReset = vi.fn();
    renderSortableTh({ activeKey: "spend", onReset });
    fireEvent.click(screen.getByTestId("sort-reset-spend"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("SortableTh · × click does not also fire sort toggle", () => {
  it("stopPropagation prevents onToggle from firing when × is clicked", () => {
    const onToggle = vi.fn();
    const onReset = vi.fn();
    renderSortableTh({ activeKey: "spend", onToggle, onReset });
    fireEvent.click(screen.getByTestId("sort-reset-spend"));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("SortableTh · sort toggle button", () => {
  it("clicking the column header calls onToggle with the sortKey", () => {
    const onToggle = vi.fn();
    renderSortableTh({ activeKey: null, onToggle });
    fireEvent.click(screen.getByTestId("sort-spend"));
    expect(onToggle).toHaveBeenCalledWith("spend");
  });

  it("shows an ArrowUp icon when active and ascending", () => {
    renderSortableTh({ activeKey: "spend", dir: "asc" });
    const btn = screen.getByTestId("sort-spend");
    expect(btn.querySelector("svg")).toBeTruthy();
    const title = btn.getAttribute("title") ?? "";
    expect(title).toMatch(/ascending/i);
  });

  it("shows an ArrowDown icon when active and descending", () => {
    renderSortableTh({ activeKey: "spend", dir: "desc" });
    const btn = screen.getByTestId("sort-spend");
    expect(btn.querySelector("svg")).toBeTruthy();
    const title = btn.getAttribute("title") ?? "";
    expect(title).toMatch(/descending/i);
  });

  it("shows no sort icon when column is inactive", () => {
    renderSortableTh({ activeKey: null });
    const btn = screen.getByTestId("sort-spend");
    expect(btn.querySelector("svg")).toBeNull();
  });
});
