import { describe, it, expect } from "vitest";
import {
  sanitizeMetaPayload,
  normalizeInsightRow,
  buildMetricMappingStatus,
} from "../metaGraph";
import { encryptToken, decryptToken } from "../metaCrypto";

describe("sanitizeMetaPayload", () => {
  it("strips access_token from paging.next URLs while keeping cursors", () => {
    const payload = {
      data: [{ spend: "12.34" }],
      paging: {
        cursors: { before: "BEF", after: "AFT" },
        next: "https://graph.facebook.com/v23.0/act_1/insights?access_token=EAABsecret123&after=AFT&limit=500",
      },
    };
    const clean = sanitizeMetaPayload(payload);
    expect(JSON.stringify(clean)).not.toContain("EAABsecret123");
    expect(clean.paging.next).toContain("access_token=REDACTED");
    expect(clean.paging.next).toContain("after=AFT");
    expect(clean.paging.cursors.after).toBe("AFT");
    // Original untouched
    expect(payload.paging.next).toContain("EAABsecret123");
  });

  it("redacts values under token-named keys anywhere in the tree", () => {
    const clean = sanitizeMetaPayload({
      nested: { access_token: "EAABplain", fb_exchange_token: "EAABother" },
      ok: "regular string",
    });
    expect(clean.nested.access_token).toBe("REDACTED");
    expect(clean.nested.fb_exchange_token).toBe("REDACTED");
    expect(clean.ok).toBe("regular string");
  });

  it("handles arrays, nulls, and numbers without mutation", () => {
    const input = { a: [1, null, { access_token: "x" }], b: 5, c: null };
    const clean = sanitizeMetaPayload(input);
    expect(clean.a[0]).toBe(1);
    expect(clean.a[1]).toBeNull();
    expect((clean.a[2] as { access_token: string }).access_token).toBe("REDACTED");
    expect(clean.b).toBe(5);
    expect(clean.c).toBeNull();
  });
});

describe("normalizeInsightRow", () => {
  const baseRaw = {
    date_start: "2026-06-10",
    date_stop: "2026-06-10",
    campaign_id: "c1",
    campaign_name: "Campaign One",
    adset_id: "s1",
    adset_name: "Set One",
    ad_id: "a1",
    ad_name: "Ad One",
    spend: "12.5",
    impressions: "1000",
    clicks: "40",
    ctr: "4.0",
    quality_ranking: "ABOVE_AVERAGE",
    actions: [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
      { action_type: "link_click", value: "38" },
    ],
    purchase_roas: [{ action_type: "omni_purchase", value: "2.75" }],
  };

  it("flattens demographic rows with numeric coercion and dot→underscore action keys", () => {
    const row = normalizeInsightRow(
      { ...baseRaw, age: "25-34", gender: "female", body_asset: { id: "b1", text: "Book more gigs" } },
      "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
    );
    expect(row.date).toBe("2026-06-10");
    expect(row.ad_id).toBe("a1");
    expect(row.metrics["spend"]).toBe(12.5);
    expect(row.metrics["impressions"]).toBe(1000);
    expect(row.metrics["quality_ranking"]).toBe("ABOVE_AVERAGE");
    const actions = row.metrics["actions"] as Record<string, number>;
    expect(actions["offsite_conversion_fb_pixel_purchase"]).toBe(3);
    expect(actions["link_click"]).toBe(38);
    const roas = row.metrics["purchase_roas"] as Record<string, number>;
    expect(roas["omni_purchase"]).toBe(2.75);
    expect(row.dimensions).toEqual({
      age: "25-34",
      gender: "female",
      text: "Book more gigs",
      body_asset_id: "b1",
    });
  });

  it("maps device/placement/platform dimensions", () => {
    const row = normalizeInsightRow(
      {
        ...baseRaw,
        impression_device: "iphone",
        publisher_platform: "instagram",
        platform_position: "instagram_reels",
      },
      "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
    );
    expect(row.dimensions).toEqual({
      impression_device: "iphone",
      platform: "instagram",
      placement: "instagram_reels",
    });
  });

  it("never fabricates metrics: absent fields stay absent, bad numbers become null", () => {
    const row = normalizeInsightRow(
      { date_start: "2026-06-10", spend: "not-a-number", age: "18-24", gender: "male" },
      "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
    );
    expect(row.metrics["spend"]).toBeNull();
    expect("impressions" in row.metrics).toBe(false);
    expect("actions" in row.metrics).toBe(false);
    expect(row.dimensions["text"]).toBeNull();
  });
});

describe("buildMetricMappingStatus", () => {
  it("reports mapped, missing, and unavailable honestly", () => {
    const rows = [
      normalizeInsightRow(
        {
          date_start: "2026-06-10",
          spend: "10",
          impressions: "500",
          actions: [{ action_type: "link_click", value: "5" }],
          age: "25-34",
          gender: "female",
        },
        "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
      ),
    ];
    const status = buildMetricMappingStatus(rows) as {
      mapped: string[];
      mapped_nested: Record<string, string[]>;
      missing: string[];
      unavailable: string[];
      derived: string[];
    };
    expect(status.mapped).toContain("spend");
    expect(status.mapped).toContain("impressions");
    expect(status.mapped_nested["actions"]).toEqual(["link_click"]);
    expect(status.missing).toContain("clicks");
    expect(status.missing).toContain("quality_ranking");
    expect(status.unavailable).toContain("purchase_roas");
    expect(status.derived).toEqual([]);
  });
});

describe("metaCrypto token encryption", () => {
  it("round-trips a token and never stores it in plaintext", () => {
    process.env["TOKEN_ENCRYPTION_KEY"] = "test-key-for-unit-tests-only-0123456789";
    const token = "EAABlongLivedUserToken";
    const encrypted = encryptToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptToken(encrypted)).toBe(token);
    // unique IV per call
    expect(encryptToken(token)).not.toBe(encrypted);
  });
});
