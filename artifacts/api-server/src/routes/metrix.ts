import { Router, type IRouter } from "express";
import {
  GetMetrixSeedResponse,
  JoinAgentWaitlistBody,
  JoinAgentWaitlistResponse,
  ListAgentWaitlistQueryParams,
  ListAgentWaitlistResponse,
} from "@workspace/api-zod";
import { db, agentWaitlistTable } from "@workspace/db";
import { count, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import seedBundle from "../data/metrix_seed_bundle.json" with { type: "json" };

const router: IRouter = Router();

router.get("/metrix/seed", (_req, res) => {
  const data = GetMetrixSeedResponse.parse(seedBundle);
  res.json(data);
});

router.post("/metrix/agent-waitlist", async (req, res) => {
  const parsed = JoinAgentWaitlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "A valid email address is required." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  const inserted = await db
    .insert(agentWaitlistTable)
    .values({ email })
    .onConflictDoNothing({ target: agentWaitlistTable.email })
    .returning();

  const data = JoinAgentWaitlistResponse.parse({
    status: inserted.length > 0 ? "joined" : "already_joined",
    email,
  });
  res.json(data);
});

router.get("/metrix/agent-waitlist", requireAdmin, async (req, res) => {
  const parsedQuery = ListAgentWaitlistQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ message: "Invalid limit/offset query parameters." });
    return;
  }
  const { limit, offset } = parsedQuery.data;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        email: agentWaitlistTable.email,
        createdAt: agentWaitlistTable.createdAt,
      })
      .from(agentWaitlistTable)
      .orderBy(desc(agentWaitlistTable.createdAt), desc(agentWaitlistTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(agentWaitlistTable),
  ]);

  const data = ListAgentWaitlistResponse.parse({
    entries: rows.map((row) => ({
      email: row.email,
      joined_at: row.createdAt.toISOString(),
    })),
    total,
  });
  res.json(data);
});

export default router;
