// Bootstrap/reset a Metrix user account from the command line.
//
// Usage:
//   pnpm --filter @workspace/scripts run create:user -- <email> [password]
//
// When no password is given, a random temporary one is generated and printed.
// The account is always flagged must_change_password=true, so the user is
// forced to pick their own password on first login.

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureSupabaseAuthUser } from "@workspace/auth-mirror";

// Kept in sync with artifacts/api-server/src/lib/agencyAccessSafeguard.ts —
// this script bypasses the API server, so it needs its own copy of the
// "agency accounts must always be admin" rule to avoid re-introducing a
// scoped agency login.
const DEFAULT_AGENCY_ADMIN_EMAILS = ["meta@metamktgagency.com"];
function isAgencyAdminEmail(email: string): boolean {
  const raw = process.env["AGENCY_ADMIN_EMAILS"];
  const fromEnv = raw
    ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  return [...DEFAULT_AGENCY_ADMIN_EMAILS, ...fromEnv].includes(email.trim().toLowerCase());
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ2345679";

function generatePassword(length = 14): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  if (!emailArg || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg)) {
    console.error("Usage: create-user <email> [password]");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const password = passwordArg ?? generatePassword();
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = isAgencyAdminEmail(email) ? "admin" : undefined;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true, ...(role ? { role } : {}) })
      .where(eq(usersTable.id, existing.id));
    console.log(`Reset password for existing user ${email}.`);
  } else {
    await db
      .insert(usersTable)
      .values({ email, passwordHash, mustChangePassword: true, ...(role ? { role } : {}) });
    console.log(`Created user ${email}.`);
  }
  if (role) {
    console.log(`${email} is a designated agency account — provisioned as admin.`);
  }

  // Mirror into Supabase Auth (official METRIX schema FKs reference
  // auth.users). Non-fatal: run mirror:auth-users later to repair gaps.
  try {
    const mirror = await ensureSupabaseAuthUser(email);
    await db
      .update(usersTable)
      .set({ supabaseUserId: mirror.supabaseUserId })
      .where(eq(usersTable.email, email));
    console.log(
      `Supabase Auth mirror: ${mirror.created ? "created" : "already existed"} (${mirror.supabaseUserId}).`,
    );
  } catch (err) {
    console.error("WARNING: Supabase Auth mirror failed:", err);
    console.error("Run `pnpm --filter @workspace/scripts run mirror:auth-users` to repair.");
  }

  console.log(`Temporary password: ${password}`);
  console.log("The user must change it on first login.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
