// Unit tests for the meta_ads_export.json parsing + validation rules.
// These are pure functions — no Supabase connection required.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  META_EXPORT_FILE,
  exportAccountMismatchError,
  loadMetaAdsExport,
  parseMetaAdsExportDoc,
  resolveLdMetaAdId,
  unmatchedExportAdNames,
} from "./metaAdsExport";

describe("parseMetaAdsExportDoc", () => {
  it("strips the act_ prefix from the account id", () => {
    const parsed = parseMetaAdsExportDoc({ meta_ad_account_id: "act_1234567890", ads: [] });
    expect(parsed.metaAdAccountId).toBe("1234567890");
  });

  it("keeps an unprefixed account id as-is", () => {
    const parsed = parseMetaAdsExportDoc({ meta_ad_account_id: "1234567890", ads: [] });
    expect(parsed.metaAdAccountId).toBe("1234567890");
  });

  it("returns null account id when absent", () => {
    expect(parseMetaAdsExportDoc({ ads: [] }).metaAdAccountId).toBeNull();
    expect(parseMetaAdsExportDoc({ meta_ad_account_id: null, ads: [] }).metaAdAccountId).toBeNull();
  });

  it("coerces a numeric account id to string", () => {
    const parsed = parseMetaAdsExportDoc({ meta_ad_account_id: 1234567890, ads: [] });
    expect(parsed.metaAdAccountId).toBe("1234567890");
  });

  it("skips entries without an ad_name", () => {
    const parsed = parseMetaAdsExportDoc({
      ads: [
        { meta_ad_id: "111", creative_asset_url: "https://a" },
        { ad_name: null, meta_ad_id: "222" },
        { ad_name: "", meta_ad_id: "333" },
        { ad_name: "Kept", meta_ad_id: "444" },
      ],
    });
    expect([...parsed.byAdName.keys()]).toEqual(["Kept"]);
  });

  it("skips entries with neither meta_ad_id nor creative_asset_url", () => {
    const parsed = parseMetaAdsExportDoc({
      ads: [
        { ad_name: "Empty" },
        { ad_name: "AlsoEmpty", meta_ad_id: null, creative_asset_url: null },
        { ad_name: "IdOnly", meta_ad_id: "111" },
        { ad_name: "UrlOnly", creative_asset_url: "https://cdn/x.jpg" },
      ],
    });
    expect(parsed.byAdName.has("Empty")).toBe(false);
    expect(parsed.byAdName.has("AlsoEmpty")).toBe(false);
    expect(parsed.byAdName.get("IdOnly")).toEqual({ metaAdId: "111", creativeAssetUrl: null });
    expect(parsed.byAdName.get("UrlOnly")).toEqual({ metaAdId: null, creativeAssetUrl: "https://cdn/x.jpg" });
  });

  it("keeps both id and url when present", () => {
    const parsed = parseMetaAdsExportDoc({
      ads: [{ ad_name: "Full", meta_ad_id: "23851234567890123", creative_asset_url: "https://cdn/full.mp4" }],
    });
    expect(parsed.byAdName.get("Full")).toEqual({
      metaAdId: "23851234567890123",
      creativeAssetUrl: "https://cdn/full.mp4",
    });
  });

  it("handles a doc without an ads array", () => {
    const parsed = parseMetaAdsExportDoc({ meta_ad_account_id: "act_9" });
    expect(parsed.metaAdAccountId).toBe("9");
    expect(parsed.byAdName.size).toBe(0);
  });
});

describe("loadMetaAdsExport", () => {
  const dirs: string[] = [];
  const makeDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "meta-export-test-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns an empty export when the file is absent", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const parsed = loadMetaAdsExport(makeDir(), "test-account");
    expect(parsed.metaAdAccountId).toBeNull();
    expect(parsed.byAdName.size).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("No meta_ads_export.json for test-account"));
  });

  it("parses a real file, stripping act_ and skipping empty entries", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = makeDir();
    writeFileSync(join(dir, META_EXPORT_FILE), JSON.stringify({
      meta_ad_account_id: "act_555000111",
      ads: [
        { ad_name: "Ad A", meta_ad_id: "111", creative_asset_url: "https://cdn/a.jpg" },
        { ad_name: "Ad B" },
        { meta_ad_id: "999" },
      ],
    }));
    const parsed = loadMetaAdsExport(dir, "test-account");
    expect(parsed.metaAdAccountId).toBe("555000111");
    expect([...parsed.byAdName.keys()]).toEqual(["Ad A"]);
  });

  it("tolerates bare NaN tokens in the file", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = makeDir();
    writeFileSync(
      join(dir, META_EXPORT_FILE),
      '{"meta_ad_account_id": "act_1", "ads": [{"ad_name": "A", "meta_ad_id": "111", "creative_asset_url": NaN}]}',
    );
    const parsed = loadMetaAdsExport(dir, "test-account");
    expect(parsed.byAdName.get("A")).toEqual({ metaAdId: "111", creativeAssetUrl: null });
  });
});

describe("exportAccountMismatchError", () => {
  it("returns an error message when the export names a different account", () => {
    const msg = exportAccountMismatchError("111", "222", "LittleData");
    expect(msg).toContain("names Meta ad account 111");
    expect(msg).toContain("account 222");
    expect(msg).toContain("Refusing to import");
  });

  it("returns null when the ids match", () => {
    expect(exportAccountMismatchError("111", "111", "LittleData")).toBeNull();
  });

  it("returns null when either id is absent (nothing to compare)", () => {
    expect(exportAccountMismatchError(null, "222", "LittleData")).toBeNull();
    expect(exportAccountMismatchError("111", null, "LittleData")).toBeNull();
    expect(exportAccountMismatchError(null, null, "LittleData")).toBeNull();
  });
});

describe("resolveLdMetaAdId", () => {
  it("uses the export id when the CSV observed it for this ad name", () => {
    const r = resolveLdMetaAdId(new Set(["111", "222"]), "222");
    expect(r).toEqual({ metaAdId: "222", source: "export", ignoredExportId: null });
  });

  it("disambiguates reused ad names via the export id", () => {
    // Name reused across campaigns → two CSV ad ids → CSV rule alone gives
    // NULL; the export pins one of them.
    const r = resolveLdMetaAdId(new Set(["111", "222"]), "111");
    expect(r.metaAdId).toBe("111");
    expect(r.source).toBe("export");
  });

  it("ignores an export id the CSV never observed, falling back to the unique CSV id", () => {
    const r = resolveLdMetaAdId(new Set(["111"]), "999");
    expect(r).toEqual({ metaAdId: "111", source: "csv_unique", ignoredExportId: "999" });
  });

  it("ignores an unobserved export id and yields NULL when CSV ids are ambiguous", () => {
    const r = resolveLdMetaAdId(new Set(["111", "222"]), "999");
    expect(r).toEqual({ metaAdId: null, source: null, ignoredExportId: "999" });
  });

  it("uses the unique CSV id when no export id exists", () => {
    const r = resolveLdMetaAdId(new Set(["111"]), null);
    expect(r).toEqual({ metaAdId: "111", source: "csv_unique", ignoredExportId: null });
    expect(resolveLdMetaAdId(new Set(["111"]), undefined).metaAdId).toBe("111");
  });

  it("yields NULL when no export id exists and the CSV ids are ambiguous", () => {
    const r = resolveLdMetaAdId(new Set(["111", "222"]), null);
    expect(r).toEqual({ metaAdId: null, source: null, ignoredExportId: null });
  });

  it("ignores an export id when the CSV observed no ids at all", () => {
    const r = resolveLdMetaAdId(new Set(), "999");
    expect(r).toEqual({ metaAdId: null, source: null, ignoredExportId: "999" });
  });
});

describe("unmatchedExportAdNames", () => {
  it("returns export names the CSV never observed", () => {
    const csvAds = new Set(["Ad A", "Ad B"]);
    const unmatched = unmatchedExportAdNames(["Ad A", "Ghost Ad", "Ad B", "Another Ghost"], (n) => csvAds.has(n));
    expect(unmatched).toEqual(["Ghost Ad", "Another Ghost"]);
  });

  it("returns empty when everything matches", () => {
    const csvAds = new Set(["Ad A"]);
    expect(unmatchedExportAdNames(["Ad A"], (n) => csvAds.has(n))).toEqual([]);
  });
});
