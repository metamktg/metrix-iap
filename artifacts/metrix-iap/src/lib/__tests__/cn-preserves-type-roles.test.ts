// cn() must never delete a type-ramp size role.
//
// tailwind-merge classifies any `text-<unknown>` class as a COLOR. Before
// cn() registered the ramp's roles as the font-size group, a call like
//   cn("text-caption …", active ? "text-foreground" : "text-foreground/65")
// returned only the color — the size was stripped from the DOM as a
// "duplicate color". Measured consequence: the whole sidebar nav rendered at
// the 16px browser default while its source visibly said text-caption and
// text-body. The reverse order deleted the COLOR instead (muted text
// rendering full-bright). Source review can never catch this — the classes
// are correct in the file and wrong only after cn() runs — so this test
// pins the merge table itself.

import { describe, expect, it } from "vitest";
import { cn } from "@workspace/command-deck/lib/utils";

describe("cn preserves type-ramp size roles alongside colors", () => {
  it("keeps a size role when a text color follows it", () => {
    expect(cn("text-caption", "text-foreground/65")).toBe("text-caption text-foreground/65");
    expect(cn("text-body", "text-foreground")).toBe("text-body text-foreground");
    expect(cn("text-title", "text-muted-foreground")).toBe("text-title text-muted-foreground");
  });

  it("keeps the color when the size role follows it", () => {
    expect(cn("text-foreground/65", "text-caption")).toBe("text-foreground/65 text-caption");
  });

  it("still merges two sizes (last wins), like Tailwind's own sizes", () => {
    expect(cn("text-caption", "text-body")).toBe("text-body");
    expect(cn("text-title", "text-h4")).toBe("text-h4");
  });

  it("still merges two colors (last wins)", () => {
    expect(cn("text-interactive", "text-status-warning")).toBe("text-status-warning");
  });

  it("covers every size role the ramp defines", () => {
    // Must match the .text-* size utilities in index.css. A role added there
    // without being added to cn()'s font-size group silently reverts to
    // being treated as a color — this enumeration is the tripwire.
    const roles = [
      "text-micro", "text-micro-num", "text-label", "text-caption", "text-body",
      "text-title", "text-cardtitle", "text-callout", "text-display", "text-section",
      "text-h2", "text-h3", "text-h4", "text-h5",
      "text-stat", "text-bignum", "text-bignum-fluid", "text-hero",
    ];
    for (const role of roles) {
      expect(cn(role, "text-foreground"), `${role} must survive a following color`).toBe(
        `${role} text-foreground`,
      );
    }
  });
});
