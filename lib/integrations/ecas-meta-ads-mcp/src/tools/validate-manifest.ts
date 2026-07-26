import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ZodError } from "zod";
import type { EcasConfig } from "../config.js";
import { logEvent } from "../logging.js";
import { CampaignManifestSchema, type ValidateManifestInputSchema } from "../schemas.js";
import { validateManifest, type ValidationIssue } from "../safety.js";
import type { z } from "zod";

type Input = z.infer<typeof ValidateManifestInputSchema>;

function zodIssuesToValidationIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    code: "schema_error",
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/**
 * Read-only: validates a campaign manifest against its declared shape and
 * every CLAUDE.md safety gate (identity match, allowlisted destination,
 * budget ceiling, duplicates, placeholders, file presence/dimensions).
 * Never calls Meta and never writes anything — this is purely local
 * validation of the manifest and the referenced creative files.
 */
export async function runValidateManifest(config: EcasConfig, input: Input): Promise<CallToolResult> {
  const manifestPath = resolve(input.manifest_path);
  logEvent("info", "meta_validate_manifest: starting", { manifestPath });

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ valid: false, issues: [{ code: "manifest_not_found", path: "manifest_path", message: `Could not read manifest at ${manifestPath}: ${(error as Error).message}` }] }, null, 2) }],
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ valid: false, issues: [{ code: "invalid_json", path: "manifest_path", message: `Manifest is not valid JSON: ${(error as Error).message}` }] }, null, 2) }],
    };
  }

  const parseResult = CampaignManifestSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    const issues = zodIssuesToValidationIssues(parseResult.error);
    logEvent("warn", "meta_validate_manifest: failed shape validation", { issueCount: issues.length });
    return {
      content: [{ type: "text", text: JSON.stringify({ valid: false, issues }, null, 2) }],
    };
  }

  const result = await validateManifest(parseResult.data, config);

  logEvent(result.valid ? "info" : "warn", "meta_validate_manifest: completed", {
    valid: result.valid,
    issueCount: result.issues.length,
  });

  const response = {
    valid: result.valid,
    issues: result.issues,
    resolved_account: result.resolvedAccount,
    deployment_plan: result.valid
      ? {
          mode: parseResult.data.mode,
          campaign_name: parseResult.data.campaign.name,
          adset_name: parseResult.data.adset.name,
          daily_budget_minor_units: parseResult.data.adset.daily_budget_minor_units,
          ad_count: parseResult.data.ads.length,
          concept_ids: parseResult.data.ads.map((ad) => ad.concept_id),
          all_statuses: "PAUSED",
          note:
            "Validation only — no Meta objects have been created. Paused draft creation (meta_upload_image, meta_create_campaign_draft, meta_create_adset_draft, meta_create_creative_draft, meta_create_ad_draft) is a separate, explicitly-approved stage.",
        }
      : null,
  };

  return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
}
