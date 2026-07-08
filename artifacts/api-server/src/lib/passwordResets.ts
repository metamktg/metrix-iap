import { createHash, randomBytes } from "node:crypto";
import { db, passwordResetTokensTable, type PasswordResetToken } from "@workspace/db";
import { and, eq, gt, isNull, lt } from "drizzle-orm";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  // Opportunistic cleanup of expired tokens.
  await db
    .delete(passwordResetTokensTable)
    .where(lt(passwordResetTokensTable.expiresAt, new Date()));
  return { token, expiresAt };
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
