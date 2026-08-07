// Guard: every check:* and smoke:* script declared in scripts/package.json
// must run somewhere — either directly in a configured workflow (.replit),
// indirectly via the IAP smoke orchestrator (IAP_SMOKE_STEPS), or be
// explicitly allowlisted in MANUAL_ONLY_CHECK_SCRIPTS with a reason. This
// makes "added a check script but never wired it into any workflow" a loud
// failure instead of a silent omission.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS,
  IAP_SMOKE_STEPS,
} from "./metrix-iap-smoke-steps.js";
import { MANUAL_ONLY_CHECK_SCRIPTS } from "./workflow-check-coverage.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const pkg = JSON.parse(
  readFileSync(path.join(repoRoot, "scripts/package.json"), "utf8"),
) as { scripts: Record<string, string> };

const replit = readFileSync(path.join(repoRoot, ".replit"), "utf8");

// Script names invoked directly by workflow shell commands, e.g.
// `pnpm --filter @workspace/scripts run check:seed-fixture-drift`.
const workflowRunScripts = new Set(
  Array.from(
    replit.matchAll(/@workspace\/scripts run ((?:check|smoke|refresh):[\w:-]+)/g),
    (m) => m[1],
  ),
);

const guardedScripts = Object.keys(pkg.scripts).filter(
  (name) => name.startsWith("check:") || name.startsWith("smoke:"),
);

const orchestratorScripts = new Set(IAP_SMOKE_STEPS.map((s) => s.script));
const allowlisted = Object.keys(MANUAL_ONLY_CHECK_SCRIPTS);

// smoke:metrix-iap-* scripts are governed by their own guard
// (metrix-iap-smoke-coverage.test.ts): they must be an orchestrator step or
// excluded there. Here, a script counts as covered by the orchestrator only
// if the orchestrator itself runs in a workflow.
const orchestratorInWorkflow = workflowRunScripts.has("smoke:metrix-iap-tests");

// smoke:metrix-iap-* scripts deliberately excluded from the orchestrator carry
// a reason in EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS (validated by the sibling
// guard metrix-iap-smoke-coverage.test.ts). They count as allowlisted here —
// an explicit, reasoned exception — never as "covered".
const iapExcluded = Object.keys(EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS);

const isCovered = (name: string): boolean => {
  if (workflowRunScripts.has(name)) return true;
  if (orchestratorInWorkflow && orchestratorScripts.has(name)) return true;
  return false;
};

const isAllowlisted = (name: string): boolean =>
  allowlisted.includes(name) || iapExcluded.includes(name);

describe("workflow coverage of check:* / smoke:* scripts", () => {
  it("runs every check:*/smoke:* script in a workflow or allowlists it explicitly", () => {
    const missing = guardedScripts.filter(
      (name) => !isCovered(name) && !isAllowlisted(name),
    );
    expect(
      missing,
      `These check:*/smoke:* scripts exist in scripts/package.json but are not run ` +
        `by any configured workflow (.replit) nor by the IAP smoke orchestrator. ` +
        `Wire them into a workflow, or add them to MANUAL_ONLY_CHECK_SCRIPTS ` +
        `(src/lib/workflow-check-coverage.ts) — or, for smoke:metrix-iap-* scripts, ` +
        `to EXCLUDED_METRIX_IAP_SMOKE_SCRIPTS — with a reason: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the IAP smoke orchestrator wired into a workflow", () => {
    expect(
      orchestratorInWorkflow,
      "smoke:metrix-iap-tests must be run by a configured workflow — the IAP " +
        "smoke steps only count as covered because the orchestrator runs there.",
    ).toBe(true);
  });

  it("only allowlists scripts that actually exist in package.json", () => {
    const unknown = allowlisted.filter((name) => !(name in pkg.scripts));
    expect(
      unknown,
      `MANUAL_ONLY_CHECK_SCRIPTS references scripts missing from scripts/package.json: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("requires a non-empty reason for every allowlist entry", () => {
    const missingReason = Object.entries(MANUAL_ONLY_CHECK_SCRIPTS)
      .filter(([, reason]) => typeof reason !== "string" || reason.trim() === "")
      .map(([name]) => name);
    expect(
      missingReason,
      `Every entry in MANUAL_ONLY_CHECK_SCRIPTS must carry a non-empty reason. ` +
        `Missing reasons for: ${missingReason.join(", ")}`,
    ).toEqual([]);
  });

  it("does not allowlist scripts that are already covered by a workflow", () => {
    const redundant = allowlisted.filter((name) => isCovered(name));
    expect(
      redundant,
      `These MANUAL_ONLY_CHECK_SCRIPTS entries are already run by a workflow — ` +
        `remove the stale allowlist entries: ${redundant.join(", ")}`,
    ).toEqual([]);
  });

  it("parses at least the known workflow-run scripts from .replit", () => {
    // Sanity check that the .replit regex extraction is not silently broken.
    expect(workflowRunScripts.size).toBeGreaterThan(0);
    expect(workflowRunScripts.has("check:api-codegen-drift")).toBe(true);
  });
});
