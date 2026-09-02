// ─── Creative-source nudge ─────────────────────────────────────────────
// Shows only while it is true, persists until dismissed, and the dismissal
// survives a remount (localStorage, per account).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreativeSourceNudge } from "../CreativeSourceNudge";
import type { AdAccount } from "@/lib/data/seedTypes";

vi.mock("@/pages/metrix/ConnectAccountDialogs", () => ({
  ManualImportDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="import-dialog" /> : null),
  ConnectMetaDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="connect-dialog" /> : null),
}));

const base = (over: Partial<AdAccount> = {}): AdAccount => ({
  id: "acct_a",
  name: "Account A",
  status: "configured",
  platform: "Manual",
  iap: {} as AdAccount["iap"],
  ads: [{ ad_name: "A1", asset_servable: false, creative_asset_url: null }],
  creative_deconstructions: [],
  creative_components: {
    baseline: { spend: 100, results: 10, cost_per_result: 10 },
    families: { headline: [], primary_text: [], description: [], cta_type: [] },
    coverage: { ads_total: 4, ads_with_copy: 3, spend_total: 100, spend_with_copy: 75, coverage: 0.75, by_family: { headline: 3, primary_text: 3, description: 0, cta_type: 3 }, sources: ["performance_export"] },
  },
  ...over,
});

beforeEach(() => { localStorage.clear(); });
afterEach(() => cleanup());

describe("CreativeSourceNudge", () => {
  it("renders with the live copy coverage and both actions for a manual account", () => {
    render(<CreativeSourceNudge account={base()} />);
    expect(screen.getByTestId("creative-source-nudge").textContent).toContain("75% of spend");
    expect(screen.getByText("Upload creatives")).toBeTruthy();
    expect(screen.getByText("Connect Meta")).toBeTruthy();
  });

  it("opens the upload dialog from its action", () => {
    render(<CreativeSourceNudge account={base()} />);
    fireEvent.click(screen.getByText("Upload creatives"));
    expect(screen.getByTestId("import-dialog")).toBeTruthy();
  });

  it("dismissal persists across a remount, per account", () => {
    const { unmount } = render(<CreativeSourceNudge account={base()} />);
    fireEvent.click(screen.getByLabelText("Dismiss creative source suggestion"));
    expect(screen.queryByTestId("creative-source-nudge")).toBeNull();
    unmount();
    render(<CreativeSourceNudge account={base()} />);
    expect(screen.queryByTestId("creative-source-nudge")).toBeNull();
    cleanup();
    render(<CreativeSourceNudge account={base({ id: "acct_b" })} />);
    expect(screen.getByTestId("creative-source-nudge")).toBeTruthy();
  });

  it("does not render once the account has a servable creative or a deconstruction", () => {
    render(<CreativeSourceNudge account={base({ ads: [{ ad_name: "A1", asset_servable: true, creative_asset_url: "/x" }] })} />);
    expect(screen.queryByTestId("creative-source-nudge")).toBeNull();
    cleanup();
    const withDecon = base({ creative_deconstructions: [{ id: "d" } as never] });
    render(<CreativeSourceNudge account={withDecon} />);
    expect(screen.queryByTestId("creative-source-nudge")).toBeNull();
  });

  it("does not render for an account with no analysis yet, and hides Connect Meta on a live account", () => {
    render(<CreativeSourceNudge account={base({ iap: null })} />);
    expect(screen.queryByTestId("creative-source-nudge")).toBeNull();
    cleanup();
    render(<CreativeSourceNudge account={base({ platform: "Meta Ads" })} />);
    expect(screen.getByText("Upload creatives")).toBeTruthy();
    expect(screen.queryByText("Connect Meta")).toBeNull();
  });

  it("names the baseline honestly when no copy is known", () => {
    render(<CreativeSourceNudge account={base({ creative_components: null })} />);
    expect(screen.getByTestId("creative-source-nudge").textContent).toContain("performance data only");
  });
});
