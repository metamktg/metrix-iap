# METRIX Manual Import — End-to-End Build Spec v1

**Status:** specification for build, pending sign-off
**Companion:** `METRIX_Manual_Upload_Ingestion_Audit_Phase1.md` (the evidence this spec answers to)
**Measurement basis:** a real client export — 34,148 rows, 239 ads, 442 days, 105 columns — plus
direct reads of `iapCsvSpec.ts`, `iapCsvParser.ts`, `analysisEngine.ts`, `deconstructionEngine.ts`,
`metaGraph.ts`, and `METRIX_Open_Work_Closeout_Register_2026-08.md`.

---

## 1. Repository reality — read before merging anything

On 2026-08-08 `main`'s history was replaced: a Replit workspace snapshot committed as a fresh root
(`238c064`). The original lineage, rooted at `185439b` (2026-06-25), still exists on every
pre-08-08 branch. Verified: `git merge-base origin/main origin/claude/manual-import-bugs-fix-e86i7q`
returns nothing — different roots, no common ancestor.

| Branch class | Count | Mergeable into `main`? |
| --- | ---: | --- |
| Post-rewrite (based on current `main`) | 4 | Yes — ordinary merges |
| Pre-rewrite (old lineage root) | 23 | **No** — no common ancestor |

Merging a pre-rewrite branch needs `--allow-unrelated-histories` and produces a diff that reverts
`main` wholesale (register measured 545–855 files, ~127k deletions per branch). `merge-replit-aug8`,
`merge-replit-aug8-v2`, `mergeaug8` and `repo-cleanup-aug8` are abandoned attempts at exactly this.
A pre-rewrite branch is re-landed as fresh work or dropped; there is no partial option.

This was already triaged. `claude/open-issues-synthesis-5ludoz` carries the closeout register with a
verified disposition per branch, and the highest-priority item — six live manual-import defects — was
re-landed fresh onto `main` as `b666b68`.

**Verified integration.** This branch and `open-issues-synthesis-5ludoz` both modify `iapCsvSpec.ts`
(their fuzzy-match guard operates on the metric lists this branch restructured), so a clean textual
merge would not prove compatibility. A real trial merge was run: auto-merged with no conflicts, full
workspace typecheck clean, 139 tests passing across both suites.

### Recommended sequence

1. Merge the 4 post-rewrite branches into `main` as separate PRs, CI green between each:
   `open-issues-synthesis-5ludoz` → `manual-upload-metrics-vk8mei` → `new-session-d9skbh` →
   `onboarding-analysis-workflow-hkz02o`.
2. Delete the 23 pre-rewrite branches once the register confirms disposition.
3. Deploy from `main` after all four land — not from one combined merge.

---

## 2. Breakdown column contract

### Tier A — identity spine

| Column | Role | Status |
| --- | --- | --- |
| `Day` (aliases: Date, Reporting starts) | Time grain | Required |
| `Ad ID` | Primary key — immutable, Meta-assigned | Required |
| `Ad name` | Display label only, never a key | Optional |
| `Ad set ID` / `Ad set name` | Hierarchy, audience rollups | Recommended |
| `Campaign ID` / `Campaign name` | Hierarchy, budget rollups | Recommended |
| `Objective` | Context axis — never a variable input | Recommended |

### Tier B — facets

Each facet is a separate aggregation axis carrying the same spend once. Facets are never summed
together.

| Facet | Columns | Basis | Unlocks |
| --- | --- | --- | --- |
| Summary | none | Delivery | Authoritative totals |
| Demographic | `Age`, `Gender` | Delivery | ICP / avatar analysis |
| Placement | `Placement`, `Platform`, `Device platform` | Delivery | Placement strategy |
| Geography | `Country`, `Region`, `DMA` | Delivery | Geo analysis |
| Conversion device | `Conversion device` | Conversion | **Rejected — see below** |

**Conversion device is rejected on evidence.** It suppresses 100% of delivery metrics, and measured
attribution yield on the test account was zero: 0 of 483 purchases, 0 of 2,086 adds-to-cart and 0 of
1,182 checkouts carried a real device. Structurally it can never exceed a raw conversion count by
device, because spend is always blank on those rows.

Functional rejection is already achieved by the P0 coverage gate (any file with empty delivery
primitives is blocked regardless of cause), so the enum values can be retired later as pure cleanup
rather than a cross-cutting schema change.

### Tier C — creative evidence

Never required. Measured coverage on the test export: `Video ID` 45.6%, `Video name`/`Image name`
59.0%, `headline` 59.8%, `Description` 12.1%, `call_to_action_type` 96.2%.

---

## 3. Identity model

Register on `campaign_id`, `adset_id`, `ad_id`. Names are stored with the date range they were
observed under, so a rename is a visible fact rather than a silent identity break.

Measured basis: 239 ad IDs vs 135 ad names; 29 names collide across 133 ads (56% of the account);
zero ads were ever renamed. The current `[campaign, adName, date]` aggregation key merges 58 ads into
other ads' rows. Naming-convention extraction matched 1 of 135 names (0.7%), so conventions demote to
optional enrichment.

Applies to the creative path too: `deconstructionEngine.ts` resolves via `adByName.get(n)`, which on
a colliding name attaches a classification to an arbitrary ad.

---

## 4. Copy library, asset library, and the join

The many-to-many is already present in real data: 46 distinct headlines across 143 ads, 24 headlines
used by more than one ad, and 16 of 65 assets running with more than one headline (one image with 5,
one video with 4). Same visual across many copies isolates copy contribution; same copy across
visuals isolates visual contribution — MST variable isolation available retroactively, reachable only
if copy is a first-class entity.

```
copy_assets      id, account_id, content_hash (identity),
                 primary_text, hook_segment, headline, description,
                 cta_type, link_url, source ('csv' | 'api')

creative_assets  id, account_id, asset_hash (identity),
                 meta_video_id, meta_image_hash, filename,
                 media_type, storage_ref

ads              ad_id (PK), adset_id, campaign_id, account_id,
                 copy_asset_id     -> copy_assets.id      (nullable)
                 creative_asset_id -> creative_assets.id  (nullable)
                 is_dynamic_creative boolean
```

Each library entry is deconstructed from what it *is*, so sourcing is implied by which library the
entry lives in — no per-code `copy|asset` tagging and no format-dependent rules. A copy entry carries
its own `HK_`; an asset entry carries its own. On a feed video the viewer meets both the
pre-"See more" text and the opening seconds; their disagreement is a diagnosable finding rather than
an arbitrary choice.

### Two hard boundaries

- **CSV exports carry no primary text.** The only copy columns Meta emits are `headline`,
  `Description` and `call_to_action_type`. `hook_segment` is therefore unobtainable on a manual
  account and must render as absent, never approximated from the headline. Only the API's
  `object_story_spec.message` carries it.
- **Dynamic creative breaks copy attribution.** 41 of 239 ads (17.2%) sit in Advantage+/ASC
  campaigns where Meta serves multiple primary texts and reports only at ad level. Those ads get
  `is_dynamic_creative` and no `copy_asset_id`.

---

## 5. Deconstruction contract

The registry is a message taxonomy. Six families are determinable from communication alone: `FW_`,
`TN_`, `AW_`, `HP_`, `ST_`, `HK_`. `PR_` is copy-evidenced except `PR_VisualDemo`; `CN_` is mixed,
with `ProductDemo` and `Lifestyle` needing the asset.

**`ST_` is never derived from campaign objective.** Doing so is tautological — a BOFU-communicating
creative running in a TOFU campaign is exactly the misalignment IAP exists to surface, and sourcing
the variable from the placement erases it by definition.

No blanket confidence multiplier. An unmapped ad resolves every copy-sourced code at full confidence
and has **no entry** for asset-sourced ones — absent, not a low-confidence guess. Mapping adds codes;
it never revises existing ones.

**Open defect:** `CTA_` is defined in `VARIABLES_REGISTRY.md` and CLAUDE.md, but
`REGISTRY_FAMILY_PREFIXES` and `CODE_RE` in `deconstructionEngine.ts` accept only eight families and
exclude it — while `call_to_action_type` is present on 96.2% of ads, exact and free.

---

## 6. Onboarding flow

1. **Drop exports** — one dropzone, no slots. Each file fingerprinted for grain and facet; duplicates
   caught by content hash over normalised rows (the two files supplied for this analysis were
   identical in content and differed only in row order, so a file hash would have missed it).
2. **Register structure by ID** — a real tree appears before any analysis runs.
3. **Capability ledger** — coverage per primitive, translated into what is unlocked, what is blocked,
   and the single export setting that unblocks each blocked item.
4. **Copy library populates immediately** — headline/description/CTA from CSV, full primary text from
   the API.
5. **Asset mapping — optional, resumable, never a gate.** Bulk-drop, filename matcher, then a
   keyboard-driven swipe queue for the remainder.
6. **Run analysis** — explicit and user-initiated, per the existing loop contract.

---

## 7. Build phases and gates

### P0 — Coverage gate and honest errors — SHIPPED

Parse-time per-column fill and sum; spend/impressions present-but-empty hard-blocks with the cause
named. Required-column-missing diagnosed once by name instead of as a bogus totals-row error. 22
derivable columns removed from required groups. `Device platform` alias. Deconstruction survives
transient Supabase failures via retry + per-file isolation.

*Gate: typecheck clean; 192 tests passing; failure profile unchanged from baseline.* **Met.**

### P1 — Land the four post-rewrite branches; retire the 23

*Depends on: nothing.* Sequential PRs per §1, CI green between each. Do this before further build —
every subsequent phase touches files those branches also touch.

*Gate: `main` green after each merge; no pre-rewrite branch merged with `--allow-unrelated-histories`.*

### P2 — ID-based identity

*Depends on: P1.*
- Aggregation key `[campaign, adName, date]` → `[ad_id, date]`
- `ads` upserted by `ad_id`; names become observed labels with date ranges
- Creative linkage moves off `adByName` to `ad_id`
- Re-import path for existing accounts (backfill cannot undo collisions already merged)

*Gate: replaying the 34,148-row export registers 239 ads, not 181. No aggregate change for an account
with zero colliding names.*

### P3 — Copy and asset libraries

*Depends on: P2.*
- `copy_assets` and `creative_assets` tables, content-hash identity, RLS per importer convention
- `ads` gains both nullable FKs plus `is_dynamic_creative`
- Copy extracted on ingest — always populated, never blocking
- `hook_segment` computed per placement convention; null on CSV-sourced copy

*Gate: 46 distinct copies from 143 ads; 16 assets resolve to multiple copies; the 41 Advantage+ ads
carry no `copy_asset_id`.*

### P4 — Meta creative fetch

*Depends on: P2. Unblocks the only source of primary text.*

`metaGraph.ts` fetches ad accounts and insights only — no `/adcreatives`, no `object_story_spec`, no
`image_url` anywhere in the codebase. Today a connected account gets *less* creative signal than a
manually mapped one, inverting the intended incentive. `ads_read` already covers this.

*Gate: a connected account populates primary text and asset refs for every ad with a creative, with
no manual mapping.*

### P5 — Per-library deconstruction and `CTA_`

*Depends on: P3, P4.*
- `CTA_` accepted as a registry family, auto-filled from `call_to_action_type` with no model call
- Separate deconstruction paths per library, each emitting only what its evidence supports
- Asset-sourced codes absent — never low-confidence — when no asset is mapped
- Lazy-init the Anthropic client so `deconstructionEngine.test.ts` collects without env (25 tests
  currently invisible in CI)

*Gate: a text-only ad emits zero asset-sourced codes; a video ad with no asset emits no `HK_`; `CTA_`
populated for ~96% of ads.*

### P6 — Swipe mapping queue and streamed upload

*Depends on: P3.*
- Bulk-drop → filename matcher → swipe queue for the remainder
- Streamed multipart upload replacing base64-in-JSON (the 8 MB limit behind a 12 MB body cap rejects
  a 17 MB single-account export before the friendly error can fire)

*Gate: the 17.1 MB export uploads; ≥59% of assets auto-match; skipping the queue entirely still
yields a complete analysis.*

---

## 8. Guarantees

Zero bugs is not a claim this spec makes. What it commits to is that every phase gate above is
executable — most against the real export rather than a fixture — that each phase ships behind full
workspace typecheck and the test suite, and that the failure profile is compared to baseline so a new
failure cannot hide among the 17 env-gated test files.

The single largest risk to a clean deploy is not in this spec: it is merging 23 unrelated-history
branches, which would produce a six-figure-line diff reverting `main`.
