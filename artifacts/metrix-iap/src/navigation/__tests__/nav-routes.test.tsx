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
    useMetrixIsRefetching: () => false,
    // AppShell mounts SeedRefreshFailedBanner, which reads this.
    useMetrixFreshness: () => ({ isRefetching: false, refreshFailed: false, retry: () => {} }),
    MetrixDataProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

import { navTree } from "../navTree";
import { PRE_LOGIN_ROUTE_PATHS } from "../preLoginRoutes";
import { LEGACY_REDIRECTS } from "../legacyRoutes";
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

// Legacy IA paths and the routes they must redirect to — the same table
// App.tsx generates its <Redirect>s from, so a row cannot be wired and
// untested, or tested and unwired.
const legacyRedirects = LEGACY_REDIRECTS;

beforeEach(() => {
  cleanup();
  seedAccountSession();
});

describe("every navTree path resolves to a real page", () => {
  it("navTree yields a sane number of paths", () => {
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
  it("the table is non-empty and every target is a live route, not another alias", () => {
    expect(legacyRedirects.length).toBeGreaterThanOrEqual(10);
    const aliases = new Set(legacyRedirects.map(([from]) => from));
    for (const [, target] of legacyRedirects) expect(aliases.has(target)).toBe(false);
  });
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
  it("/forgot-password → /app/settings/security?focus=password, not the 404 page", async () => {
    const { container, location } = await renderAuthedAt("/forgot-password");
    expect(location.history.at(-1)).toBe("/app/settings/security?focus=password");
    expect(container.textContent).not.toContain(NOT_FOUND_TEXT);
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe("unknown paths still 404", () => {
  it("a bogus path renders the NotFound page", async () => {
    const { container } = await renderAt("/this-is-definitely-not-a-real-route");
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

  it("the login baseline itself renders non-empty content", () => {
    expect(loginBaselineText().trim().length).toBeGreaterThan(0);
  });

  for (const path of PRE_LOGIN_ROUTE_PATHS) {
    it(`${path} renders a screen distinct from the login page`, () => {
      const baseline = loginBaselineText();
      const { container } = renderAuthGateAt(path);
      const text = container.textContent ?? "";
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toBe(baseline);
    });
  }
});
