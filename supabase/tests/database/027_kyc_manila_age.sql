begin;
select '1..1';

insert into auth.users (id) values ('f2700000-0000-4000-8000-000000000001');
insert into public.profiles (user_id, legal_name, phone) values
  ('f2700000-0000-4000-8000-000000000001', 'Age Boundary Renter', '+639270000001');

set local role authenticated;
set local "request.jwt.claim.sub" = 'f2700000-0000-4000-8000-000000000001';

do $$
declare
  zone text;
  cutoff date := ((now() at time zone 'Asia/Manila')::date - interval '18 years')::date;
  saved jsonb;
  input jsonb := jsonb_build_object(
    'legal_name', 'Age Boundary Renter', 'phone', '+639270000001',
    'birth_date', cutoff, 'legacy_address_line1', null,
    'house_number', '12', 'street_name', 'Mango Avenue',
    'building', null, 'address_details', null, 'postal_code', '6000',
    'expected_address_revision', null, 'release_key', '2026-q2',
    'area_code', '0730600041', 'pin_operation', 'set',
    'pin_source', 'map_pin', 'pin_latitude', '10.31570',
    'pin_longitude', '123.88540', 'pin_accuracy_meters', null,
    'pin_consent_version', 'residential-pin-v1'
  );
begin
  -- At least one extreme is on a different calendar date from Manila,
  -- regardless of what hour CI runs. Neither may alter eligibility.
  foreach zone in array array['Etc/GMT+12', 'Etc/GMT-14', 'UTC', 'Asia/Manila'] loop
    perform set_config('TimeZone', zone, true);
    saved := api.save_my_kyc_profile_v2(input);
    if (saved ->> 'birth_date')::date <> cutoff then
      raise exception 'eighteenth birthday was not saved';
    end if;
    input := input || jsonb_build_object('expected_address_revision', saved ->> 'address_revision');
    begin
      perform api.save_my_kyc_profile_v2(input || jsonb_build_object('birth_date', cutoff + 1));
      raise exception 'tomorrow birthday was admitted';
    exception when sqlstate '22023' then null;
    end;
    if (api.get_my_kyc_profile_v2() ->> 'birth_date')::date <> cutoff then
      raise exception 'rejected birthdate changed the saved profile';
    end if;
  end loop;
end;
$$;

reset role;

do $$
declare
  sample record;
  target regprocedure;
begin
  for sample in select * from (values
    ('2026-09-21 15:59:59+00'::timestamptz, 18, '2008-09-21'::date),
    ('2026-09-21 16:00:00+00'::timestamptz, 18, '2008-09-22'::date),
    ('2026-12-31 16:00:00+00'::timestamptz, 18, '2009-01-01'::date),
    ('2028-02-29 08:00:00+00'::timestamptz, 18, '2010-02-28'::date),
    ('2020-02-29 08:00:00+00'::timestamptz, 120, '1900-02-28'::date),
    ('2024-02-29 08:00:00+00'::timestamptz, 120, '1904-02-29'::date)
  ) as samples(at_time, years, expected) loop
    if private.kyc_date_years_ago(sample.at_time, sample.years) <> sample.expected then
      raise exception 'KYC cutoff disagrees with calendar boundary';
    end if;
  end loop;
  if has_function_privilege('anon', 'private.kyc_date_years_ago(timestamptz,integer)', 'execute')
    or has_function_privilege('authenticated', 'private.kyc_date_years_ago(timestamptz,integer)', 'execute')
    or has_function_privilege('service_role', 'private.kyc_date_years_ago(timestamptz,integer)', 'execute')
  then raise exception 'internal KYC clock helper was exposed'; end if;
  foreach target in array array[
    'private.save_my_kyc_profile(jsonb)'::regprocedure,
    'private.save_my_kyc_profile_v2(jsonb)'::regprocedure,
    'api.request_booking_with_preference_idempotent(uuid,uuid,date,date,time without time zone,bigint,text,text,text,uuid)'::regprocedure,
    'api.request_booking_with_place_idempotent(uuid,uuid,date,date,time without time zone,bigint,text,text,uuid,bigint,uuid)'::regprocedure
  ] loop
    if position('current_date' in pg_get_functiondef(target)) > 0
      or position('private.kyc_date_years_ago(now(), 18)' in pg_get_functiondef(target)) = 0
    then raise exception 'KYC operation still uses a session-dependent age'; end if;
  end loop;
end;
$$;

select 'ok 1 - KYC age follows Manila across database session timezones';
rollback;
