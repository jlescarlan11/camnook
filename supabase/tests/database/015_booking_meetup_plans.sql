begin;

select '1..1';

insert into auth.users (id) values
  ('d0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('d0000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone, account_status) values
  ('d0000000-0000-4000-8000-000000000001', 'Meetup Admin', '+639800000001', 'active'),
  ('d0000000-0000-4000-8000-000000000002', 'Meetup Renter', '+639800000002', 'active'),
  ('d0000000-0000-4000-8000-000000000003', 'Other Renter', '+639800000003', 'active');

insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at
) values (
  'd0100000-0000-4000-8000-000000000001', 'meetup-camera',
  'PRIVATE-MEETUP-SERIAL', 'Meetup Camera', 'Meetup fixture.',
  'published', 900, 3500, statement_timestamp()
);

insert into public.camera_handoff_policies (
  camera_id, city_label, allowed_weekdays, timezone, enabled, version
) values (
  'd0100000-0000-4000-8000-000000000001', 'Cebu City',
  array[0,1,2,3,4,5,6]::smallint[], 'Asia/Manila', true, 1
);

insert into public.camera_handoff_slots (camera_id, local_time)
values ('d0100000-0000-4000-8000-000000000001', '09:00');

insert into private.camera_lender_city_anchors (
  camera_id, provider_city_id, country_code, latitude, longitude, updated_by
) values (
  'd0100000-0000-4000-8000-000000000001', 'provider:cebu-city', 'PH',
  10.31570, 123.88540, 'd0000000-0000-4000-8000-000000000001'
);

insert into public.contract_templates (
  id, version, schema_version, terms, content_sha256, approved_at, approved_by,
  activated_at, created_by
) values (
  'd0200000-0000-4000-8000-000000000001', 'meetup-v1', 1,
  jsonb_build_object(
    'pickup', 'Meet at the planned public venue.',
    'return', 'Return at the same planned public venue.',
    'cancellation', 'Cancellation terms.',
    'late-return', 'Late return terms.',
    'damage', 'Damage terms.',
    'loss', 'Loss terms.',
    'non-transferability', 'Named renter only.'
  ), extensions.digest(convert_to('meetup-template', 'UTF8'), 'sha256'),
  statement_timestamp(), 'd0000000-0000-4000-8000-000000000001',
  statement_timestamp(), 'd0000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000002';
set local "request.jwt.claim.role" = 'authenticated';

do $$
begin
  if has_function_privilege(
    'authenticated',
    'api.request_booking_schedule_with_meetup(uuid,uuid,date,date,time without time zone,bigint,text,text,text,text,text,text,numeric,numeric,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can execute the service-only meetup request';
  end if;
  if has_function_privilege(
    'authenticated',
    'api.request_booking_schedule_idempotent(uuid,date,date,time without time zone,bigint,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can bypass the mandatory meetup snapshot';
  end if;
  begin
    perform api.request_booking_schedule_idempotent(
      'd0100000-0000-4000-8000-000000000001',
      current_date + 8, current_date + 10, '09:00', 1,
      'Direct bypass attempt', 'Cebu shoot',
      'd0400000-0000-4000-8000-000000000099'
    );
    raise exception 'authenticated caller created a schedule-only request';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api.get_meetup_recommendation_context(
      'd0100000-0000-4000-8000-000000000001',
      current_date + 8, current_date + 10, '09:00', 1
    );
    raise exception 'renter obtained private lender recommendation context';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

do $$
declare
  created_id uuid;
  context jsonb;
begin
  context := api.get_meetup_recommendation_context(
    'd0100000-0000-4000-8000-000000000001',
    current_date + 8, current_date + 10, '09:00', 1
  );
  if context ->> 'provider_city_id' <> 'provider:cebu-city'
    or (context ->> 'policy_version')::bigint <> 1
  then
    raise exception 'service context did not return the bound lender city';
  end if;

  created_id := api.request_booking_schedule_with_meetup_idempotent(
    'd0000000-0000-4000-8000-000000000002',
    'd0100000-0000-4000-8000-000000000001',
    current_date + 8, current_date + 10, '09:00', 1,
    'Documentary', 'Cebu shoot', 'Mandaue City',
    'Ayala Center Cebu', 'Cardinal Rosales Avenue, Cebu City', 'Cebu City',
    10.317, 123.905, 'geoapify-v1',
    'd0400000-0000-4000-8000-000000000001'
  );
  perform set_config('camnook.test_meetup_booking_id', created_id::text, true);

  begin
    perform api.request_booking_schedule_with_meetup_idempotent(
      'd0000000-0000-4000-8000-000000000002',
      'd0100000-0000-4000-8000-000000000001',
      current_date + 8, current_date + 10, '09:00', 1,
      'Different use', 'Cebu shoot', 'Mandaue City',
      'Ayala Center Cebu', 'Cardinal Rosales Avenue, Cebu City', 'Cebu City',
      10.317, 123.905, 'geoapify-v1',
      'd0400000-0000-4000-8000-000000000001'
    );
    raise exception 'booking operation key was reused for a different payload';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform api.request_booking_schedule_with_meetup_idempotent(
      'd0000000-0000-4000-8000-000000000002',
      'd0100000-0000-4000-8000-000000000001',
      current_date + 12, current_date + 14, '09:00', 1,
      'Documentary', 'Cebu shoot', 'Mandaue City',
      '', 'Cardinal Rosales Avenue, Cebu City', 'Cebu City',
      10.317, 123.905, 'geoapify-v1',
      'd0400000-0000-4000-8000-000000000002'
    );
    raise exception 'invalid meetup snapshot was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;

do $$
declare
  target_id uuid := current_setting('camnook.test_meetup_booking_id')::uuid;
begin
  if (select count(*) from public.bookings where id = target_id and state = 'FOR_REVIEW' and meetup_snapshot_required) <> 1
    or (select count(*) from public.booking_meetup_plans where booking_meetup_plans.booking_id = target_id) <> 1
    or (select count(*) from public.booking_state_history where booking_state_history.booking_id = target_id and to_state = 'FOR_REVIEW') <> 1
    or (select count(*) from private.audit_logs where entity_id = target_id and action = 'request_booking' and outcome = 'success') <> 1
    or (select count(*) from public.bookings) <> 1
  then
    raise exception 'meetup booking aggregate was not committed exactly once or failed request left partial state';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000002';

do $$
declare
  target_id uuid := current_setting('camnook.test_meetup_booking_id')::uuid;
begin
  if (select count(*) from public.booking_meetup_plans where booking_meetup_plans.booking_id = target_id) <> 1 then
    raise exception 'booking renter could not read the owned meetup snapshot';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000003';

do $$
declare
  target_id uuid := current_setting('camnook.test_meetup_booking_id')::uuid;
begin
  if exists (select 1 from public.booking_meetup_plans where booking_meetup_plans.booking_id = target_id) then
    raise exception 'another renter read the meetup snapshot';
  end if;
end;
$$;

reset role;

do $$
declare
  target_id uuid := current_setting('camnook.test_meetup_booking_id')::uuid;
begin
  begin
    update public.booking_meetup_plans set venue_name = 'Changed' where booking_meetup_plans.booking_id = target_id;
    raise exception 'meetup snapshot was mutable';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.bookings set meetup_snapshot_required = false where id = target_id;
    raise exception 'meetup requirement marker was mutable';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000001';

select api.approve_booking(current_setting('camnook.test_meetup_booking_id')::uuid);

do $$
declare
  target_id uuid := current_setting('camnook.test_meetup_booking_id')::uuid;
  snapshot jsonb;
begin
  select version.snapshot into snapshot
  from public.contract_versions as version
  where version.booking_id = target_id and version.status = 'issued';
  if snapshot #>> '{meetup,venue_name}' <> 'Ayala Center Cebu'
    or snapshot #>> '{meetup,renter_city}' <> 'Mandaue City'
    or snapshot #>> '{meetup,provider_config_version}' <> 'geoapify-v1'
    or (select snapshot_schema_version from public.contract_versions where contract_versions.booking_id = target_id) <> 2
  then
    raise exception 'contract did not contain the immutable meetup snapshot: %', snapshot;
  end if;
end;
$$;

reset role;

insert into public.bookings (
  id, renter_id, camera_id, pickup_at, return_at, intended_use,
  expected_location, meetup_snapshot_required
) values (
  'd0300000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0100000-0000-4000-8000-000000000001',
  (current_date + 20 + time '09:00') at time zone 'Asia/Manila',
  (current_date + 22 + time '09:00') at time zone 'Asia/Manila',
  'Missing snapshot test', 'Cebu shoot', true
);
insert into public.booking_state_history (
  booking_id, from_state, to_state, actor_user_id, actor_type, reason_code
) values (
  'd0300000-0000-4000-8000-000000000001', null, 'FOR_REVIEW',
  'd0000000-0000-4000-8000-000000000002', 'renter', 'booking_requested'
);

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform api.approve_booking('d0300000-0000-4000-8000-000000000001');
    raise exception 'booking without required meetup snapshot was approved';
  exception when sqlstate '23514' then null;
  end;
  if not exists (
    select 1 from public.bookings
    where id = 'd0300000-0000-4000-8000-000000000001'
      and state = 'FOR_REVIEW' and approved_at is null
  ) then
    raise exception 'failed approval changed the incomplete booking';
  end if;
end;
$$;

reset role;

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform api.claim_geoapify_provider_budget(
      'd0000000-0000-4000-8000-000000000002', 1
    );
    raise exception 'authenticated clients could reserve Geoapify provider budget';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

do $$
begin
  if not api.claim_geoapify_provider_budget(
    'd0000000-0000-4000-8000-000000000002', 3
  )
    or not api.claim_geoapify_provider_budget(
      'd0000000-0000-4000-8000-000000000002', 2
    )
    or api.claim_geoapify_provider_budget(
      'd0000000-0000-4000-8000-000000000002', 1
    )
  then
    raise exception 'Geoapify request budget did not enforce the shared per-second cap';
  end if;

  begin
    perform api.claim_geoapify_provider_budget(
      'd0000000-0000-4000-8000-000000000002', 6
    );
    raise exception 'Geoapify request budget accepted an invalid request count';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;

delete from private.geoapify_provider_global_windows;
delete from private.geoapify_provider_actor_windows;
insert into private.geoapify_provider_daily_windows (
  window_started_on, request_count
) values ((statement_timestamp() at time zone 'UTC')::date, 2999)
on conflict (window_started_on) do update
set request_count = excluded.request_count;

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

do $$
begin
  if not api.claim_geoapify_provider_budget(
    'd0000000-0000-4000-8000-000000000002', 1
  )
    or api.claim_geoapify_provider_budget(
      'd0000000-0000-4000-8000-000000000001', 1
    )
  then
    raise exception 'Geoapify request budget did not enforce the daily cap';
  end if;
end;
$$;

reset role;

update public.profiles
set account_status = 'suspended'
where user_id = 'd0000000-0000-4000-8000-000000000003';

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

do $$
begin
  begin
    perform api.claim_geoapify_provider_budget(
      'd0000000-0000-4000-8000-000000000003', 1
    );
    raise exception 'inactive profiles could reserve Geoapify provider budget';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select 'ok 1 - meetup plans are service-bound, atomic, private, immutable, contract-snapshotted, and legacy-safe';

rollback;
