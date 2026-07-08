import { pgTable, text, serial, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per workspace. Every column is a nullable override — anything left
// null falls back to the seed's report_builder defaults on the client.
export const workspaceReportSettingsTable = pgTable(
  "workspace_report_settings",
  {
    id: serial("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    defaultBranding: text("default_branding"), // "metrix" | "white_label"
    defaultFormat: text("default_format"), // "pdf" | "google_doc" | "html"
    defaultMode: text("default_mode"), // "internal" | "client"
    scheduleEnabled: boolean("schedule_enabled"),
    scheduleCadence: text("schedule_cadence"), // "weekly" | "monthly"
    scheduleRecipients: text("schedule_recipients"), // comma-separated emails
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("workspace_report_settings_workspace_idx").on(table.workspaceId),
  ],
);

export const insertWorkspaceReportSettingsSchema = createInsertSchema(
  workspaceReportSettingsTable,
).omit({ id: true, updatedAt: true });

export type InsertWorkspaceReportSettings = z.infer<typeof insertWorkspaceReportSettingsSchema>;
export type WorkspaceReportSettings = typeof workspaceReportSettingsTable.$inferSelect;
