// ─── Creative match review-flag regression test ───────────────────────
// Staging a creative file gets it mapped to the closest ("most logical")
// ad name — on the SERVER, since 2026-09-02 (creativeAutoMap.ts): the
// client sends no mapping, the server runs the matcher against the
// account's ad registry and persists ad_names + match_method. Confident
// matches map silently, but a low-confidence "guess" tier MUST render a
// visible "Best guess — please review" badge so users know to double-check
// before running analysis. If a refactor ever applied a guessed mapping
// without that flag (e.g. dropping match_method or collapsing the badge),
// users could silently ship the wrong mapping.
//
// This drives the real upload flow end to end: the panel stages the file,
// a fake XHR stands in for the server — applying the SAME matcher the
// server runs (adNameMatch.ts is byte-identical on both sides; the scripts
// drift test enforces it) — and feeds the staged row back through a
// store-backed useListManualImports, so the badge renders from the exact
// match_method the server would have persisted.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const store = vi.hoisted(() => {
  let imports: unknown[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => imports,
    push: (imp: unknown) => {
      imports = [...imports, imp];
      emit();
    },
    reset: () => {
      imports = [];
      emit();
    },
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
});

// Store-backed useListManualImports: the fake XHR pushes each staged import
// (carrying the real, computed match_method) into the store, and the panel
// re-renders from it — so the badge under test is driven by the exact
// payload the upload flow sent, not a hand-authored fixture.
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const React = await import("react");
  return {
    ...actual,
    useListManualImports: () => {
      const imports = React.useSyncExternalStore(store.subscribe, store.get, store.get);
      return { data: { imports }, refetch: () => {}, isLoading: false };
    },
    useUpdateManualImportAdNames: () => ({ mutateAsync: async () => {}, isPending: false }),
    useDeleteManualImport: () => ({ mutateAsync: async () => {}, isPending: false }),
    useSyncCreativeLinks: () => ({ mutateAsync: async () => {}, isPending: false }),
  };
});

import { CreativeLibraryPanel } from "../ConnectAccountDialogs";
import { suggestAdNameMatch } from "@/lib/adNameMatch";

let importCounter = 0;

// Minimal XMLHttpRequest stand-in matching stageManualImportWithProgress's
// usage: it records the staged import (with its match_method) and reports
// success synchronously.
class MockXHR {
  upload: Record<string, unknown> = {};
  status = 0;
  responseText = "";
  withCredentials = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send(body: string) {
    const data = JSON.parse(body) as {
      kind: string;
      filename: string;
      content_type?: string | null;
      ad_names: string[];
      match_method?: string | null;
    };
    // The client must NOT map — that is the server's job now. Pin it here so
    // a client-side matcher cannot quietly come back.
    expect(data.ad_names).toEqual([]);
    expect(data.match_method).toBeUndefined();
    // Server behaviour (creativeAutoMap.ts): match the filename against the
    // account's ad registry and persist the result with its method.
    const match = suggestAdNameMatch(data.filename, AVAILABLE_AD_NAMES);
    const id = `imp_${++importCounter}`;
    store.push({
      id,
      account_id: "acct_test",
      kind: data.kind,
      filename: data.filename,
      content_type: data.content_type ?? null,
      size_bytes: 1234,
      ad_names: match ? [match.name] : [],
      match_method: match?.method ?? null,
      status: "staged",
      created_at: new Date().toISOString(),
    });
    this.status = 200;
    this.responseText = JSON.stringify({ import_id: id });
    this.onload?.();
  }
}

// The account's real ad registry the filenames auto-map against. Chosen so
// each staged file resolves to a distinct match tier (see below).
const AVAILABLE_AD_NAMES = [
  "Holiday Bundle v3", // low-confidence "guess" target
  "Summer Sale v2", // confident "fuzzy" target
  "Concept A [CR-1234]", // ID-code target
  "Winter Promo v1", // decoy
];

function stage(filename: string, type = "video/mp4") {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], filename, { type });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  cleanup();
  store.reset();
  importCounter = 0;
  vi.stubGlobal("XMLHttpRequest", MockXHR as unknown as typeof XMLHttpRequest);
});

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreativeLibraryPanel accountId="acct_test" availableAdNames={AVAILABLE_AD_NAMES} />
    </QueryClientProvider>
  );
}

// Locate the mapping editor row for a given staged filename. The filename
// also renders in the deconstruct-status section, so search every match
// for the one inside a mapping-editor card.
function rowFor(filename: string): HTMLElement {
  for (const node of screen.getAllByText(filename)) {
    const el = node.closest("[class*='rounded-md']");
    if (el) return el as HTMLElement;
  }
  throw new Error(`No mapping row found for ${filename}`);
}

describe("creative match review flag", () => {
  it("flags a low-confidence guess with a visible 'please review' badge while confident/ID matches show their own badges", async () => {
    renderPanel();

    // Low-confidence guess: shares real signal ("holiday", "v3") with
    // "Holiday Bundle v3" but below the confident threshold.
    stage("holiday_v3_1080x1080.mp4");
    // Confident filename similarity (exact after normalization).
    stage("Summer_Sale_v2.mp4");
    // Unambiguous shared ID code.
    stage("CR1234_final.mp4");

    await waitFor(() => {
      expect(screen.getAllByText("holiday_v3_1080x1080.mp4").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Summer_Sale_v2.mp4").length).toBeGreaterThan(0);
      expect(screen.getAllByText("CR1234_final.mp4").length).toBeGreaterThan(0);
    });

    // Guess row: a mapping WAS applied (ad selected) AND it is flagged for
    // review — this is the core guarantee. If the guessed mapping were
    // applied without the review flag, this assertion fails.
    const guessRow = within(rowFor("holiday_v3_1080x1080.mp4"));
    expect(guessRow.getByText(/ad(s)? selected/i)).toBeTruthy();
    expect(guessRow.getByText("Best guess — please review")).toBeTruthy();

    // Confident fuzzy match: normal (non-review) similarity badge.
    const fuzzyRow = within(rowFor("Summer_Sale_v2.mp4"));
    expect(fuzzyRow.getByText(/ad(s)? selected/i)).toBeTruthy();
    expect(fuzzyRow.getByText("Matched by filename similarity")).toBeTruthy();
    expect(fuzzyRow.queryByText("Best guess — please review")).toBeNull();

    // ID-code match: "Matched by ID code" badge.
    const idRow = within(rowFor("CR1234_final.mp4"));
    expect(idRow.getByText(/ad(s)? selected/i)).toBeTruthy();
    expect(idRow.getByText("Matched by ID code")).toBeTruthy();
    expect(idRow.queryByText("Best guess — please review")).toBeNull();
  });

  it("fails if a guessed mapping is applied without the review badge", async () => {
    renderPanel();
    stage("holiday_v3_1080x1080.mp4");

    await waitFor(() => expect(screen.getAllByText("holiday_v3_1080x1080.mp4").length).toBeGreaterThan(0));

    // The staged row must carry the guess method the server persisted
    // (proves the mapping was applied *with* the review signal, not
    // silently) … The store populates asynchronously relative to the
    // filename render, so poll for it.
    await waitFor(() => {
      const staged = store.get() as { ad_names: string[]; match_method?: string }[];
      expect(staged).toHaveLength(1);
      expect(staged[0].ad_names).toEqual(["Holiday Bundle v3"]);
      expect(staged[0].match_method).toBe("guess");
    });

    // … and that signal must surface as the visible review badge.
    expect(screen.getByText("Best guess — please review")).toBeTruthy();
  });
});
