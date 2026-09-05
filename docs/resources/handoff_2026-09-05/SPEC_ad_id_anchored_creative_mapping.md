# Spec: Ad-ID-Anchored Concept Mapping & Creative Filename Matching

**Status:** Draft — ready for Claude Code implementation planning
**Origin:** Consolidated from brain-dump session, Aug 29 2026
**Touches:** `metrix-data-bundle-prep`, ingestion schema, `generationEngine.ts` (concept_id resolution logic), Creative Library resolver/join layer

---

## 1. Problem Statement

Three previously-identified issues share one root cause:

1. **Cross-objective collision (BOOK0/BOOK2):** `concept_code` is currently derived by parsing it out of the ad name / filename string *on every ingestion pass*. The parser strips product qualifiers, causing collisions between distinct concepts that happen to share a naming fragment.
2. **Manual upload friction:** Users uploading raw creative assets (image/video files) must manually configure naming convention / concept_code fields one file at a time, because there's no automated correspondence between the uploaded file and its performance data.
3. **Creative Library resolver/join bugs:** Missing creative data traces to the resolver/join layer, not threshold filters — consistent with an unstable identity model that re-derives keys instead of resolving them from a stable anchor.

**Root fix:** Stop treating `concept_code` as something re-parsed from a string every time. Treat `ad_id` (Meta-assigned, stable, present on every reporting row) as the anchor. `concept_id` gets assigned once, at first encounter of a new `ad_id`, and is persisted from then on — never re-derived.

This is additive to, not a departure from, the canonical creative identity model (concept_code = primary identifier, ad_id = fallback join key). What changes is the *resolution mechanism*: ad_id becomes the stable join key that concept_id is looked up through, rather than a fallback used only when concept_code parsing fails.

---

## 2. Architecture

### 2.1 Ad ID as anchor

- Every reporting row includes `ad_id` — always present, Meta-assigned, immutable.
- On first encounter of a new `ad_id`: parse `concept_id` from the ad name (existing naming convention logic), write the result to a persistent `ad_id → concept_id` mapping table.
- On every subsequent encounter of that `ad_id`: look up `concept_id` from the mapping table. **Do not re-parse.**
- This requires a new table, tentatively `ad_id_concept_map` (`ad_id`, `concept_id`, `assigned_at`, `assignment_method`).
- One-time backfill migration required for existing ad_ids already in the system (Bookster, KOV, historical accounts) to populate this table retroactively.

### 2.2 Asset-to-row mapping (solves manual upload friction)

When a user uploads a raw creative file (image/video) from their device, match it against reporting data to auto-identify which `ad_id` (and therefore which `concept_id`) it belongs to — no manual naming-convention entry required.

**Confirmed data source:** Ads Manager exposes toggleable `Image name` and `Video name` columns. Per Meta's own field description, the cell value is the image/video asset name of the ad — i.e., the literal filename as it existed on the user's device at the moment of upload to Meta. This is a clean, direct signal — not a Meta-side hash or renamed value.

---

## 3. Matching Logic — Best-Match, Not Strict Equality

Per requirement: matching must tolerate minor variance (extension differences, stray words/suffixes like `_final`, `(1)`, version tags) rather than requiring exact string equality. Strict equality would create unnecessary friction for users whose device filenames don't perfectly mirror Meta's stored name.

### 3.1 Normalization (applied to both sides before comparison)

- Strip file extension
- Lowercase
- Collapse/strip separators (`_`, `-`, spaces, parentheses) to a common token boundary
- Strip common non-semantic suffixes (`_final`, `_v2`, `(1)`, `copy`, etc. — build as a small denylist, expand as real-world examples surface)

### 3.2 Match passes (in priority order)

**Pass 1 — Asset field match:** uploaded filename vs. `Image name` / `Video name` column.
This is the strongest signal — it's a direct asset-to-asset comparison, not an inference through the ad name.

**Pass 2 — Ad name fallback:** only runs if Pass 1 doesn't clear the confidence threshold, or the asset-name field is empty for that row. Uploaded filename vs. `Ad name` column.
Lower trust than Pass 1 — Ad name is a broader field describing the whole ad, not the specific asset, so a match here is inferential rather than direct.

### 3.3 Scoring, not boolean matching

Use a normalized string-similarity score (token containment + edit-distance based — exact algorithm is an implementation detail for Claude Code, not a policy decision) rather than exact-match boolean logic. This is what allows "extension differs" or "one extra word" to still resolve correctly without manual intervention.

### 3.4 Confidence bands (consistent with existing BSIL confidence-grading pattern already used elsewhere on the platform — never a display gate, only an action classifier)

| Band | Condition | Behavior |
|---|---|---|
| **High** | Pass 1 score ≥ high threshold | Auto-map silently. No user interruption. |
| **Medium** | Pass 1 score in mid-range, OR Pass 2 score ≥ high threshold | Auto-map, but flag row in QA/review queue for confirmation. |
| **Unmapped** | Neither pass clears minimum threshold | Held unmapped. User can manually assign, or it resolves automatically once a future CSV import provides a cleaner match. |

Exact numeric thresholds are a tuning decision to be made against real Bookster/KOV data during implementation — not fixed here.

### 3.5 Guardrails (prevent false positives)

- **File-type consistency gate:** a `.jpg` upload must never match a row where the populated field is `Video name`, regardless of string similarity score. Hard rejection, not a scoring penalty.
- **Duplicate-filename disambiguation:** when the same (post-normalization) filename appears on multiple rows across different ad sets/campaigns — common with reused evergreen creative — use `Campaign Name` / `Ad Set Name` as a tie-breaker, not as a primary matching signal.
- **File size as secondary corroboration:** when duplicate filenames exist and campaign/ad set context doesn't disambiguate, file size can serve as an additional weak signal. Not a standalone match criterion.

---

## 4. Data Ingestion Requirements

- **New required/optional columns:** `Image name`, `Video name` — confirmed as standard toggleable Ads Manager report columns (not confirmed to require the separate Creative Breakdown export; verify against current `metrix_iap_ads_reporting_pivot_templates_v2` whether these are already toggled on).
- **Action item:** confirm with Alex whether the current pivot template includes these two columns. If not, this is a one-time addition to the saved report/column preset, not a new export workflow.
- Per the no-threshold-gates-ingestion rule already locked for this platform: every row still ingests and displays regardless of match confidence. Confidence bands here only gate the *auto-assignment* decision, never data visibility.

---

## 5. What This Fixes

- **Cross-objective collision (BOOK0/BOOK2):** eliminated by removing repeated re-parsing of concept_code from strings; concept_id becomes a stable, persisted lookup keyed to ad_id.
- **Manual upload friction:** eliminated for any asset whose filename reasonably resembles its Meta-reported asset name — no more one-by-one naming-convention entry.
- **Creative Library resolver/join bugs:** addressed at the root by giving the resolver a stable, non-re-derived key to join on.

---

## 6. Open Items Before Build

1. Confirm `Image name` / `Video name` are already present in Alex's current export/pivot template, or need to be added to the column preset.
2. Tune actual similarity-score thresholds against real Bookster/KOV filename data (not guessable in the abstract — needs real examples).
3. Confirm scope of the one-time `ad_id_concept_map` backfill migration across Bookster, KOV, and historical accounts (Oxiflo, EDBIO, Doro, SKOV Pet) — decide whether historical accounts get backfilled at all or only active ones.
4. Denylist of non-semantic filename suffixes (`_final`, `(1)`, etc.) will need to grow from real usage — start minimal, expand as false-negatives surface.

---

## 7. Out of Scope (this spec)

- Meta Ads API integration (still manual CSV/export upload for now).
- Any change to the `generationEngine.ts` variable taxonomy or matrix methodology hardcoded strings — this spec only touches concept_id resolution and asset mapping, not the prompt-chain generation logic itself.
