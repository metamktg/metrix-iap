import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-user ad account authorization. A 'member' user sees ONLY the ad
// accounts listed here; 'admin' users (agency team) see every account.
// Membership is granted when a user creates a manual account, selects a
// live Meta account, or when an admin assigns access.
export const userAdAccountsTable = pgTable(
  "user_ad_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Supabase ad_accounts.id (text — e.g. "act_123..." or "manual_x1y2").
    adAccountId: text("ad_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_ad_accounts_user_account_unique").on(
      table.userId,
      table.adAccountId,
    ),
  ],
);

export type UserAdAccount = typeof userAdAccountsTable.$inferSelect;
