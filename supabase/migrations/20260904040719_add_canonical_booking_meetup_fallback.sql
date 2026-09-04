-- Preserve the existing immutable public-venue snapshot while allowing a
-- provider-independent, current PSGC barangay to carry a review request.
alter table public.booking_meetup_plans
  add column plan_kind text not null default 'public_venue',
  add column area_code text,
  add column area_release text,
  add column area_label text,
  alter column venue_name drop not null,
  alter column venue_address drop not null,
  alter column venue_city drop not null,
  alter column venue_latitude drop not null,
  alter column venue_longitude drop not null,
  alter column provider drop not null,
  alter column provider_config_version drop not null,
  alter column attribution drop not null;

alter table public.booking_meetup_plans
  drop constraint booking_meetup_plans_renter_city_label_check,
  add constraint booking_meetup_plans_renter_city_label_check
    check (length(btrim(renter_city_label)) between 1 and 160),
  add constraint booking_meetup_plans_variant_check check (
    (
      plan_kind = 'public_venue'
      and area_code is null
      and area_release is null
      and area_label is null
      and venue_name is not null
      and venue_address is not null
      and venue_city is not null
      and venue_latitude is not null
      and venue_longitude is not null
      and provider = 'geoapify'
      and provider_config_version is not null
      and attribution = '© OpenStreetMap contributors · Powered by Geoapify'
    )
    or
    (
      plan_kind = 'canonical_area'
      and area_code ~ '^[0-9]{10}$'
      and area_release ~ '^[0-9]{4}-q[1-4]$'
      and length(btrim(area_label)) between 1 and 160
      and venue_name is null
      and venue_address is null
      and venue_city is null
      and venue_latitude is null
      and venue_longitude is null
      and provider is null
      and provider_config_version is null
      and attribution is null
    )
  );

create function private.request_booking_schedule_with_meetup_v2(
  p_renter_id uuid,
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint,
  p_intended_use text,
  p_expected_location text,
  p_meetup_plan jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pickup_at timestamptz;
  return_at timestamptz;
  booking_id uuid;
  operation_id uuid := gen_random_uuid();
  plan_kind text := p_meetup_plan ->> 'kind';
  area_name text;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'meetup_request_unauthorized' using errcode = '42501';
  end if;
  if p_renter_id is null
    or p_camera_id is null
    or p_pickup_date is null
    or p_return_date is null
    or p_handoff_time is null
    or length(btrim(coalesce(p_intended_use, ''))) not between 2 and 1000
    or length(btrim(coalesce(p_expected_location, ''))) not between 2 and 500
    or p_meetup_plan is null
    or jsonb_typeof(p_meetup_plan) <> 'object'
    or plan_kind not in ('public_venue', 'canonical_area')
  then
    raise exception 'meetup_request_invalid' using errcode = '22023';
  end if;

  if plan_kind = 'public_venue' then
    if p_meetup_plan <> jsonb_build_object(
      'kind', 'public_venue',
      'provider', 'geoapify',
      'provider_config_version', p_meetup_plan ->> 'provider_config_version',
      'renter_city_label', p_meetup_plan ->> 'renter_city_label',
      'venue_address', p_meetup_plan ->> 'venue_address',
      'venue_city', p_meetup_plan ->> 'venue_city',
      'venue_latitude', p_meetup_plan -> 'venue_latitude',
      'venue_longitude', p_meetup_plan -> 'venue_longitude',
      'venue_name', p_meetup_plan ->> 'venue_name'
    )
      or length(btrim(coalesce(p_meetup_plan ->> 'renter_city_label', ''))) not between 2 and 120
      or length(btrim(coalesce(p_meetup_plan ->> 'venue_name', ''))) not between 2 and 200
      or length(btrim(coalesce(p_meetup_plan ->> 'venue_address', ''))) not between 2 and 300
      or length(btrim(coalesce(p_meetup_plan ->> 'venue_city', ''))) not between 2 and 120
      or length(btrim(coalesce(p_meetup_plan ->> 'provider_config_version', ''))) not between 1 and 64
      or jsonb_typeof(p_meetup_plan -> 'venue_latitude') <> 'number'
      or jsonb_typeof(p_meetup_plan -> 'venue_longitude') <> 'number'
      or (p_meetup_plan ->> 'venue_latitude')::numeric not between -90 and 90
      or (p_meetup_plan ->> 'venue_longitude')::numeric not between -180 and 180
    then
      raise exception 'meetup_request_invalid' using errcode = '22023';
    end if;
  else
    if p_meetup_plan <> jsonb_build_object(
      'area_code', p_meetup_plan ->> 'area_code',
      'area_label', p_meetup_plan ->> 'area_label',
      'area_release', p_meetup_plan ->> 'area_release',
      'kind', 'canonical_area',
      'renter_city_label', p_meetup_plan ->> 'renter_city_label'
    )
      or coalesce(p_meetup_plan ->> 'area_code', '') !~ '^[0-9]{10}$'
      or coalesce(p_meetup_plan ->> 'area_release', '') !~ '^[0-9]{4}-q[1-4]$'
      or length(btrim(coalesce(p_meetup_plan ->> 'area_label', ''))) not between 1 and 160
      or p_meetup_plan ->> 'renter_city_label' is distinct from p_meetup_plan ->> 'area_label'
    then
      raise exception 'meetup_request_invalid' using errcode = '22023';
    end if;

    select btrim(area.name) into area_name
    from private.psgc_areas as area
    join private.psgc_releases as release
      on release.release_key = area.release_key
    where area.release_key = p_meetup_plan ->> 'area_release'
      and area.code = p_meetup_plan ->> 'area_code'
      and area.area_type = 'barangay'
      and area.active
      and release.active;

    if area_name is null
      or area_name is distinct from btrim(p_meetup_plan ->> 'area_label')
    then
      raise exception 'meetup_request_invalid' using errcode = '22023';
    end if;
  end if;

  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );
  perform private.assert_active_booking_profile(p_renter_id);

  if not exists (
    select 1 from public.cameras as camera
    where camera.id = p_camera_id
      and camera.status = 'published'
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

  if plan_kind = 'public_venue' then
    insert into public.booking_meetup_plans (
      booking_id, plan_kind, renter_city_label, venue_name, venue_address,
      venue_city, venue_latitude, venue_longitude, provider,
      provider_config_version, attribution
    ) values (
      booking_id, plan_kind, btrim(p_meetup_plan ->> 'renter_city_label'),
      btrim(p_meetup_plan ->> 'venue_name'),
      btrim(p_meetup_plan ->> 'venue_address'),
      btrim(p_meetup_plan ->> 'venue_city'),
      round((p_meetup_plan ->> 'venue_latitude')::numeric, 3),
      round((p_meetup_plan ->> 'venue_longitude')::numeric, 3),
      'geoapify', btrim(p_meetup_plan ->> 'provider_config_version'),
      '© OpenStreetMap contributors · Powered by Geoapify'
    );
  else
    insert into public.booking_meetup_plans (
      booking_id, plan_kind, renter_city_label, area_code, area_release,
      area_label
    ) values (
      booking_id, plan_kind, btrim(p_meetup_plan ->> 'renter_city_label'),
      p_meetup_plan ->> 'area_code', p_meetup_plan ->> 'area_release',
      btrim(p_meetup_plan ->> 'area_label')
    );
  end if;

  insert into public.booking_state_history (
    booking_id, from_state, to_state, actor_user_id, actor_type,
    reason_code, operation_id
  ) values (
    booking_id, null, 'FOR_REVIEW', p_renter_id, 'renter',
    'booking_requested', operation_id
  );

  perform private.write_audit(
    operation_id, 'request_booking', 'booking', booking_id, 'success',
    'rental request', jsonb_build_object(
      'meetup_snapshot', true,
      'meetup_plan_kind', plan_kind
    )
  );
  return booking_id;
end;
$$;

create function api.request_booking_schedule_with_meetup_v2_idempotent(
  p_renter_id uuid,
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint,
  p_intended_use text,
  p_expected_location text,
  p_meetup_plan jsonb,
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
  profile_status public.account_status;
  request_fingerprint text := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'camera_id', p_camera_id,
      'expected_location', p_expected_location,
      'handoff_time', p_handoff_time,
      'intended_use', p_intended_use,
      'meetup_plan', p_meetup_plan,
      'pickup_date', p_pickup_date,
      'policy_version', p_policy_version,
      'return_date', p_return_date
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'meetup_request_unauthorized' using errcode = '42501';
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
  booking_id := private.claim_booking_request_operation(
    p_renter_id, p_operation_id, request_fingerprint
  );
  if booking_id is not null then return booking_id; end if;

  if (
    select count(*)
    from public.bookings as booking
    where booking.renter_id = p_renter_id
      and booking.state = 'FOR_REVIEW'
  ) >= 10 then
    raise exception 'booking_request_limit_reached' using errcode = 'P0001';
  end if;

  booking_id := private.request_booking_schedule_with_meetup_v2(
    p_renter_id, p_camera_id, p_pickup_date, p_return_date, p_handoff_time,
    p_policy_version, p_intended_use, p_expected_location, p_meetup_plan
  );
  perform private.complete_booking_request_operation(
    p_renter_id, p_operation_id, booking_id
  );
  return booking_id;
end;
$$;

create or replace function private.attach_meetup_contract_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required boolean;
  plan public.booking_meetup_plans%rowtype;
  meetup_json jsonb;
begin
  select booking.meetup_snapshot_required into required
  from public.bookings as booking
  where booking.id = new.booking_id;

  select * into plan
  from public.booking_meetup_plans as stored
  where stored.booking_id = new.booking_id;

  if required and not found then
    raise exception 'approval_meetup_snapshot_missing' using errcode = '23514';
  end if;
  if plan.booking_id is not null then
    meetup_json := jsonb_build_object('renter_city', plan.renter_city_label);
    if plan.plan_kind = 'public_venue' then
      meetup_json := meetup_json || jsonb_build_object(
        'venue_name', plan.venue_name,
        'venue_address', plan.venue_address,
        'venue_city', plan.venue_city,
        'venue_latitude', plan.venue_latitude,
        'venue_longitude', plan.venue_longitude,
        'provider', plan.provider,
        'provider_config_version', plan.provider_config_version,
        'attribution', plan.attribution
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 2);
    else
      meetup_json := meetup_json || jsonb_build_object(
        'kind', 'canonical_area',
        'area_code', plan.area_code,
        'area_release', plan.area_release,
        'area_label', plan.area_label,
        'venue_status', 'pending_owner_confirmation'
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 3);
    end if;
    new.snapshot := new.snapshot || jsonb_build_object('meetup', meetup_json);
    new.content_sha256 := extensions.digest(
      convert_to(new.snapshot::text, 'UTF8'), 'sha256'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.request_booking_schedule_with_meetup_v2(
  uuid, uuid, date, date, time without time zone, bigint, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function api.request_booking_schedule_with_meetup_v2_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text, jsonb, uuid
) from public, anon, authenticated, service_role;
grant execute on function private.request_booking_schedule_with_meetup_v2(
  uuid, uuid, date, date, time without time zone, bigint, text, text, jsonb
) to service_role;
grant execute on function api.request_booking_schedule_with_meetup_v2_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text, jsonb, uuid
) to service_role;

comment on table public.booking_meetup_plans is
  'Immutable public-venue or current canonical-area snapshot for one booking; exact browser and private origin coordinates are never stored.';
comment on function api.request_booking_schedule_with_meetup_v2_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text, jsonb, uuid
) is
  'Creates one idempotent service-bound review request with an immutable public-venue or current PSGC area snapshot.';
