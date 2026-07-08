import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash } from "node:crypto";
import {
  db,
  pool,
  passwordResetTokensTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  cleanupStalePasswordResetTokens,
  createPasswordResetToken,
} from "../passwordResets";

const HOUR_MS = 60 * 60 * 1000;

let testUserId: number;

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR_MS);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * HOUR_MS);
}

async function seedToken(opts: {
  label: string;
  expiresAt: Date;
  usedAt?: Date | null;
}): Promise<number> {
  const tokenHash = createHash("sha256")
    .update(`test-cleanup-${opts.label}-${Date.now()}-${Math.random()}`)
    .digest("hex");
  const [row] = await db
    .insert(passwordResetTokensTable)
    .values({
      tokenHash,
      userId: testUserId,
      expiresAt: opts.expiresAt,
      usedAt: opts.usedAt ?? null,
    })
    .returning({ id: passwordResetTokensTable.id });
  return row.id;
}

async function remainingIds(ids: number[]): Promise<Set<number>> {
  const rows = await db
    .select({ id: passwordResetTokensTable.id })
    .from(passwordResetTokensTable)
    .where(inArray(passwordResetTokensTable.id, ids));
  return new Set(rows.map((r) => r.id));
}

beforeAll(async () => {
  const [user] = await db
    .insert(usersTable)
    .values({
      email: `pw-reset-cleanup-test-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
    })
    .returning({ id: usersTable.id });
  testUserId = user.id;
});

afterAll(async () => {
  // Cascade-deletes any leftover test tokens.
  await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  await pool.end();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db
    .delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, testUserId));
});

describe("cleanupStalePasswordResetTokens", () => {
  it("deletes only tokens expired or used more than 24h ago", async () => {
    const staleExpired = await seedToken({
      label: "stale-expired",
      expiresAt: hoursAgo(25),
    });
    // Used >24h ago but NOT expired — exercises the usedAt branch on its own.
    const staleUsed = await seedToken({
      label: "stale-used",
      expiresAt: hoursFromNow(1),
      usedAt: hoursAgo(25),
    });
    const recentlyExpired = await seedToken({
      label: "recently-expired",
      expiresAt: hoursAgo(2),
    });
    const recentlyUsed = await seedToken({
      label: "recently-used",
      expiresAt: hoursFromNow(1),
      usedAt: hoursAgo(1),
    });
    const validUnexpired = await seedToken({
      label: "valid",
      expiresAt: hoursFromNow(1),
    });

    await cleanupStalePasswordResetTokens();

    const remaining = await remainingIds([
      staleExpired,
      staleUsed,
      recentlyExpired,
      recentlyUsed,
      validUnexpired,
    ]);

    expect(remaining.has(staleExpired)).toBe(false);
    expect(remaining.has(staleUsed)).toBe(false);
    expect(remaining.has(recentlyExpired)).toBe(true);
    expect(remaining.has(recentlyUsed)).toBe(true);
    expect(remaining.has(validUnexpired)).toBe(true);
  });

  it("never touches valid tokens even when run repeatedly", async () => {
    const validA = await seedToken({
      label: "valid-a",
      expiresAt: hoursFromNow(1),
    });
    const validB = await seedToken({
      label: "valid-b",
      expiresAt: hoursFromNow(0.5),
    });

    await cleanupStalePasswordResetTokens();
    await cleanupStalePasswordResetTokens();

    const remaining = await remainingIds([validA, validB]);
    expect(remaining.has(validA)).toBe(true);
    expect(remaining.has(validB)).toBe(true);
  });
});

describe("createPasswordResetToken", () => {
  it("still creates a token when cleanup fails", async () => {
    const deleteSpy = vi.spyOn(db, "delete").mockImplementation(() => {
      throw new Error("simulated cleanup failure");
    });

    const result = await createPasswordResetToken(testUserId);

    expect(deleteSpy).toHaveBeenCalled();
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    deleteSpy.mockRestore();

    const rows = await db
      .select()
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, testUserId));
    expect(rows).toHaveLength(1);
    const expectedHash = createHash("sha256")
      .update(result.token)
      .digest("hex");
    expect(rows[0].tokenHash).toBe(expectedHash);
    expect(rows[0].usedAt).toBeNull();
  });

  it("runs cleanup as part of creating a new token", async () => {
    const staleExpired = await seedToken({
      label: "stale-for-create",
      expiresAt: hoursAgo(30),
    });
    const valid = await seedToken({
      label: "valid-for-create",
      expiresAt: hoursFromNow(1),
    });

    await createPasswordResetToken(testUserId);

    const remaining = await remainingIds([staleExpired, valid]);
    expect(remaining.has(staleExpired)).toBe(false);
    expect(remaining.has(valid)).toBe(true);
  });
});
