// Backfill: mirror every Metrix IAP user (Replit Postgres `users` table)
// into Supabase Auth (auth.users) and record the uuid in
// users.supabase_user_id. Idempotent — safe to re-run any time; it also
// repairs rows whose earlier mirror attempt failed.
//
// Usage: pnpm --filter @workspace/scripts run mirror:auth-users

import { db, usersTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { ensureSupabaseAuthUser } from "@workspace/auth-mirror";

async function main() {
  const pending = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(isNull(usersTable.supabaseUserId));

  if (pending.length === 0) {
    console.log("All users already mirrored into Supabase Auth. Nothing to do.");
    process.exit(0);
  }

  console.log(`Mirroring ${pending.length} user(s) into Supabase Auth...`);
  let ok = 0;
  let failed = 0;

  for (const user of pending) {
    try {
      const mirror = await ensureSupabaseAuthUser(user.email);
      await db
        .update(usersTable)
        .set({ supabaseUserId: mirror.supabaseUserId })
        .where(eq(usersTable.id, user.id));
      console.log(
        `  ${user.email} → ${mirror.supabaseUserId} (${mirror.created ? "created" : "existed"})`,
      );
      ok++;
    } catch (err) {
      console.error(`  FAILED ${user.email}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`Done: ${ok} mirrored, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
