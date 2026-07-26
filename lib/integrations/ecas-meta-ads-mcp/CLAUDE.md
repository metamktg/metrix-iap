# ECAS Meta Ads MCP — Project Instructions

## Mission

A private local MCP server that lets Claude Code validate and (under a
separate, explicitly-approved stage) create Meta ad objects for the East
Coast Art Studio ad account.

The first production use case is the ECAS Sprint 2 static creative batch.

## Operating mode

Work in two phases:

1. **Build and validate** — read-only tools, manifest validation, tests.
2. **Create Meta objects in `PAUSED` status only** — a separate stage that
   requires explicit human approval before it is even implemented.

Do not activate campaigns, ad sets, or ads. Ever, in this package.

## Hard safety rules

- Never place access tokens, app secrets, or system-user credentials in
  source control. `.env` is gitignored at the workspace root — keep it that
  way.
- Never print full access tokens to logs or terminal output (`src/logging.ts`
  redacts any field whose key looks credential-shaped; keep using it).
- Never write credentials into this file, `.mcp.json`, the campaign
  manifest, fixtures, tests, or screenshots.
- Use environment variables (`.env`, loaded by `src/config.ts`) for all
  credentials and account identifiers.
- Allow mutations only against the configured East Coast Art Studio ad
  account (`META_AD_ACCOUNT_ID`).
- Allow destination URLs only on hosts in `META_ALLOWED_DESTINATION_HOSTS`.
- Create campaigns, ad sets, creatives, and ads in `PAUSED` status only.
- Separate creation from activation. Do not implement activation
  (`meta_activate_approved_ads` or equivalent) until the draft workflow has
  shipped and been reviewed by a human.
- Require an explicit, validated manifest for every batch — never infer
  missing budget, targeting, attribution, pixel, Page, Instagram, or
  destination settings.
- Stop on any account, Page, Instagram, pixel, destination, budget, or
  naming mismatch (`src/safety.ts` is the single source of truth for these
  gates — extend it, don't duplicate its checks elsewhere).
- Make mutation operations idempotent once they exist. Before retrying,
  check whether Meta already created the object (`src/logging.ts`'s
  `MutationLogger` + `hashRequest` exist for exactly this).
- Log every mutation locally without secrets.
- Validate image dimensions and filename format before upload.

## Approved filename format

`<CONCEPT_ID>_4x5.png`

Examples: `C5D_4x5.png`, `C6B_4x5.png`, `C10A_4x5.png`. No descriptive
strings are permitted.

## MCP tools

Read-only (implemented):

1. `meta_validate_connection`
2. `meta_get_account_context`
3. `meta_validate_manifest`

Paused-draft creation (Stage 4 — **not implemented**; requires explicit
approval before starting):

4. `meta_upload_image`
5. `meta_create_campaign_draft`
6. `meta_create_adset_draft`
7. `meta_create_creative_draft`
8. `meta_create_ad_draft`
9. `meta_get_ad_preview`
10. `meta_reconcile_batch`

Activation (not planned as part of this build at all — separate future
workflow, separate approval):

11. `meta_activate_approved_ads`

## Validation requirements (enforced in `src/safety.ts`)

Reject:

- unresolved placeholders
- duplicate concept IDs or filenames
- filenames not matching `^C[0-9]+[A-D]_4x5\.png$`
- missing files
- unsupported image types or dimensions (must be a valid PNG, exactly 4:5)
- destinations outside the allowlist
- missing approved copy or CTA
- any status other than `PAUSED`
- budget above the environment ceiling
- account, Page, Instagram, or pixel mismatches
- objective/optimization/billing/conversion/destination combinations
  outside the single approved combination for this integration
  (`OUTCOME_SALES` / `OFFSITE_CONVERSIONS` / `IMPRESSIONS` / `PURCHASE` /
  `WEBSITE`)

## Engineering requirements

- TypeScript, Node.js 20+
- Official MCP TypeScript SDK (`@modelcontextprotocol/sdk`, `registerTool`)
- Zod validation (workspace catalog pins Zod 3 — use `z.string().url()`,
  not the Zod-4-only `z.url()`)
- Native `fetch`
- Structured errors, structured JSON logs to stderr only (this is a stdio
  MCP server — stdout is reserved for the JSON-RPC stream)
- Unit tests (vitest)
- `pnpm --filter @workspace/ecas-meta-ads-mcp run dry-run -- <manifest.json>`
  for local validation outside of Claude Code / MCP entirely

## Definition of done (current stage)

1. Typecheck passes (`pnpm --filter @workspace/ecas-meta-ads-mcp run typecheck`).
2. Tests pass (`pnpm --filter @workspace/ecas-meta-ads-mcp run test`).
3. MCP server starts locally (`pnpm --filter @workspace/ecas-meta-ads-mcp run start`).
4. Claude Code detects it (`claude mcp list`).
5. Read-only account validation succeeds against the real ECAS account.
6. A real ECAS manifest validates cleanly via `meta_validate_manifest`.
7. No Meta objects have been created.
8. A human-readable deployment plan is produced for approval before Stage 4
   (draft creation tools) is even implemented.
