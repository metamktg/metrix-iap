import { describe, expect, it } from "vitest";
import { CampaignManifestSchema } from "../src/schemas.js";
import { buildTestManifest } from "./fixtures.js";

describe("CampaignManifestSchema", () => {
  it("accepts a well-formed manifest", () => {
    const result = CampaignManifestSchema.safeParse(buildTestManifest());
    expect(result.success).toBe(true);
  });

  it("rejects any campaign status other than PAUSED", () => {
    const manifest = buildTestManifest();
    // @ts-expect-error intentionally invalid for the test
    manifest.campaign.status = "ACTIVE";
    const result = CampaignManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it("rejects any adset status other than PAUSED", () => {
    const manifest = buildTestManifest();
    // @ts-expect-error intentionally invalid for the test
    manifest.adset.status = "ACTIVE";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects any ad status other than PAUSED", () => {
    const manifest = buildTestManifest();
    // @ts-expect-error intentionally invalid for the test
    manifest.ads[0].status = "ACTIVE";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects filenames that don't match <CONCEPT_ID>_4x5.png", () => {
    const manifest = buildTestManifest();
    manifest.ads[0].filename = "C5D_final_v2.png";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects filenames missing the 4x5 suffix", () => {
    const manifest = buildTestManifest();
    manifest.ads[0].filename = "C5D.png";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects concept ids that don't match ^C[0-9]+[A-D]$", () => {
    const manifest = buildTestManifest();
    manifest.ads[0].concept_id = "concept-5d";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects an unlisted CTA", () => {
    const manifest = buildTestManifest();
    // @ts-expect-error intentionally invalid for the test
    manifest.ads[0].cta = "CLICK_HERE_NOW";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects a non-URL destination", () => {
    const manifest = buildTestManifest();
    manifest.ads[0].destination_url = "not-a-url";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects empty primary text or headline", () => {
    const manifest = buildTestManifest();
    manifest.ads[0].primary_text = "";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("accepts a placeholder string in daily_budget_minor_units at the shape layer (safety.ts rejects it)", () => {
    const manifest = buildTestManifest();
    manifest.adset.daily_budget_minor_units = "REPLACE_WITH_APPROVED_BUDGET";
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("requires at least one ad", () => {
    const manifest = buildTestManifest({ ads: [] });
    expect(CampaignManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
