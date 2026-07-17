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
import { PRE_LOGIN_ROUTE_PATHS } from "../preLoginRoutes";
import {
  renderAt,
  renderAuthGateAt,
  renderAuthedAt,
  seedAccountSession,
  NOT_FOUND_TEXT,
} from "./harness";

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
  it("navTree yields a sane number of paths", async () => {
    expect(navPaths.length).toBeGreaterThanOrEqual(20);
  });

  for (const { label, to } of navPaths) {
    it(`${label} (${to}) does not hit the 404 page`, async () => {
      const { container } = await renderAt(to);
      expect(container.textContent).not.toContain(NOT_FOUND_TEXT);
      expect(container.textContent?.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("legacy redirects land on their new targets", () => {
  for (const [from, target] of legacyRedirects) {
    it(`${from} → ${target}`, async () => {
      const { container, location } = await renderAt(from);
      expect(location.history.at(-1)).toBe(target);
      expect(container.textContent).not.toContain(NOT_FOUND_TEXT);
    });
  }
});

// The forgot-password screen only exists for logged-out visitors. A signed-in
// user opening that link (old email, bookmark) must be redirected to a real
// in-app destination — never fall through to the 404 page.
describe("a signed-in user visiting /forgot-password is redirected", () => {
  it("/forgot-password → /app/settings/account?focus=password, not the 404 page", async () => {
    const { container, location } = await renderAuthedAt("/forgot-password");
    expect(location.history.at(-1)).toBe("/app/settings/account?focus=password");
    expect(container.textContent).not.toContain(NOT_FOUND_TEXT);
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe("unknown paths still 404", () => {
  it("a bogus path renders the NotFound page", async () => {
    const { container } = await renderAt("/app/definitely-not-a-real-page");
    expect(container.textContent).toContain(NOT_FOUND_TEXT);
  });
});

// Guards against the reverse drift: a path added to PRE_LOGIN_ROUTE_PATHS
// but never wired to a screen in AuthGate silently falls through to the
// plain login page for logged-out visitors. Each pre-login path must render
// something distinct from the login baseline, so an unwired path fails loudly.
describe("every PRE_LOGIN_ROUTE_PATHS entry renders its own screen, not the login page", () => {
  // A path AuthGate has no branch for — this is exactly what an unwired
  // pre-login route looks like to a logged-out visitor: the login page.
  function loginBaselineText(): string {
    const { container, unmount } = renderAuthGateAt(
      "/definitely-not-a-wired-pre-login-path"
    );
    const text = container.textContent ?? "";
    unmount();
    return text;
  }

  it("the login baseline itself renders non-empty content", async () => {
    expect(loginBaselineText().trim().length).toBeGreaterThan(0);
  });

  for (const path of PRE_LOGIN_ROUTE_PATHS) {
    it(`${path} renders a screen distinct from the login page`, async () => {
      const baseline = loginBaselineText();
      const { container } = renderAuthGateAt(path);
      const text = container.textContent ?? "";
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toBe(baseline);
    });
  }
});
