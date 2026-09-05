// ─── Audit round 7 · one vocabulary, one first layer ─────────────────────
// The register's §D and §E (METRIX_UI_AUDIT_ROUND4_2026-09.md): the loop
// speaks four verbs (Retire · Scale · Optimize · Validate) wherever it
// recommends, engine codes reach a reader through the one humaniser, the
// hypothesis queue renders the label every other surface renders, a
// CrossLink never carries a text arrow beside its icon, the task tray's rail
// has one handle, and a manual-reports account is not nagged to connect Meta.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KIND_LABEL, KIND_STYLE, engineKindNote } from "@/components/deck/recommendationKind";
import { BUCKET_LABEL } from "@/lib/data/scalingBuckets";
import { tierBadge } from "@/lib/performanceTier";
import { flagHeadline, flagEvidence } from "@/lib/dataQualityFlags";
import { deriveRecommendations } from "@/lib/data/recommendations";
import { HypothesisLabel } from "../strategy/strategyShared";
import { ConnectionNudgeBanner } from "../shared";
import type { AdAccount } from "@/lib/data/seedTypes";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => fs.readFileSync(path.join(src, rel), "utf-8");
const seed = JSON.parse(fs.readFileSync(path.join(src, "test-fixtures/metrix_seed_bundle.json"), "utf-8")) as { ad_accounts: AdAccount[] };

const FOUR_VERBS = ["Retire", "Scale", "Optimize", "Validate"];

describe("the four verbs", () => {
  it("every engine kind renders as one of the four verbs, and the kind survives on the note", () => {
    for (const [kind, label] of Object.entries(KIND_LABEL)) {
      expect(FOUR_VERBS, kind).toContain(label);
      expect(KIND_STYLE[kind], `style for ${kind}`).toBeTruthy();
    }
    expect(KIND_LABEL.budget).toBe("Optimize");
    expect(KIND_LABEL.investigate).toBe("Validate");
    expect(KIND_LABEL.test).toBe("Validate");
    expect(KIND_LABEL.data).toBe("Validate");
    expect(engineKindNote("budget")).toBe("Engine kind: budget");
    expect(engineKindNote("avoid")).toBe("Engine kind: avoid");
    // The verb IS the kind: nothing to note.
    expect(engineKindNote("optimize")).toBeNull();
    expect(engineKindNote("scale")).toBeNull();
    expect(engineKindNote("never-a-kind")).toBeNull();
  });

  it("the scaling playbook's buckets speak the same verbs", () => {
    for (const label of Object.values(BUCKET_LABEL)) expect(FOUR_VERBS).toContain(label);
    expect(BUCKET_LABEL.explore).toBe("Validate");
    expect(BUCKET_LABEL.avoid).toBe("Retire");
  });

  it("the seed's performance tiers read as verbs, with the run's own wording kept beside them", () => {
    expect(tierBadge("1 - Scale Winners")).toMatchObject({ label: "Scale", raw: "1 - Scale Winners" });
    expect(tierBadge("2 - Watch / Test")).toMatchObject({ label: "Validate" });
    expect(tierBadge("3 - Optimize")).toMatchObject({ label: "Optimize" });
    expect(tierBadge("4 - Eliminate")).toMatchObject({ label: "Retire", raw: "4 - Eliminate" });
    expect(tierBadge(undefined)).toMatchObject({ label: "–", raw: null });
  });
});

describe("engine codes on the first layer", () => {
  it("a data-quality finding's headline is humanised, never underscored", () => {
    expect(flagHeadline({ kind: "placement", type: "placement_engagement_no_conversion" })).toBe("Placement engagement no conversion");
    expect(flagHeadline({ kind: "device", flag: "cpm_device_divergence" })).toBe("Cpm device divergence");
    expect(flagHeadline({ kind: "attribution_window" })).toBe("Attribution window");
    expect(flagHeadline({ kind: "cross_export_mismatch" })).toBe("Cross export mismatch");
  });

  it("a finding's platform reads as a platform name", () => {
    const rows = flagEvidence({ kind: "placement", platform: "audience_network" });
    const platform = rows.find((r) => r.k === "Platform");
    expect(platform).toBeTruthy();
    expect(platform!.v).not.toContain("_");
    expect(platform!.v.toLowerCase()).toContain("audience");
  });

  it("a data-anomaly recommendation names the flag through the humaniser, never the raw code", () => {
    const bookster = seed.ad_accounts.find((a) => a.id === "bookster")!;
    const anomalies = deriveRecommendations(bookster).filter((r) => r.title.startsWith("Data anomaly · "));
    expect(anomalies.length).toBeGreaterThan(0);
    for (const r of anomalies) {
      expect(r.title, r.id).not.toMatch(/_/);
      expect(r.rationale, r.id).not.toMatch(/_/);
    }
  });

  it("a queued hypothesis's rationale is its criteria, not a 'Success criteria:' label that deriveLabel cut off", () => {
    const bookster = seed.ad_accounts.find((a) => a.id === "bookster")!;
    const tests = deriveRecommendations(bookster).filter((r) => r.id.startsWith("derived:test:"));
    expect(tests.length).toBeGreaterThan(0);
    for (const r of tests) expect(r.rationale, r.id).not.toMatch(/^Success criteria:/);
  });
});

describe("the hypothesis label inside a button", () => {
  it("renders the sentence clamped with no nested control, and keeps the whole sentence on the title", () => {
    const label = "We believe isolating HK_Problem as the hook will lift CVR because the pain framing converts.";
    const { container } = render(<HypothesisLabel label={label} inButton />);
    expect(container.querySelector("button")).toBeNull();
    const p = container.querySelector("p.line-clamp-3");
    expect(p).toBeTruthy();
    expect(p!.getAttribute("title")).toBe(label);
    expect(p!.textContent).toBe(label);
  });

  it("is what the queue renders (the same component as the Strategy Map and Avatars)", () => {
    const source = read("pages/metrix/strategy/HypothesisQueueView.tsx");
    expect(source).toContain("<HypothesisLabel label={h.label} inButton />");
    expect(source).not.toContain("deriveLabel(h.label, 72)");
  });
});

describe("one affordance each", () => {
  it("no CrossLink label carries a text arrow beside the icon the component draws", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== "__tests__") walk(full, out); }
        else if (/\.tsx$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    const offenders = walk(path.join(src, "pages")).concat(walk(path.join(src, "components")))
      .filter((f) => /label="[^"]*→"/.test(fs.readFileSync(f, "utf-8")))
      .map((f) => path.relative(src, f));
    expect(offenders).toEqual([]);
  });

  it("the task tray's collapsed rail has one Expand handle, a labelled button", () => {
    const source = read("components/layout/TaskTray.tsx");
    expect((source.match(/aria-label="Expand task tray"/g) ?? []).length).toBe(1);
    expect(source).not.toMatch(/<div[^>]*onClick=\{toggle\}/);
  });

  it("the MST centre renders its pages strip whatever the data holds", () => {
    const source = read("pages/metrix/mst/MstCommandCenter.tsx");
    expect(source).toContain("explore={children}");
    expect(source).not.toContain("explore={mstReady ? children : []}");
  });

  it("Updates says its three feeds are not live in one card, not three empty frames", () => {
    const source = read("pages/metrix/OverviewUpdatesView.tsx");
    expect(source).toContain('title="Feeds"');
    expect(source).not.toContain('<SectionCard title="Product updates">');
    expect(source).not.toContain('<SectionCard title="Knowledge base">');
  });
});

describe("the connection nudge and the source of an account", () => {
  function renderBanner(account: Pick<AdAccount, "source_status"> | null) {
    const loc = memoryLocation({ path: "/app/listen/alerts", record: false });
    return render(
      <WouterRouter hook={loc.hook}>
        <ConnectionNudgeBanner hasMetaConnection={false} account={account} />
      </WouterRouter>,
    );
  }

  it("does not ask a manual-reports account to connect Meta: it has a source", () => {
    const { container } = renderBanner({ source_status: "manual_reports" });
    expect(container.textContent).toBe("");
  });

  it("still nudges an imported or legacy account, whose next step is a live connection", () => {
    renderBanner({ source_status: "imported_from_iap_loop_package" as AdAccount["source_status"] });
    expect(screen.getByText(/Connect Meta in Settings/)).toBeTruthy();
  });
});
