// ─── Demo account safeguard ────────────────────────────────────────────
// User accounts live in Replit Postgres, which is separate between dev and
// prod, isolated per task environment, and restored on checkpoint
// rollbacks — so a manually created demo login can silently vanish from
// the copy of the DB the user actually demos against. This module makes
// the demo login self-healing: on every API-server boot it ensures the
// designated demo account exists with the password from the
// DEMO_ACCOUNT_PASSWORD secret, is enabled, is an admin (full visibility
// for demos), and is NOT flagged must_change_password so the login stays
// stable forever. Idempotent: it only writes when something drifted.
//
// Opt-in by design: when DEMO_ACCOUNT_PASSWORD is unset, nothing is
// created and a single info line explains why.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { ensureSupabaseAuthUser } from "@workspace/auth-mirror";
import type { Logger } from "pino";

const DEFAULT_DEMO_EMAIL = "demo@metrix.app";

export function getDemoAccountConfig(): { email: string; password: string } | null {
  const password = process.env["DEMO_ACCOUNT_PASSWORD"];
  if (!password) return null;
  const email = (process.env["DEMO_ACCOUNT_EMAIL"] ?? DEFAULT_DEMO_EMAIL)
    .trim()
    .toLowerCase();
  return { email, password };
}

/**
 * Idempotent reconciliation, safe to run on every boot:
 *  1. Creates the demo user if missing (admin, no forced password change).
 *  2. Re-aligns password / role / disabled / must-change flags if any
 *     drifted (e.g. someone reset the password or revoked the account).
 *  3. Mirrors the user into Supabase Auth (non-fatal, FK targets only).
 * Never throws — a demo-account problem must never crash the server.
 */
export async function ensureDemoAccount(log: Logger): Promise<void> {
  const config = getDemoAccountConfig();
  if (!config) {
    log.info(
      "Demo account safeguard: DEMO_ACCOUNT_PASSWORD is not set — skipping (no demo account will be provisioned)",
    );
    return;
  }
  const { email, password } = config;
  if (password.length < 8) {
    log.error(
      "Demo account safeguard: DEMO_ACCOUNT_PASSWORD is shorter than 8 characters — refusing to provision the demo account. Set a longer secret.",
    );
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      passwordHash: usersTable.passwordHash,
      mustChangePassword: usersTable.mustChangePassword,
      role: usersTable.role,
      disabledAt: usersTable.disabledAt,
      supabaseUserId: usersTable.supabaseUserId,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  let userId: number;
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        mustChangePassword: false,
        role: "admin",
      })
      .returning({ id: usersTable.id });
    if (!created) {
      log.error(
        { email },
        "Demo account safeguard: insert returned no row — demo account was NOT provisioned",
      );
      return;
    }
    userId = created.id;
    log.info({ email }, "Demo account safeguard: created demo account");
  } else {
    userId = user.id;
    const drift: string[] = [];
    const updates: Partial<{
      passwordHash: string;
      mustChangePassword: boolean;
      role: string;
      disabledAt: null;
    }> = {};

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      updates.passwordHash = await bcrypt.hash(password, 12);
      drift.push("password");
    }
    if (user.mustChangePassword) {
      updates.mustChangePassword = false;
      drift.push("must_change_password");
    }
    if (user.role !== "admin") {
      updates.role = "admin";
      drift.push("role");
    }
    if (user.disabledAt !== null) {
      updates.disabledAt = null;
      drift.push("disabled");
    }

    if (drift.length > 0) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));
      log.warn(
        { email, drift },
        "Demo account safeguard: reconciled drifted demo account back to a stable login",
      );
    }
  }

  // Mirror into Supabase Auth (official METRIX schema FKs reference
  // auth.users). Non-fatal: run mirror:auth-users later to repair gaps.
  if (!user?.supabaseUserId) {
    try {
      const mirror = await ensureSupabaseAuthUser(email);
      await db
        .update(usersTable)
        .set({ supabaseUserId: mirror.supabaseUserId })
        .where(eq(usersTable.id, userId));
    } catch (err) {
      log.warn(
        { err, email },
        "Demo account safeguard: Supabase Auth mirror failed (non-fatal) — run mirror:auth-users to repair",
      );
    }
  }
}
