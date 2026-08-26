// ─── /metrix seed routes ───────────────────────────────────────────
// Split out of routes/metrix.ts (E5) — a pure move. Routes appear here in
// their ORIGINAL registration order, and index.ts mounts the routers in
// the original order too, so Express matching is unchanged.

import { Router, type IRouter } from "express";
import { CreateManualAdAccountBody, CreateManualAdAccountResponse } from "@workspace/api-zod";
import { db, userAdAccountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { invalidateMetrixSeedCache } from "../../lib/metrixSeedAssembly";
import { randomBytes } from "node:crypto";
import { getSupabase } from "../../lib/supabase";
const router: IRouter = Router();


router.post("/metrix/accounts", requireAuth, async (req, res) => {
  const parsed = CreateManualAdAccountBody.safeParse(req.body);
  const name = parsed.success ? parsed.data.name.trim() : "";
  if (!parsed.success || name.length < 2) {
    res.status(400).json({ message: "An account name of at least 2 characters is required." });
    return;
  }
  const user = req.authUser!;

  try {
    const supabase = getSupabase();
    const lookup = await supabase
      .from("ad_accounts")
      .select("id, name")
      .ilike("name", name)
      .limit(1);
    if (lookup.error) throw new Error(lookup.error.message);
    if (lookup.data && lookup.data.length > 0) {
      res.status(409).json({
        message: `An ad account named "${lookup.data[0]!["name"]}" already exists.`,
      });
      return;
    }

    // Manual accounts get a "manual_" id — NEVER an act_ prefix, which is
    // reserved for real Meta ad account ids.
    const accountId = `manual_${randomBytes(9).toString("base64url")}`;
    const insert = await supabase.from("ad_accounts").insert({
      id: accountId,
      name,
      status: "unconfigured",
      platform: "Meta Ads",
      source_status: "manual_reports",
      overview_state: {
        title: "Analysis not run yet",
        description:
          "This ad account was created for manual report uploads. Upload exported Meta reports; performance and strategy data appears after the first analysis run processes them.",
        primary_action: "Upload Reports",
        secondary_action: "Connect Meta",
      },
    });
    if (insert.error) throw new Error(insert.error.message);

    // Grant the creator access (idempotent) — for members this is what
    // makes the new account visible in their filtered seed. The account row
    // lives in Supabase and the grant lives in Replit Postgres, so there is
    // no shared transaction; if the grant fails we compensate by deleting the
    // just-created account row so a half-failure never strands an ungranted,
    // orphaned account that nobody can see or manage.
    try {
      await db
        .insert(userAdAccountsTable)
        .values({ userId: user.id, adAccountId: accountId })
        .onConflictDoNothing();
    } catch (grantErr) {
      req.log.error(
        { err: grantErr, accountId },
        "Access grant failed after account insert — rolling back the orphaned account",
      );
      const rollback = await supabase.from("ad_accounts").delete().eq("id", accountId);
      if (rollback.error) {
        req.log.error(
          { err: rollback.error, accountId },
          "Failed to roll back orphaned account after grant failure",
        );
      }
      throw new Error(
        "The account was created but access couldn't be granted, so it was rolled back. Please try again.",
      );
    }
    invalidateMetrixSeedCache();

    req.log.info({ accountId, name }, "Manual ad account created");
    res.json(
      CreateManualAdAccountResponse.parse({
        account_id: accountId,
        name,
        status: "unconfigured",
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to create manual ad account");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not create the ad account.",
    });
  }
});

export default router;
