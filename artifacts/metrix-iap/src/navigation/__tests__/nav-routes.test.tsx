// ─── Navigation route coverage tests ───────────────────────────────────
// Guards against dead ends after IA changes:
//   - every `to` (and matchPaths) in navTree.ts must resolve to a real
//     page in App.tsx's Router, never the NotFound component
//   - every legacy redirect path must land on its new target
// Renders the real Router against an in-memory wouter location.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("@/contexts/MetrixDataContext", async () => {
  const { seed } = await import("./seed");
  return {
    useMetrixSeed: () => seed,
    MetrixDataProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

import { navTree } from "../navTree";
import { renderAt, seedAccountSession, NOT_FOUND_TEXT } from "./harness";

// Every path the sidebar can link to (sections + children + matchPaths).
const navPaths: { label: string; to: string }[] = navTree.flatMap((section) => [
  ...(section.to ? [{ label: section.label, to: section.to }] : []),
  ...(section.matchPaths ?? []).map((to) => ({
    label: `${section.label} (matchPath)`,
    to,
  })),
  ...(section.children ?? []).map((child) => ({
    label: `${section.label} · ${child.label}`,
    to: child.to,
  })),
]);

// Legacy IA paths and the routes they must redirect to.
const legacyRedirects: [string, string][] = [
  ["/app/listen", "/app/listen/alerts"],
  ["/app/analysis", "/app/analysis/overview"],
  ["/app/analysis/concept-map", "/app/mst/concept-map"],
  ["/app/strategy", "/app/strategy/overview"],
  ["/app/strategy/brief-builder", "/app/briefs/builder"],
  ["/app/briefs", "/app/briefs/builder"],
  ["/app/report-builder", "/app/reports/new"],
  ["/app/reports", "/app/reports/new"],
  ["/app/mst", "/app/mst/matrix"],
  ["/app/settings", "/app/settings/account"],
];

beforeEach(() => {
  cleanup();
  seedAccountSession();
});

describe("every navTree path resolves to a real page", () => {
  it("navTree yields a sane number of paths", () => {
    expect(navPaths.length).toBeGreaterThanOrEqual(20);
  });

  for (const { label, to } of navPaths) {
    it(`${label} (${to}) does not hit the 404 page`, () => {
      const { container } = renderAt(to);
      expect(container.textContent).not.toContain(NOT_FOUND_TEXT);
      expect(container.textContent?.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("legacy redirects land on their new targets", () => {
  for (const [from, target] of legacyRedirects) {
    it(`${from} → ${target}`, () => {
      const { container, location } = renderAt(from);
      expect(location.history.at(-1)).toBe(target);
      expect(container.textContent).not.toContain(NOT_FOUND_TEXT);
    });
  }
});

describe("unknown paths still 404", () => {
  it("a bogus path renders the NotFound page", () => {
    const { container } = renderAt("/app/definitely-not-a-real-page");
    expect(container.textContent).toContain(NOT_FOUND_TEXT);
  });
});
