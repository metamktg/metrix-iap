import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashRequest, MutationLogger, redact } from "../src/logging.js";

describe("hashRequest", () => {
  it("is deterministic regardless of key order — the basis for idempotency/retry checks", () => {
    const a = hashRequest({ name: "C5D_4x5", adset_id: "123", creative: { creative_id: "456" } });
    const b = hashRequest({ creative: { creative_id: "456" }, adset_id: "123", name: "C5D_4x5" });
    expect(a).toBe(b);
  });

  it("differs when the payload actually differs", () => {
    const a = hashRequest({ name: "C5D_4x5" });
    const b = hashRequest({ name: "C6B_4x5" });
    expect(a).not.toBe(b);
  });
});

describe("redact", () => {
  it("strips fields whose key looks credential-shaped", () => {
    const safe = redact({ access_token: "super-secret", app_secret: "also-secret", id: "act_123" });
    expect(safe.access_token).toBe("[redacted]");
    expect(safe.app_secret).toBe("[redacted]");
    expect(safe.id).toBe("act_123");
  });
});

describe("MutationLogger", () => {
  let dir: string;
  let logPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ecas-mcp-log-test-"));
    logPath = join(dir, "nested", "meta-mutations.jsonl");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates the log directory and appends one JSON line per record", async () => {
    const logger = new MutationLogger(logPath);
    const requestHash = hashRequest({ name: "C5D_4x5" });

    await logger.record({ tool: "meta_create_ad_draft", request_hash: requestHash, meta_object_id: null, operator: "claude-code", status: "attempted" });
    await logger.record({ tool: "meta_create_ad_draft", request_hash: requestHash, meta_object_id: "1234567", operator: "claude-code", status: "PAUSED" });

    const contents = await readFile(logPath, "utf8");
    const lines = contents.trim().split("\n").map((line) => JSON.parse(line));

    expect(lines).toHaveLength(2);
    expect(lines[0].request_hash).toBe(requestHash);
    expect(lines[1].meta_object_id).toBe("1234567");
    // A future retry-protection check can find the prior attempt for this
    // exact request before ever issuing a new create call.
    expect(lines.some((line) => line.request_hash === requestHash && line.meta_object_id)).toBe(true);
  });

  it("never writes a raw secret-shaped field into the log", async () => {
    const logger = new MutationLogger(logPath);
    await logger.record({
      tool: "meta_create_ad_draft",
      request_hash: hashRequest({ name: "C5D_4x5" }),
      meta_object_id: null,
      operator: "claude-code",
      status: "error",
      detail: { access_token: "super-secret-value" },
    });
    const contents = await readFile(logPath, "utf8");
    expect(contents).not.toContain("super-secret-value");
  });
});
