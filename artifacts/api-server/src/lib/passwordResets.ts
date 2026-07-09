import { createHash, randomBytes } from "node:crypto";
import { db, passwordResetTokensTable, type PasswordResetToken } from "@workspace/db";
import { logger } from "./logger";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Delete tokens that expired or were used more than ~24h ago. The grace
 * period keeps recent rows around briefly for debugging/auditing.
 */
export async function cleanupStalePasswordResetTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - CLEANUP_GRACE_MS);
  const deleted = await db
    .delete(passwordResetTokensTable)
    .where(
      or(
        lt(passwordResetTokensTable.expiresAt, cutoff),
        lt(passwordResetTokensTable.usedAt, cutoff),
      ),
    )
    .returning({ id: passwordResetTokensTable.id });
  return deleted.length;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a single-use password reset token for a user. Returns the raw token. */
export async function createPasswordResetToken(userId: number): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await db.insert(passwordResetTokensTable).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });
  // Opportunistic cleanup of stale tokens; never let it break token creation.
  try {
    await cleanupStalePasswordResetTokens();
  } catch (err) {
    logger.warn({ err }, "password reset token cleanup failed");
  }
  return { token, expiresAt };
}

/**
 * Delete ALL reset tokens for a user, consumed or not. Called when access is
 * revoked or credentials are rotated — a pre-existing reset link must not
 * survive either event (e.g. remain redeemable after a later restore).
 */
export async function deletePasswordResetTokensForUser(
  userId: number,
): Promise<void> {
  await db
    .delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, userId));
}

/**
 * Atomically consume a reset token: marks it used and returns the row only if
 * it exists, is unexpired, and has not been used before. Returns null otherwise.
 */
export async function consumePasswordResetToken(
  token: string,
): Promise<PasswordResetToken | null> {
  const [row] = await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, hashToken(token)),
        gt(passwordResetTokensTable.expiresAt, new Date()),
        isNull(passwordResetTokensTable.usedAt),
      ),
    )
    .returning();
  return row ?? null;
}
