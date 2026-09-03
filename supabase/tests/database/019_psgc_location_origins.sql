begin;

select '1..1';

do $$
begin
  if (select count(*) from private.psgc_areas where release_key = '2026-q2' and area_type = 'region') <> 18
    or (select count(*) from private.psgc_areas where release_key = '2026-q2' and area_type = 'province') <> 82
    or (select count(*) from private.psgc_areas where release_key = '2026-q2' and area_type in ('city', 'municipality')) <> 1642
    or (select count(*) from private.psgc_areas where release_key = '2026-q2' and area_type = 'submunicipality') <> 14
    or (select count(*) from private.psgc_areas where release_key = '2026-q2' and area_type = 'barangay') <> 42010
  then
    raise exception 'official PSGC release counts are incomplete';
  end if;

  if exists (
    select 1 from private.psgc_areas city
    join private.psgc_areas parent on parent.release_key = city.release_key and parent.code = city.parent_code
    where city.release_key = '2026-q2' and city.area_type = 'city'
      and city.city_class in ('HUC', 'ICC') and parent.area_type <> 'region'
  ) then
    raise exception 'independent city received an invented province parent';
  end if;
end;
$$;

insert into auth.users (id) values
  ('f1900000-0000-4000-8000-000000000001'),
  ('f1900000-0000-4000-8000-000000000002'),
  ('f1900000-0000-4000-8000-000000000003');
insert into private.admin_accounts (user_id) values ('f1900000-0000-4000-8000-000000000001');
insert into public.profiles (user_id, legal_name, phone) values
  ('f1900000-0000-4000-8000-000000000001', 'PSGC Admin', '+639190000001'),
  ('f1900000-0000-4000-8000-000000000002', 'PSGC Renter', '+639190000002'),
  ('f1900000-0000-4000-8000-000000000003', 'Other Renter', '+639190000003');
insert into public.cameras (id, slug, serial_number, name, description, status, daily_rate, security_deposit, published_at)
values ('f1910000-0000-4000-8000-000000000001', 'psgc-camera', 'PSGC-PRIVATE-001', 'PSGC Camera', 'PSGC fixture', 'published', 1000, 4000, statement_timestamp());

set local role authenticated;
set local "request.jwt.claim.sub" = 'f1900000-0000-4000-8000-000000000001';

do $$
declare
  roots jsonb;
  cebu_children jsonb;
  version bigint;
begin
  roots := api.list_psgc_area_choices(null);
  if jsonb_array_length(roots -> 'choices') <> 18 then
    raise exception 'active region choices are incomplete';
  end if;
  cebu_children := api.list_psgc_area_choices('0700000000');
  if not exists (
    select 1 from jsonb_array_elements(cebu_children -> 'choices') item
    where item ->> 'code' = '0730600000' and item ->> 'city_class' = 'HUC'
  ) then
    raise exception 'Central Visayas did not expose its independent city child';
  end if;

  version := api.replace_camera_handoff_policy_v3(jsonb_build_object(
    'camera_id', 'f1910000-0000-4000-8000-000000000001',
    'expected_version', 0,
    'release_key', '2026-q2',
    'area_code', '0730600041',
    'precision', 'precise',
    'source', 'device_gps',
    'latitude', 10.33300,
    'longitude', 123.89700,
    'provider_reference', null,
    'accuracy_meters', 25,
    'consent_version', 'camera-origin-consent-v1',
    'provenance_version', 'camera-handoff-origin-v1',
    'captured_at', statement_timestamp(),
    'allowed_weekdays', jsonb_build_array(1, 3, 5),
    'approved_times', jsonb_build_array('09:00', '17:00'),
    'enabled', true
  ));
  if version <> 1 then raise exception 'canonical camera policy version mismatch'; end if;

  if api.get_camera_handoff_policy_admin_v2('f1910000-0000-4000-8000-000000000001') #>> '{canonical_anchor,area_code}' <> '0730600041' then
    raise exception 'canonical camera anchor did not round trip';
  end if;

  version := api.replace_camera_handoff_policy(
    'f1910000-0000-4000-8000-000000000001', 1, 'Lahug',
    'canonical:0730600041', 'PH', 10.33300, 123.89700,
    array[2, 4]::smallint[], array['10:00']::time[], true
  );
  if version <> 2
    or api.get_camera_handoff_policy_admin_v2('f1910000-0000-4000-8000-000000000001') #>> '{canonical_anchor,precision}' <> 'precise'
  then raise exception 'schedule-only save changed the canonical private origin'; end if;

  begin
    perform api.replace_camera_handoff_policy(
      'f1910000-0000-4000-8000-000000000001', 2, 'Mandaue City',
      'provider:mandaue', 'PH', 10.32360, 123.92220,
      array[2, 4]::smallint[], array['10:00']::time[], true
    );
    raise exception 'legacy replacement diverged from canonical camera metadata';
  exception when sqlstate '22023' then null;
  end;

  if api.get_camera_handoff_policy_admin_v2('f1910000-0000-4000-8000-000000000001') ->> 'city_label' <> 'Lahug'
    or api.get_camera_handoff_policy_admin_v2('f1910000-0000-4000-8000-000000000001') #>> '{canonical_anchor,area_code}' <> '0730600041'
  then raise exception 'rejected legacy replacement changed canonical camera state'; end if;

  begin
    perform api.replace_camera_handoff_policy_v2(
      'f1910000-0000-4000-8000-000000000001', 0, '2026-q2', '0730600041',
      'barangay_centroid', 'provider_centroid', 10.33300, 123.89700,
      'provider:stale-write', null, null, 'camera-handoff-origin-v1',
      statement_timestamp(), array[2]::smallint[], array['10:00']::time[], true
    );
    raise exception 'stale canonical camera write unexpectedly committed';
  exception when sqlstate '40001' then null;
  end;

  if api.get_camera_handoff_policy_admin_v2('f1910000-0000-4000-8000-000000000001') #>> '{canonical_anchor,precision}' <> 'precise' then
    raise exception 'stale canonical camera write partially changed the anchor';
  end if;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f1900000-0000-4000-8000-000000000002';

do $$
declare
  anchor_id uuid;
  origin jsonb;
begin
  anchor_id := api.replace_my_meetup_origin_v2(jsonb_build_object(
    'release_key', '2026-q2',
    'area_code', '0730600041',
    'precision', 'barangay_centroid',
    'source', 'provider_centroid',
    'latitude', 10.33300,
    'longitude', 123.89700,
    'provider_reference', 'provider:lahug-centroid',
    'accuracy_meters', null,
    'consent_version', null,
    'provenance_version', 'renter-default-origin-v1',
    'captured_at', statement_timestamp()
  ));
  if anchor_id is null then raise exception 'renter origin id missing'; end if;
  origin := api.get_my_meetup_origin();
  if origin ->> 'area_code' <> '0730600041'
    or origin ->> 'precision' <> 'barangay_centroid'
    or origin ?| array['latitude', 'longitude', 'provider_reference', 'accuracy_meters', 'consent_version']
  then raise exception 'ordinary renter origin projection widened'; end if;

  begin
    perform api.replace_my_meetup_origin(
      '2026-q2', '0730600041', 'precise', 'provider_centroid',
      10.33300, 123.89700, 'provider:bad', null, null,
      'renter-default-origin-v1', statement_timestamp()
    );
    raise exception 'inconsistent precision unexpectedly committed';
  exception when sqlstate '22023' then null;
  end;

  if api.get_my_meetup_origin() ->> 'precision' <> 'barangay_centroid' then
    raise exception 'invalid replacement partially changed the saved origin';
  end if;

  if not api.remove_my_meetup_origin() then
    raise exception 'renter origin removal did not report the retired anchor';
  end if;
  if api.get_my_meetup_origin() is not null then
    raise exception 'renter origin removal left an active anchor';
  end if;
  anchor_id := api.replace_my_meetup_origin(
    '2026-q2', '0730600041', 'barangay_centroid', 'provider_centroid',
    10.33300, 123.89700, 'provider:lahug-centroid', null, null,
    'renter-default-origin-v1', statement_timestamp()
  );
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'f1900000-0000-4000-8000-000000000003';
do $$
begin
  if api.get_my_meetup_origin() is not null then
    raise exception 'another renter read the saved origin';
  end if;
  begin
    perform 1 from private.location_anchors;
    raise exception 'authenticated role read private anchors directly';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform api.replace_camera_handoff_policy_v2(
      'f1910000-0000-4000-8000-000000000001', 1, '2026-q2', '0730600041',
      'barangay_centroid', 'provider_centroid', 10.33300, 123.89700,
      'provider:unauthorized', null, null, 'camera-handoff-origin-v1',
      statement_timestamp(), array[2]::smallint[], array['10:00']::time[], true
    );
    raise exception 'renter unexpectedly changed a camera origin';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
declare projection jsonb;
begin
  select to_jsonb(policy) into projection from public.public_camera_handoff_policies policy
  where policy.camera_id = 'f1910000-0000-4000-8000-000000000001';
  if projection ?| array['latitude', 'longitude', 'provider_reference', 'accuracy_meters', 'consent_version', 'provenance_version']
    or projection ->> 'approximation_level' <> 'precise'
  then raise exception 'public camera origin projection leaked private fields'; end if;
  begin
    perform api.list_psgc_area_choices(null);
    raise exception 'anonymous PSGC API unexpectedly executed';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

reset role;

insert into private.psgc_releases (
  release_key, source_title, source_url, source_sha256, effective_on,
  expected_region_count, expected_province_count, expected_locality_count,
  expected_submunicipality_count, expected_barangay_count
) values (
  '2026-q1', 'Historical PSGC test release', 'https://psa.gov.ph/classification/psgc',
  repeat('0', 64), '2026-03-31', 1, 1, 1, 0, 1
);
insert into private.psgc_areas (release_key, code, name, area_type, parent_code, city_class, active, valid_from, valid_until) values
  ('2026-q1', '0700000000', 'Region VII', 'region', null, null, true, '2026-03-31', null),
  ('2026-q1', '0702200000', 'Cebu', 'province', '0700000000', null, true, '2026-03-31', null),
  ('2026-q1', '0702201000', 'Historical Municipality', 'municipality', '0702200000', null, false, '2026-03-31', '2026-06-29'),
  ('2026-q1', '0702201001', 'Historical Barangay', 'barangay', '0702201000', null, false, '2026-03-31', '2026-06-29');
insert into private.psgc_supersessions (from_release_key, from_code, to_release_key, to_code, reason)
values ('2026-q1', '0702201001', '2026-q2', '0730600041', 'test retirement mapping');

set local role authenticated;
set local "request.jwt.claim.sub" = 'f1900000-0000-4000-8000-000000000002';
do $$
begin
  begin
    perform api.replace_my_meetup_origin(
      '2026-q1', '0702201001', 'barangay_centroid', 'provider_centroid',
      10.33300, 123.89700, 'provider:historical', null, null,
      'renter-default-origin-v1', statement_timestamp()
    );
    raise exception 'inactive historical area unexpectedly replaced the origin';
  exception when sqlstate '22023' then null;
  end;
  if api.get_my_meetup_origin() ->> 'area_code' <> '0730600041' then
    raise exception 'historical-area rejection changed the active renter origin';
  end if;
end;
$$;

reset role;

set local role service_role;
do $$
begin
  begin
    perform private.activate_psgc_release('2026-q1');
    raise exception 'incomplete refresh unexpectedly activated';
  exception when sqlstate '23514' then null;
  end;
end;
$$;

reset role;
do $$
begin
  if not (select active from private.psgc_releases where release_key = '2026-q2')
    or (select active from private.psgc_releases where release_key = '2026-q1')
  then raise exception 'failed refresh changed the authoritative release'; end if;
end;
$$;

do $$
begin
  if exists (select 1 from private.location_anchors where removed_at is not null) then
    raise exception 'retired location anchor retained exact private coordinates';
  end if;
end;
$$;

update private.psgc_releases set active = false where release_key = '2026-q2';

set local role authenticated;
set local "request.jwt.claim.sub" = 'f1900000-0000-4000-8000-000000000001';
do $$
begin
  if api.get_camera_handoff_policy_admin_v2(
    'f1910000-0000-4000-8000-000000000001'
  ) #>> '{canonical_anchor,current}' <> 'false' then
    raise exception 'stale canonical camera origin was not surfaced for review';
  end if;
end;
$$;

reset role;
set local role service_role;
do $$
begin
  begin
    perform api.get_meetup_recommendation_context(
      'f1910000-0000-4000-8000-000000000001',
      '2099-08-25', '2099-08-27', '10:00', 2
    );
    raise exception 'stale canonical camera origin remained route-capable';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;
update private.psgc_releases set active = true where release_key = '2026-q2';

select 'ok 1 - PSGC hierarchy, private anchors, actor boundaries, atomic writes, legacy-safe projection, and failed refresh recovery';

rollback;
