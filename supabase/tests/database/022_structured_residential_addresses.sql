begin;

select '1..1';

insert into auth.users (id) values
  ('f2200000-0000-4000-8000-000000000001'),
  ('f2200000-0000-4000-8000-000000000002');
insert into public.profiles (user_id, legal_name, phone) values
  ('f2200000-0000-4000-8000-000000000001', 'Address Renter', '+639220000001'),
  ('f2200000-0000-4000-8000-000000000002', 'Other Address Renter', '+639220000002');

set local role authenticated;
set local "request.jwt.claim.sub" = 'f2200000-0000-4000-8000-000000000001';

do $$
declare
  saved jsonb;
begin
  saved := api.save_my_kyc_profile_v2(jsonb_build_object(
    'legal_name', 'Address Renter',
    'phone', '+639220000001',
    'birth_date', '1990-03-15',
    'legacy_address_line1', null,
    'house_number', '12',
    'street_name', 'Mango Avenue',
    'building', 'Tower A',
    'address_details', 'Unit 4',
    'postal_code', '6000',
    'expected_address_revision', null,
    'release_key', '2026-q2',
    'area_code', '0730600041',
    'pin_operation', 'set',
    'pin_source', 'map_pin',
    'pin_latitude', '10.31570',
    'pin_longitude', '123.88540',
    'pin_accuracy_meters', null,
    'pin_consent_version', 'residential-pin-v1'
  ));

  if saved ->> 'address_line1' <> 'Tower A, 12 Mango Avenue, Unit 4'
    or saved ->> 'postal_code' <> '6000'
    or saved #>> '{residential_pin,source}' <> 'map_pin'
    or saved #>> '{residential_pin,latitude}' <> '10.31570'
    or saved ?| array['user_id', 'updated_by', 'consent_version']
  then raise exception 'structured KYC projection was incomplete or widened'; end if;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Address Renter', 'phone', '+639220000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', '13', 'street_name', 'Mango Avenue',
      'building', 'Tower A', 'address_details', 'Unit 4',
      'postal_code', '6000', 'release_key', '2026-q2',
      'expected_address_revision', saved ->> 'address_revision',
      'area_code', '0730600041', 'pin_operation', 'keep',
      'pin_source', null, 'pin_latitude', null, 'pin_longitude', null,
      'pin_accuracy_meters', null, 'pin_consent_version', null
    ));
    raise exception 'changed address retained a stale pin';
  exception when sqlstate '40001' then null;
  end;

  if api.get_my_kyc_profile_v2() ->> 'house_number' <> '12'
    or api.get_my_kyc_profile_v2() -> 'residential_pin' is null
  then raise exception 'failed address/pin update was not atomic'; end if;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Address Renter', 'phone', '+639220000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', '12', 'street_name', 'Mango Avenue',
      'building', 'Tower A', 'address_details', 'Unit 4',
      'postal_code', '6000', 'release_key', '2026-q2',
      'expected_address_revision', saved ->> 'address_revision',
      'area_code', '0730600041', 'pin_operation', 'remove',
      'pin_source', null, 'pin_latitude', null, 'pin_longitude', null,
      'pin_accuracy_meters', null, 'pin_consent_version', null,
      'unexpected', 'must fail'
    ));
    raise exception 'unknown input key unexpectedly passed';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Address Renter', 'phone', '+639220000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', '12', 'street_name', 'Mango Avenue',
      'building', 'Tower A', 'address_details', 'Unit 4',
      'postal_code', '6000', 'release_key', '2026-q2',
      'expected_address_revision', saved ->> 'address_revision',
      'area_code', '0730600041', 'pin_operation', 'keep',
      'pin_source', 'map_pin', 'pin_latitude', '10.3157',
      'pin_longitude', '123.8854', 'pin_accuracy_meters', null,
      'pin_consent_version', null
    ));
    raise exception 'coordinate payload unexpectedly bypassed keep semantics';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Address Renter', 'phone', '+639220000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', '12', 'street_name', 'Mango Avenue',
      'building', 'Tower A', 'address_details', 'Unit 4',
      'postal_code', '6000', 'release_key', '2026-q2',
      'area_code', '0730600041', 'pin_operation', 'remove',
      'expected_address_revision', gen_random_uuid(),
      'pin_source', null, 'pin_latitude', null, 'pin_longitude', null,
      'pin_accuracy_meters', null, 'pin_consent_version', null
    ));
    raise exception 'stale address revision unexpectedly saved';
  exception when sqlstate '40001' then null;
  end;
end;
$$;

do $$ begin
  begin
    perform * from private.renter_residential_pins;
    raise exception 'authenticated role directly read private residential pins';
  exception when insufficient_privilege then null;
  end;
end; $$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f2200000-0000-4000-8000-000000000002';
do $$ begin
  if api.get_my_kyc_profile_v2() is not null then
    raise exception 'one renter read another renter residential address or pin';
  end if;
end; $$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f2200000-0000-4000-8000-000000000001';
do $$
declare
  legacy jsonb;
begin
  legacy := api.save_my_kyc_profile(jsonb_build_object(
    'legal_name', 'Address Renter Updated', 'phone', '+639220000009',
    'birth_date', '1990-03-15',
    'address_line1', 'Tower A, 12 Mango Avenue, Unit 4',
    'release_key', '2026-q2', 'area_code', '0730600041'
  ));
  if legacy ?| array[
    'address_format_version', 'house_number', 'street_name', 'postal_code',
    'residential_pin', 'address_revision'
  ] then raise exception 'legacy RPC response contract widened'; end if;
  if api.get_my_kyc_profile_v2() ->> 'postal_code' <> '6000'
    or api.get_my_kyc_profile_v2() -> 'residential_pin' is null
  then raise exception 'unrelated legacy save erased structured address data'; end if;

  perform api.save_my_kyc_profile(jsonb_build_object(
    'legal_name', 'Address Renter Updated', 'phone', '+639220000009',
    'birth_date', '1990-03-15', 'address_line1', '99 New Road',
    'release_key', '2026-q2', 'area_code', '0730600041'
  ));
  if api.get_my_kyc_profile_v2() ->> 'address_format_version' <> '1'
    or api.get_my_kyc_profile_v2() -> 'residential_pin' <> 'null'::jsonb
  then raise exception 'legacy address replacement retained incompatible structured data'; end if;
end;
$$;

-- Recreate structured data with its required private pin, then prove booking
-- history freezes the written fields and never receives residential coordinates.
select api.save_my_kyc_profile_v2(jsonb_build_object(
  'legal_name', 'Address Renter Updated', 'phone', '+639220000009',
  'birth_date', '1990-03-15', 'legacy_address_line1', null,
  'house_number', '12', 'street_name', 'Mango Avenue',
  'building', 'Tower A', 'address_details', 'Unit 4', 'postal_code', '6000',
  'expected_address_revision', (api.get_my_kyc_profile_v2() ->> 'address_revision'),
  'release_key', '2026-q2', 'area_code', '0730600041',
  'pin_operation', 'set', 'pin_source', 'map_pin',
  'pin_latitude', '10.31570', 'pin_longitude', '123.88540',
  'pin_accuracy_meters', null, 'pin_consent_version', 'residential-pin-v1'
));

reset role;
insert into public.cameras (
  id, slug, serial_number, name, description, status, daily_rate,
  security_deposit, published_at
) values (
  'f2210000-0000-4000-8000-000000000001', 'address-test-camera',
  'ADDRESS-TEST-001', 'Address Test Camera', 'Database address test.',
  'published', 1200, 5000, statement_timestamp()
);
insert into public.bookings (
  id, renter_id, camera_id, pickup_at, return_at, intended_use,
  expected_location
) values (
  'f2220000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000001',
  'f2210000-0000-4000-8000-000000000001',
  '2099-10-01 01:00+00', '2099-10-02 01:00+00',
  'Address snapshot test', 'Cebu City'
);
insert into private.booking_kyc_snapshots (
  booking_id, birth_date, address_line1, release_key, area_code
) select
  'f2220000-0000-4000-8000-000000000001', birth_date, address_line1,
  release_key, area_code
from private.renter_kyc_profiles
where user_id = 'f2200000-0000-4000-8000-000000000001';

do $$ begin
  if not exists (
    select 1 from private.booking_kyc_snapshots
    where booking_id = 'f2220000-0000-4000-8000-000000000001'
      and address_format_version = 2 and house_number = '12'
      and street_name = 'Mango Avenue' and building = 'Tower A'
      and address_details = 'Unit 4' and postal_code = '6000'
  ) then raise exception 'booking did not freeze the structured address'; end if;
  begin
    update private.booking_kyc_snapshots set postal_code = '6001'
    where booking_id = 'f2220000-0000-4000-8000-000000000001';
    raise exception 'structured booking KYC snapshot was mutable';
  exception when sqlstate '55000' then null;
  end;
end; $$;

select 'ok 1 - structured residential addresses and required pins are actor-owned, atomic, private, legacy-safe, and snapshotted';

rollback;
