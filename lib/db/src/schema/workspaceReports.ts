import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per generated report. The full composed document (sections and
// blocks) is snapshotted as JSON at generation time so downloads always
// reproduce exactly what was generated, independent of later data changes.
export const workspaceReportsTable = pgTable(
  "workspace_reports",
  {
    id: serial("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    adAccountId: text("ad_account_id").notNull(),
    // Who generated the report. Members only see (and delete) their own
    // reports; admins see all. Nullable for reports predating this column.
    createdByUserId: integer("created_by_user_id"),
    title: text("title").notNull(),
    mode: text("mode").notNull(), // "internal" | "client"
    branding: text("branding").notNull(), // "metrix" | "white_label"
    exportFormat: text("export_format").notNull(), // "pdf" | "google_doc" | "html"
    sectionCount: integer("section_count").notNull(),
    rangeStart: text("range_start"), // ISO date; null when no data window existed
    rangeEnd: text("range_end"),
    rangeIsOverride: text("range_is_override"), // "override" | "global" | null
    summary: text("summary").notNull(),
    modelJson: text("model_json").notNull(), // serialized ReportModel snapshot
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workspace_reports_workspace_idx").on(table.workspaceId, table.adAccountId),
  ],
);

export const insertWorkspaceReportSchema = createInsertSchema(
  workspaceReportsTable,
).omit({ id: true, generatedAt: true });

export type InsertWorkspaceReport = z.infer<typeof insertWorkspaceReportSchema>;
export type WorkspaceReport = typeof workspaceReportsTable.$inferSelect;
