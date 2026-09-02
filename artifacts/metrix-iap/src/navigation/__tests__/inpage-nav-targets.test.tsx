// ─── In-page navigation target coverage ────────────────────────────────
// The sidebar tests (nav-routes.test.tsx) only guard navTree.ts paths.
// Many pages/components navigate with hardcoded literals instead — e.g.
// ManagerOverview's "connect account" card, AccountSwitcher's settings
// shortcut, CrossLink "View in ..." buttons, and <Redirect> targets.
// This test scans the source tree for those literals and asserts every
// one of them resolves in the real Router without hitting NotFound, so
// an IA change can't silently break an in-page button.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

import { renderAt, seedAccountSession, NOT_FOUND_TEXT } from "./harness";
import { LEGACY_REDIRECTS } from "../legacyRoutes";

// ─── Source scanning ───────────────────────────────────────────────────

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Patterns that capture hardcoded route literals used for navigation:
//   navigate("/app/...")           — wouter's useLocation navigate
//   navigate(`/app/...`)           — template-literal variant
//   to="/app/..."                  — <Link>, <CrossLink>, <Redirect>
//   to={`/app/...`}                — template-literal JSX variant
const LITERAL_PATTERNS = [
  /\bnavigate\(\s*"(\/[^"]*)"/g,
  /\bnavigate\(\s*`(\/[^`]*)`/g,
  /\bto="(\/[^"]*)"/g,
  /\bto=\{\s*`(\/[^`]*)`/g,
];

type Target = { to: string; sources: string[] };

function collectNavTargets(): Target[] {
  const byPath = new Map<string, Set<string>>();
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const content = fs.readFileSync(file, "utf-8");
    const rel = path.relative(SRC_ROOT, file);
    for (const pattern of LITERAL_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        // Keep only the path portion; query strings often interpolate
        // dynamic ids, but the route match ignores them anyway.
        const to = match[1].split("?")[0].split("#")[0];
        // Skip targets whose *path* itself is dynamic — can't resolve
        // statically (none exist today; sanity-checked below).
        if (to.includes("${")) continue;
        if (!byPath.has(to)) byPath.set(to, new Set());
        byPath.get(to)!.add(rel);
      }
    }
  }
  return [...byPath.entries()]
    .map(([to, sources]) => ({ to, sources: [...sources].sort() }))
    .sort((a, b) => a.to.localeCompare(b.to));
}

const targets = collectNavTargets();

beforeEach(() => {
  cleanup();
  seedAccountSession();
});

describe("scanner sanity", () => {
  it("finds a sane number of hardcoded navigation targets", () => {
    expect(targets.length).toBeGreaterThanOrEqual(15);
  });

  it("catches known in-page targets outside the sidebar", () => {
    const paths = targets.map((t) => t.to);
    // AddAccountDialog / ConnectAccountDialogs "Meta connection" path
    expect(paths).toContain("/app/settings/integrations");
    // AdAccountOverview "View in MST" button
    expect(paths).toContain("/app/mst");
    // CrossLink template-literal targets (query stripped)
    expect(paths).toContain("/app/analysis/library");
    expect(paths).toContain("/app/creative/builder");
    // AccountContext fallback
    expect(paths).toContain("/app/account");
  });

  it("no navigation target has a dynamic path segment", () => {
    // If this ever fails, a page interpolates the route path itself
    // (not just the query string); add explicit coverage for it.
    for (const t of targets) {
      expect(t.to).not.toContain("${");
    }
  });
});

describe("every hardcoded in-page navigation target resolves", () => {
  for (const { to, sources } of targets) {
    it(`${to} (used in ${sources.join(", ")}) does not hit the 404 page`, async () => {
      const { container } = await renderAt(to);
      expect(container.textContent).not.toContain(NOT_FOUND_TEXT);
      expect(container.textContent?.trim().length).toBeGreaterThan(0);
    });
  }
});

// A legacy alias resolves — through a <Redirect> — which is exactly why
// the check above never caught it. The redirect drops the query string, so
// a loop link carrying `?from=strategy&fromCell=…` through
// `/app/briefs/builder` arrived at the Brief Builder with no origin and no
// "← Back" crumb. Old paths are for bookmarks; code links to live routes.
describe("no in-page navigation target is a legacy alias", () => {
  const legacy = new Set(LEGACY_REDIRECTS.map(([from]) => from));
  for (const { to, sources } of targets) {
    it(`${to} (used in ${sources.join(", ")}) is a live route, not a redirect`, () => {
      expect(legacy.has(to)).toBe(false);
    });
  }
});
