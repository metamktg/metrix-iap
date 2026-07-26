import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isUnresolvedPlaceholder, resolveIdentityToken, validateManifest } from "../src/safety.js";
import { buildTestConfig, buildTestManifest, makeMinimalPng } from "./fixtures.js";

let creativeDir: string;

beforeEach(async () => {
  creativeDir = await mkdtemp(join(tmpdir(), "ecas-mcp-test-"));
  await writeFile(join(creativeDir, "C5D_4x5.png"), makeMinimalPng(1080, 1350));
});

afterEach(async () => {
  await rm(creativeDir, { recursive: true, force: true });
});

function issueCodesOf(result: Awaited<ReturnType<typeof validateManifest>>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe("resolveIdentityToken / isUnresolvedPlaceholder", () => {
  it("resolves a known ${META_X} token to the configured value", () => {
    const config = buildTestConfig();
    expect(resolveIdentityToken("${META_AD_ACCOUNT_ID}", config)).toBe(config.adAccountId);
  });

  it("leaves an unknown token untouched", () => {
    const config = buildTestConfig();
    expect(resolveIdentityToken("${META_SOME_UNKNOWN_ID}", config)).toBe("${META_SOME_UNKNOWN_ID}");
  });

  it("flags REPLACE_WITH_ and unresolved ${...} strings as placeholders", () => {
    expect(isUnresolvedPlaceholder("REPLACE_WITH_APPROVED_BUDGET")).toBe(true);
    expect(isUnresolvedPlaceholder("${META_SOME_UNKNOWN_ID}")).toBe(true);
    expect(isUnresolvedPlaceholder("act_1234567890")).toBe(false);
  });
});

describe("validateManifest", () => {
  it("passes a fully valid manifest with a matching creative file", async () => {
    const config = buildTestConfig({}, creativeDir);
    const result = await validateManifest(buildTestManifest(), config);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.resolvedAccount.ad_account_id).toBe(config.adAccountId);
  });

  it("resolves ${META_X} account tokens and still passes", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest({
      account: {
        ad_account_id: "${META_AD_ACCOUNT_ID}",
        page_id: "${META_PAGE_ID}",
        instagram_actor_id: "${META_INSTAGRAM_ACTOR_ID}",
        pixel_id: "${META_PIXEL_ID}",
      },
    });
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(true);
  });

  it("rejects a manifest carrying an unresolved placeholder", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest();
    manifest.ads[0].primary_text = "REPLACE_WITH_APPROVED_PRIMARY_TEXT";
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("unresolved_placeholder");
  });

  it("rejects a manifest referencing an unknown template token as an account id", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest({
      account: {
        ad_account_id: "${META_SOME_UNKNOWN_ID}",
        page_id: config.pageId,
        instagram_actor_id: config.instagramActorId,
        pixel_id: config.pixelId,
      },
    });
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("unresolved_placeholder");
  });

  it("rejects a manifest targeting the wrong ad account", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest({
      account: {
        ad_account_id: "act_9999999999",
        page_id: config.pageId,
        instagram_actor_id: config.instagramActorId,
        pixel_id: config.pixelId,
      },
    });
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("identity_mismatch");
  });

  it("rejects a manifest targeting the wrong Page, Instagram actor, or pixel", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest({
      account: {
        ad_account_id: config.adAccountId,
        page_id: "page_WRONG",
        instagram_actor_id: "ig_WRONG",
        pixel_id: "pixel_WRONG",
      },
    });
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    const codes = issueCodesOf(result);
    expect(codes.filter((code) => code === "identity_mismatch")).toHaveLength(3);
  });

  it("rejects a destination outside the allowlist", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest();
    manifest.ads[0].destination_url = "https://not-ecas.example.com/sale";
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("destination_not_allowed");
  });

  it("rejects a budget above the configured ceiling", async () => {
    const config = buildTestConfig({ maxDailyBudgetMinorUnits: 5000 }, creativeDir);
    const manifest = buildTestManifest();
    manifest.adset.daily_budget_minor_units = 50000;
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("budget_exceeds_ceiling");
  });

  it("rejects duplicate concept IDs within the same batch", async () => {
    const config = buildTestConfig({}, creativeDir);
    await writeFile(join(creativeDir, "C5D_4x5.png"), makeMinimalPng(1080, 1350));
    const manifest = buildTestManifest({
      ads: [buildTestManifest().ads[0], { ...buildTestManifest().ads[0], name: "C5D_4x5_dup" }],
    });
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("duplicate_concept_id");
    expect(issueCodesOf(result)).toContain("duplicate_filename");
  });

  it("rejects a missing creative file", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest();
    manifest.ads[0].concept_id = "C9Z";
    manifest.ads[0].filename = "C9Z_4x5.png";
    manifest.ads[0].name = "C9Z_4x5";
    manifest.ads[0].url_tags = "utm_source=meta&utm_medium=paid_social&utm_campaign=ecas_mst_sprint2&utm_content=C9Z_4x5";
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("missing_file");
  });

  it("rejects a creative file that isn't a 4:5 aspect ratio", async () => {
    await writeFile(join(creativeDir, "C5D_4x5.png"), makeMinimalPng(1000, 1000));
    const config = buildTestConfig({}, creativeDir);
    const result = await validateManifest(buildTestManifest(), config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("unsupported_image_dimensions");
  });

  it("rejects a file that isn't actually a PNG", async () => {
    await writeFile(join(creativeDir, "C5D_4x5.png"), Buffer.from("not a png"));
    const config = buildTestConfig({}, creativeDir);
    const result = await validateManifest(buildTestManifest(), config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("unsupported_image_type");
  });

  it("rejects a missing or mismatched utm_content", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest();
    manifest.ads[0].url_tags = "utm_source=meta&utm_medium=paid_social";
    const missingResult = await validateManifest(manifest, config);
    expect(issueCodesOf(missingResult)).toContain("missing_utm_content");

    manifest.ads[0].url_tags = "utm_source=meta&utm_content=WRONG_CONTENT";
    const mismatchResult = await validateManifest(manifest, config);
    expect(issueCodesOf(mismatchResult)).toContain("utm_content_mismatch");
  });

  it("rejects a filename that doesn't match its own concept_id", async () => {
    await writeFile(join(creativeDir, "C6B_4x5.png"), makeMinimalPng(1080, 1350));
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest();
    manifest.ads[0].filename = "C6B_4x5.png";
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("concept_filename_mismatch");
  });

  it("rejects an unsupported objective/optimization/billing/conversion/destination combination", async () => {
    const config = buildTestConfig({}, creativeDir);
    const manifest = buildTestManifest();
    manifest.campaign.objective = "OUTCOME_TRAFFIC";
    manifest.adset.conversion_event = "ADD_TO_CART";
    const result = await validateManifest(manifest, config);
    expect(result.valid).toBe(false);
    expect(issueCodesOf(result)).toContain("unsupported_objective_combination");
  });
});
