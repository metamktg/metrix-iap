# ECAS Meta Ads MCP

A private, local MCP server that lets Claude Code validate — and, under a
separate future approval, deploy — Meta ad campaigns for the East Coast Art
Studio (ECAS) ad account.

**Current status: Stage 3 (read-only validation) is implemented. Stage 4
(paused draft creation) is intentionally not implemented yet — it requires
a separate explicit approval before work starts.** See `CLAUDE.md` in this
directory for the full operating rules.

## What's implemented

Read-only MCP tools (no Meta object is ever created, modified, or
activated by any of these):

| Tool | What it does |
| --- | --- |
| `meta_validate_connection` | Confirms the configured token can see the configured ECAS ad account. |
| `meta_get_account_context` | Resolves ad account, Page, Instagram actor, and pixel; reports per-node success/failure. |
| `meta_validate_manifest` | Validates a campaign manifest JSON file against every safety gate below. Reads local creative files but never calls Meta. |

## Not implemented (Stage 4, pending approval)

`meta_upload_image`, `meta_create_campaign_draft`, `meta_create_adset_draft`,
`meta_create_creative_draft`, `meta_create_ad_draft`, `meta_get_ad_preview`,
`meta_reconcile_batch` — and, later still, any activation tool. These are
the tools that actually write to Meta (always as `PAUSED`). Do not implement
or invoke them until a human has reviewed the Stage 3 output and explicitly
approved moving on.

## Meta prerequisites

Before this server can do anything useful:

1. In Meta Business Manager, create/use a developer app with the Marketing
   API product added.
2. Create a **system user** (Business Settings → Users → System Users).
   Use an Admin system user for initial setup; tighten scopes after the
   integration is validated.
3. Assign the system user: the ECAS ad account, the ECAS Facebook Page, the
   connected Instagram account, and the developer app.
4. Generate a system-user access token with `ads_management` and
   `ads_read` (add `business_management` if you need to resolve Business
   Portfolio assets rather than working from known IDs).
5. Note the exact IDs: ad account (`act_...`), Page, Instagram actor, and
   Pixel.

## Environment setup

```bash
cd lib/integrations/ecas-meta-ads-mcp
cp .env.example .env
# edit .env — never commit it
```

Required variables (server refuses to start without these):

```
META_GRAPH_VERSION
META_ACCESS_TOKEN
META_AD_ACCOUNT_ID       # must start with act_
META_PAGE_ID
META_INSTAGRAM_ACTOR_ID
META_PIXEL_ID
```

Optional, with safe defaults:

```
META_APP_ID / META_APP_SECRET             # not required for read-only Graph GETs
META_ALLOWED_DESTINATION_HOSTS            # default: eastcoastartstudio.com,www.eastcoastartstudio.com
META_MAX_DAILY_BUDGET_MINOR_UNITS         # default: 10000
META_MUTATION_LOG_PATH                    # default: ./logs/meta-mutations.jsonl
ECAS_CREATIVE_DIR                         # default: ./creatives — where approved *_4x5.png files live
```

`.env` is covered by the workspace root `.gitignore` — do not remove that
entry, do not put credentials anywhere else (not `.mcp.json`, not the
manifest, not a test fixture).

## Install, typecheck, test

From the workspace root:

```bash
pnpm install
pnpm --filter @workspace/ecas-meta-ads-mcp run typecheck
pnpm --filter @workspace/ecas-meta-ads-mcp run test
```

## Dry-run flow (no MCP, no Claude Code needed)

Validate a manifest directly from the command line while iterating on it:

```bash
pnpm --filter @workspace/ecas-meta-ads-mcp run dry-run -- ./campaign-manifest.example.json
```

This runs the exact same validation `meta_validate_manifest` runs, printed
to stdout, and exits non-zero if anything fails.

## Connect it to Claude Code

Local scope keeps credentials and this server project-private (never
checked into the repo, never in `.mcp.json`):

```bash
cd lib/integrations/ecas-meta-ads-mcp
claude mcp add ecas-meta-ads \
  --scope local \
  --env META_ACCESS_TOKEN="$META_ACCESS_TOKEN" \
  --env META_AD_ACCOUNT_ID="$META_AD_ACCOUNT_ID" \
  --env META_PAGE_ID="$META_PAGE_ID" \
  --env META_INSTAGRAM_ACTOR_ID="$META_INSTAGRAM_ACTOR_ID" \
  --env META_PIXEL_ID="$META_PIXEL_ID" \
  --env META_GRAPH_VERSION="$META_GRAPH_VERSION" \
  -- npx tsx src/index.ts

claude mcp list
claude mcp get ecas-meta-ads
```

Then, inside Claude Code:

```text
Use meta_validate_connection. Perform no mutations.
```

```text
Use meta_get_account_context.
```

```text
Use meta_validate_manifest with manifest_path ./campaign-manifest.example.json
```

## Paused deployment flow (once Stage 4 is approved and built)

1. `meta_validate_connection`
2. `meta_get_account_context`
3. `meta_validate_manifest`
4. Review the deployment plan the manifest tool returns
5. `meta_upload_image` for each approved file
6. Create the campaign and ad set as `PAUSED`
7. Create creatives and ads as `PAUSED`
8. `meta_get_ad_preview` for each ad
9. `meta_reconcile_batch` — full local-id ↔ Meta-id ↔ status table
10. Review everything in Meta Ads Manager
11. Activate manually — this server never activates anything itself

## Previews and reconciliation

Not built yet (Stage 4). When implemented, `meta_get_ad_preview` returns
Meta's preview URL/markup per ad, and `meta_reconcile_batch` produces a
table of: local concept ID, filename, image hash, creative ID, ad ID,
ad-set ID, campaign ID, status, destination URL, preview result — reading
back from `META_MUTATION_LOG_PATH`, not from memory, so it survives a
restarted session.

## Rollback and cleanup

Because every object this server will ever create is `PAUSED` and nothing
is activated automatically, "rollback" during the draft stage is simply
deleting or archiving the paused objects in Meta Ads Manager — there is no
live spend to unwind. `META_MUTATION_LOG_PATH` is the authoritative record
of what was created, in case Ads Manager and local state ever disagree.

## Windows / WSL

- **WSL (recommended):** run everything (`pnpm install`, `claude mcp add`,
  `pnpm run start`) from inside the WSL filesystem (e.g. `~/metrix-iap`,
  not `/mnt/c/...`) for normal Node.js file-watching and permissions
  behavior.
- **Windows native:** works with Node 20+, but wrap the launcher command in
  `claude mcp add` for the local OS shell — e.g. use `npx.cmd` in place of
  `npx` if invoking through `cmd.exe`, or invoke `tsx` directly with an
  absolute path if PATH resolution differs from WSL/macOS/Linux. `.env` is
  loaded the same way in both environments (via `dotenv/config`).

## Common Meta API errors

| Symptom | Likely cause |
| --- | --- |
| `Error validating access token` | Token expired, revoked, or the system user lost asset access. Regenerate the token. |
| `(#200) Permissions error` | Token is missing `ads_management`/`ads_read`, or the system user isn't assigned to this specific ad account/Page/Instagram account. |
| `Unsupported get request` on the ad account | Wrong `META_AD_ACCOUNT_ID` (remember the `act_` prefix), or the token's system user isn't assigned to that account. |
| `Unsupported get request` on the Instagram actor | The ID isn't a valid Instagram **Business** Account ID, or it isn't connected to the Page/token you're using. |
| `(#100) Invalid parameter` | Usually a Graph API version mismatch — confirm `META_GRAPH_VERSION` matches a currently-supported version. |
| `meta_validate_manifest` reports `identity_mismatch` | The manifest's `account.*` fields (or their resolved `${META_X}` tokens) don't exactly equal the server's configured IDs — this is the account-isolation gate working as intended, not a bug. |
