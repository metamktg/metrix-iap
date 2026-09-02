// ─── Topbar breadcrumb coverage tests ──────────────────────────────────
// Guards against silently wrong/missing breadcrumb labels after IA changes:
//   - every navTree path (sections, children, matchPaths) must produce the
//     expected section/child labels from buildBreadcrumbs
//   - "/" and matchPaths must show the manager vs ad-account overview label
//   - unknown paths fall back to an empty crumb list (account name now lives
//     in the topbar AccountSwitcher, not in the breadcrumb trail)
// buildBreadcrumbs is a pure function, so this tests it directly.

import { describe, it, expect } from "vitest";

import { buildBreadcrumbs } from "@/components/layout/breadcrumbs";
import { navTree, sectionLandingRoute } from "../navTree";

function labels(location: string, isManager = false): string[] {
  return buildBreadcrumbs(location, isManager).map((c) => c.label);
}

describe("root overview breadcrumb", () => {
  it('"/" shows Account Overview for an ad account', () => {
    expect(labels("/", false)).toEqual(["Account Overview"]);
  });

  it('"/" shows Agency Overview for a manager', () => {
    expect(labels("/", true)).toEqual(["Agency Overview"]);
  });

  it("empty location behaves like the root", () => {
    expect(labels("", false)).toEqual(["Account Overview"]);
  });
});

describe("matchPaths breadcrumbs (e.g. /app/account)", () => {
  const matchPaths = navTree.flatMap((s) => s.matchPaths ?? []);

  it("navTree declares at least one matchPath", () => {
    expect(matchPaths).toContain("/app/account");
  });

  for (const path of matchPaths) {
    it(`${path} shows Account Overview for an ad account`, () => {
      expect(labels(path, false)).toEqual(["Account Overview"]);
    });

    it(`${path} shows Agency Overview for a manager`, () => {
      expect(labels(path, true)).toEqual(["Agency Overview"]);
    });

    it(`${path}/nested-subpage still matches`, () => {
      expect(labels(`${path}/nested-subpage`, false)).toEqual([
        "Account Overview",
      ]);
    });
  }
});

describe("command-center (parent) pages show their section label", () => {
  // Every expandable section is itself a command-center page at its own
  // `landing` route — none of today's sections are true leaves (to + no
  // children); each has real content of its own plus child subpages.
  // Excludes sections whose landing route IS one of their children's own
  // route (Action, Settings — a single/first child doubles as the
  // landing rather than a distinct parent page), which correctly resolve
  // through the child-match branch instead and get their own crumb shape.
  const commandCenters = navTree.filter(
    (s) => s.children?.length && s.landing && !s.children.some((c) => c.to === s.landing)
  );

  it("navTree has at least one command-center (landing) route", () => {
    expect(commandCenters.length).toBeGreaterThanOrEqual(1);
  });

  for (const section of commandCenters) {
    // The root Overview's landing ("/") is covered by the root-overview
    // describe block above with its own manager/account-aware label.
    if (section.landing === "/") continue;

    it(`${section.landing} → ${section.label}`, () => {
      expect(labels(section.landing!)).toEqual([section.label]);
    });

    it(`${section.landing}/unlisted-subpath → ${section.label}`, () => {
      expect(labels(`${section.landing}/unlisted-subpath`)).toEqual([section.label]);
    });
  }
});

describe("section landing pages show only the section label (Overview as parent route)", () => {
  const landingSections = navTree.filter(
    (s) => s.landing && !s.children?.some((c) => c.to === s.landing)
  );

  it("navTree has at least one section where the landing is not a child (Analyze, Act, Report)", () => {
    expect(landingSections.length).toBeGreaterThanOrEqual(2);
  });

  for (const section of landingSections) {
    it(`${section.landing} → ["${section.label}"] (section as parent, no "Overview" subtab crumb)`, () => {
      expect(labels(section.landing!)).toEqual([section.label]);
    });

    // "//sub-detail" is not a path; the root landing is covered above.
    if (section.landing === "/") continue;
    it(`${section.landing}/sub-detail also collapses to section label`, () => {
      expect(labels(`${section.landing}/sub-detail`)).toEqual([section.label]);
    });
  }
});

describe("child pages show section + child labels", () => {
  const childPaths = navTree.flatMap((section) =>
    (section.children ?? []).map((child) => ({ section, child }))
  );

  it("navTree yields a sane number of child paths", () => {
    expect(childPaths.length).toBeGreaterThanOrEqual(16);
  });

  for (const { section, child } of childPaths) {
    it(`${child.to} → ${section.label} · ${child.label}`, () => {
      expect(labels(child.to)).toEqual([section.label, child.label]);
    });

    it(`${child.to}/detail-id → ${section.label} · ${child.label}`, () => {
      expect(labels(`${child.to}/detail-id`)).toEqual([
        section.label,
        child.label,
      ]);
    });
  }
});

describe("crumb link targets", () => {
  // The section crumb and the sidebar section link open the SAME page —
  // the command center. It used to link to the first child, so "Analysis"
  // in the trail and "Analysis" in the sidebar went to two different pages.
  it("section crumbs on child pages link to the section's command center (landing route)", () => {
    for (const section of navTree) {
      for (const child of section.children ?? []) {
        const crumbs = buildBreadcrumbs(child.to, false);
        expect(crumbs[0]?.to).toBe(sectionLandingRoute(section));
      }
    }
  });

  it("hidden children (no menu row) still resolve to their section", () => {
    const hidden = navTree.flatMap((s) => (s.children ?? []).filter((c) => c.hidden).map((c) => ({ s, c })));
    expect(hidden.length).toBeGreaterThanOrEqual(1);
    for (const { s, c } of hidden) {
      expect(labels(c.to)).toEqual([s.label, c.label]);
    }
  });

  it("a command-center page's own crumb links to its landing route", () => {
    const section = navTree.find(
      (s) => s.children?.length && s.landing && s.landing !== "/" && !s.children.some((c) => c.to === s.landing)
    );
    expect(section).toBeDefined();
    const crumbs = buildBreadcrumbs(section!.landing!, false);
    expect(crumbs[0]?.to).toBe(section!.landing);
  });

  it("overview crumbs (root and matchPaths) have no link target", () => {
    expect(buildBreadcrumbs("/", false)[0]?.to).toBeUndefined();
    expect(buildBreadcrumbs("/app/account", false)[0]?.to).toBeUndefined();
  });
});

describe("unknown paths fall back to an empty breadcrumb list", () => {
  it("a bogus path yields no crumbs (account name is in the topbar switcher, not here)", () => {
    expect(labels("/app/definitely-not-a-real-page")).toEqual([]);
  });

  it("a nav path with an extra prefix does not match", () => {
    expect(labels("/other/app/listen/alerts")).toEqual([]);
  });
});
