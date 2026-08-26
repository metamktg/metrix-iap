-- METRIX — upload storage reclaim
--
-- ══ EXECUTION RECORD — 2026-08-26 ═══════════════════════════════════
-- STEP 1 and a NARROWED STEP 2 were run in production on 2026-08-26.
-- STEP 3 was deliberately NOT run. STEP 4 is still outstanding.
--
--   STEP 1  abandoned 'uploading' session      1 row   (138 MB logical)
--   STEP 2  duplicate copies, narrowed        14 rows  ( 26 MB logical)
--   ─────────────────────────────────────────────────────────────────
--   manual_imports        185 → 170     manual_import_chunks  105 → 70
--   creative_deconstructions  12 → 12   ad_performance  9,647 → 9,647
--
-- STEP 2 was narrowed beyond the guards below: rows carrying
-- `manual_analysis_run_id` were ALSO excluded (8 of the 22 the original
-- predicate called safe). That lineage is what Import History shows and what
-- `restage-run/:runId` reads, and BUG-08 has since made re-staging a
-- documented, sign-posted path — so dropping those rows would have quietly
-- regressed a feature that had just been made discoverable. Kept 8 rows /
-- ~163 MB rather than take that.
--
-- It also cleared three accounts (ECAS, Gabri, AAFE) that each held TWO
-- byte-identical files STAGED in the same slot — pre-guard leftovers the
-- BUG-09 staging guard rejects on the way in but never cleaned up behind it.
-- These did NOT double-count: `appendRowsCrossFileDeduped` already drops
-- exact-duplicate rows across staged files. What they did was make every run
-- parse the second copy, discard all of its rows, and emit a
-- `[Duplicate data]` warning nothing else was going to resolve. Zero such
-- pairs remain. See BUG-45, which records the corrected severity.
--
-- STEP 4 NOT DONE: plain DELETE only marks tuples dead. `vacuum (analyze)`
-- was run on both tables, which returns the space to each table's free list —
-- the database still reports 533 MB, because only VACUUM FULL returns space
-- to the filesystem and that holds an ACCESS EXCLUSIVE lock. Schedule it.
-- ════════════════════════════════════════════════════════════════════
--
-- Prepared during the pre-deploy backend audit. DELIBERATELY NOT EXECUTED:
-- every statement here destroys uploaded source files, which is the repo
-- owner's call, not an auditor's. Read the SELECTs first, run the DELETEs
-- only when you agree with what they list.
--
-- Position at audit time: 533 MB database, of which 794 MB LOGICAL upload
-- bytes across 185 files (logical > physical because bytea is TOAST-
-- compressed; expect physical reclaim to be materially smaller than the
-- logical numbers below).
--
--   abandoned 'uploading' session        138 MB    1 file
--   exact duplicate copies (beyond 1st)  270 MB   62 files
--   processed (retention candidates)     333 MB   39 files
--   staged, unique, still needed         215 MB  101 files
--
-- Deleting manual_imports rows cascades to manual_import_chunks.

-- ── STEP 0 — always look before deleting ─────────────────────────────
-- What is actually taking the space, largest first.
select mi.id, mi.account_id, mi.kind, mi.filename, mi.status,
       mi.created_at::date as staged,
       mi.content_md5,
       pg_size_pretty(coalesce(octet_length(mi.content),
         (select sum(octet_length(c.content)) from manual_import_chunks c
           where c.import_id = mi.id), 0)::bigint) as size
from manual_imports mi
order by coalesce(octet_length(mi.content),
  (select sum(octet_length(c.content)) from manual_import_chunks c
    where c.import_id = mi.id), 0) desc
limit 40;

-- ── STEP 1 — abandoned upload sessions ───────────────────────────────
-- 'uploading' rows are already excluded from listings and can never be
-- consumed by a run, so these are pure dead weight. The 24h sweep clears
-- them on its own; this only makes it immediate.
-- At audit time: one 138 MB AAFE row from an abandoned chunked upload.
select id, account_id, filename, created_at from manual_imports where status = 'uploading';
-- delete from manual_imports where status = 'uploading' and created_at < now() - interval '2 hours';

-- ── STEP 2 — exact duplicate copies ──────────────────────────────────
-- Byte-identical files (same account + kind + content_md5), keeping one per
-- group. 62 rows / 270 MB logical at audit time.
--
-- READ THIS BEFORE RUNNING. A naive "keep the first, drop the rest" is NOT
-- safe here, for three reasons found during the audit:
--
--   1. creative_deconstructions.manual_import_id is ON DELETE CASCADE.
--      Deleting a duplicate destroys its AI deconstruction — real analysis
--      output (variables, detected copy, brief refs). At audit time all 12
--      deconstructions happened to hang off rows the ordering already kept,
--      but that was luck, not design. The predicate below makes it explicit.
--   2. 40 of the 62 duplicate rows carry a non-empty ad_names array — the
--      user-editable creative->ad mapping. A byte-identical sibling can carry
--      a DIFFERENT (or empty) mapping, so dropping the row silently discards
--      hand-corrected work.
--   3. 18 of the 62 are status='processed' and carry manual_analysis_run_id
--      lineage, which is what Import History shows and what "restage" needs.
--
-- So the ranking below prefers, in order: rows carrying a deconstruction,
-- then rows carrying ad_names, then processed rows, then the oldest. And the
-- delete additionally REFUSES to touch any row that still carries a
-- deconstruction or an ad_names mapping, whatever the ranking said — belt and
-- braces, because the cascade is silent.

with ranked as (
  select mi.id, mi.account_id, mi.kind, mi.filename, mi.status, mi.content_md5,
         (select count(*) from creative_deconstructions d where d.manual_import_id = mi.id) as deconstructions,
         coalesce(array_length(mi.ad_names, 1), 0) as ad_name_count,
         row_number() over (
           partition by mi.account_id, mi.kind, mi.content_md5
           order by (select count(*) from creative_deconstructions d where d.manual_import_id = mi.id) desc,
                    coalesce(array_length(mi.ad_names, 1), 0) desc,
                    (mi.status = 'processed') desc,
                    mi.created_at
         ) as copy_no
  from manual_imports mi
  where mi.content_md5 is not null
)
select * from ranked where copy_no > 1 order by account_id, kind, filename;

-- Safe delete: only rows that are duplicates AND carry no deconstruction AND
-- no ad_names mapping. Anything excluded by those guards needs a human look.
-- delete from manual_imports where id in (
--   with ranked as (
--     select mi.id,
--            (select count(*) from creative_deconstructions d where d.manual_import_id = mi.id) as dec_count,
--            coalesce(array_length(mi.ad_names, 1), 0) as ad_name_count,
--            row_number() over (
--              partition by mi.account_id, mi.kind, mi.content_md5
--              order by (select count(*) from creative_deconstructions d where d.manual_import_id = mi.id) desc,
--                       coalesce(array_length(mi.ad_names, 1), 0) desc,
--                       (mi.status = 'processed') desc,
--                       mi.created_at) as copy_no
--       from manual_imports mi where mi.content_md5 is not null
--   )
--   select id from ranked
--    where copy_no > 1 and dec_count = 0 and ad_name_count = 0
-- );

-- ── STEP 3 — processed-file retention (needs a product decision) ─────
-- 39 processed files / 333 MB logical. These are already consumed; their
-- rows in the rollup tables carry the analysis result. Keeping the bytes
-- buys re-runnability without re-upload (the Import History "restage"
-- action); dropping them makes that action fail for the purged files.
--
-- This is the "retention policy for processed performance files" item still
-- open in the Phase 2 backlog. Suggested shape: keep the last N per
-- (account, kind), purge older ones EXPLICITLY, never silently.
select account_id, kind, count(*) as processed_files,
       pg_size_pretty(sum(coalesce(octet_length(content), 0))::bigint) as bytes
from manual_imports where status = 'processed'
group by account_id, kind order by 4 desc;
-- No delete offered here on purpose: pick N first.

-- ── STEP 4 — after any delete, reclaim to the OS ─────────────────────
-- Plain DELETE only marks tuples dead; autovacuum returns space to the
-- table's free list but not to the filesystem. For a large one-off reclaim:
--   vacuum (analyze) manual_imports;
--   vacuum (analyze) manual_import_chunks;
-- VACUUM FULL rewrites and does return space to the OS, but takes an ACCESS
-- EXCLUSIVE lock for the duration — schedule it, do not run it mid-day.
