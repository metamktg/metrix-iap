import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EcasConfig } from "../config.js";
import { logEvent } from "../logging.js";
import { MetaApiError, MetaGraphClient } from "../meta-client.js";

/**
 * Read-only: confirms the configured token can see the configured ECAS ad
 * account and nothing else has been touched. No object is created or
 * modified by this tool.
 */
export async function runValidateConnection(config: EcasConfig): Promise<CallToolResult> {
  const client = new MetaGraphClient(config);
  logEvent("info", "meta_validate_connection: starting", { adAccountId: config.adAccountId });

  try {
    const account = await client.get(config.adAccountId, ["id", "name", "account_status", "currency", "timezone_name"]);

    const idMatches = account.id === config.adAccountId;
    const result = {
      ok: true,
      account,
      configured_ad_account_id: config.adAccountId,
      id_matches_configured_account: idMatches,
    };

    if (!idMatches) {
      logEvent("warn", "meta_validate_connection: returned account id does not match configured id", {
        returned: account.id,
        configured: config.adAccountId,
      });
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const meta = error instanceof MetaApiError ? error : undefined;
    logEvent("error", "meta_validate_connection: failed", {
      message: (error as Error).message,
      code: meta?.code,
      type: meta?.type,
    });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: false,
              error: (error as Error).message,
              code: meta?.code,
              subcode: meta?.subcode,
              type: meta?.type,
              fbtrace_id: meta?.fbtraceId,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
