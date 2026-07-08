import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspace_invites_workspace_email_idx").on(table.workspaceId, table.email)],
);

export const insertWorkspaceInviteSchema = createInsertSchema(workspaceInvitesTable, {
  email: z.email(),
}).omit({ id: true, createdAt: true });

export type InsertWorkspaceInvite = z.infer<typeof insertWorkspaceInviteSchema>;
export type WorkspaceInvite = typeof workspaceInvitesTable.$inferSelect;
