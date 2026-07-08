// ─── Topbar breadcrumb coverage tests ──────────────────────────────────
// Guards against silently wrong/missing breadcrumb labels after IA changes:
//   - every navTree path (sections, children, matchPaths) must produce the
//     expected section/child labels from buildBreadcrumbs
//   - "/" and matchPaths must show the manager vs ad-account overview label
//   - unknown paths fall back to just the lead label (account name)
// buildBreadcrumbs is a pure function, so this tests it directly.

import { describe, it, expect } from "vitest";

import { buildBreadcrumbs } from "@/components/layout/Topbar";
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

describe("leaf sections show their section label", () => {
  // Leaf sections other than the "/" overview (handled above).
  const leafSections = navTree.filter(
    (s) => !s.children?.length && s.to && s.to !== "/"
  );

  it("navTree has at least one non-root leaf section", () => {
    expect(leafSections.length).toBeGreaterThanOrEqual(1);
  });

  for (const section of leafSections) {
    it(`${section.to} → ${section.label}`, () => {
      expect(labels(section.to!)).toEqual([LEAD, section.label]);
    });

    it(`${section.to}/subpage → ${section.label}`, () => {
      expect(labels(`${section.to}/subpage`)).toEqual([LEAD, section.label]);
    });
  }
});

describe("child pages show section + child labels", () => {
  const childPaths = navTree.flatMap((section) =>
    (section.children ?? []).map((child) => ({ section, child }))
  );

  it("navTree yields a sane number of child paths", () => {
    expect(childPaths.length).toBeGreaterThanOrEqual(20);
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

describe("unknown paths fall back to the lead label only", () => {
  it("a bogus path yields just the account name", () => {
    expect(labels("/app/definitely-not-a-real-page")).toEqual([LEAD]);
  });

  it("a nav path with an extra prefix does not match", () => {
    expect(labels("/other/app/listen/alerts")).toEqual([LEAD]);
  });
});
