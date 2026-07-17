// ─── Account settings ?focus=password ──────────────────────────────────
// A signed-in user opening /forgot-password is redirected to Account
// settings with ?focus=password. This test proves the page reacts to the
// param: the password card is scrolled into view and highlighted, and the
// param is cleared afterwards so refreshes behave like normal visits.
// Normal visits (no param) must render the card without any highlight.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AccountSettingsView } from "../settings/AccountSettingsView";

const SESSION_KEY = "metrix_active_account_v1";

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AccountSettingsView />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

let scrollSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
  sessionStorage.clear();
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
  // jsdom does not implement scrollIntoView.
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView =
    scrollSpy as unknown as typeof Element.prototype.scrollIntoView;
  window.history.replaceState({}, "", "/app/settings/account");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("arriving with ?focus=password (forgot-password redirect)", () => {
  it("scrolls to and highlights the password card, then clears the param", () => {
    window.history.replaceState({}, "", "/app/settings/account?focus=password");
    renderView();

    const card = screen.getByTestId("section-password");
    expect(card).toBeTruthy();

    // The param is consumed immediately so refreshes act like normal
    // visits. Other params (e.g. account scope) must survive.
    expect(window.location.search).not.toContain("focus=password");

    // After the short mount delay: scrolled into view + highlight ring on.
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(scrollSpy).toHaveBeenCalled();
    expect(card.className).toContain("ring-2");

    // The highlight is temporary.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(card.className).not.toContain("ring-2");
  });
});

describe("normal visit (no hash)", () => {
  it("renders the password card without scrolling or highlighting", () => {
    renderView();

    const card = screen.getByTestId("section-password");
    expect(card).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(card.className).not.toContain("ring-2");
  });
});
