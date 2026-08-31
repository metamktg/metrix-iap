-- The mapping and ad-instance rows are wholly owned by their account/import.
-- Cascade ownership preserves existing account and upload deletion semantics.

alter table public.creative_asset_mappings
  drop constraint if exists creative_asset_mappings_account_id_fkey,
  add constraint creative_asset_mappings_account_id_fkey
    foreign key (account_id) references public.ad_accounts(id) on delete cascade,
  drop constraint if exists creative_asset_mappings_manual_import_id_fkey,
  add constraint creative_asset_mappings_manual_import_id_fkey
    foreign key (manual_import_id) references public.manual_imports(id) on delete cascade;

alter table public.ad_instances
  drop constraint if exists ad_instances_account_id_fkey,
  add constraint ad_instances_account_id_fkey
    foreign key (account_id) references public.ad_accounts(id) on delete cascade;