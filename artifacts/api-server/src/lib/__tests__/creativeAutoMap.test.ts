// The server's file → ad decision. Pinned against the first fresh-account
// run: identifier codes decide, confident similarity applies, a guess is a
// suggestion and never a link.
import { describe, expect, it } from "vitest";
import { decideAdForFile, type AdNameCandidate } from "../creativeAutoMap";

const ADS: AdNameCandidate[] = [
  { adName: "C1A SKOV2", names: ["C1A SKOV2"] },
  { adName: "C2A SKOV2", names: ["C2A SKOV2", "skov_c2a_hero.png"] },
  { adName: "C2B", names: ["C2B", "c2b_lifestyle_v3.mp4"] },
  { adName: "C3B", names: ["C3B"] },
  { adName: "18118246642761770 - Jun 16, 2026", names: ["18118246642761770 - Jun 16, 2026"] },
];

describe("decideAdForFile", () => {
  it("applies an identifier match", () => {
    expect(decideAdForFile("SKOV_C2B_9x16.png", ADS)).toEqual({ kind: "match", adName: "C2B", method: "id" });
  });

  it("resolves a file named after the Meta asset name back to its ad", () => {
    expect(decideAdForFile("c2b_lifestyle_v3.mp4", ADS)).toEqual({ kind: "match", adName: "C2B", method: "id" });
    expect(decideAdForFile("skov_c2a_hero.png", ADS)).toEqual({ kind: "match", adName: "C2A SKOV2", method: "id" });
  });

  it("applies a confident similarity match", () => {
    expect(decideAdForFile("SKOV_C1A.png", ADS)).toMatchObject({ kind: "match", adName: "C1A SKOV2" });
  });

  it("never links on a guess — it is a suggestion for the editor", () => {
    const d = decideAdForFile("ChatGPT Image Jul 13, 2026, 04_13_34 PM.png", ADS);
    expect(d.kind === "suggestion" || d.kind === "none").toBe(true);
  });

  it("sends two files that differ only by code to two different ads", () => {
    expect(decideAdForFile("SKOV 03 C2A.png", ADS)).toMatchObject({ adName: "C2A SKOV2" });
    expect(decideAdForFile("SKOV 03 C2B.png", ADS)).toMatchObject({ adName: "C2B" });
  });
});
