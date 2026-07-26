import { z } from "zod";

/**
 * Structural/format validation for the campaign manifest and tool I/O.
 *
 * This layer only checks shape — regexes, enums, "is this a URL." It does
 * NOT know about the configured ECAS account, allowed hosts, or budget
 * ceiling; those are business rules that need config + filesystem access
 * and live in safety.ts. Keeping the split means schemas.ts stays a pure,
 * dependency-free description of "what a well-formed manifest looks like."
 */

// CLAUDE.md: approved filename format is exactly <CONCEPT_ID>_4x5.png, no
// descriptive strings.
export const FILENAME_PATTERN = /^C[0-9]+[A-D]_4x5\.png$/;
export const CONCEPT_ID_PATTERN = /^C[0-9]+[A-D]$/;

// Meta call-to-action values relevant to OUTCOME_SALES website conversion ads.
// Extend deliberately — an unlisted CTA should fail validation, not pass silently.
export const CTA_VALUES = [
  "SHOP_NOW",
  "LEARN_MORE",
  "SIGN_UP",
  "SUBSCRIBE",
  "DOWNLOAD",
  "BOOK_NOW",
  "CONTACT_US",
  "GET_OFFER",
  "GET_QUOTE",
  "ORDER_NOW",
  "APPLY_NOW",
  "DONATE_NOW",
  "SEND_MESSAGE",
  "WATCH_MORE",
] as const;

export const CtaSchema = z.enum(CTA_VALUES);

// Every creatable object must be PAUSED. This is enforced at the schema
// level (not just safety.ts) so a manifest declaring "ACTIVE" fails to even
// parse, per KICKOFF_PROMPT.md Stage 4: "Hard-code PAUSED. Reject overrides."
export const PausedStatusSchema = z.literal("PAUSED");

export const ManifestModeSchema = z.enum(["dry_run", "deploy"]);

export const ManifestAccountSchema = z.object({
  ad_account_id: z.string().min(1),
  page_id: z.string().min(1),
  instagram_actor_id: z.string().min(1),
  pixel_id: z.string().min(1),
});

export const ManifestCampaignSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  status: PausedStatusSchema,
  special_ad_categories: z.array(z.string()),
});

export const ManifestAdsetSchema = z.object({
  name: z.string().min(1),
  status: PausedStatusSchema,
  // Accepted as string-or-number at the shape layer because an unresolved
  // manifest legitimately carries a "REPLACE_WITH_..." placeholder here;
  // safety.ts rejects placeholders and enforces the numeric budget ceiling.
  daily_budget_minor_units: z.union([z.number(), z.string()]),
  billing_event: z.string().min(1),
  optimization_goal: z.string().min(1),
  conversion_event: z.string().min(1),
  destination_type: z.string().min(1),
  attribution_spec: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  targeting: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

export const ManifestAdSchema = z.object({
  concept_id: z.string().regex(CONCEPT_ID_PATTERN, "concept_id must match ^C[0-9]+[A-D]$"),
  filename: z.string().regex(FILENAME_PATTERN, "filename must match ^C[0-9]+[A-D]_4x5.png$"),
  name: z.string().min(1),
  status: PausedStatusSchema,
  primary_text: z.string().min(1),
  headline: z.string().min(1),
  description: z.string(),
  cta: CtaSchema,
  destination_url: z.string().url(),
  url_tags: z.string().min(1),
});

export const CampaignManifestSchema = z.object({
  schema_version: z.string().min(1),
  client: z.string().min(1),
  mode: ManifestModeSchema,
  account: ManifestAccountSchema,
  campaign: ManifestCampaignSchema,
  adset: ManifestAdsetSchema,
  ads: z.array(ManifestAdSchema).min(1),
});

export type CampaignManifest = z.infer<typeof CampaignManifestSchema>;
export type ManifestAd = z.infer<typeof ManifestAdSchema>;

export const ValidateManifestInputSchema = z.object({
  manifest_path: z.string().min(1).describe("Absolute or workspace-relative path to the campaign manifest JSON file."),
});

export const UploadImageInputSchema = z.object({
  file_path: z.string().min(1),
});
