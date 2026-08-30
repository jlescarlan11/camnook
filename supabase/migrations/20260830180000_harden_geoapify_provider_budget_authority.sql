create or replace function private.claim_geoapify_provider_budget(
  p_actor_user_id uuid,
  p_request_count integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  second_window timestamptz := date_trunc('second', statement_timestamp());
  actor_window timestamptz := date_bin(
    interval '15 minutes', statement_timestamp(), '2000-01-01 00:00:00+00'::timestamptz
  );
  actor_claimed integer;
  global_claimed integer;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Geoapify provider budget is server-only' using errcode = '42501';
  end if;
  if p_actor_user_id is null or p_request_count not between 1 and 5 then
    raise exception 'Geoapify request budget is invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.profiles as profile
    where profile.user_id = p_actor_user_id
      and profile.account_status = 'active'
  ) then
    raise exception 'Geoapify provider actor is unavailable' using errcode = '42501';
  end if;

  delete from private.geoapify_provider_global_windows
  where window_started_at < second_window - interval '5 minutes';
  delete from private.geoapify_provider_actor_windows
  where window_started_at < actor_window - interval '15 minutes';

  begin
    insert into private.geoapify_provider_actor_windows as budget (
      actor_user_id, window_started_at, request_count
    ) values (p_actor_user_id, actor_window, p_request_count)
    on conflict (actor_user_id, window_started_at) do update
    set request_count = budget.request_count + excluded.request_count
    where budget.request_count + excluded.request_count <= 10
    returning request_count into actor_claimed;

    if actor_claimed is null then return false; end if;

    insert into private.geoapify_provider_global_windows as budget (
      window_started_at, request_count
    ) values (second_window, p_request_count)
    on conflict (window_started_at) do update
    set request_count = budget.request_count + excluded.request_count
    where budget.request_count + excluded.request_count <= 5
    returning request_count into global_claimed;

    if global_claimed is null then
      raise exception 'Geoapify global budget is exhausted' using errcode = 'P0001';
    end if;
  exception when raise_exception then
    return false;
  end;

  return true;
end;
$$;

create or replace function api.claim_geoapify_provider_budget(
  p_actor_user_id uuid,
  p_request_count integer
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_geoapify_provider_budget(p_actor_user_id, p_request_count);
$$;

revoke all on function
  private.claim_geoapify_provider_budget(integer),
  private.claim_geoapify_provider_budget(uuid, integer),
  api.claim_geoapify_provider_budget(integer),
  api.claim_geoapify_provider_budget(uuid, integer)
from public, anon, authenticated, service_role;

grant execute on function private.claim_geoapify_provider_budget(uuid, integer)
to service_role;

grant execute on function api.claim_geoapify_provider_budget(uuid, integer)
to service_role;
