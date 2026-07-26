import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EcasConfig } from "./config.js";
import { InvalidImageError, isFourByFive, readPngDimensionsFromFile } from "./image.js";
import type { CampaignManifest, ManifestAd } from "./schemas.js";

/**
 * The non-negotiable validation gates from CLAUDE.md. Every check here
 * collects into a flat issue list rather than throwing on the first
 * failure — Claude (and a human reviewer) needs the full picture of what's
 * wrong with a manifest in one pass, not a trial-and-error loop.
 */

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ResolvedAccountIdentity {
  ad_account_id: string;
  page_id: string;
  instagram_actor_id: string;
  pixel_id: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  resolvedAccount: ResolvedAccountIdentity;
}

const PLACEHOLDER_PATTERN = /^REPLACE_WITH_/i;
const TEMPLATE_TOKEN_PATTERN = /\$\{[A-Z0-9_]+\}/;
const IDENTITY_TOKEN_PATTERN = /^\$\{([A-Z0-9_]+)\}$/;

function knownInterpolations(config: EcasConfig): Record<string, string> {
  return {
    META_AD_ACCOUNT_ID: config.adAccountId,
    META_PAGE_ID: config.pageId,
    META_INSTAGRAM_ACTOR_ID: config.instagramActorId,
    META_PIXEL_ID: config.pixelId,
  };
}

/**
 * Resolves a manifest string that is either a literal value or an exact
 * `${META_X}` token referencing a configured identity value. Anything that
 * doesn't match a known token is returned unchanged so the caller can flag
 * it as unresolved — this never guesses at a value.
 */
export function resolveIdentityToken(value: string, config: EcasConfig): string {
  const match = value.trim().match(IDENTITY_TOKEN_PATTERN);
  if (!match) return value;
  const known = knownInterpolations(config);
  return match[1] in known ? known[match[1]] : value;
}

export function isUnresolvedPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim()) || TEMPLATE_TOKEN_PATTERN.test(value);
}

function scanForPlaceholders(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value === "string") {
    if (isUnresolvedPlaceholder(value)) {
      issues.push({
        code: "unresolved_placeholder",
        path,
        message: `${path} still contains an unresolved placeholder: "${value}"`,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForPlaceholders(entry, `${path}[${index}]`, issues));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      scanForPlaceholders(entry, `${path}.${key}`, issues);
    }
  }
}

function validateAccountIdentity(
  manifest: CampaignManifest,
  config: EcasConfig,
  issues: ValidationIssue[],
): ResolvedAccountIdentity {
  const resolved: ResolvedAccountIdentity = {
    ad_account_id: resolveIdentityToken(manifest.account.ad_account_id, config),
    page_id: resolveIdentityToken(manifest.account.page_id, config),
    instagram_actor_id: resolveIdentityToken(manifest.account.instagram_actor_id, config),
    pixel_id: resolveIdentityToken(manifest.account.pixel_id, config),
  };

  const checks: Array<[keyof ResolvedAccountIdentity, string, string]> = [
    ["ad_account_id", resolved.ad_account_id, config.adAccountId],
    ["page_id", resolved.page_id, config.pageId],
    ["instagram_actor_id", resolved.instagram_actor_id, config.instagramActorId],
    ["pixel_id", resolved.pixel_id, config.pixelId],
  ];

  for (const [field, actual, expected] of checks) {
    const path = `account.${field}`;
    if (isUnresolvedPlaceholder(actual)) {
      issues.push({ code: "unresolved_placeholder", path, message: `${path} is still an unresolved placeholder: "${actual}"` });
    } else if (actual !== expected) {
      issues.push({ code: "identity_mismatch", path, message: `${path} ("${actual}") does not match the configured ECAS value.` });
    }
  }

  return resolved;
}

// Scoped tightly to the approved ECAS Sprint 2 use case (CLAUDE.md "Mission").
// An unlisted combination fails closed rather than being silently accepted.
function validateObjectiveCombination(manifest: CampaignManifest, issues: ValidationIssue[]): void {
  const rules: Array<[string, string, string]> = [
    ["campaign.objective", manifest.campaign.objective, "OUTCOME_SALES"],
    ["adset.optimization_goal", manifest.adset.optimization_goal, "OFFSITE_CONVERSIONS"],
    ["adset.billing_event", manifest.adset.billing_event, "IMPRESSIONS"],
    ["adset.conversion_event", manifest.adset.conversion_event, "PURCHASE"],
    ["adset.destination_type", manifest.adset.destination_type, "WEBSITE"],
  ];
  for (const [path, actual, expected] of rules) {
    if (actual !== expected) {
      issues.push({
        code: "unsupported_objective_combination",
        path,
        message: `${path} ("${actual}") is not approved for this integration. Only "${expected}" is supported.`,
      });
    }
  }
}

function validateBudget(manifest: CampaignManifest, config: EcasConfig, issues: ValidationIssue[]): void {
  const raw = manifest.adset.daily_budget_minor_units;
  const path = "adset.daily_budget_minor_units";

  if (typeof raw === "string") {
    if (isUnresolvedPlaceholder(raw)) return; // already reported by the generic placeholder scan
    issues.push({ code: "invalid_budget", path, message: `${path} must be a resolved integer, not the string "${raw}".` });
    return;
  }
  if (!Number.isInteger(raw) || raw <= 0) {
    issues.push({ code: "invalid_budget", path, message: `${path} must be a positive integer (minor currency units).` });
    return;
  }
  if (raw > config.maxDailyBudgetMinorUnits) {
    issues.push({
      code: "budget_exceeds_ceiling",
      path,
      message: `${path} (${raw}) exceeds the configured ceiling of ${config.maxDailyBudgetMinorUnits} minor units.`,
    });
  }
}

function validateDuplicates(manifest: CampaignManifest, issues: ValidationIssue[]): void {
  const seenConceptIds = new Set<string>();
  const seenFilenames = new Set<string>();
  manifest.ads.forEach((ad, index) => {
    const path = `ads[${index}]`;
    if (seenConceptIds.has(ad.concept_id)) {
      issues.push({ code: "duplicate_concept_id", path: `${path}.concept_id`, message: `Duplicate concept_id "${ad.concept_id}" within this batch.` });
    }
    seenConceptIds.add(ad.concept_id);

    if (seenFilenames.has(ad.filename)) {
      issues.push({ code: "duplicate_filename", path: `${path}.filename`, message: `Duplicate filename "${ad.filename}" within this batch.` });
    }
    seenFilenames.add(ad.filename);
  });
}

function validateDestinationHost(ad: ManifestAd, config: EcasConfig, path: string, issues: ValidationIssue[]): void {
  let host: string;
  try {
    host = new URL(ad.destination_url).hostname.toLowerCase();
  } catch {
    issues.push({ code: "invalid_destination_url", path: `${path}.destination_url`, message: `${path}.destination_url is not a valid URL.` });
    return;
  }
  if (!config.allowedDestinationHosts.has(host)) {
    issues.push({
      code: "destination_not_allowed",
      path: `${path}.destination_url`,
      message: `${path}.destination_url host "${host}" is not in the allowed destination list.`,
    });
  }
}

function validateUtmContent(ad: ManifestAd, path: string, issues: ValidationIssue[]): void {
  const params = new URLSearchParams(ad.url_tags);
  const utmContent = params.get("utm_content");
  if (!utmContent) {
    issues.push({ code: "missing_utm_content", path: `${path}.url_tags`, message: `${path}.url_tags is missing a utm_content value.` });
    return;
  }
  if (utmContent !== ad.name) {
    issues.push({
      code: "utm_content_mismatch",
      path: `${path}.url_tags`,
      message: `${path}.url_tags utm_content ("${utmContent}") must equal the ad name ("${ad.name}").`,
    });
  }
}

function validateConceptFilenameConsistency(ad: ManifestAd, path: string, issues: ValidationIssue[]): void {
  const expected = `${ad.concept_id}_4x5.png`;
  if (ad.filename !== expected) {
    issues.push({
      code: "concept_filename_mismatch",
      path: `${path}.filename`,
      message: `${path}.filename ("${ad.filename}") does not match concept_id ("${ad.concept_id}"); expected "${expected}".`,
    });
  }
}

async function validateCreativeFile(ad: ManifestAd, config: EcasConfig, path: string, issues: ValidationIssue[]): Promise<void> {
  const filePath = join(config.creativeDir, ad.filename);
  if (!existsSync(filePath)) {
    issues.push({ code: "missing_file", path: `${path}.filename`, message: `Creative file not found: ${filePath}` });
    return;
  }
  try {
    const dimensions = await readPngDimensionsFromFile(filePath);
    if (!isFourByFive(dimensions)) {
      issues.push({
        code: "unsupported_image_dimensions",
        path: `${path}.filename`,
        message: `${filePath} is ${dimensions.width}x${dimensions.height}, which is not a 4:5 aspect ratio.`,
      });
    }
  } catch (error) {
    const message = error instanceof InvalidImageError ? error.message : `Could not read image: ${(error as Error).message}`;
    issues.push({ code: "unsupported_image_type", path: `${path}.filename`, message: `${filePath}: ${message}` });
  }
}

export async function validateManifest(manifest: CampaignManifest, config: EcasConfig): Promise<ManifestValidationResult> {
  const issues: ValidationIssue[] = [];

  scanForPlaceholders(manifest.campaign, "campaign", issues);
  scanForPlaceholders(manifest.adset, "adset", issues);
  manifest.ads.forEach((ad, index) => scanForPlaceholders(ad, `ads[${index}]`, issues));

  const resolvedAccount = validateAccountIdentity(manifest, config, issues);
  validateObjectiveCombination(manifest, issues);
  validateBudget(manifest, config, issues);
  validateDuplicates(manifest, issues);

  for (const [index, ad] of manifest.ads.entries()) {
    const path = `ads[${index}]`;
    validateDestinationHost(ad, config, path, issues);
    validateUtmContent(ad, path, issues);
    validateConceptFilenameConsistency(ad, path, issues);
    await validateCreativeFile(ad, config, path, issues);
  }

  return {
    valid: issues.length === 0,
    issues,
    resolvedAccount,
  };
}
