// ─── Seed provider: what happens when the data service fails ─────────────
//
// The provider decides whether the whole app renders. It used to bail to a
// full-screen error on ANY error state, including a failed REFRESH — and a
// refresh is exactly what the sixteen mutation handlers trigger, so a blip
// while an upload settled wiped a working dashboard.
//
// These tests pin both halves of the corrected contract: no bundle at all is
// still a full-screen error, and a bundle that is merely stale keeps rendering
// with the staleness stated.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";

const seedState = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  isRefetching: false,
  error: null as unknown,
  refetch: vi.fn(),
};

// ApiError and getAuthMeQueryKey are the real ones — the provider narrows on
// `instanceof ApiError` and on the exact auth query key, so faking either
// would let the test pass while the app failed.
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useGetMetrixSeed: () => seedState };
});

import { ApiError, getAuthMeQueryKey, getGetMetrixSeedQueryKey } from "@workspace/api-client-react";

import { MetrixDataProvider, useMetrixFreshness, SEED_SLOW_AFTER_MS } from "../MetrixDataContext";
import { SeedRefreshFailedBanner } from "@/components/layout/SeedRefreshFailedBanner";

const BUNDLE = { app_defaults: null, ad_accounts: [] };

function Child() {
  const { refreshFailed } = useMetrixFreshness();
  return <div data-testid="child">child rendered · stale={String(refreshFailed)}</div>;
}

let queryClient: QueryClient;

function renderProvider() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MetrixDataProvider>
        <SeedRefreshFailedBanner />
        <Child />
      </MetrixDataProvider>
    </QueryClientProvider>,
  );
}

function apiError(status: number): ApiError {
  return new ApiError(new Response(null, { status }), null, {
    method: "GET",
    url: "/api/metrix/seed",
  });
}

beforeEach(() => {
  seedState.data = undefined;
  seedState.isLoading = false;
  seedState.isError = false;
  seedState.isRefetching = false;
  seedState.error = null;
  seedState.refetch = vi.fn();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});
afterEach(cleanup);

describe("MetrixDataProvider", () => {
  it("takes over the screen when there is no bundle at all", () => {
    seedState.isError = true;
    renderProvider();
    expect(screen.getByText("Couldn't load Metrix data")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();
  });

  it("takes over the screen when the request succeeded but returned nothing", () => {
    seedState.isError = false;
    seedState.data = undefined;
    renderProvider();
    expect(screen.getByText("Couldn't load Metrix data")).toBeTruthy();
  });

  it("keeps rendering the last-good bundle when a REFRESH fails", () => {
    seedState.data = BUNDLE;
    seedState.isError = true;
    renderProvider();
    // The dashboard survives — this is the whole point of the change.
    expect(screen.getByTestId("child").textContent).toContain("child rendered");
    expect(screen.queryByText("Couldn't load Metrix data")).toBeNull();
  });

  it("says the data is stale rather than letting it pass as current", () => {
    seedState.data = BUNDLE;
    seedState.isError = true;
    renderProvider();
    const strip = screen.getByTestId("seed-refresh-failed");
    expect(strip.textContent).toContain("Showing the last data that loaded");
    expect(screen.getByTestId("child").textContent).toContain("stale=true");
  });

  it("shows no staleness strip when the bundle is current", () => {
    seedState.data = BUNDLE;
    seedState.isError = false;
    renderProvider();
    expect(screen.queryByTestId("seed-refresh-failed")).toBeNull();
    expect(screen.getByTestId("child").textContent).toContain("stale=false");
  });

  it("refetches when the staleness strip's button is pressed", () => {
    seedState.data = BUNDLE;
    seedState.isError = true;
    renderProvider();
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(seedState.refetch).toHaveBeenCalledTimes(1);
  });

  it("disables the button while a refresh is already in flight", () => {
    seedState.data = BUNDLE;
    seedState.isError = true;
    seedState.isRefetching = true;
    renderProvider();
    const button = screen.getByRole("button", { name: /refreshing/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe("a seed 401 is a gone session, not stale data", () => {
  it("re-asks who the user is, so AuthGate can render the login page", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    seedState.data = BUNDLE;
    seedState.isError = true;
    seedState.error = apiError(401);
    renderProvider();
    expect(
      spy.mock.calls.some(
        ([arg]) =>
          JSON.stringify((arg as { queryKey?: unknown } | undefined)?.queryKey) ===
          JSON.stringify(getAuthMeQueryKey()),
      ),
      "a 401 left the user stuck on stale data with no way back to a login screen",
    ).toBe(true);
  });

  it("leaves the auth session alone for a 503, which is the data service failing", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    seedState.data = BUNDLE;
    seedState.isError = true;
    seedState.error = apiError(503);
    renderProvider();
    expect(
      spy.mock.calls.some(
        ([arg]) =>
          JSON.stringify((arg as { queryKey?: unknown } | undefined)?.queryKey) ===
          JSON.stringify(getAuthMeQueryKey()),
      ),
      "an unreachable data service signed the user out",
    ).toBe(false);
    expect(screen.getByTestId("seed-refresh-failed")).toBeTruthy();
  });
});

describe("the premise the fix rests on", () => {
  it("react-query keeps the previous data when a refetch fails", async () => {
    // If a future version dropped the last-good value on a failed refetch,
    // `!data` would fire and the full-screen error would silently come back
    // for the case above. This asserts the behaviour rather than assuming it.
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    let mode: "ok" | "fail" = "ok";
    const observer = new QueryObserver(qc, {
      queryKey: ["seed-premise"],
      queryFn: async () => {
        if (mode === "fail") throw new Error("503");
        return BUNDLE;
      },
      staleTime: Infinity,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    expect(observer.getCurrentResult().status).toBe("success");

    mode = "fail";
    await qc.invalidateQueries({ queryKey: ["seed-premise"] });
    const result = observer.getCurrentResult();
    unsubscribe();

    expect(result.isError, "a failed refetch should surface as an error").toBe(true);
    expect(result.data, "…while still holding the last good bundle").toEqual(BUNDLE);
  });
});

// ── A seed that never answers is said out loud ──────────────────────────────
// The splash used to cycle its callouts forever while the seed hung — a wedged
// database behind it (2026-09-02) was indistinguishable from a slow network.
// Past SEED_SLOW_AFTER_MS it says how long it has waited and offers a retry
// that cancels the hung request before asking again.

describe("a first load that takes too long", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays a plain splash before the deadline and says so after it", () => {
    seedState.isLoading = true;
    renderProvider();
    expect(screen.queryByTestId("boot-loader-slow")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SEED_SLOW_AFTER_MS + 1_500);
    });
    const notice = screen.getByTestId("boot-loader-slow");
    expect(notice.textContent).toMatch(/Still waiting on the data service after \d+s/);
  });

  it("retries by cancelling the hung request first, then refetching", async () => {
    seedState.isLoading = true;
    const cancel = vi.spyOn(queryClient, "cancelQueries").mockResolvedValue(undefined);
    renderProvider();
    act(() => {
      vi.advanceTimersByTime(SEED_SLOW_AFTER_MS + 1_500);
    });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(cancel).toHaveBeenCalledWith({ queryKey: getGetMetrixSeedQueryKey() });
    expect(seedState.refetch).toHaveBeenCalled();
  });
});
