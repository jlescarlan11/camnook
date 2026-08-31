begin;

do $$
declare
  admin_count integer;
  admin_id uuid;
begin
  select count(*)
  into admin_count
  from private.admin_accounts
  where singleton;

  if admin_count <> 1 then
    raise exception 'hosted database must contain exactly one canonical administrator';
  end if;

  select user_id
  into admin_id
  from private.admin_accounts
  where singleton;

  perform set_config('camnook.hosted_admin_id', admin_id::text, true);
end;
$$;

create temporary table hosted_admin_baseline on commit drop as
select to_jsonb(account) as snapshot
from private.admin_accounts as account
where singleton;

select set_config('camnook.hosted_renter_id', gen_random_uuid()::text, true);
select set_config('camnook.hosted_other_renter_id', gen_random_uuid()::text, true);
select set_config('camnook.hosted_camera_id', gen_random_uuid()::text, true);
select set_config('camnook.hosted_fixture_suffix', replace(gen_random_uuid()::text, '-', ''), true);

insert into auth.users (id) values
  (current_setting('camnook.hosted_renter_id')::uuid),
  (current_setting('camnook.hosted_other_renter_id')::uuid);

insert into public.profiles (user_id, legal_name, phone, account_status) values
  (
    current_setting('camnook.hosted_renter_id')::uuid,
    'Hosted Schedule Renter',
    '+639700000001',
    'active'
  ),
  (
    current_setting('camnook.hosted_other_renter_id')::uuid,
    'Hosted Other Renter',
    '+639700000002',
    'active'
  );

insert into public.cameras (
  id,
  slug,
  serial_number,
  name,
  description,
  status,
  daily_rate,
  security_deposit,
  published_at
) values (
  current_setting('camnook.hosted_camera_id')::uuid,
  'hosted-handoff-' || current_setting('camnook.hosted_fixture_suffix'),
  'HOSTED-HANDOFF-' || current_setting('camnook.hosted_fixture_suffix'),
  'Hosted Handoff Camera',
  'Transaction-owned hosted smoke fixture.',
  'published',
  750,
  3000,
  statement_timestamp()
);

set local role authenticated;
do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    current_setting('camnook.hosted_admin_id'),
    true
  );
end;
$$;

do $$
declare
  saved_version bigint;
begin
  saved_version := api.replace_camera_handoff_policy(
    current_setting('camnook.hosted_camera_id')::uuid,
    0,
    'Cebu City',
    'hosted:cebu-city:' || current_setting('camnook.hosted_fixture_suffix'),
    'PH',
    10.31570,
    123.88540,
    array[0, 1, 2, 3, 4, 5, 6]::smallint[],
    array['09:00']::time[],
    true
  );
  if saved_version <> 1 then
    raise exception 'hosted handoff policy version was not one';
  end if;
end;
$$;

reset role;
set local role anon;

do $$
declare
  quote record;
  projection jsonb;
begin
  select * into quote
  from api.quote_booking_schedule(
    current_setting('camnook.hosted_camera_id')::uuid,
    current_date + 8,
    current_date + 10,
    '09:00',
    1
  );
  if quote.billable_days <> 2 then
    raise exception 'hosted handoff quote returned unexpected duration';
  end if;

  begin
    perform * from api.quote_booking_schedule(
      current_setting('camnook.hosted_camera_id')::uuid,
      current_date + 8,
      current_date + 10,
      '09:00',
      0
    );
    raise exception 'hosted stale policy version was quoted';
  exception when sqlstate '40001' then null;
  end;

  select to_jsonb(policy) into projection
  from public.public_camera_handoff_policies as policy
  where policy.camera_id = current_setting('camnook.hosted_camera_id')::uuid;
  if projection is null
    or projection ->> 'city_label' <> 'Cebu City'
    or projection ?| array[
      'provider_city_id',
      'latitude',
      'longitude',
      'updated_by'
    ]
  then
    raise exception 'hosted public handoff projection is missing or private';
  end if;

  begin
    perform api.get_camera_handoff_policy_admin(
      current_setting('camnook.hosted_camera_id')::uuid
    );
    raise exception 'anonymous caller read hosted admin handoff policy';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_renter_id'),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    perform api.get_meetup_recommendation_context(
      current_setting('camnook.hosted_camera_id')::uuid,
      current_date + 8,
      current_date + 10,
      '09:00',
      1
    );
    raise exception 'renter obtained private lender recommendation context';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  context jsonb;
  created_booking_id uuid;
begin
  context := api.get_meetup_recommendation_context(
    current_setting('camnook.hosted_camera_id')::uuid,
    current_date + 8,
    current_date + 10,
    '09:00',
    1
  );
  if context ->> 'city_label' <> 'Cebu City'
    or (context ->> 'policy_version')::bigint <> 1
  then
    raise exception 'service meetup context did not bind the hosted policy';
  end if;

  created_booking_id := api.request_booking_schedule_with_meetup_idempotent(
    current_setting('camnook.hosted_renter_id')::uuid,
    current_setting('camnook.hosted_camera_id')::uuid,
    current_date + 8,
    current_date + 10,
    '09:00',
    1,
    'Hosted smoke',
    'Cebu City',
    'Mandaue City',
    'Hosted Public Venue',
    'Hosted public entrance, Cebu City',
    'Cebu City',
    10.317,
    123.905,
    'hosted-smoke-v1',
    'b0400000-0000-4000-8000-000000000001'
  );
  perform set_config(
    'camnook.hosted_booking_id',
    created_booking_id::text,
    true
  );

  begin
    perform api.request_booking_schedule_with_meetup_idempotent(
      current_setting('camnook.hosted_renter_id')::uuid,
      current_setting('camnook.hosted_camera_id')::uuid,
      current_date + 12,
      current_date + 14,
      '09:00',
      1,
      'Hosted invalid smoke',
      'Cebu City',
      'Mandaue City',
      '',
      'Hosted public entrance, Cebu City',
      'Cebu City',
      10.317,
      123.905,
      'hosted-smoke-v1',
      'b0400000-0000-4000-8000-000000000002'
    );
    raise exception 'invalid hosted meetup snapshot was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_renter_id'),
  true
);

do $$
begin
  if not exists (
    select 1
    from public.booking_meetup_plans
    where booking_id = current_setting('camnook.hosted_booking_id')::uuid
  ) then
    raise exception 'booking renter could not read hosted meetup snapshot';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_other_renter_id'),
  true
);

do $$
begin
  if exists (
    select 1
    from public.booking_meetup_plans
    where booking_id = current_setting('camnook.hosted_booking_id')::uuid
  ) then
    raise exception 'another renter read hosted meetup snapshot';
  end if;
end;
$$;

reset role;

do $$
begin
  if (
    select count(*)
    from public.bookings
    where camera_id = current_setting('camnook.hosted_camera_id')::uuid
  ) <> 1 then
    raise exception 'failed hosted request left partial booking state';
  end if;

  if (
    select to_jsonb(account)
    from private.admin_accounts as account
    where singleton
  ) is distinct from (
    select snapshot
    from hosted_admin_baseline
  ) then
    raise exception 'hosted smoke changed the canonical administrator';
  end if;
end;
$$;

select unnest(array[
  '1..1',
  'ok 1 - hosted calendar, handoff, and meetup boundaries are baseline-safe and atomic'
]);

rollback;
