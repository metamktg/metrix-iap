// ─── /metrix creatives routes ───────────────────────────────────────────
// Split out of routes/metrix.ts (E5) — a pure move. Routes appear here in
// their ORIGINAL registration order, and index.ts mounts the routers in
// the original order too, so Express matching is unchanged.

import { Router, type IRouter } from "express";
import { resolveServedAsset, isInlineVideo } from "../../lib/assetContentType";
import { JoinAgentWaitlistBody, JoinAgentWaitlistResponse } from "@workspace/api-zod";
import { db, agentWaitlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { waitlistRateLimit } from "../../middlewares/waitlistRateLimit";
import { isDisposableEmailDomain } from "../../lib/disposableEmailDomains";
import { invalidateMetrixSeedCache } from "../../lib/metrixSeedAssembly";
import { getSupabase } from "../../lib/supabase";
import { userHasAccountAccess } from "./shared";
const router: IRouter = Router();


router.get("/metrix/accounts/:accountId/cells/:cellId/creative", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const cellId = String(req.params["cellId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const row = await supabase
      .from("cell_creative_overrides")
      .select("asset_bytes, content_type, filename")
      .eq("account_id", accountId)
      .eq("cell_id", cellId)
      .limit(1)
      .maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (!row.data) {
      res.status(404).json({ message: "No creative uploaded for this cell." });
      return;
    }
    const hexStr = String(row.data["asset_bytes"] ?? "");
    const buf = Buffer.from(hexStr.replace(/^\\x/, ""), "hex");
    // The uploader's declared content type is advisory — echoed back only
    // when it names a type that cannot execute (see lib/assetContentType).
    // This endpoint matters most of the three: its URL carries no
    // unguessable id (cell ids are matrix codes like C2B), so a link to it
    // is trivially constructible and looks entirely legitimate.
    const served = resolveServedAsset(row.data["content_type"] as string | null, row.data["filename"] as string | null);
    const contentType = served.contentType;
    res.setHeader("Content-Type", contentType);
    if (served.disposition) res.setHeader("Content-Disposition", served.disposition);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");
    const rangeHeader = req.headers.range;
    if (rangeHeader && isInlineVideo(contentType)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      const total = buf.length;
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= total) {
        res.setHeader("Content-Range", `bytes */${total}`);
        res.status(416).end();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", String(end - start + 1));
      res.send(buf.subarray(start, end + 1));
      return;
    }
    res.send(buf);
  } catch (err) {
    req.log.error({ err, accountId, cellId }, "Failed to serve cell creative");
    res.status(502).json({ message: err instanceof Error ? err.message : "Could not fetch the creative." });
  }
});


router.delete("/metrix/accounts/:accountId/cells/:cellId/creative", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const cellId = String(req.params["cellId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const row = await supabase
      .from("cell_creative_overrides")
      .select("id")
      .eq("account_id", accountId)
      .eq("cell_id", cellId)
      .limit(1)
      .maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (!row.data) {
      res.status(404).json({ message: "No creative uploaded for this cell." });
      return;
    }
    const del = await supabase
      .from("cell_creative_overrides")
      .delete()
      .eq("account_id", accountId)
      .eq("cell_id", cellId);
    if (del.error) throw new Error(del.error.message);
    invalidateMetrixSeedCache();
    res.json({ deleted: true });
  } catch (err) {
    req.log.error({ err, accountId, cellId }, "Failed to delete cell creative");
    res.status(502).json({ message: err instanceof Error ? err.message : "Delete failed." });
  }
});


router.post("/metrix/agent-waitlist", waitlistRateLimit, async (req, res) => {
  const parsed = JoinAgentWaitlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "A valid email address is required." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  if (isDisposableEmailDomain(email)) {
    res.status(400).json({
      message: "Please use a permanent email address to join the waitlist.",
    });
    return;
  }

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
