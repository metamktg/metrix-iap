import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, redactedConfigSummary } from "../src/config.js";

const VALID_ENV = {
  META_GRAPH_VERSION: "v21.0",
  META_ACCESS_TOKEN: "super-secret-token",
  META_AD_ACCOUNT_ID: "act_123",
  META_PAGE_ID: "page_1",
  META_INSTAGRAM_ACTOR_ID: "ig_1",
  META_PIXEL_ID: "pixel_1",
};

describe("loadConfig", () => {
  it("loads successfully with all required values and sensible defaults", () => {
    const config = loadConfig({ ...VALID_ENV });
    expect(config.adAccountId).toBe("act_123");
    expect(config.allowedDestinationHosts.has("eastcoastartstudio.com")).toBe(true);
    expect(config.maxDailyBudgetMinorUnits).toBe(10000);
    expect(config.creativeDir).toBe("./creatives");
  });

  it("throws ConfigError listing every missing required key at once", () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    try {
      loadConfig({});
    } catch (error) {
      const message = (error as Error).message;
      for (const key of Object.keys(VALID_ENV)) {
        expect(message).toContain(key);
      }
    }
  });

  it("rejects an ad account id without the act_ prefix", () => {
    expect(() => loadConfig({ ...VALID_ENV, META_AD_ACCOUNT_ID: "123456789" })).toThrowError(ConfigError);
  });

  it("rejects a non-numeric budget ceiling", () => {
    expect(() => loadConfig({ ...VALID_ENV, META_MAX_DAILY_BUDGET_MINOR_UNITS: "not-a-number" })).toThrowError(ConfigError);
  });

  it("respects overridden allowed hosts and budget ceiling", () => {
    const config = loadConfig({
      ...VALID_ENV,
      META_ALLOWED_DESTINATION_HOSTS: "example.com, www.example.com",
      META_MAX_DAILY_BUDGET_MINOR_UNITS: "2500",
    });
    expect([...config.allowedDestinationHosts]).toEqual(["example.com", "www.example.com"]);
    expect(config.maxDailyBudgetMinorUnits).toBe(2500);
  });
});

describe("redactedConfigSummary", () => {
  it("never includes the raw access token or app secret", () => {
    const config = loadConfig({ ...VALID_ENV, META_APP_SECRET: "shh-app-secret" });
    const summary = JSON.stringify(redactedConfigSummary(config));
    expect(summary).not.toContain("super-secret-token");
    expect(summary).not.toContain("shh-app-secret");
  });
});
