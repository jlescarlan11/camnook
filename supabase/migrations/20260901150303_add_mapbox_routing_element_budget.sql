create table private.mapbox_routing_actor_windows (
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  element_count integer not null check (element_count between 2 and 128),
  primary key (actor_user_id, window_started_at)
);

create table private.mapbox_routing_rate_windows (
  window_started_at timestamptz primary key,
  element_count integer not null check (element_count between 2 and 480)
);

create table private.mapbox_routing_daily_windows (
  window_started_on date primary key,
  element_count integer not null check (element_count between 2 and 8000)
);

create table private.mapbox_routing_monthly_windows (
  window_started_on date primary key,
  element_count integer not null check (element_count between 2 and 50000),
  check (window_started_on = date_trunc('month', window_started_on)::date)
);

alter table private.mapbox_routing_actor_windows enable row level security;
alter table private.mapbox_routing_rate_windows enable row level security;
alter table private.mapbox_routing_daily_windows enable row level security;
alter table private.mapbox_routing_monthly_windows enable row level security;

create function private.claim_mapbox_routing_budget(
  p_actor_user_id uuid,
  p_element_count integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_window timestamptz := date_bin(
    interval '15 minutes', statement_timestamp(), '2000-01-01 00:00:00+00'::timestamptz
  );
  rate_window timestamptz := date_trunc('minute', statement_timestamp());
  daily_window date := (statement_timestamp() at time zone 'UTC')::date;
  monthly_window date := date_trunc(
    'month', statement_timestamp() at time zone 'UTC'
  )::date;
  claimed integer;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Mapbox routing budget is server-only' using errcode = '42501';
  end if;
  if p_actor_user_id is null
    or p_element_count not between 2 and 16
    or p_element_count % 2 <> 0
  then
    raise exception 'Mapbox routing element budget is invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.profiles as profile
    where profile.user_id = p_actor_user_id
      and profile.account_status = 'active'
  ) then
    raise exception 'Mapbox routing actor is unavailable' using errcode = '42501';
  end if;

  delete from private.mapbox_routing_actor_windows
  where window_started_at < actor_window - interval '1 hour';
  delete from private.mapbox_routing_rate_windows
  where window_started_at < rate_window - interval '5 minutes';
  delete from private.mapbox_routing_daily_windows
  where window_started_on < daily_window - 14;
  delete from private.mapbox_routing_monthly_windows
  where window_started_on < monthly_window - interval '2 months';

  begin
    insert into private.mapbox_routing_actor_windows as budget (
      actor_user_id, window_started_at, element_count
    ) values (p_actor_user_id, actor_window, p_element_count)
    on conflict (actor_user_id, window_started_at) do update
    set element_count = budget.element_count + excluded.element_count
    where budget.element_count + excluded.element_count <= 128
    returning element_count into claimed;
    if claimed is null then
      raise exception 'Mapbox actor budget is exhausted' using errcode = 'P0001';
    end if;

    claimed := null;
    insert into private.mapbox_routing_rate_windows as budget (
      window_started_at, element_count
    ) values (rate_window, p_element_count)
    on conflict (window_started_at) do update
    set element_count = budget.element_count + excluded.element_count
    where budget.element_count + excluded.element_count <= 480
    returning element_count into claimed;
    if claimed is null then
      raise exception 'Mapbox rate budget is exhausted' using errcode = 'P0001';
    end if;

    claimed := null;
    insert into private.mapbox_routing_daily_windows as budget (
      window_started_on, element_count
    ) values (daily_window, p_element_count)
    on conflict (window_started_on) do update
    set element_count = budget.element_count + excluded.element_count
    where budget.element_count + excluded.element_count <= 8000
    returning element_count into claimed;
    if claimed is null then
      raise exception 'Mapbox daily budget is exhausted' using errcode = 'P0001';
    end if;

    claimed := null;
    insert into private.mapbox_routing_monthly_windows as budget (
      window_started_on, element_count
    ) values (monthly_window, p_element_count)
    on conflict (window_started_on) do update
    set element_count = budget.element_count + excluded.element_count
    where budget.element_count + excluded.element_count <= 50000
    returning element_count into claimed;
    if claimed is null then
      raise exception 'Mapbox monthly budget is exhausted' using errcode = 'P0001';
    end if;
  exception when raise_exception then
    return false;
  end;

  return true;
end;
$$;

create function api.claim_mapbox_routing_budget(
  p_actor_user_id uuid,
  p_element_count integer
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_mapbox_routing_budget(p_actor_user_id, p_element_count);
$$;

revoke all on table
  private.mapbox_routing_actor_windows,
  private.mapbox_routing_rate_windows,
  private.mapbox_routing_daily_windows,
  private.mapbox_routing_monthly_windows
from public, anon, authenticated, service_role;

revoke all on function
  private.claim_mapbox_routing_budget(uuid, integer),
  api.claim_mapbox_routing_budget(uuid, integer)
from public, anon, authenticated, service_role;

grant execute on function private.claim_mapbox_routing_budget(uuid, integer)
to service_role;

grant execute on function api.claim_mapbox_routing_budget(uuid, integer)
to service_role;
