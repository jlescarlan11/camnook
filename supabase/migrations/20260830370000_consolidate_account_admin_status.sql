create or replace function api.get_my_account_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_my_account_overview()
    || jsonb_build_object('is_admin', private.is_admin());
$$;

revoke all on function api.get_my_account_overview()
from public, anon, authenticated;
grant execute on function api.get_my_account_overview()
to authenticated;
