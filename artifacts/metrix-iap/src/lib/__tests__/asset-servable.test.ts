// ─── A URL is not the same as a file that exists ──────────────────────
//
// ads.asset_servable is the importer's answer to "is the asset actually
// there". It defaults to false and is set true only once the importer has
// confirmed the file. A row can carry a creative_asset_url whose asset was
// never uploaded, or has since gone.
//
// primaryAdForCell preferred any row with a URL, so those rows were picked
// first and rendered as an <img> that fails to load — which reads as
// "Metrix lost your creative" rather than "this one was never uploaded".

import { describe, it, expect } from "vitest";
import { primaryAdForCell, cardFromCell } from "../creative-assembly";

const ad = (over: Record<string, unknown>) =>
  ({
    ad_name: "A", book: null, cell: "C2B", concept: null, variation: null,
    test_id: null, meta_ad_id: null, creative_asset_url: null,
    asset_filename: null, asset_servable: true, performance: null,
    ...over,
  }) as Parameters<typeof primaryAdForCell>[0] extends (infer T)[] | undefined ? T : never;

describe("primaryAdForCell prefers an asset that exists", () => {
  it("picks the servable row over an unservable one that also has a Meta id", () => {
    const picked = primaryAdForCell(
      [
        ad({ ad_name: "ghost", creative_asset_url: "/a.jpg", meta_ad_id: "1", asset_servable: false }),
        ad({ ad_name: "real", creative_asset_url: "/b.jpg", asset_servable: true }),
      ],
      "C2B",
    );
    expect(picked?.ad_name).toBe("real");
  });

  it("still prefers a Meta id AMONG servable rows", () => {
    const picked = primaryAdForCell(
      [
        ad({ ad_name: "noid", creative_asset_url: "/a.jpg", asset_servable: true }),
        ad({ ad_name: "withid", creative_asset_url: "/b.jpg", meta_ad_id: "9", asset_servable: true }),
      ],
      "C2B",
    );
    expect(picked?.ad_name).toBe("withid");
  });

  it("returns the unservable row when it is the only one. It is still the cell's identity", () => {
    // Dropping it entirely would lose the ad name and the Ads Manager link.
    const picked = primaryAdForCell(
      [ad({ ad_name: "ghost", creative_asset_url: "/a.jpg", meta_ad_id: "1", asset_servable: false })],
      "C2B",
    );
    expect(picked?.ad_name).toBe("ghost");
  });

  it("treats a missing asset_servable as servable, so older rows are unaffected", () => {
    const picked = primaryAdForCell(
      [ad({ ad_name: "legacy", creative_asset_url: "/a.jpg", asset_servable: undefined })],
      "C2B",
    );
    expect(picked?.ad_name).toBe("legacy");
  });
});

describe("cardFromCell drops an unservable URL", () => {
  it("gives the card no assetUrl when the file is not there", () => {
    const card = cardFromCell("C2B", {
      ads: [ad({ ad_name: "ghost", creative_asset_url: "/gone.jpg", asset_servable: false })],
    });
    expect(card.assetUrl).toBeNull();
  });

  it("keeps a servable URL", () => {
    const card = cardFromCell("C2B", {
      ads: [ad({ ad_name: "real", creative_asset_url: "/there.jpg", asset_servable: true })],
    });
    expect(card.assetUrl).toBe("/there.jpg");
  });
});
