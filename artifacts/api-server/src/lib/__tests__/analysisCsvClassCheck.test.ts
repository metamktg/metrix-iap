import { describe, expect, it } from "vitest";
import {
  detectCsvClassFromHeaders,
  checkDuplicateCsvClasses,
  type IapCsvClass,
} from "../iapCsvSpec";

// ─── detectCsvClassFromHeaders ───────────────────────────────────────────────

describe("detectCsvClassFromHeaders", () => {
  it("detects demographic from exact signature columns", () => {
    const headers = ["Date", "Campaign name", "Ad name", "Gender", "Age", "Impressions"];
    expect(detectCsvClassFromHeaders(headers)).toBe("demographic");
  });

  it("detects demographic via alias ('gender' lowercase)", () => {
    const headers = ["Date", "Ad name", "gender", "age", "Impressions"];
    expect(detectCsvClassFromHeaders(headers)).toBe("demographic");
  });

  it("detects device_placement from exact signature columns", () => {
    const headers = ["Date", "Campaign name", "Ad name", "Impression device", "Platform", "Placement"];
    expect(detectCsvClassFromHeaders(headers)).toBe("device_placement");
  });

  it("detects device_placement via alias ('device' and 'ad placement')", () => {
    const headers = ["Date", "Ad name", "device", "Platform", "ad placement"];
    expect(detectCsvClassFromHeaders(headers)).toBe("device_placement");
  });

  it("returns null when no signature columns are present", () => {
    const headers = ["Date", "Campaign name", "Ad name", "Impressions", "Spend"];
    expect(detectCsvClassFromHeaders(headers)).toBeNull();
  });

  it("returns null for an empty header list", () => {
    expect(detectCsvClassFromHeaders([])).toBeNull();
  });
});

// ─── checkDuplicateCsvClasses ─────────────────────────────────────────────────

describe("checkDuplicateCsvClasses", () => {
  it("returns null when both slots cover distinct classes (demographic + device_placement)", () => {
    const result = checkDuplicateCsvClasses(["demographic"], ["device_placement"]);
    expect(result).toBeNull();
  });

  it("returns null when both slots cover distinct classes (device_placement + demographic)", () => {
    const result = checkDuplicateCsvClasses(["device_placement"], ["demographic"]);
    expect(result).toBeNull();
  });

  it("returns null when both slots contain nulls (detection inconclusive)", () => {
    const result = checkDuplicateCsvClasses([null], [null]);
    expect(result).toBeNull();
  });

  it("returns null when one slot is null and the other has a class", () => {
    expect(checkDuplicateCsvClasses([null], ["demographic"])).toBeNull();
    expect(checkDuplicateCsvClasses(["device_placement"], [null])).toBeNull();
  });

  it("reports duplicate when both slots are demographic", () => {
    const result = checkDuplicateCsvClasses(["demographic"], ["demographic"]);
    expect(result).toEqual({ duplicatedClass: "demographic", missingClass: "device_placement" });
  });

  it("reports duplicate when both slots are device_placement", () => {
    const result = checkDuplicateCsvClasses(["device_placement"], ["device_placement"]);
    expect(result).toEqual({ duplicatedClass: "device_placement", missingClass: "demographic" });
  });

  it("uses first detectable class when a slot has multiple imports, reports duplicate if both slots match", () => {
    const result = checkDuplicateCsvClasses(
      ["demographic", "demographic"],
      ["demographic"],
    );
    expect(result).toEqual({ duplicatedClass: "demographic", missingClass: "device_placement" });
  });

  it("uses first non-null detection per slot", () => {
    const result = checkDuplicateCsvClasses(
      [null, "demographic"],
      [null, "demographic"],
    );
    expect(result).toEqual({ duplicatedClass: "demographic", missingClass: "device_placement" });
  });
});

// ─── End-to-end: header detection feeding into the duplicate check ────────────

describe("detectCsvClassFromHeaders + checkDuplicateCsvClasses round-trip", () => {
  function headersFor(cls: IapCsvClass): string[] {
    if (cls === "demographic") {
      return ["Date", "Campaign name", "Ad set name", "Ad name", "Gender", "Age", "Impressions"];
    }
    return ["Date", "Campaign name", "Ad set name", "Ad name", "Impression device", "Platform", "Placement", "Impressions"];
  }

  it("rejects two demographic CSVs (one in each slot)", () => {
    const demoDetected = [detectCsvClassFromHeaders(headersFor("demographic"))];
    const placementDetected = [detectCsvClassFromHeaders(headersFor("demographic"))];
    const result = checkDuplicateCsvClasses(demoDetected, placementDetected);
    expect(result).not.toBeNull();
    expect(result?.duplicatedClass).toBe("demographic");
    expect(result?.missingClass).toBe("device_placement");
  });

  it("rejects two device_placement CSVs (one in each slot)", () => {
    const demoDetected = [detectCsvClassFromHeaders(headersFor("device_placement"))];
    const placementDetected = [detectCsvClassFromHeaders(headersFor("device_placement"))];
    const result = checkDuplicateCsvClasses(demoDetected, placementDetected);
    expect(result).not.toBeNull();
    expect(result?.duplicatedClass).toBe("device_placement");
    expect(result?.missingClass).toBe("demographic");
  });

  it("accepts one of each class (correct setup)", () => {
    const demoDetected = [detectCsvClassFromHeaders(headersFor("demographic"))];
    const placementDetected = [detectCsvClassFromHeaders(headersFor("device_placement"))];
    expect(checkDuplicateCsvClasses(demoDetected, placementDetected)).toBeNull();
  });
});
