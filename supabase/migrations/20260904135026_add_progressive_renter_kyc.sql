-- Progressive renter KYC: account creation remains email-only. A renter must
-- save the minimum contract/risk details before requesting a booking, while the
-- original government ID continues to be checked in person at pickup.
create table private.renter_kyc_profiles (
  user_id uuid primary key references public.profiles (user_id) on delete restrict,
  birth_date date not null,
  address_line1 text not null check (length(btrim(address_line1)) between 3 and 200),
  release_key text not null,
  area_code text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid not null references auth.users (id) on delete restrict,
  foreign key (release_key, area_code)
    references private.psgc_areas (release_key, code) on delete restrict
);

create trigger renter_kyc_profiles_set_updated_at
before update on private.renter_kyc_profiles
for each row execute function private.set_updated_at();

revoke all on table private.renter_kyc_profiles from public, anon, authenticated, service_role;

create table private.booking_kyc_snapshots (
  booking_id uuid primary key references public.bookings (id) on delete restrict,
  birth_date date not null,
  address_line1 text not null,
  release_key text not null,
  area_code text not null,
  foreign key (release_key, area_code)
    references private.psgc_areas (release_key, code) on delete restrict,
  created_at timestamptz not null default statement_timestamp()
);

revoke all on table private.booking_kyc_snapshots from public, anon, authenticated, service_role;

create function private.reject_booking_kyc_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'booking KYC snapshots are immutable' using errcode = '55000';
end;
$$;

create trigger booking_kyc_snapshots_immutable
before update or delete on private.booking_kyc_snapshots
for each row execute function private.reject_booking_kyc_snapshot_mutation();

revoke all on function private.reject_booking_kyc_snapshot_mutation()
from public, anon, authenticated, service_role;

create function private.get_my_kyc_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'birth_date', kyc.birth_date,
    'address_line1', btrim(kyc.address_line1),
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
  where kyc.user_id = private.current_user_id();
$$;

create function private.save_my_kyc_profile(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  profile public.profiles;
  birth_date date;
  address_line1 text := btrim(p_input ->> 'address_line1');
  selected_release_key text := p_input ->> 'release_key';
  selected_area_code text := p_input ->> 'area_code';
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end if;

  begin
    birth_date := (p_input ->> 'birth_date')::date;
  exception when others then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end;

  if birth_date is null
    or address_line1 is null
    or birth_date > current_date - interval '18 years'
    or birth_date < current_date - interval '120 years'
    or length(address_line1) not between 3 and 200
    or not exists (
      select 1
      from private.psgc_areas area
      join private.psgc_releases release
        on release.release_key = area.release_key and release.active
      where area.release_key = selected_release_key
        and area.code = selected_area_code
        and area.area_type = 'barangay'
        and area.active
    )
  then
    raise exception 'kyc_profile_invalid' using errcode = '22023';
  end if;

  profile := private.ensure_profile(
    p_input ->> 'legal_name',
    p_input ->> 'phone'
  );
  if profile.account_status <> 'active' then
    raise exception 'kyc_profile_suspended' using errcode = '42501';
  end if;

  insert into private.renter_kyc_profiles (
    user_id, birth_date, address_line1, release_key, area_code, updated_by
  ) values (
    caller, birth_date, address_line1, selected_release_key, selected_area_code, caller
  )
  on conflict (user_id) do update set
    birth_date = excluded.birth_date,
    address_line1 = excluded.address_line1,
    release_key = excluded.release_key,
    area_code = excluded.area_code,
    updated_by = excluded.updated_by;

  perform private.write_audit(
    gen_random_uuid(), 'save_renter_kyc_profile', 'profile', caller, 'success',
    'minimum renter KYC details',
    jsonb_build_object('psgc_release', selected_release_key, 'area_type', 'barangay')
  );
  return private.get_my_kyc_profile();
end;
$$;

create function api.get_my_kyc_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.get_my_kyc_profile(); $$;

create function api.save_my_kyc_profile(p_input jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$ select private.save_my_kyc_profile(p_input); $$;

revoke all on function private.get_my_kyc_profile() from public, anon, authenticated, service_role;
revoke all on function private.save_my_kyc_profile(jsonb) from public, anon, authenticated, service_role;
revoke all on function api.get_my_kyc_profile() from public, anon;
revoke all on function api.save_my_kyc_profile(jsonb) from public, anon;
grant execute on function api.get_my_kyc_profile() to authenticated;
grant execute on function api.save_my_kyc_profile(jsonb) to authenticated;

-- The service-role booking endpoint independently enforces KYC so bypassing the
-- page or Server Action cannot create an unverified-age booking request.
create or replace function api.request_booking_with_preference_idempotent(
  p_renter_id uuid,
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint,
  p_intended_use text,
  p_expected_location text,
  p_preferred_meetup_area text,
  p_operation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  booking_id uuid;
  pickup_at timestamptz;
  return_at timestamptz;
  profile_status public.account_status;
  normalized_area text := btrim(p_preferred_meetup_area);
  request_fingerprint text := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'camera_id', p_camera_id,
      'expected_location', p_expected_location,
      'handoff_time', p_handoff_time,
      'intended_use', p_intended_use,
      'pickup_date', p_pickup_date,
      'policy_version', p_policy_version,
      'preferred_meetup_area', normalized_area,
      'return_date', p_return_date
    )::text, 'UTF8'), 'sha256'), 'hex');
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'booking_request_unauthorized' using errcode = '42501';
  end if;
  if p_renter_id is null or p_camera_id is null or p_operation_id is null
    or p_pickup_date is null or p_return_date is null or p_handoff_time is null
    or length(btrim(coalesce(p_intended_use, ''))) not between 2 and 1000
    or length(btrim(coalesce(p_expected_location, ''))) not between 2 and 500
    or length(normalized_area) not between 2 and 160
  then
    raise exception 'booking_request_invalid' using errcode = '22023';
  end if;

  select profile.account_status into profile_status
  from public.profiles as profile
  where profile.user_id = p_renter_id
  for update;
  if profile_status is null then
    raise exception 'booking_profile_required' using errcode = '42501';
  end if;
  if profile_status <> 'active' then
    raise exception 'booking_profile_suspended' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from private.renter_kyc_profiles kyc
    join private.psgc_areas area
      on area.release_key = kyc.release_key and area.code = kyc.area_code
    join private.psgc_releases release
      on release.release_key = kyc.release_key and release.active
    where kyc.user_id = p_renter_id
      and kyc.birth_date <= current_date - interval '18 years'
      and area.area_type = 'barangay' and area.active
  ) then
    raise exception 'booking_kyc_required' using errcode = '42501';
  end if;

  booking_id := private.claim_booking_request_operation(
    p_renter_id, p_operation_id, request_fingerprint
  );
  if booking_id is not null then return booking_id; end if;
  if (
    select count(*) from public.bookings as booking
    where booking.renter_id = p_renter_id and booking.state = 'FOR_REVIEW'
  ) >= 10 then
    raise exception 'booking_request_limit_reached' using errcode = 'P0001';
  end if;

  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );
  if not exists (
    select 1 from public.cameras as camera
    where camera.id = p_camera_id and camera.status = 'published'
      and camera.archived_at is null
  ) then
    raise exception 'camera is not available for requests' using errcode = '22023';
  end if;

  insert into public.bookings (
    renter_id, camera_id, pickup_at, return_at, intended_use,
    expected_location, meetup_snapshot_required
  ) values (
    p_renter_id, p_camera_id, pickup_at, return_at, btrim(p_intended_use),
    btrim(p_expected_location), true
  ) returning id into booking_id;
  insert into public.booking_meetup_plans (
    booking_id, plan_kind, renter_city_label, area_label
  ) values (booking_id, 'preferred_area', normalized_area, normalized_area);
  insert into private.booking_kyc_snapshots (
    booking_id, birth_date, address_line1, release_key, area_code
  )
  select booking_id, kyc.birth_date, kyc.address_line1, kyc.release_key, kyc.area_code
  from private.renter_kyc_profiles kyc where kyc.user_id = p_renter_id;
  insert into public.booking_state_history (
    booking_id, from_state, to_state, actor_user_id, actor_type,
    reason_code, operation_id
  ) values (
    booking_id, null, 'FOR_REVIEW', p_renter_id, 'renter',
    'booking_requested', p_operation_id
  );
  perform private.write_audit(
    p_operation_id, 'request_booking', 'booking', booking_id, 'success',
    'rental request', jsonb_build_object(
      'meetup_snapshot', true, 'meetup_plan_kind', 'preferred_area'
    )
  );
  perform private.complete_booking_request_operation(
    p_renter_id, p_operation_id, booking_id
  );
  return booking_id;
end;
$$;

-- Freeze the renter's KYC details into new contract versions. Historical
-- contracts retain their original schema, while editable profile changes do
-- not rewrite an agreement that was already issued or signed.
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
begin
  select booking.meetup_snapshot_required
  into required
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
    select jsonb_build_object(
      'birth_date', kyc.birth_date,
      'address', jsonb_build_object(
        'line1', btrim(kyc.address_line1),
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
            from chain child
            join private.psgc_areas parent
              on parent.release_key = child.release_key
              and parent.code = child.parent_code
          )
          select jsonb_agg(
            jsonb_build_object('name', name, 'type', area_type)
            order by depth desc
          ) from chain
        )
      )
    ) into kyc_json
    from private.booking_kyc_snapshots kyc
    where kyc.booking_id = new.booking_id;
    if kyc_json is null then
      raise exception 'approval_kyc_snapshot_missing' using errcode = '23514';
    end if;

    new.snapshot := jsonb_set(
      new.snapshot,
      '{renter}',
      (new.snapshot -> 'renter') || kyc_json,
      true
    );
    new.snapshot_schema_version := greatest(new.snapshot_schema_version, 5);
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
    elsif plan.plan_kind = 'canonical_area' then
      meetup_json := meetup_json || jsonb_build_object(
        'kind', 'canonical_area', 'area_code', plan.area_code,
        'area_release', plan.area_release, 'area_label', plan.area_label,
        'venue_status', 'pending_owner_confirmation'
      );
    else
      meetup_json := meetup_json || jsonb_build_object(
        'kind', 'preferred_area', 'area_label', plan.area_label,
        'venue_status', 'pending_owner_confirmation'
      );
    end if;
    new.snapshot := new.snapshot || jsonb_build_object('meetup', meetup_json);
  end if;
  new.content_sha256 := extensions.digest(
    convert_to(new.snapshot::text, 'UTF8'), 'sha256'
  );
  return new;
end;
$$;

comment on table private.renter_kyc_profiles is
  'Actor-owned minimum renter KYC attributes; government ID evidence is never stored here.';
