import { describe, it, expect, beforeAll, vi } from "vitest";
import { createAdminToken, verifyAdminToken, safeCompare } from "../adminPanelSession";

beforeAll(() => {
  process.env["SESSION_SECRET"] = process.env["SESSION_SECRET"] ?? "test-secret-for-admin-session";
});

describe("adminPanelSession", () => {
  it("round-trips a freshly created token", () => {
    const token = createAdminToken();
    expect(verifyAdminToken(token)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const token = createAdminToken();
    const dot = token.lastIndexOf(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 365 }),
      "utf8",
    ).toString("base64url");
    expect(verifyAdminToken(`${forgedPayload}${token.slice(dot)}`)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = createAdminToken();
    expect(verifyAdminToken(`${token.slice(0, -2)}xx`)).toBe(false);
  });

  it("rejects a legitimately signed token once it has expired", () => {
    const token = createAdminToken();
    expect(verifyAdminToken(token)).toBe(true);
    vi.useFakeTimers();
    try {
      // Jump past the 12-hour TTL — same signature, now expired.
      vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
      expect(verifyAdminToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed tokens", () => {
    expect(verifyAdminToken("")).toBe(false);
    expect(verifyAdminToken("no-dot-here")).toBe(false);
    expect(verifyAdminToken(".only-sig")).toBe(false);
  });

  it("safeCompare handles equal and unequal strings", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
    expect(safeCompare("abc", "abd")).toBe(false);
    expect(safeCompare("abc", "abcd")).toBe(false);
  });
});
