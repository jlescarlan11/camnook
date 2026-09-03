do $reconcile$
declare
  release private.psgc_releases%rowtype;
begin
  if exists (
    select 1
    from supabase_migrations.schema_migrations
    where version > '20260902220100'
  ) then
    raise exception 'psgc_seed_recovery_refuses_later_migration_history';
  end if;

  select * into release
  from private.psgc_releases
  where release_key = '2026-q2';

  if not found
    or release.source_sha256 <> '31892bc2bdde3ea0682562d9412b5bab4d45a0be5e5a5b4f6c9d7714b94bca5d'
    or release.effective_on <> date '2026-06-30'
    or not release.active
    or release.activated_at is null
  then
    raise exception 'psgc_seed_recovery_state_mismatch';
  end if;

  perform private.validate_psgc_release('2026-q2');
end;
$reconcile$;
