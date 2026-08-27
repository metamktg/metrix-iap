// ─── Every dimension key must exist on a real row ─────────────────────
//
// Written because three of the first five keys did not. `concept`,
// `funnel_stage`, `result_type` and `device_platform` were all plausible and
// all wrong — the rows carry `book2_concept_name`, `funnel_stage_variable`,
// `Result type` (with a space, as Meta exports it) and `device`.
//
// A wrong key does not throw. distinctCount reads undefined for every row,
// returns 0, and whyNotDimension disables the option with "these rows carry
// no value for this dimension" — which is indistinguishable from an account
// that genuinely has one placement. The control would look correct and be
// permanently, silently empty.
//
// So the keys are checked against the checked-in seed bundle rather than
// against the TypeScript types: a type says what a row COULD have, and an
// optional field that nothing ever populates passes a type check and fails
// here.

import { describe, it, expect } from "vitest";
import seed from "../../../test-fixtures/metrix_seed_bundle.json";
import { dimensionsFor } from "../breakdownDimensions";
import type { DataShape } from "../viewSupport";

/** Every row array in the bundle, flattened, keyed by the shape it backs. */
function rowsForShape(shape: DataShape): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === shape && Array.isArray(v)) out.push(...(v as Record<string, unknown>[]));
        else walk(v);
      }
    }
  };
  walk(seed);
  return out;
}

const SHAPES: DataShape[] = [
  "performance_by_cell", "v3_variable_performance", "top_checkout_variables",
  "demographic_registration_signal", "v3_placement_signal", "device_delivery_signal",
];

describe("breakdown dimension keys exist on the real seed rows", () => {
  for (const shape of SHAPES) {
    const dims = dimensionsFor(shape);
    if (dims.length === 0) continue;

    it(`${shape}: the fixture carries rows for it`, () => {
      // If this fails the assertions below prove nothing — an empty row set
      // makes every key "absent" and the test would pass vacuously.
      expect(rowsForShape(shape).length, `no ${shape} rows in the seed fixture`).toBeGreaterThan(0);
    });

    for (const d of dims) {
      it(`${shape}: "${d.key}" is a field the rows actually have`, () => {
        const rows = rowsForShape(shape);
        if (rows.length === 0) return;
        const present = rows.some((r) => Object.prototype.hasOwnProperty.call(r, d.key));
        expect(
          present,
          `"${d.key}" appears on no ${shape} row. distinctCount would return 0 for every ` +
            `account, so the option would disable itself with "these rows carry no value" — ` +
            `indistinguishable from real data with one value. Row keys: ` +
            `${Object.keys(rows[0]!).join(", ")}`,
        ).toBe(true);
      });
    }
  }
});
