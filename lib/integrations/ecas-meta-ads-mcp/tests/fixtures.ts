import type { EcasConfig } from "../src/config.js";
import type { CampaignManifest } from "../src/schemas.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A minimal-but-parseable PNG: real signature + IHDR chunk with the given
 * dimensions. Not a complete, renderable PNG (no IDAT/IEND, no CRCs) — the
 * server's reader (src/image.ts) only ever looks at bytes 0-23, so that's
 * all a test fixture needs to exercise it honestly.
 */
export function makeMinimalPng(width: number, height: number): Buffer {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  const chunkLength = Buffer.alloc(4);
  chunkLength.writeUInt32BE(ihdrData.length, 0);
  return Buffer.concat([PNG_SIGNATURE, chunkLength, Buffer.from("IHDR", "ascii"), ihdrData]);
}

export function buildTestConfig(overrides: Partial<EcasConfig> = {}, creativeDir = "/nonexistent"): EcasConfig {
  return {
    graphVersion: "v21.0",
    accessToken: "test-token-not-real",
    appId: undefined,
    appSecret: undefined,
    adAccountId: "act_1234567890",
    pageId: "page_111",
    instagramActorId: "ig_222",
    pixelId: "pixel_333",
    allowedDestinationHosts: new Set(["eastcoastartstudio.com", "www.eastcoastartstudio.com"]),
    maxDailyBudgetMinorUnits: 10000,
    mutationLogPath: "./logs/meta-mutations.jsonl",
    creativeDir,
    ...overrides,
  };
}

export function buildTestManifest(overrides: Partial<CampaignManifest> = {}): CampaignManifest {
  return {
    schema_version: "1.0",
    client: "East Coast Art Studio",
    mode: "dry_run",
    account: {
      ad_account_id: "act_1234567890",
      page_id: "page_111",
      instagram_actor_id: "ig_222",
      pixel_id: "pixel_333",
    },
    campaign: {
      name: "ECAS | MST Sprint 2 | Static | 2026-07",
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
    },
    adset: {
      name: "ECAS | Prospecting | Women 45+ | Canada-US",
      status: "PAUSED",
      daily_budget_minor_units: 5000,
      billing_event: "IMPRESSIONS",
      optimization_goal: "OFFSITE_CONVERSIONS",
      conversion_event: "PURCHASE",
      destination_type: "WEBSITE",
      attribution_spec: "7d_click_1d_view",
      targeting: { age_min: 45, geo_locations: { countries: ["CA", "US"] } },
    },
    ads: [
      {
        concept_id: "C5D",
        filename: "C5D_4x5.png",
        name: "C5D_4x5",
        status: "PAUSED",
        primary_text: "Gallery-grade prints of 3,000+ cities.",
        headline: "3,000+ Cities. Real Wood.",
        description: "25% off this week only.",
        cta: "SHOP_NOW",
        destination_url: "https://eastcoastartstudio.com/collections/best-sellers",
        url_tags: "utm_source=meta&utm_medium=paid_social&utm_campaign=ecas_mst_sprint2&utm_content=C5D_4x5",
      },
    ],
    ...overrides,
  };
}
