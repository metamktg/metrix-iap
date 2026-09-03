// ─── The Library grid's own controls ──────────────────────────────────
//
// The cell grid used to inherit its ordering from a funnel-stage config set
// on a different page, show ten tiles in a five-column grid, and page with
// prev/next only. Three things are under test here, and each one is a rule
// rather than a rendering:
//
//   · a grouping is offered only when the rows can back it;
//   · a page window always reaches both ends of the set;
//   · a group value is a value the row actually carried, never a guess.

import { describe, it, expect } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  pageWindow, usableGroupKeys, groupValueOf, groupLabelOf,
  LibraryGridControls, Pager,
} from "../LibraryGridControls";

describe("usableGroupKeys — only what the rows can back", () => {
  const row = (o: Record<string, string>) => o as never;

  it("offers a dimension with two distinct values across the rows", () => {
    const rows = [
      row({ book2_concept_name: "Rational Bridge" }),
      row({ book2_concept_name: "Time Efficiency" }),
      row({ book2_concept_name: "Rational Bridge" }),
    ];
    expect(usableGroupKeys(rows)).toContain("concept");
  });

  it("withholds a dimension every row leaves blank", () => {
    const rows = [row({ book2_concept_name: "A" }), row({ book2_concept_name: "B" })];
    expect(usableGroupKeys(rows)).not.toContain("hook");
  });

  it("withholds a dimension with only ONE value — grouping by it groups nothing", () => {
    const rows = [
      row({ book2_concept_name: "Only" }),
      row({ book2_concept_name: "Only" }),
      row({ book2_concept_name: "Only" }),
    ];
    expect(usableGroupKeys(rows)).not.toContain("concept");
  });

  it("withholds a dimension too sparse to group by — a wall of 'Not set' is a worse answer", () => {
    // Set on 1 of 9 rows: two distinct values would still leave eight
    // rows under one bucket.
    const rows = [
      row({ hook_variable: "HK_Problem" }),
      ...Array.from({ length: 8 }, () => row({})),
    ];
    expect(usableGroupKeys(rows)).not.toContain("hook");
  });

  it("says nothing about an empty set rather than offering everything", () => {
    expect(usableGroupKeys([])).toEqual([]);
  });
});

describe("groupValueOf — the value the row carried, or nothing", () => {
  it("reads the field the dimension names", () => {
    expect(groupValueOf({ book2_concept_name: "Rational Bridge" } as never, "concept")).toBe("Rational Bridge");
    expect(groupValueOf({ cta_variable: "CTA_Buy" } as never, "cta")).toBe("CTA_Buy");
  });

  it("treats blank and whitespace as absent, so a group is never named ''", () => {
    expect(groupValueOf({ book2_concept_name: "" } as never, "concept")).toBeNull();
    expect(groupValueOf({ book2_concept_name: "   " } as never, "concept")).toBeNull();
    expect(groupValueOf({} as never, "concept")).toBeNull();
  });

  it("has no value under 'no grouping'", () => {
    expect(groupValueOf({ book2_concept_name: "A" } as never, "none")).toBeNull();
  });

  it("names every dimension it offers", () => {
    for (const k of usableGroupKeys([
      { book2_concept_name: "A", hook_variable: "H1", tone_variable: "T1" },
      { book2_concept_name: "B", hook_variable: "H2", tone_variable: "T2" },
    ] as never[])) {
      expect(groupLabelOf(k).length).toBeGreaterThan(0);
    }
  });
});

describe("pageWindow — both ends always one click away", () => {
  it("lists every page when the set is small", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the first and last page visible from the middle", () => {
    const w = pageWindow(10, 20);
    expect(w[0]).toBe(1);
    expect(w[w.length - 1]).toBe(20);
    expect(w).toContain(10);
    expect(w).toContain(null); // elision on both sides
  });

  it("elides only where there is something to elide", () => {
    // Near the start there is no gap between 1 and the window.
    const w = pageWindow(2, 20);
    expect(w.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it("never emits a page outside the set", () => {
    for (const [cur, total] of [[1, 1], [1, 7], [4, 8], [8, 8], [50, 100]] as const) {
      for (const p of pageWindow(cur, total)) {
        if (p !== null) { expect(p).toBeGreaterThanOrEqual(1); expect(p).toBeLessThanOrEqual(total); }
      }
    }
  });
});

describe("Pager", () => {
  const props = { page: 3, totalPages: 9, onPage: () => {}, rangeStart: 51, rangeEnd: 75, total: 220 };

  it("renders nothing when there is only one page — a pager over one page is furniture", () => {
    const { container } = render(<Pager {...props} totalPages={1} />);
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("states the range it is showing out of the whole set", () => {
    render(<Pager {...props} />);
    expect(screen.getByText("51–75 of 220")).toBeTruthy();
    cleanup();
  });

  it("reaches the first and last page directly", () => {
    const seen: number[] = [];
    render(<Pager {...props} onPage={(p) => seen.push(p)} />);
    fireEvent.click(screen.getByLabelText("First page"));
    fireEvent.click(screen.getByLabelText("Last page"));
    expect(seen).toEqual([1, 9]);
    cleanup();
  });

  it("marks the current page for assistive tech", () => {
    render(<Pager {...props} />);
    expect(screen.getByLabelText("Page 3").getAttribute("aria-current")).toBe("page");
    cleanup();
  });
});

describe("LibraryGridControls", () => {
  const base = {
    sortKey: "spend" as const, sortDir: "desc" as const, onSort: () => {},
    groupKey: "none" as const, groupOptions: ["concept", "hook"] as never,
    onGroup: () => {}, pageSize: 25 as const, onPageSize: () => {},
    shown: 25, total: 88,
  };

  it("offers every sort key the row data can compute", () => {
    render(<LibraryGridControls {...base} />);
    const sel = screen.getByTestId("library-sort-key") as HTMLSelectElement;
    // Spend · Results · Cost per result · Link CTR · Result rate ·
    // Impressions · Reach · Link clicks — every key sortValueForCell can
    // compute, and nothing it cannot.
    expect(sel.options.length).toBe(8);
    expect([...sel.options].map((o) => o.textContent)).toContain("Cost per result");
    cleanup();
  });

  it("flips direction without changing the key", () => {
    const calls: [string, string][] = [];
    render(<LibraryGridControls {...base} onSort={(k, d) => calls.push([k, d])} />);
    fireEvent.click(screen.getByTestId("library-sort-dir"));
    expect(calls).toEqual([["spend", "asc"]]);
    cleanup();
  });

  it("hides the group control entirely when no dimension can back it", () => {
    render(<LibraryGridControls {...base} groupOptions={[] as never} />);
    expect(screen.queryByTestId("library-group-key")).toBeNull();
    cleanup();
  });

  it("offers an All option, so a reader is never forced to page", () => {
    render(<LibraryGridControls {...base} />);
    expect(screen.getByText("All")).toBeTruthy();
    cleanup();
  });

  it("says how much of the set is on screen", () => {
    render(<LibraryGridControls {...base} />);
    expect(screen.getByTestId("library-shown-count").textContent).toBe("25 of 88 cells");
    cleanup();
  });

  it("drops the 'of N' when everything is shown", () => {
    render(<LibraryGridControls {...base} shown={88} />);
    expect(screen.getByTestId("library-shown-count").textContent).toBe("88 cells");
    cleanup();
  });
});
