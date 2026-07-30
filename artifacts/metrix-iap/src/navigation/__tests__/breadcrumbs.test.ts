// ─── Topbar breadcrumb coverage tests ──────────────────────────────────
// Guards against silently wrong/missing breadcrumb labels after IA changes:
//   - every navTree path (sections, children, matchPaths) must produce the
//     expected section/child labels from buildBreadcrumbs
//   - "/" and matchPaths must show the manager vs ad-account overview label
//   - unknown paths fall back to just the lead label (account name)
// buildBreadcrumbs is a pure function, so this tests it directly.

import { describe, it, expect } from "vitest";

import { buildBreadcrumbs } from "@/components/layout/breadcrumbs";
import { navTree } from "../navTree";

const LEAD = "Bookster";

function labels(location: string, isManager = false): string[] {
  return buildBreadcrumbs(location, LEAD, isManager).map((c) => c.label);
}

describe("root overview breadcrumb", () => {
  it('"/" shows Account Overview for an ad account', () => {
    expect(labels("/", false)).toEqual([LEAD, "Account Overview"]);
  });

  it('"/" shows Agency Overview for a manager', () => {
    expect(labels("/", true)).toEqual([LEAD, "Agency Overview"]);
  });

  it("empty location behaves like the root", () => {
    expect(labels("", false)).toEqual([LEAD, "Account Overview"]);
  });
});

describe("matchPaths breadcrumbs (e.g. /app/account)", () => {
  const matchPaths = navTree.flatMap((s) => s.matchPaths ?? []);

  it("navTree declares at least one matchPath", () => {
    expect(matchPaths).toContain("/app/account");
  });

  for (const path of matchPaths) {
    it(`${path} shows Account Overview for an ad account`, () => {
      expect(labels(path, false)).toEqual([LEAD, "Account Overview"]);
    });

    it(`${path} shows Agency Overview for a manager`, () => {
      expect(labels(path, true)).toEqual([LEAD, "Agency Overview"]);
    });

    it(`${path}/nested-subpage still matches`, () => {
      expect(labels(`${path}/nested-subpage`, false)).toEqual([
        LEAD,
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
      expect(labels(section.landing!)).toEqual([LEAD, section.label]);
    });

    it(`${section.landing}/unlisted-subpath → ${section.label}`, () => {
      expect(labels(`${section.landing}/unlisted-subpath`)).toEqual([LEAD, section.label]);
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
    it(`${section.landing} → [${LEAD}, "${section.label}"] (section as parent, no "Overview" subtab crumb)`, () => {
      expect(labels(section.landing!)).toEqual([LEAD, section.label]);
    });

    it(`${section.landing}/sub-detail also collapses to section label`, () => {
      expect(labels(`${section.landing}/sub-detail`)).toEqual([LEAD, section.label]);
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
      expect(labels(child.to)).toEqual([LEAD, section.label, child.label]);
    });

    it(`${child.to}/detail-id → ${section.label} · ${child.label}`, () => {
      expect(labels(`${child.to}/detail-id`)).toEqual([
        LEAD,
        section.label,
        child.label,
      ]);
    });
  }
});

describe("crumb link targets", () => {
  it("the lead crumb always links to /", () => {
    expect(buildBreadcrumbs("/app/listen/signal", LEAD, false)[0]?.to).toBe("/");
    expect(buildBreadcrumbs("/", LEAD, true)[0]?.to).toBe("/");
  });

  it("section crumbs on child pages link to the section's first child route", () => {
    for (const section of navTree) {
      for (const child of section.children ?? []) {
        const crumbs = buildBreadcrumbs(child.to, LEAD, false);
        expect(crumbs[1]?.to).toBe(section.children![0]!.to);
      }
    }
  });

  it("a command-center page's own crumb links to its landing route", () => {
    const section = navTree.find(
      (s) => s.children?.length && s.landing && s.landing !== "/" && !s.children.some((c) => c.to === s.landing)
    );
    expect(section).toBeDefined();
    const crumbs = buildBreadcrumbs(section!.landing!, LEAD, false);
    expect(crumbs[1]?.to).toBe(section!.landing);
  });

  it("overview crumbs (root and matchPaths) have no link target", () => {
    expect(buildBreadcrumbs("/", LEAD, false)[1]?.to).toBeUndefined();
    expect(buildBreadcrumbs("/app/account", LEAD, false)[1]?.to).toBeUndefined();
  });
});

describe("unknown paths fall back to the lead label only", () => {
  it("a bogus path yields just the account name", () => {
    expect(labels("/app/definitely-not-a-real-page")).toEqual([LEAD]);
  });

  it("a nav path with an extra prefix does not match", () => {
    expect(labels("/other/app/listen/alerts")).toEqual([LEAD]);
  });
});
