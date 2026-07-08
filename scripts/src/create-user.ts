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

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(usersTable.id, existing.id));
    console.log(`Reset password for existing user ${email}.`);
  } else {
    await db
      .insert(usersTable)
      .values({ email, passwordHash, mustChangePassword: true });
    console.log(`Created user ${email}.`);
  }

  console.log(`Temporary password: ${password}`);
  console.log("The user must change it on first login.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
