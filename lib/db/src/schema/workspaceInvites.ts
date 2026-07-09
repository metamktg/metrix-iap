import { pgTable, text, serial, timestamp, uniqueIndex, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workspaceInvitesTable = pgTable(
  "workspace_invites",
  {
    id: serial("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("invited"),
    // Master-level permissions and initial ad-account grants configured at
    // invite time, applied to the real user account the moment it's
    // provisioned (single-step "Add member" — see metrix.ts createWorkspaceInvite).
    canManageTeam: boolean("can_manage_team").notNull().default(false),
    canViewAgencyRollups: boolean("can_view_agency_rollups").notNull().default(false),
    adAccountIds: jsonb("ad_account_ids").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspace_invites_workspace_email_idx").on(table.workspaceId, table.email)],
);

export const insertWorkspaceInviteSchema = createInsertSchema(workspaceInvitesTable, {
  email: z.email(),
  adAccountIds: z.array(z.string()),
}).omit({ id: true, createdAt: true });

export type InsertWorkspaceInvite = z.infer<typeof insertWorkspaceInviteSchema>;
export type WorkspaceInvite = typeof workspaceInvitesTable.$inferSelect;
