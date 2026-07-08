import { Router, type IRouter } from "express";
import {
  GetMetrixSeedResponse,
  JoinAgentWaitlistBody,
  JoinAgentWaitlistResponse,
} from "@workspace/api-zod";
import { db, agentWaitlistTable } from "@workspace/db";
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

export default router;
