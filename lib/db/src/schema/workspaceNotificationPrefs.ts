import { pgTable, text, serial, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per overridden preference. Channel rows use `enabled`; event rows
// use `email` and `inApp`. Defaults for anything without a row come from the
// seed bundle on the client.
export const workspaceNotificationPrefsTable = pgTable(
  "workspace_notification_prefs",
  {
    id: serial("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    kind: text("kind").notNull(), // "channel" | "event"
    key: text("key").notNull(),
    enabled: boolean("enabled"),
    email: boolean("email"),
    inApp: boolean("in_app"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("workspace_notification_prefs_scope_idx").on(table.workspaceId, table.kind, table.key),
  ],
);

export const insertWorkspaceNotificationPrefSchema = createInsertSchema(
  workspaceNotificationPrefsTable,
).omit({ id: true, updatedAt: true });

export type InsertWorkspaceNotificationPref = z.infer<typeof insertWorkspaceNotificationPrefSchema>;
export type WorkspaceNotificationPref = typeof workspaceNotificationPrefsTable.$inferSelect;
