// ─── Baseline security headers ────────────────────────────────────────
//
// nosniff is the load-bearing one: lib/assetContentType downgrades unsafe
// uploads to application/octet-stream, and without nosniff a browser may
// sniff that back into HTML and execute it — undoing the downgrade
// entirely. The two only work together, so both are pinned.

import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { securityHeaders } from "../securityHeaders";

function run(reqOverrides: Partial<Request> = {}) {
  const headers = new Map<string, string>();
  const res = {
    setHeader: (k: string, v: string) => { headers.set(k, String(v)); },
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  securityHeaders({ secure: false, ...reqOverrides } as Request, res, next);
  return { headers, next };
}

describe("securityHeaders", () => {
  it("sets nosniff, so a downgraded upload cannot be sniffed back into HTML", () => {
    const { headers } = run();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("neutralises any document that does get served", () => {
    const { headers } = run();
    expect(headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("keeps account and import ids out of third-party Referer headers", () => {
    const { headers } = run();
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("sets HSTS only over HTTPS, so local http development is unaffected", () => {
    expect(run({ secure: false }).headers.has("Strict-Transport-Security")).toBe(false);
    expect(run({ secure: true }).headers.get("Strict-Transport-Security"))
      .toBe("max-age=31536000; includeSubDomains");
  });

  it("always continues the chain", () => {
    const { next } = run();
    expect(next).toHaveBeenCalledOnce();
  });
});
