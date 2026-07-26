import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig, redactedConfigSummary } from "./config.js";
import { logEvent } from "./logging.js";
import { registerTools } from "./tools/index.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  logEvent("info", "ecas-meta-ads-mcp starting", redactedConfigSummary(config));

  const server = new McpServer({
    name: "ecas-meta-ads",
    version: "0.1.0",
  });

  registerTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logEvent("info", "ecas-meta-ads-mcp ready (read-only toolset: meta_validate_connection, meta_get_account_context, meta_validate_manifest)");
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${(error as Error).stack ?? (error as Error).message}\n`);
  process.exit(1);
});
