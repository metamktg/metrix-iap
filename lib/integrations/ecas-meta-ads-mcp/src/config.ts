import "dotenv/config";

/**
 * Loads and validates the environment this MCP server runs under.
 *
 * CLAUDE.md hard rule: never place credentials in source control, never log
 * a full token, never let the server start against an unresolved identity.
 * Everything the safety layer later checks a manifest against (account,
 * Page, Instagram actor, pixel, allowed hosts, budget ceiling) is read once
 * here so there is a single source of truth for "what ECAS actually is."
 */

const REQUIRED_KEYS = [
  "META_GRAPH_VERSION",
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_PAGE_ID",
  "META_INSTAGRAM_ACTOR_ID",
  "META_PIXEL_ID",
] as const;

export interface EcasConfig {
  graphVersion: string;
  accessToken: string;
  appId: string | undefined;
  appSecret: string | undefined;
  adAccountId: string;
  pageId: string;
  instagramActorId: string;
  pixelId: string;
  allowedDestinationHosts: ReadonlySet<string>;
  maxDailyBudgetMinorUnits: number;
  mutationLogPath: string;
  creativeDir: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function readRequired(env: NodeJS.ProcessEnv, missing: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of REQUIRED_KEYS) {
    const value = env[key]?.trim();
    if (!value) {
      missing.push(key);
      continue;
    }
    values[key] = value;
  }
  return values;
}

function parseAllowedHosts(raw: string | undefined): Set<string> {
  const fallback = "eastcoastartstudio.com,www.eastcoastartstudio.com";
  return new Set(
    (raw ?? fallback)
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host.length > 0),
  );
}

function parseMaxBudget(raw: string | undefined, missing: string[]): number {
  const fallback = 10000;
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    missing.push("META_MAX_DAILY_BUDGET_MINOR_UNITS (must be a positive integer)");
    return fallback;
  }
  return parsed;
}

/**
 * Loads config from process.env. Throws ConfigError listing every missing
 * or malformed value at once, rather than failing one variable at a time —
 * KICKOFF_PROMPT.md Stage 1 asks for "required environment values still
 * missing" up front, not a trial-and-error loop.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): EcasConfig {
  const missing: string[] = [];
  const required = readRequired(env, missing);

  const adAccountId = required.META_AD_ACCOUNT_ID;
  if (adAccountId && !adAccountId.startsWith("act_")) {
    missing.push("META_AD_ACCOUNT_ID (must start with 'act_')");
  }

  const maxDailyBudgetMinorUnits = parseMaxBudget(env.META_MAX_DAILY_BUDGET_MINOR_UNITS, missing);

  if (missing.length > 0) {
    throw new ConfigError(
      `Missing or invalid required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}\n` +
        "See .env.example. Populate .env and never commit it.",
    );
  }

  return {
    graphVersion: required.META_GRAPH_VERSION,
    accessToken: required.META_ACCESS_TOKEN,
    appId: env.META_APP_ID?.trim() || undefined,
    appSecret: env.META_APP_SECRET?.trim() || undefined,
    adAccountId,
    pageId: required.META_PAGE_ID,
    instagramActorId: required.META_INSTAGRAM_ACTOR_ID,
    pixelId: required.META_PIXEL_ID,
    allowedDestinationHosts: parseAllowedHosts(env.META_ALLOWED_DESTINATION_HOSTS),
    maxDailyBudgetMinorUnits,
    mutationLogPath: env.META_MUTATION_LOG_PATH?.trim() || "./logs/meta-mutations.jsonl",
    creativeDir: env.ECAS_CREATIVE_DIR?.trim() || "./creatives",
  };
}

/** Safe-to-log summary — never includes the token, app secret, or any prefix of them. */
export function redactedConfigSummary(config: EcasConfig): Record<string, unknown> {
  return {
    graphVersion: config.graphVersion,
    adAccountId: config.adAccountId,
    pageId: config.pageId,
    instagramActorId: config.instagramActorId,
    pixelId: config.pixelId,
    allowedDestinationHosts: [...config.allowedDestinationHosts],
    maxDailyBudgetMinorUnits: config.maxDailyBudgetMinorUnits,
    mutationLogPath: config.mutationLogPath,
    creativeDir: config.creativeDir,
    // Named to avoid the word "token"/"secret" — logEvent()'s redact() strips any
    // field whose *key* contains those substrings, which would otherwise turn
    // this harmless boolean into a confusing "[redacted]" in the server log.
    credentialsLoaded: config.accessToken.length > 0,
    appCredentialsLoaded: Boolean(config.appId && config.appSecret),
  };
}
