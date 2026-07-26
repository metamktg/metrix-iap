import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EcasConfig } from "../config.js";
import { ValidateManifestInputSchema } from "../schemas.js";
import { runGetAccountContext } from "./get-account-context.js";
import { runValidateConnection } from "./validate-connection.js";
import { runValidateManifest } from "./validate-manifest.js";

/**
 * Registers the Stage 3 read-only toolset. None of these tools create,
 * modify, or activate anything in Meta — they only validate.
 *
 * Draft-creation tools (meta_upload_image, meta_create_campaign_draft,
 * meta_create_adset_draft, meta_create_creative_draft, meta_create_ad_draft,
 * meta_get_ad_preview, meta_reconcile_batch) are Stage 4 and require a
 * separate explicit approval before being implemented, per KICKOFF_PROMPT.md.
 */
export function registerTools(server: McpServer, config: EcasConfig): void {
  server.registerTool(
    "meta_validate_connection",
    {
      title: "Validate Meta connection",
      description:
        "Read-only. Confirms the configured access token can see the configured East Coast Art Studio ad account. Makes no changes.",
      inputSchema: {},
    },
    async () => runValidateConnection(config),
  );

  server.registerTool(
    "meta_get_account_context",
    {
      title: "Get ECAS account context",
      description:
        "Read-only. Resolves the configured ad account, Page, Instagram actor, and pixel and reports whether each was found. Makes no changes.",
      inputSchema: {},
    },
    async () => runGetAccountContext(config),
  );

  server.registerTool(
    "meta_validate_manifest",
    {
      title: "Validate campaign manifest",
      description:
        "Read-only. Validates a campaign manifest JSON file against every CLAUDE.md safety gate: resolved placeholders, account/Page/Instagram/pixel identity match, allowlisted destination host, budget ceiling, PAUSED-only statuses, duplicate concept IDs/filenames, UTM content, and local creative file presence/dimensions. Never calls the Meta API and never creates anything.",
      inputSchema: ValidateManifestInputSchema.shape,
    },
    async (args) => runValidateManifest(config, args),
  );
}
