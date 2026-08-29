import { describe, expect, it } from "vitest";
import { formatMstRenderPolicy } from "../metrixSeedAdapter";

describe("formatMstRenderPolicy", () => {
  it("converts the structured MST format policy from the seed into display-safe text", () => {
    expect(
      formatMstRenderPolicy({
        mobile_first: true,
        primary_format: "4:5 (1080x1350)",
        secondary_format_required: "9:16 (1080x1920)",
        text_safe_zones_required_on_9x16: true,
      }),
    ).toBe(
      "Mobile-first · Primary format: 4:5 (1080x1350) · Secondary format required: 9:16 (1080x1920) · Text safe zones required on 9:16",
    );
  });

  it("preserves the legacy text form and rejects unsupported values", () => {
    expect(formatMstRenderPolicy("Use mobile-first formats.")).toBe("Use mobile-first formats.");
    // REVISED 2026-08-29: this asserted `toBe("")`, and the empty string was
    // the defect. Consumers all write `render_policy ?? "<fallback>"`, and
    // `??` does not catch "" — so on the six manual-import accounts (whose
    // seed carries `render_policy: ""`) every fallback was silently defeated
    // and four empty states rendered a bare title with no explanation. The
    // intent of this case — an unsupported value must never reach the UI —
    // is unchanged; "nothing to say" is now expressed as null so the
    // fallbacks actually fire.
    expect(formatMstRenderPolicy(null)).toBeNull();
    expect(formatMstRenderPolicy(undefined)).toBeNull();
    expect(formatMstRenderPolicy(123)).toBeNull();
    expect(formatMstRenderPolicy([])).toBeNull();
  });

  it("treats a blank or whitespace-only policy as nothing to say", () => {
    // The exact shape carried by every manual-import account in the seed.
    expect(formatMstRenderPolicy("")).toBeNull();
    expect(formatMstRenderPolicy("   ")).toBeNull();
    // An object with no renderable fields is the same claim by another route.
    expect(formatMstRenderPolicy({ unrelated: "value" })).toBeNull();
  });
});