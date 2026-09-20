begin;

select '1..1';

insert into auth.users (id) values
  ('f2600000-0000-4000-8000-000000000001');
insert into public.profiles (user_id, legal_name, phone) values
  ('f2600000-0000-4000-8000-000000000001', 'Complete Address Renter', '+639260000001');

set local role authenticated;
set local "request.jwt.claim.sub" = 'f2600000-0000-4000-8000-000000000001';

do $$
declare
  saved jsonb;
begin
  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Complete Address Renter', 'phone', '+639260000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', '12', 'street_name', 'Mango Avenue',
      'building', null, 'address_details', null, 'postal_code', '6000',
      'expected_address_revision', null, 'release_key', '2026-q2',
      'area_code', '0730600041', 'pin_operation', 'keep',
      'pin_source', null, 'pin_latitude', null, 'pin_longitude', null,
      'pin_accuracy_meters', null, 'pin_consent_version', null
    ));
    set constraints renter_address_requires_residential_pin immediate;
    raise exception 'named-street address without a pin unexpectedly saved';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Complete Address Renter', 'phone', '+639260000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', null, 'street_name', 'Mango Avenue',
      'building', null, 'address_details', null, 'postal_code', '6000',
      'expected_address_revision', null, 'release_key', '2026-q2',
      'area_code', '0730600041', 'pin_operation', 'keep',
      'pin_source', null, 'pin_latitude', null, 'pin_longitude', null,
      'pin_accuracy_meters', null, 'pin_consent_version', null
    ));
    raise exception 'named street without premises unexpectedly saved';
  exception when check_violation then null;
  end;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Complete Address Renter', 'phone', '+639260000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', '12', 'street_name', 'Mango Avenue',
      'building', null, 'address_details', null, 'postal_code', '600',
      'expected_address_revision', null, 'release_key', '2026-q2',
      'area_code', '0730600041', 'pin_operation', 'keep',
      'pin_source', null, 'pin_latitude', null, 'pin_longitude', null,
      'pin_accuracy_meters', null, 'pin_consent_version', null
    ));
    raise exception 'non-four-digit postal code unexpectedly saved';
  exception when check_violation then null;
  end;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Complete Address Renter', 'phone', '+639260000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', null, 'street_name', null, 'building', null,
      'address_details', 'Sitio Riverside, near the barangay hall',
      'postal_code', '6000', 'expected_address_revision', null,
      'release_key', '2026-q2', 'area_code', '0730600041',
      'pin_operation', 'keep', 'pin_source', null, 'pin_latitude', null,
      'pin_longitude', null, 'pin_accuracy_meters', null,
      'pin_consent_version', null
    ));
    set constraints renter_address_requires_residential_pin immediate;
    raise exception 'unnamed-road address without a pin unexpectedly saved';
  exception when sqlstate '22023' then null;
  end;

  saved := api.save_my_kyc_profile_v2(jsonb_build_object(
    'legal_name', 'Complete Address Renter', 'phone', '+639260000001',
    'birth_date', '1990-03-15', 'legacy_address_line1', null,
    'house_number', null, 'street_name', null, 'building', null,
    'address_details', 'Sitio Riverside, near the barangay hall',
    'postal_code', '6000', 'expected_address_revision', null,
    'release_key', '2026-q2', 'area_code', '0730600041',
    'pin_operation', 'set', 'pin_source', 'map_pin',
    'pin_latitude', '10.31570', 'pin_longitude', '123.88540',
    'pin_accuracy_meters', null,
    'pin_consent_version', 'residential-pin-v1'
  ));
  set constraints renter_address_requires_residential_pin immediate;
  set constraints renter_address_requires_residential_pin deferred;

  begin
    perform api.save_my_kyc_profile_v2(jsonb_build_object(
      'legal_name', 'Complete Address Renter', 'phone', '+639260000001',
      'birth_date', '1990-03-15', 'legacy_address_line1', null,
      'house_number', null, 'street_name', null, 'building', null,
      'address_details', 'Sitio Riverside, near the barangay hall',
      'postal_code', '6000',
      'expected_address_revision', saved ->> 'address_revision',
      'release_key', '2026-q2', 'area_code', '0730600041',
      'pin_operation', 'remove', 'pin_source', null, 'pin_latitude', null,
      'pin_longitude', null, 'pin_accuracy_meters', null,
      'pin_consent_version', null
    ));
    set constraints renter_pin_preserves_required_address immediate;
    raise exception 'required residential pin was unexpectedly removed';
  exception when sqlstate '22023' then null;
  end;

  if api.get_my_kyc_profile_v2() #>> '{residential_pin,source}' <> 'map_pin'
  then raise exception 'rejected pin removal was not atomic'; end if;
end;
$$;

select 'ok 1 - complete written addresses and required private pins are enforced at the database boundary';

rollback;
