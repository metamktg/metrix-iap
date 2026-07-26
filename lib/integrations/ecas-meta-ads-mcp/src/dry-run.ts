import { ConfigError, loadConfig } from "./config.js";
import { runValidateManifest } from "./tools/validate-manifest.js";

/**
 * Standalone CLI entry point (`pnpm run dry-run -- <manifest.json>`) for
 * validating a manifest without going through Claude Code or MCP at all —
 * useful while iterating on a manifest locally. This is NOT the MCP
 * server; it prints straight to stdout.
 */
async function main(): Promise<void> {
  const manifestPath = process.argv[2] ?? "./campaign-manifest.example.json";

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

  const result = await runValidateManifest(config, { manifest_path: manifestPath });
  const text = result.content.map((block) => ("text" in block ? block.text : "")).join("\n");
  console.log(text);

  if (result.isError) process.exit(1);
  try {
    const parsed = JSON.parse(text) as { valid?: boolean };
    process.exit(parsed.valid === false ? 1 : 0);
  } catch {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${(error as Error).stack ?? (error as Error).message}\n`);
  process.exit(1);
});
