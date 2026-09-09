-- Add versioned structured residential addresses and a purpose-separated,
-- renter-owned optional pin. The existing v1 RPC shape remains unchanged so
-- schema-first deployment cannot break the still-running application.

alter table private.renter_kyc_profiles
  drop constraint renter_kyc_profiles_address_line1_check;
alter table private.renter_kyc_profiles
  add constraint renter_kyc_profiles_address_line1_check
  check (length(btrim(address_line1)) between 3 and 500),
  add column address_format_version smallint not null default 1
    check (address_format_version in (1, 2)),
  add column house_number text check (
    house_number is null or length(btrim(house_number)) between 1 and 80
  ),
  add column street_name text check (
    street_name is null or length(btrim(street_name)) between 1 and 160
  ),
  add column building text check (
    building is null or length(btrim(building)) between 1 and 160
  ),
  add column address_details text check (
    address_details is null or length(btrim(address_details)) between 1 and 200
  ),
  add column postal_code text check (
    postal_code is null
    or (
      length(btrim(postal_code)) between 1 and 16
      and btrim(postal_code) !~ '[[:cntrl:]]'
    )
  ),
  add column address_revision uuid not null default gen_random_uuid(),
  add constraint renter_kyc_structured_address_check check (
    (address_format_version = 1 and house_number is null and street_name is null
      and building is null and address_details is null and postal_code is null)
    or
    (address_format_version = 2 and num_nonnulls(
      house_number, street_name, building, address_details
    ) > 0)
  ),
  add constraint renter_kyc_address_revision_unique unique (user_id, address_revision);

alter table private.booking_kyc_snapshots
  add column address_format_version smallint not null default 1
    check (address_format_version in (1, 2)),
  add column house_number text,
  add column street_name text,
  add column building text,
  add column address_details text,
  add column postal_code text;

create table private.renter_residential_pins (
  user_id uuid primary key references private.renter_kyc_profiles (user_id)
    on delete cascade,
  address_revision uuid not null,
  latitude numeric(8,5) not null check (latitude between 4 and 22),
  longitude numeric(8,5) not null check (longitude between 116 and 127),
  source text not null check (source in ('device_gps', 'map_pin')),
  accuracy_meters numeric(10,2) check (
    accuracy_meters is null or accuracy_meters between 1 and 50000
  ),
  consent_version text not null check (
    length(btrim(consent_version)) between 3 and 80
  ),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid not null references auth.users (id) on delete restrict,
  foreign key (user_id, address_revision)
    references private.renter_kyc_profiles (user_id, address_revision)
    on update cascade deferrable initially deferred
);

alter table private.renter_residential_pins enable row level security;
create trigger renter_residential_pins_set_updated_at
before update on private.renter_residential_pins
for each row execute function private.set_updated_at();
revoke all on table private.renter_residential_pins
from public, anon, authenticated, service_role;

create function private.get_my_kyc_profile_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'birth_date', kyc.birth_date,
    'address_line1', btrim(kyc.address_line1),
    'address_format_version', kyc.address_format_version,
    'house_number', kyc.house_number,
    'street_name', kyc.street_name,
    'building', kyc.building,
    'address_details', kyc.address_details,
    'postal_code', kyc.postal_code,
    'address_revision', kyc.address_revision,
    'residential_pin', case when pin.user_id is null then null else jsonb_build_object(
      'latitude', pin.latitude,
      'longitude', pin.longitude,
      'source', pin.source,
      'accuracy_meters', pin.accuracy_meters,
      'confirmed_at', pin.confirmed_at
    ) end,
    'release', kyc.release_key,
    'area_code', kyc.area_code,
    'area_name', btrim(area.name),
    'area_type', area.area_type,
    'current', release.active,
    'active', area.active,
    'path', (
      with recursive chain as (
        select current_area.*, 0 depth
        from private.psgc_areas current_area
        where current_area.release_key = area.release_key
          and current_area.code = area.code
        union all
        select parent.*, child.depth + 1
        from chain child
        join private.psgc_areas parent
          on parent.release_key = child.release_key
          and parent.code = child.parent_code
      )
      select jsonb_agg(
        jsonb_build_object('code', code, 'name', btrim(name), 'type', area_type)
        order by depth desc
      ) from chain
    )
  )
  from private.renter_kyc_profiles kyc
  join private.psgc_areas area
    on area.release_key = kyc.release_key and area.code = kyc.area_code
  join private.psgc_releases release on release.release_key = kyc.release_key
  left join private.renter_residential_pins pin
    on pin.user_id = kyc.user_id and pin.address_revision = kyc.address_revision
  where kyc.user_id = private.current_user_id();
$$;

create function private.save_my_kyc_profile_v2(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  saved_profile public.profiles;
  existing private.renter_kyc_profiles%rowtype;
  birth_date date;
  selected_release_key text := p_input ->> 'release_key';
  selected_area_code text := p_input ->> 'area_code';
  format_version smallint;
  legacy_line text := nullif(btrim(p_input ->> 'legacy_address_line1'), '');
  house text := nullif(btrim(p_input ->> 'house_number'), '');
  street text := nullif(btrim(p_input ->> 'street_name'), '');
  building_name text := nullif(btrim(p_input ->> 'building'), '');
  details text := nullif(btrim(p_input ->> 'address_details'), '');
  postal text := nullif(btrim(p_input ->> 'postal_code'), '');
  address_line text;
  next_revision uuid;
  expected_revision uuid;
  address_changed boolean;
  pin_operation text := p_input ->> 'pin_operation';
  pin_source text := nullif(p_input ->> 'pin_source', '');
  pin_latitude numeric;
  pin_longitude numeric;
  pin_accuracy numeric;
  pin_consent text := nullif(btrim(p_input ->> 'pin_consent_version'), '');
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_input) key
      where key <> all (array[
        'legal_name', 'phone', 'birth_date', 'legacy_address_line1',
        'house_number', 'street_name', 'building', 'address_details',
        'postal_code', 'release_key', 'area_code', 'pin_operation',
        'expected_address_revision',
        'pin_source', 'pin_latitude', 'pin_longitude', 'pin_accuracy_meters',
        'pin_consent_version'
      ])
    )
  then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end if;

  begin
    birth_date := (p_input ->> 'birth_date')::date;
    expected_revision := nullif(p_input ->> 'expected_address_revision', '')::uuid;
    if pin_operation = 'set' then
      pin_latitude := (p_input ->> 'pin_latitude')::numeric;
      pin_longitude := (p_input ->> 'pin_longitude')::numeric;
      pin_accuracy := nullif(p_input ->> 'pin_accuracy_meters', '')::numeric;
    end if;
  exception when others then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end;

  format_version := case when num_nonnulls(house, street, building_name, details) > 0
    then 2 else 1 end;
  address_line := case when format_version = 1 then legacy_line else
    concat_ws(', ', building_name, nullif(concat_ws(' ', house, street), ''), details)
  end;

  if birth_date is null
    or address_line is null
    or birth_date > current_date - interval '18 years'
    or birth_date < current_date - interval '120 years'
    or length(address_line) not between 3 and 500
    or (house is not null and length(house) > 80)
    or (street is not null and length(street) > 160)
    or (building_name is not null and length(building_name) > 160)
    or (details is not null and length(details) > 200)
    or (postal is not null and (
      length(postal) > 16 or postal ~ '[[:cntrl:]]'
    ))
    or (format_version = 1 and postal is not null)
    or pin_operation not in ('keep', 'set', 'remove')
    or not exists (
      select 1
      from private.psgc_areas area
      join private.psgc_releases release
        on release.release_key = area.release_key and release.active
      where area.release_key = selected_release_key
        and area.code = selected_area_code
        and area.area_type = 'barangay' and area.active
    )
    or (pin_operation = 'set' and (
      pin_latitude is null or pin_latitude not between 4 and 22
      or pin_longitude is null or pin_longitude not between 116 and 127
      or pin_source not in ('device_gps', 'map_pin')
      or (pin_source = 'map_pin' and pin_accuracy is not null)
      or (pin_accuracy is not null and pin_accuracy not between 1 and 50000)
      or pin_consent <> 'residential-pin-v1'
    ))
    or (pin_operation <> 'set' and num_nonnulls(
      nullif(p_input ->> 'pin_source', ''),
      nullif(p_input ->> 'pin_latitude', ''),
      nullif(p_input ->> 'pin_longitude', ''),
      nullif(p_input ->> 'pin_accuracy_meters', ''),
      nullif(p_input ->> 'pin_consent_version', '')
    ) > 0)
  then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end if;

  saved_profile := private.ensure_profile(p_input ->> 'legal_name', p_input ->> 'phone');
  if saved_profile.account_status <> 'active' then
    raise exception 'kyc_profile_suspended' using errcode = '42501';
  end if;

  select * into existing from private.renter_kyc_profiles
  where user_id = caller for update;
  if (existing.user_id is null and expected_revision is not null)
    or (existing.user_id is not null and expected_revision is distinct from existing.address_revision)
  then
    raise exception 'kyc_address_revision_conflict' using errcode = '40001';
  end if;
  address_changed := existing.user_id is null
    or existing.address_format_version <> format_version
    or existing.address_line1 is distinct from address_line
    or existing.release_key is distinct from selected_release_key
    or existing.area_code is distinct from selected_area_code
    or existing.house_number is distinct from house
    or existing.street_name is distinct from street
    or existing.building is distinct from building_name
    or existing.address_details is distinct from details
    or existing.postal_code is distinct from postal;
  next_revision := case when address_changed then gen_random_uuid()
    else existing.address_revision end;

  if address_changed and pin_operation = 'keep' and exists (
    select 1 from private.renter_residential_pins where user_id = caller
  ) then
    raise exception 'kyc_pin_reconfirmation_required' using errcode = '40001';
  end if;

  insert into private.renter_kyc_profiles (
    user_id, birth_date, address_line1, address_format_version, house_number,
    street_name, building, address_details, postal_code, address_revision,
    release_key, area_code, updated_by
  ) values (
    caller, birth_date, address_line, format_version, house, street,
    building_name, details, postal, next_revision, selected_release_key,
    selected_area_code, caller
  )
  on conflict (user_id) do update set
    birth_date = excluded.birth_date,
    address_line1 = excluded.address_line1,
    address_format_version = excluded.address_format_version,
    house_number = excluded.house_number,
    street_name = excluded.street_name,
    building = excluded.building,
    address_details = excluded.address_details,
    postal_code = excluded.postal_code,
    address_revision = excluded.address_revision,
    release_key = excluded.release_key,
    area_code = excluded.area_code,
    updated_by = excluded.updated_by;

  if pin_operation = 'remove' then
    delete from private.renter_residential_pins where user_id = caller;
  elsif pin_operation = 'set' then
    insert into private.renter_residential_pins (
      user_id, address_revision, latitude, longitude, source, accuracy_meters,
      consent_version, confirmed_at, updated_by
    ) values (
      caller, next_revision, pin_latitude, pin_longitude, pin_source,
      pin_accuracy, pin_consent, statement_timestamp(), caller
    )
    on conflict (user_id) do update set
      address_revision = excluded.address_revision,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      source = excluded.source,
      accuracy_meters = excluded.accuracy_meters,
      consent_version = excluded.consent_version,
      confirmed_at = excluded.confirmed_at,
      updated_by = excluded.updated_by;
  end if;

  perform private.write_audit(
    gen_random_uuid(), 'save_renter_kyc_profile', 'profile', caller, 'success',
    'minimum renter KYC details',
    jsonb_build_object(
      'psgc_release', selected_release_key,
      'area_type', 'barangay',
      'address_format_version', format_version,
      'residential_pin_operation', pin_operation
    )
  );
  return private.get_my_kyc_profile_v2();
end;
$$;

-- Preserve old clients. If an old client changes the legacy address, structured
-- fields and its pin are cleared; unrelated saves keep both.
create or replace function private.save_my_kyc_profile(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  saved_profile public.profiles;
  existing private.renter_kyc_profiles%rowtype;
  birth_date date;
  address_line text := btrim(p_input ->> 'address_line1');
  selected_release_key text := p_input ->> 'release_key';
  selected_area_code text := p_input ->> 'area_code';
  address_changed boolean;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end if;
  begin birth_date := (p_input ->> 'birth_date')::date;
  exception when others then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end;
  if birth_date is null or address_line is null
    or birth_date > current_date - interval '18 years'
    or birth_date < current_date - interval '120 years'
    or length(address_line) not between 3 and 500
    or not exists (
      select 1 from private.psgc_areas area
      join private.psgc_releases release
        on release.release_key = area.release_key and release.active
      where area.release_key = selected_release_key
        and area.code = selected_area_code
        and area.area_type = 'barangay' and area.active
    )
  then raise exception 'kyc_profile_invalid' using errcode = '22023'; end if;

  saved_profile := private.ensure_profile(p_input ->> 'legal_name', p_input ->> 'phone');
  if saved_profile.account_status <> 'active' then
    raise exception 'kyc_profile_suspended' using errcode = '42501';
  end if;
  select * into existing from private.renter_kyc_profiles
  where user_id = caller for update;
  address_changed := existing.user_id is null
    or existing.address_line1 is distinct from address_line
    or existing.release_key is distinct from selected_release_key
    or existing.area_code is distinct from selected_area_code;

  insert into private.renter_kyc_profiles (
    user_id, birth_date, address_line1, address_format_version,
    address_revision, release_key, area_code, updated_by
  ) values (
    caller, birth_date, address_line, 1, gen_random_uuid(),
    selected_release_key, selected_area_code, caller
  ) on conflict (user_id) do update set
    birth_date = excluded.birth_date,
    address_line1 = excluded.address_line1,
    address_format_version = case when address_changed then 1
      else private.renter_kyc_profiles.address_format_version end,
    house_number = case when address_changed then null
      else private.renter_kyc_profiles.house_number end,
    street_name = case when address_changed then null
      else private.renter_kyc_profiles.street_name end,
    building = case when address_changed then null
      else private.renter_kyc_profiles.building end,
    address_details = case when address_changed then null
      else private.renter_kyc_profiles.address_details end,
    postal_code = case when address_changed then null
      else private.renter_kyc_profiles.postal_code end,
    address_revision = case when address_changed then excluded.address_revision
      else private.renter_kyc_profiles.address_revision end,
    release_key = excluded.release_key,
    area_code = excluded.area_code,
    updated_by = excluded.updated_by;
  if address_changed then
    delete from private.renter_residential_pins where user_id = caller;
  end if;
  perform private.write_audit(
    gen_random_uuid(), 'save_renter_kyc_profile', 'profile', caller, 'success',
    'minimum renter KYC details',
    jsonb_build_object('psgc_release', selected_release_key, 'area_type', 'barangay')
  );
  return private.get_my_kyc_profile();
end;
$$;

create function api.get_my_kyc_profile_v2()
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.get_my_kyc_profile_v2(); $$;
create function api.save_my_kyc_profile_v2(p_input jsonb)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.save_my_kyc_profile_v2(p_input); $$;

revoke all on function private.get_my_kyc_profile_v2()
from public, anon, authenticated, service_role;
revoke all on function private.save_my_kyc_profile_v2(jsonb)
from public, anon, authenticated, service_role;
revoke all on function api.get_my_kyc_profile_v2() from public, anon;
revoke all on function api.save_my_kyc_profile_v2(jsonb) from public, anon;
grant execute on function api.get_my_kyc_profile_v2() to authenticated;
grant execute on function api.save_my_kyc_profile_v2(jsonb) to authenticated;

-- Existing booking creation inserts the legacy columns. Populate structured
-- fields before the immutable-snapshot trigger can reject later mutation.
create function private.populate_booking_kyc_structured_address()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select kyc.address_format_version, kyc.house_number, kyc.street_name,
    kyc.building, kyc.address_details, kyc.postal_code
  into new.address_format_version, new.house_number, new.street_name,
    new.building, new.address_details, new.postal_code
  from public.bookings booking
  join private.renter_kyc_profiles kyc on kyc.user_id = booking.renter_id
  where booking.id = new.booking_id;
  return new;
end;
$$;
create trigger booking_kyc_structured_address
before insert on private.booking_kyc_snapshots
for each row execute function private.populate_booking_kyc_structured_address();
revoke all on function private.populate_booking_kyc_structured_address()
from public, anon, authenticated, service_role;

create or replace function private.attach_meetup_contract_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required boolean;
  kyc_required boolean;
  plan public.booking_meetup_plans%rowtype;
  meetup_json jsonb;
  kyc_json jsonb;
  address_json jsonb;
  snapshot_changed boolean := false;
begin
  select booking.meetup_snapshot_required into required
  from public.bookings as booking where booking.id = new.booking_id;
  kyc_required := exists (
    select 1 from private.booking_kyc_snapshots stored_kyc
    where stored_kyc.booking_id = new.booking_id
  );
  select * into plan from public.booking_meetup_plans as stored
  where stored.booking_id = new.booking_id;
  if required and not found then
    raise exception 'approval_meetup_snapshot_missing' using errcode = '23514';
  end if;

  if kyc_required then
    select jsonb_strip_nulls(jsonb_build_object(
      'line1', btrim(kyc.address_line1),
      'format_version', kyc.address_format_version,
      'house_number', kyc.house_number,
      'street_name', kyc.street_name,
      'building', kyc.building,
      'address_details', kyc.address_details,
      'postal_code', kyc.postal_code,
      'area_code', kyc.area_code,
      'area_release', kyc.release_key,
      'path', (
        with recursive chain as (
          select current_area.*, 0 depth
          from private.psgc_areas current_area
          where current_area.release_key = kyc.release_key
            and current_area.code = kyc.area_code
          union all
          select parent.*, child.depth + 1
          from chain child join private.psgc_areas parent
            on parent.release_key = child.release_key
            and parent.code = child.parent_code
        )
        select jsonb_agg(
          jsonb_build_object('name', name, 'type', area_type) order by depth desc
        ) from chain
      )
    )) into address_json
    from private.booking_kyc_snapshots kyc where kyc.booking_id = new.booking_id;
    if address_json is null then
      raise exception 'approval_kyc_snapshot_missing' using errcode = '23514';
    end if;
    select jsonb_build_object(
      'birth_date', kyc.birth_date, 'address', address_json
    ) into kyc_json
    from private.booking_kyc_snapshots kyc where kyc.booking_id = new.booking_id;
    new.snapshot := jsonb_set(
      new.snapshot, '{renter}', (new.snapshot -> 'renter') || kyc_json, true
    );
    new.snapshot_schema_version := greatest(new.snapshot_schema_version, 6);
    snapshot_changed := true;
  end if;

  if plan.booking_id is not null then
    meetup_json := jsonb_build_object('renter_city', plan.renter_city_label);
    if plan.plan_kind = 'public_venue' then
      meetup_json := meetup_json || jsonb_build_object(
        'venue_name', plan.venue_name, 'venue_address', plan.venue_address,
        'venue_city', plan.venue_city, 'venue_latitude', plan.venue_latitude,
        'venue_longitude', plan.venue_longitude, 'provider', plan.provider,
        'provider_config_version', plan.provider_config_version,
        'attribution', plan.attribution
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 2);
    elsif plan.plan_kind = 'canonical_area' then
      meetup_json := meetup_json || jsonb_build_object(
        'kind', 'canonical_area', 'area_code', plan.area_code,
        'area_release', plan.area_release, 'area_label', plan.area_label,
        'venue_status', 'pending_owner_confirmation'
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 3);
    else
      meetup_json := meetup_json || jsonb_build_object(
        'kind', 'preferred_area', 'area_label', plan.area_label,
        'venue_status', 'pending_owner_confirmation'
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 4);
    end if;
    new.snapshot := new.snapshot || jsonb_build_object('meetup', meetup_json);
    snapshot_changed := true;
  end if;
  if snapshot_changed then
    new.content_sha256 := extensions.digest(
      convert_to(new.snapshot::text, 'UTF8'), 'sha256'
    );
  end if;
  return new;
end;
$$;

comment on table private.renter_residential_pins is
  'Optional renter-confirmed residential coordinates, private from meetup and contract projections; hard-deleted on removal.';
