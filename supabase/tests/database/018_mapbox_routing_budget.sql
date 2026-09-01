begin;

select '1..1';

insert into auth.users (id) values
  ('e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002');

insert into public.profiles (user_id, legal_name, phone, account_status) values
  ('e0000000-0000-4000-8000-000000000001', 'Routing Renter', '+639800000011', 'active'),
  ('e0000000-0000-4000-8000-000000000002', 'Suspended Renter', '+639800000012', 'suspended');

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'e0000000-0000-4000-8000-000000000001';

do $$
begin
  if has_function_privilege(
    'authenticated',
    'api.claim_mapbox_routing_budget(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can reserve Mapbox routing budget';
  end if;
  begin
    perform api.claim_mapbox_routing_budget(
      'e0000000-0000-4000-8000-000000000001', 16
    );
    raise exception 'authenticated caller reserved Mapbox elements';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.mapbox_routing_monthly_windows;
    raise exception 'authenticated caller inspected private Mapbox counters';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

do $$
begin
  if not api.claim_mapbox_routing_budget(
    'e0000000-0000-4000-8000-000000000001', 16
  ) then
    raise exception 'valid 2x8 Mapbox reservation was denied';
  end if;
  begin
    perform api.claim_mapbox_routing_budget(
      'e0000000-0000-4000-8000-000000000001', 15
    );
    raise exception 'odd Mapbox element reservation was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform api.claim_mapbox_routing_budget(
      'e0000000-0000-4000-8000-000000000002', 2
    );
    raise exception 'inactive actor reserved Mapbox elements';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  actor_window timestamptz := date_bin(
    interval '15 minutes', statement_timestamp(), '2000-01-01 00:00:00+00'::timestamptz
  );
begin
  if (select element_count from private.mapbox_routing_actor_windows
      where actor_user_id = 'e0000000-0000-4000-8000-000000000001'
        and window_started_at = actor_window) <> 16
    or (select coalesce(sum(element_count), 0) from private.mapbox_routing_rate_windows) <> 16
    or (select coalesce(sum(element_count), 0) from private.mapbox_routing_daily_windows) <> 16
    or (select coalesce(sum(element_count), 0) from private.mapbox_routing_monthly_windows) <> 16
  then
    raise exception 'Mapbox element reservation was not recorded exactly';
  end if;
  update private.mapbox_routing_actor_windows
  set element_count = 128
  where actor_user_id = 'e0000000-0000-4000-8000-000000000001'
    and window_started_at = actor_window;
end;
$$;

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';
do $$
begin
  if api.claim_mapbox_routing_budget(
    'e0000000-0000-4000-8000-000000000001', 2
  ) then
    raise exception 'actor exceeded the Mapbox element ceiling';
  end if;
end;
$$;
reset role;

do $$
begin
  if (select coalesce(sum(element_count), 0) from private.mapbox_routing_rate_windows) <> 16
    or (select coalesce(sum(element_count), 0) from private.mapbox_routing_daily_windows) <> 16
    or (select coalesce(sum(element_count), 0) from private.mapbox_routing_monthly_windows) <> 16
  then
    raise exception 'denied actor claim consumed a broader Mapbox budget';
  end if;
end;
$$;

select 'ok 1 - Mapbox routing budget is bounded, atomic, private, and service-only';

rollback;
