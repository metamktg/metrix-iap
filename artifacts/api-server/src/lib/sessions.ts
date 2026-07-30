import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { db, usersTable, userSessionsTable, type User } from "@workspace/db";
import { and, eq, gt, lt } from "drizzle-orm";

export const SESSION_COOKIE = "metrix_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(userSessionsTable).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });
  // Opportunistic cleanup of expired sessions.
  await db
    .delete(userSessionsTable)
    .where(lt(userSessionsTable.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function getUserForSessionToken(token: string): Promise<User | null> {
  const rows = await db
    .select({ user: usersTable })
    .from(userSessionsTable)
    .innerJoin(usersTable, eq(userSessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(userSessionsTable.tokenHash, hashToken(token)),
        gt(userSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const user = rows[0]?.user ?? null;
  // Revoked users are treated as having no valid session anywhere.
  if (user?.disabledAt) return null;
  return user;
}

/** Revoke every session for a user (access revoked / credentials rotated). */
export async function destroyAllSessions(userId: number): Promise<void> {
  await db
    .delete(userSessionsTable)
    .where(eq(userSessionsTable.userId, userId));
}

export async function destroySession(token: string): Promise<void> {
  await db
    .delete(userSessionsTable)
    .where(eq(userSessionsTable.tokenHash, hashToken(token)));
}

export type SessionSummary = {
  id: number;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
};

/** Lists a user's active sessions, flagging which one is the caller's own. */
export async function listUserSessions(userId: number, currentToken: string | null): Promise<SessionSummary[]> {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const rows = await db
    .select({
      id: userSessionsTable.id,
      tokenHash: userSessionsTable.tokenHash,
      createdAt: userSessionsTable.createdAt,
      expiresAt: userSessionsTable.expiresAt,
    })
    .from(userSessionsTable)
    .where(eq(userSessionsTable.userId, userId));
  return rows
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      isCurrent: currentHash !== null && r.tokenHash === currentHash,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Revokes one of a user's own sessions by id. Never touches another user's session. */
export async function destroySessionById(userId: number, sessionId: number): Promise<boolean> {
  const deleted = await db
    .delete(userSessionsTable)
    .where(and(eq(userSessionsTable.id, sessionId), eq(userSessionsTable.userId, userId)))
    .returning({ id: userSessionsTable.id });
  return deleted.length > 0;
}

/** Revoke every session for a user except the one identified by keepToken. */
export async function destroyOtherSessions(
  userId: number,
  keepToken: string,
): Promise<void> {
  const sessions = await db
    .select({ id: userSessionsTable.id, tokenHash: userSessionsTable.tokenHash })
    .from(userSessionsTable)
    .where(eq(userSessionsTable.userId, userId));
  const keepHash = hashToken(keepToken);
  for (const session of sessions) {
    if (session.tokenHash !== keepHash) {
      await db.delete(userSessionsTable).where(eq(userSessionsTable.id, session.id));
    }
  }
}

export function readSessionToken(req: Request): string | null {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function setSessionCookie(
  req: Request,
  res: Response,
  token: string,
  expiresAt: Date,
  rememberMe = false,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    // When rememberMe is false the cookie has no expires/Max-Age so the
    // browser treats it as a session cookie and clears it on close.
    ...(rememberMe ? { expires: expiresAt } : {}),
    path: "/",
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/",
  });
}
