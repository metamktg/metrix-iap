import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  // Access role: 'admin' sees every ad account (agency team); 'member' sees
  // only accounts granted in user_ad_accounts. New users default to member.
  role: text("role").notNull().default("member"),
  // Master-level (workspace-wide) permissions, independent of per-ad-account
  // grants in user_ad_accounts. Agency `admin` accounts always behave as if
  // both are true (enforced in code, not by these columns) — see
  // agencyAccessSafeguard.ts.
  canManageTeam: boolean("can_manage_team").notNull().default(false),
  canViewAgencyRollups: boolean("can_view_agency_rollups").notNull().default(false),
  // Mirror of this user in Supabase auth.users (uuid). The official METRIX
  // schema FKs reviewer/approver/editor columns to auth.users(id), so every
  // provisioned user is mirrored there at approval time (login stays custom).
  supabaseUserId: text("supabase_user_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // Set when an admin revokes access. Disabled users cannot log in, their
  // sessions are rejected, and password resets are silently skipped.
  // Cleared on explicit re-approval or admin restore.
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type User = typeof usersTable.$inferSelect;
export type UserSession = typeof userSessionsTable.$inferSelect;
