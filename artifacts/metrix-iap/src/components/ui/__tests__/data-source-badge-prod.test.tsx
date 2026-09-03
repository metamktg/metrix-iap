// The provenance badge names real Postgres tables — 28 distinct ones across
// 30 surfaces, `user_sessions` and `app_config` among them. In development
// that is a useful annotation. In production it publishes the schema to every
// signed-in browser, which is the reconnaissance an attacker needs to aim at
// the PostgREST surface the anon key can already reach (RLS and revoked
// grants are what stop the read — see docs/security/).
//
// "Collapsed by default" was never a control: the chip expands on click.
// This suite pins the real one — production renders NOTHING.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DataSourceBadge, DataSourceBadgeToggle } from "../DataSourceBadge";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("DataSourceBadge · production discloses no schema", () => {
  it("renders nothing at all in a production build", () => {
    vi.stubEnv("PROD", true);
    const { container } = render(<DataSourceBadge table="user_sessions, app_config" />);
    expect(container.innerHTML).toBe("");
    // Not merely collapsed — the table name must not be in the DOM to be
    // found by inspecting the page.
    expect(container.textContent).not.toContain("user_sessions");
    expect(container.textContent).not.toContain("app_config");
  });

  it("renders nothing even when several tables are passed", () => {
    vi.stubEnv("PROD", true);
    const { container } = render(
      <DataSourceBadge table="core_reanalysis_read, v3_variable_performance" collapsible />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("hides its Settings toggle in production. No control for an absent feature", () => {
    vi.stubEnv("PROD", true);
    const { container } = render(<DataSourceBadgeToggle />);
    expect(container.innerHTML).toBe("");
  });

  it("still annotates in development, where the reader is the builder", () => {
    vi.stubEnv("PROD", false);
    render(<DataSourceBadge table="campaign_summary" />);
    expect(screen.getByText("campaign_summary")).toBeTruthy();
  });
});
