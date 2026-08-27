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
    expect(formatMstRenderPolicy(null)).toBe("");
  });
});