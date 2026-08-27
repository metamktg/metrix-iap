// ─── A calendar day is not an instant ─────────────────────────────────
//
// date_start, date_end, window_start and window_end are Postgres `date`
// columns. They arrive as "YYYY-MM-DD" and name the CALENDAR DAY Meta
// attributed the spend to — they carry no timezone because they are not
// instants.
//
// Four separate files rendered them with `new Date(s).toLocaleDateString(...)`.
// `new Date("2026-08-01")` parses as UTC midnight, and toLocaleDateString
// then formats in the BROWSER's timezone — so for every viewer west of UTC,
// which is all of the Americas, an analysis window covering Aug 1–31 was
// labelled "Jul 31 – Aug 30".
//
// Off by one day, on the exact control a user consults to know what window
// they are looking at, and invisible to anyone developing in UTC. These
// cases run under a New York timezone so the defect actually reproduces —
// under UTC the old code passes and proves nothing.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fmtDay, fmtDayRange } from "../normalize";

const originalTZ = process.env.TZ;

beforeAll(() => {
  // UTC-4/-5. The old implementation renders the previous day here.
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

/** What the four call sites used to do, kept so the defect is demonstrable. */
function legacyFormat(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

describe("fmtDay", () => {
  it("names the day the data is actually attributed to", () => {
    expect(fmtDay("2026-08-01")).toBe("Aug 1");
    expect(fmtDay("2026-08-31")).toBe("Aug 31");
  });

  it("reproduces the defect it exists to fix", () => {
    // Guard the guard: if this stops shifting, the environment is not
    // exercising a western timezone and the tests below prove nothing.
    expect(legacyFormat("2026-08-01")).toBe("Jul 31");
    expect(fmtDay("2026-08-01")).not.toBe(legacyFormat("2026-08-01"));
  });

  it("does not shift across a month or year boundary", () => {
    expect(fmtDay("2026-01-01", { year: true })).toBe("Jan 1, 2026");
    expect(fmtDay("2026-03-01")).toBe("Mar 1");
  });

  it("includes the year only when asked", () => {
    expect(fmtDay("2026-08-01")).toBe("Aug 1");
    expect(fmtDay("2026-08-01", { year: true })).toBe("Aug 1, 2026");
  });

  it("tolerates a full timestamp by reading its date part", () => {
    // Not the intended input, but a caller passing one should not get a
    // day silently shifted by the local offset.
    expect(fmtDay("2026-08-01T23:30:00Z")).toBe("Aug 1");
  });

  it("returns empty for absent values rather than 'Invalid Date'", () => {
    expect(fmtDay(null)).toBe("");
    expect(fmtDay(undefined)).toBe("");
    expect(fmtDay("")).toBe("");
  });

  it("passes an unparseable value through instead of inventing a date", () => {
    expect(fmtDay("not-a-date")).toBe("not-a-date");
  });
});

describe("fmtDayRange", () => {
  it("renders both ends on the correct days", () => {
    expect(fmtDayRange("2026-08-01", "2026-08-31")).toBe("Aug 1 – Aug 31");
  });

  it("omits the separator when only one end exists", () => {
    expect(fmtDayRange("2026-08-01", null)).toBe("Aug 1");
    expect(fmtDayRange(null, "2026-08-31")).toBe("Aug 31");
    expect(fmtDayRange(null, null)).toBe("");
  });

  it("carries the year option through to both ends", () => {
    expect(fmtDayRange("2025-12-31", "2026-01-01", { year: true }))
      .toBe("Dec 31, 2025 – Jan 1, 2026");
  });
});
