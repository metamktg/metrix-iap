import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { correctCreativeAssetMappingsForAds } from "../creativeAssetMappingService";
import { getSupabase } from "../supabase";

const accountId = `creative_mapping_service_test_${Date.now()}`;
let importId = "";

describe("creativeAssetMappingService live identity correction", () => {
  beforeAll(async () => {
    const supabase = getSupabase();
    const account = await supabase.from("ad_accounts").insert({
      id: accountId,
      name: `Creative mapping service test ${Date.now()}`,
    });
    if (account.error) throw new Error(account.error.message);

    const manualImport = await supabase
      .from("manual_imports")
      .insert({
        account_id: accountId,
        kind: "creative_asset",
        filename: "chosen-b.png",
        content_type: "image/png",
        content: "\\x00",
        size_bytes: 1,
      })
      .select("id")
      .single();
    if (manualImport.error) throw new Error(manualImport.error.message);
    importId = String(manualImport.data.id);

    const ads = await supabase.from("ads").insert({
      account_id: accountId,
      ad_name: "Reused ad name",
      image_name: "other-a.png",
    });
    if (ads.error) throw new Error(ads.error.message);

    const instances = await supabase.from("ad_instances").insert([
      {
        account_id: accountId,
        meta_ad_id: "900000000000000001",
        ad_name: "Reused ad name",
        image_name: "other-a.png",
      },
      {
        account_id: accountId,
        meta_ad_id: "900000000000000002",
        ad_name: "Reused ad name",
        image_name: "chosen-b.png",
      },
    ]);
    if (instances.error) throw new Error(instances.error.message);
  }, 120_000);

  afterAll(async () => {
    const supabase = getSupabase();
    await supabase.from("manual_imports").delete().eq("account_id", accountId);
    await supabase.from("ads").delete().eq("account_id", accountId);
    await supabase.from("ad_accounts").delete().eq("id", accountId);
  }, 120_000);

  it("corrects only the selected Meta ad ID when two IDs share an ad name", async () => {
    await correctCreativeAssetMappingsForAds({
      accountId,
      importId,
      adNames: ["Reused ad name"],
      metaAdIds: ["900000000000000002"],
      correctedBy: "test@example.test",
    });

    const supabase = getSupabase();
    const mappings = await supabase
      .from("creative_asset_mappings")
      .select("id, normalized_meta_asset_name, manual_import_id, match_method")
      .eq("account_id", accountId);
    if (mappings.error) throw new Error(mappings.error.message);
    expect(mappings.data).toHaveLength(1);
    expect(mappings.data?.[0]).toMatchObject({
      normalized_meta_asset_name: "chosen b",
      manual_import_id: importId,
      match_method: "manual",
    });

    const instances = await supabase
      .from("ad_instances")
      .select("meta_ad_id, creative_asset_mapping_id")
      .eq("account_id", accountId)
      .order("meta_ad_id");
    if (instances.error) throw new Error(instances.error.message);
    expect(instances.data?.[0]).toMatchObject({
      meta_ad_id: "900000000000000001",
      creative_asset_mapping_id: null,
    });
    expect(instances.data?.[1]?.creative_asset_mapping_id).toBe(mappings.data?.[0]?.id);
  }, 120_000);
});