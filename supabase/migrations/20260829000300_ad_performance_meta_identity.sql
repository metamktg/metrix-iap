-- Meta ad ID is the primary performance-row identity when the export supplies
-- it. Ad name remains the compatibility identity only for rows without an ID.

alter table public.ad_performance
  drop constraint if exists ad_performance_account_id_ad_name_campaign_name_result_type_key;

create unique index if not exists ad_performance_meta_identity_key
  on public.ad_performance (
    account_id,
    meta_ad_id,
    campaign_name,
    result_type,
    date_start,
    date_end
  )
  where meta_ad_id is not null;

create unique index if not exists ad_performance_name_identity_fallback_key
  on public.ad_performance (
    account_id,
    ad_name,
    campaign_name,
    result_type,
    date_start,
    date_end
  )
  where meta_ad_id is null;