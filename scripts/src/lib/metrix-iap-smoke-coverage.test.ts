// Guard: every smoke:metrix-iap-* script declared in scripts/package.json
// must either be run by the smoke-metrix-iap-tests orchestrator (via
// IAP_SMOKE_STEPS) or be explicitly excluded with a reason. This makes
// "added a smoke script but forgot to wire it into the main suite" a loud
// failure instead of a silent omission.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS,
  IAP_SMOKE_STEPS,
} from "./metrix-iap-smoke-steps.js";

const pkgPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../package.json",
);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
  scripts: Record<string, string>;
};

const declaredIapSmokeScripts = Object.keys(pkg.scripts).filter((name) =>
  name.startsWith("smoke:metrix-iap-"),
);
const stepScripts = IAP_SMOKE_STEPS.map((s) => s.script);
const excluded = Object.keys(EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS);

describe("metrix-iap smoke suite coverage", () => {
  it("runs every smoke:metrix-iap-* script or excludes it explicitly", () => {
    const missing = declaredIapSmokeScripts.filter(
      (name) => !stepScripts.includes(name) && !excluded.includes(name),
    );
    expect(
      missing,
      `These smoke:metrix-iap-* scripts exist in scripts/package.json but are not run by smoke:metrix-iap-tests. ` +
        `Add them to IAP_SMOKE_STEPS in src/lib/metrix-iap-smoke-steps.ts, or add them to ` +
        `EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS with a reason: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("only references scripts that actually exist in package.json", () => {
    const unknownSteps = stepScripts.filter((name) => !(name in pkg.scripts));
    expect(
      unknownSteps,
      `IAP_SMOKE_STEPS references scripts missing from scripts/package.json: ${unknownSteps.join(", ")}`,
    ).toEqual([]);

    const unknownExclusions = excluded.filter((name) => !(name in pkg.scripts));
    expect(
      unknownExclusions,
      `EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS references scripts missing from scripts/package.json: ${unknownExclusions.join(", ")}`,
    ).toEqual([]);
  });

  it("requires a non-empty reason for every exclusion", () => {
    const missingReason = Object.entries(EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS)
      .filter(([, reason]) => typeof reason !== "string" || reason.trim() === "")
      .map(([name]) => name);
    expect(
      missingReason,
      `Every entry in EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS must carry a non-empty reason. ` +
        `Missing reasons for: ${missingReason.join(", ")}`,
    ).toEqual([]);
  });

  it("has no overlap between steps and exclusions, and no duplicate steps", () => {
    const overlap = stepScripts.filter((name) => excluded.includes(name));
    expect(overlap).toEqual([]);
    expect(new Set(stepScripts).size).toBe(stepScripts.length);
  });
});
