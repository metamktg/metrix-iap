-- METRIX — upload storage reclaim (prepared 2026-08-25, NOT YET RUN)
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
-- Byte-identical files (same account + kind + content_md5). Keeps ONE copy
-- per group, preferring a 'processed' row (it carries run lineage) and
-- otherwise the oldest. 62 rows / 270 MB logical at audit time — 22 groups
-- of bookster/skov_pet creative assets plus three performance exports.
--
-- Review this list before running the delete: a kept row must remain for
-- every group, and creative assets may be referenced by ad_names mappings.
with ranked as (
  select mi.id, mi.account_id, mi.kind, mi.filename, mi.status, mi.content_md5,
         row_number() over (
           partition by mi.account_id, mi.kind, mi.content_md5
           order by (mi.status = 'processed') desc, mi.created_at
         ) as copy_no
  from manual_imports mi
  where mi.content_md5 is not null
)
select * from ranked where copy_no > 1 order by account_id, kind, filename;
-- delete from manual_imports where id in (
--   with ranked as (
--     select mi.id, row_number() over (
--              partition by mi.account_id, mi.kind, mi.content_md5
--              order by (mi.status = 'processed') desc, mi.created_at) as copy_no
--       from manual_imports mi where mi.content_md5 is not null
--   ) select id from ranked where copy_no > 1
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
