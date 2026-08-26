// ─── Ephemeral upload warnings, made durable ──────────────────────────
//
// Upload-time warnings used to be produced by validation, returned once in
// the staging response, rendered in the upload dialog, and then gone when it
// closed. A file whose ID columns a Sheets round-trip had blanked, or whose
// headers Meta's exporter duplicated, said so exactly once — to whoever was
// at the keyboard — and never again, including at the analysis run days later
// that actually consumed it. A true-positive warning visible only once is a
// suppressed warning on the second look, which is the honesty invariant.
//
// They are now persisted on manual_imports and rendered here. The subtle half:
// `null` (never recorded) and `[]` (validation ran, found none) are different
// claims, and rendering the first as "no warnings" would assert a clean bill
// of health nobody ever issued.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ImportConfidenceReport } from "../ImportConfidenceReport";

type Imp = Parameters<typeof ImportConfidenceReport>[0]["imports"][number];

const mapping = [
  { canonical: "Day", found_as: "Day", confidence: 1, method: "id", tier: "exact", is_required: true },
  { canonical: "Ad name", found_as: "Ad name", confidence: 1, method: "id", tier: "exact", is_required: true },
];

const imp = (over: Partial<Imp> = {}): Imp =>
  ({
    id: "i1",
    account_id: "acct",
    kind: "performance_demo_csv",
    filename: "demo.csv",
    content_type: "text/csv",
    size_bytes: 100,
    ad_names: [],
    match_method: null,
    status: "staged",
    manual_analysis_run_id: null,
    created_at: "2026-08-01T00:00:00Z",
    mapping_summary: mapping,
    upload_warnings: null,
    ...over,
  }) as unknown as Imp;

// A single CSV import renders with `defaultOpen`, so the detail panel is
// already expanded — clicking the header here would COLLAPSE it.
const open = () => {};

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe("persisted upload warnings", () => {
  it("renders warnings recorded at upload time, long after the dialog closed", () => {
    render(
      <ImportConfidenceReport
        imports={[
          imp({
            upload_warnings: [
              "3 ID columns were blank — likely a Google Sheets round-trip.",
              "Duplicate header set detected in Meta's pivot export.",
            ],
          }),
        ]}
      />
    );
    open();
    expect(screen.getByText("Upload warnings (2)")).toBeTruthy();
    expect(screen.getByText("3 ID columns were blank — likely a Google Sheets round-trip.")).toBeTruthy();
    expect(screen.getByText("Duplicate header set detected in Meta's pivot export.")).toBeTruthy();
  });

  it("counts them on the collapsed card face, so they are visible without opening it", () => {
    render(<ImportConfidenceReport imports={[imp({ upload_warnings: ["one problem"] })]} />);
    // Singular, and present before any interaction.
    expect(screen.getByText(/1 upload warning(?!s)/)).toBeTruthy();
  });

  it("says warnings were NOT RECORDED for a file staged before they were persisted", () => {
    // null must never render as "no warnings" — that asserts a clean bill of
    // health nobody issued.
    render(<ImportConfidenceReport imports={[imp({ upload_warnings: null })]} />);
    open();
    expect(screen.getByText(/weren't recorded for this file/)).toBeTruthy();
    expect(screen.queryByText(/Upload warnings \(/)).toBeNull();
  });

  it("distinguishes 'validated and clean' from 'never recorded'", () => {
    // [] is a real positive finding: validation ran and found nothing.
    render(<ImportConfidenceReport imports={[imp({ upload_warnings: [] })]} />);
    open();
    expect(screen.queryByText(/weren't recorded for this file/)).toBeNull();
    expect(screen.queryByText(/Upload warnings \(/)).toBeNull();
  });
});
