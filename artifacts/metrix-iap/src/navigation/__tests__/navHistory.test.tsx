// ─── In-app navigation record ─────────────────────────────────────────
// The Back control reads this. Two properties matter: stepping back pops
// rather than pushes (or every back-and-forth would grow the record and
// Back would walk it twice), and a location with nothing behind it falls
// back to its structural parent rather than leaving the app.

import { describe, it, expect, beforeEach } from "vitest";
import { recordNavigation, resetNavigationHistory } from "../navHistory";
import { navTree, sectionLandingRoute } from "../navTree";

// The store is module-level; read it back through the same seam the hook uses.
async function stack(): Promise<readonly string[]> {
  const mod = await import("../navHistory");
  let out: readonly string[] = [];
  // useNavigationHistory is a hook; the snapshot it reads is exposed only
  // through it, so drive the store and read via a tiny harness.
  const { renderHook } = await import("@testing-library/react");
  const { result } = renderHook(() => mod.useNavigationHistory());
  out = result.current;
  return out;
}

beforeEach(() => resetNavigationHistory());

describe("recordNavigation", () => {
  it("pushes distinct locations in order", async () => {
    recordNavigation("/");
    recordNavigation("/app/analysis");
    recordNavigation("/app/analysis/library");
    expect(await stack()).toEqual(["/", "/app/analysis", "/app/analysis/library"]);
  });

  it("ignores a repeat of the current location", async () => {
    recordNavigation("/app/analysis");
    recordNavigation("/app/analysis");
    expect(await stack()).toEqual(["/app/analysis"]);
  });

  it("treats arriving at the entry below the top as a step back (pop, not push)", async () => {
    recordNavigation("/");
    recordNavigation("/app/analysis");
    recordNavigation("/app/analysis/library");
    recordNavigation("/app/analysis"); // browser Back, or ours
    expect(await stack()).toEqual(["/", "/app/analysis"]);
  });

  it("caps the record so a long session cannot grow it without bound", async () => {
    for (let i = 0; i < 200; i++) recordNavigation(`/app/page-${i}`);
    expect((await stack()).length).toBeLessThanOrEqual(50);
  });
});

// The structural fallback is reachable only through the hook, so drive it
// the way the Topbar does: a location with nothing recorded behind it.
describe("useBackTarget with no history falls back to the structure", () => {
  async function backFor(location: string) {
    const { renderHook } = await import("@testing-library/react");
    const { useBackTarget } = await import("../navHistory");
    const { Router } = await import("wouter");
    const { memoryLocation } = await import("wouter/memory-location");
    const mem = memoryLocation({ path: location });
    const { result } = renderHook(() => useBackTarget(), {
      wrapper: ({ children }) => <Router hook={mem.hook}>{children}</Router>,
    });
    return result.current;
  }

  it("the overview has nowhere to go", async () => {
    expect(await backFor("/")).toBeNull();
  });

  it("a child page goes to its section's command center", async () => {
    for (const section of navTree) {
      const landing = sectionLandingRoute(section);
      for (const child of section.children ?? []) {
        if (child.to === landing) continue;
        const back = await backFor(child.to);
        expect(back?.to).toBe(landing);
        expect(back?.viaHistory).toBe(false);
      }
    }
  });

  it("a command center goes to the overview", async () => {
    expect((await backFor("/app/analysis"))?.to).toBe("/");
    expect((await backFor("/app/settings/general"))?.to).toBe("/");
  });

  it("an unknown in-app path still has somewhere to go", async () => {
    expect((await backFor("/app/definitely-not-a-page"))?.to).toBe("/");
  });

  it("with a recorded previous page, walks history instead", async () => {
    recordNavigation("/app/analysis/library");
    recordNavigation("/app/strategy/map");
    const back = await backFor("/app/strategy/map");
    expect(back?.to).toBe("/app/analysis/library");
    expect(back?.viaHistory).toBe(true);
  });
});
