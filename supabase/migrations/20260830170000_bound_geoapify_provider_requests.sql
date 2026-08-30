create table private.geoapify_provider_global_windows (
  window_started_at timestamptz primary key,
  request_count integer not null check (request_count between 1 and 5)
);

create table private.geoapify_provider_actor_windows (
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 10),
  primary key (actor_user_id, window_started_at)
);

alter table private.geoapify_provider_global_windows enable row level security;
alter table private.geoapify_provider_actor_windows enable row level security;

create function private.claim_geoapify_provider_budget(p_request_count integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  second_window timestamptz := date_trunc('second', statement_timestamp());
  actor_window timestamptz := date_bin(
    interval '15 minutes', statement_timestamp(), '2000-01-01 00:00:00+00'::timestamptz
  );
  actor_claimed integer;
  global_claimed integer;
begin
  if p_request_count not between 1 and 5 then
    raise exception 'Geoapify request count is invalid' using errcode = '22023';
  end if;

  -- Keep the operational throttle state short-lived. It records only an actor
  -- UUID and aggregate request counts, never positions, queries, or provider
  -- responses.
  delete from private.geoapify_provider_global_windows
  where window_started_at < second_window - interval '5 minutes';
  delete from private.geoapify_provider_actor_windows
  where window_started_at < actor_window - interval '15 minutes';

  begin
    insert into private.geoapify_provider_actor_windows as budget (
      actor_user_id, window_started_at, request_count
    ) values (caller, actor_window, p_request_count)
    on conflict (actor_user_id, window_started_at) do update
    set request_count = budget.request_count + excluded.request_count
    where budget.request_count + excluded.request_count <= 10
    returning request_count into actor_claimed;

    if actor_claimed is null then
      return false;
    end if;

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
  exception
    when raise_exception then
      -- The nested block rolls back the actor claim if the global claim loses
      -- a concurrent race, so a denied attempt never consumes later capacity.
      return false;
  end;

  return true;
end;
$$;

create function api.claim_geoapify_provider_budget(p_request_count integer)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_geoapify_provider_budget(p_request_count);
$$;

revoke all on table
  private.geoapify_provider_global_windows,
  private.geoapify_provider_actor_windows
from public, anon, authenticated, service_role;

revoke all on function
  private.claim_geoapify_provider_budget(integer),
  api.claim_geoapify_provider_budget(integer)
from public, anon, authenticated, service_role;

grant execute on function private.claim_geoapify_provider_budget(integer)
to authenticated;

grant execute on function api.claim_geoapify_provider_budget(integer)
to authenticated;
