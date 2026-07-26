import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EcasConfig } from "../config.js";
import { logEvent } from "../logging.js";
import { MetaApiError, MetaGraphClient } from "../meta-client.js";

interface NodeResult {
  status: "ok" | "error";
  data?: Record<string, unknown>;
  error?: { message: string; code?: number; type?: string };
}

async function fetchNode(client: MetaGraphClient, nodeId: string, fields: string[]): Promise<NodeResult> {
  try {
    const data = await client.get(nodeId, fields);
    return { status: "ok", data };
  } catch (error) {
    const meta = error instanceof MetaApiError ? error : undefined;
    return { status: "error", error: { message: (error as Error).message, code: meta?.code, type: meta?.type } };
  }
}

/**
 * Read-only: resolves ad account, Page, Instagram actor, and pixel in one
 * call so Claude (and a human reviewer) can see the full configured
 * identity before any manifest is validated or anything is created.
 */
export async function runGetAccountContext(config: EcasConfig): Promise<CallToolResult> {
  const client = new MetaGraphClient(config);
  logEvent("info", "meta_get_account_context: starting", { adAccountId: config.adAccountId });

  const [adAccount, page, instagramActor, pixel] = await Promise.all([
    fetchNode(client, config.adAccountId, ["id", "name", "account_status", "currency", "timezone_name"]),
    fetchNode(client, config.pageId, ["id", "name"]),
    fetchNode(client, config.instagramActorId, ["id", "username"]),
    fetchNode(client, config.pixelId, ["id", "name"]),
  ]);

  const result = {
    ad_account: adAccount,
    page,
    instagram_actor: instagramActor,
    pixel,
    all_resolved: [adAccount, page, instagramActor, pixel].every((node) => node.status === "ok"),
  };

  logEvent("info", "meta_get_account_context: completed", { all_resolved: result.all_resolved });

  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
