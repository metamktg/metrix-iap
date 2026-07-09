// ─── Admin panel sessions ─────────────────────────────────────────────
// The /admin page is protected by a single shared password stored in the
// ADMIN_PANEL_PASSWORD secret (changeable any time in the Secrets panel —
// no code change needed). A successful login sets a short-lived, stateless
// HMAC-signed cookie; no DB row is involved, so rotating SESSION_SECRET or
// the password invalidates outstanding admin sessions.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const ADMIN_COOKIE = "metrix_admin";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(`admin:${payload}`).digest("base64url");
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createAdminToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + ADMIN_SESSION_TTL_MS }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  if (!safeCompare(sig, expected)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export function readAdminToken(req: Request): string | null {
  const token = (req.cookies as Record<string, string> | undefined)?.[ADMIN_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function hasAdminSession(req: Request): boolean {
  const token = readAdminToken(req);
  return token !== null && verifyAdminToken(token);
}

export function setAdminCookie(req: Request, res: Response, token: string): void {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: ADMIN_SESSION_TTL_MS,
    path: "/",
  });
}

export function clearAdminCookie(req: Request, res: Response): void {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/",
  });
}
