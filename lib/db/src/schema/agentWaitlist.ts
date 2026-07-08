import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentWaitlistTable = pgTable("agent_waitlist", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentWaitlistSchema = createInsertSchema(agentWaitlistTable, {
  email: z.email(),
}).omit({ id: true, createdAt: true });

export type InsertAgentWaitlist = z.infer<typeof insertAgentWaitlistSchema>;
export type AgentWaitlistEntry = typeof agentWaitlistTable.$inferSelect;
