alter table public.bookings
add column meetup_snapshot_required boolean not null default false;

create table public.booking_meetup_plans (
  booking_id uuid primary key references public.bookings (id) on delete restrict,
  renter_city_label text not null check (length(btrim(renter_city_label)) between 2 and 120),
  venue_name text not null check (length(btrim(venue_name)) between 2 and 200),
  venue_address text not null check (length(btrim(venue_address)) between 2 and 300),
  venue_city text not null check (length(btrim(venue_city)) between 2 and 120),
  venue_latitude numeric(7,3) not null check (venue_latitude between -90 and 90),
  venue_longitude numeric(8,3) not null check (venue_longitude between -180 and 180),
  provider text not null check (provider = 'geoapify'),
  provider_config_version text not null check (length(btrim(provider_config_version)) between 1 and 64),
  attribution text not null check (
    attribution = '© OpenStreetMap contributors · Powered by Geoapify'
  ),
  created_at timestamptz not null default statement_timestamp()
);

create trigger booking_meetup_plans_append_only
before update or delete on public.booking_meetup_plans
for each row execute function private.reject_update_or_delete();

create function private.protect_meetup_requirement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.meetup_snapshot_required is distinct from new.meetup_snapshot_required then
    raise exception 'booking meetup requirement is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger bookings_protect_meetup_requirement
before update of meetup_snapshot_required on public.bookings
for each row execute function private.protect_meetup_requirement();

alter table public.booking_meetup_plans enable row level security;

create policy booking_meetup_plans_select_owner
on public.booking_meetup_plans for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.bookings as booking
    where booking.id = booking_id
      and booking.renter_id = (select auth.uid())
  )
);

grant select on public.booking_meetup_plans to authenticated;

create function private.get_meetup_recommendation_context(
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pickup_at timestamptz;
  return_at timestamptz;
  result jsonb;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'meetup_context_unauthorized' using errcode = '42501';
  end if;
  if p_pickup_date is null or p_return_date is null or p_handoff_time is null then
    raise exception 'meetup_context_invalid' using errcode = '22023';
  end if;

  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );

  select jsonb_build_object(
    'camera_id', camera.id,
    'policy_version', policy.version,
    'city_label', policy.city_label,
    'provider_city_id', anchor.provider_city_id,
    'country_code', anchor.country_code,
    'latitude', anchor.latitude,
    'longitude', anchor.longitude
  ) into result
  from public.cameras as camera
  join public.camera_handoff_policies as policy on policy.camera_id = camera.id
  join private.camera_lender_city_anchors as anchor on anchor.camera_id = camera.id
  where camera.id = p_camera_id
    and camera.status = 'published'
    and camera.archived_at is null
    and policy.enabled;

  if result is null then
    raise exception 'meetup_context_unavailable' using errcode = '22023';
  end if;
  return result;
end;
$$;

create function api.get_meetup_recommendation_context(
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.get_meetup_recommendation_context(
    p_camera_id,
    p_pickup_date,
    p_return_date,
    p_handoff_time,
    p_policy_version
  );
$$;

create function private.request_booking_schedule_with_meetup(
  p_renter_id uuid,
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint,
  p_intended_use text,
  p_expected_location text,
  p_renter_city_label text,
  p_venue_name text,
  p_venue_address text,
  p_venue_city text,
  p_venue_latitude numeric,
  p_venue_longitude numeric,
  p_provider_config_version text
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
    or length(btrim(coalesce(p_renter_city_label, ''))) not between 2 and 120
    or length(btrim(coalesce(p_venue_name, ''))) not between 2 and 200
    or length(btrim(coalesce(p_venue_address, ''))) not between 2 and 300
    or length(btrim(coalesce(p_venue_city, ''))) not between 2 and 120
    or p_venue_latitude is null or p_venue_latitude not between -90 and 90
    or p_venue_longitude is null or p_venue_longitude not between -180 and 180
    or length(btrim(coalesce(p_provider_config_version, ''))) not between 1 and 64
  then
    raise exception 'meetup_request_invalid' using errcode = '22023';
  end if;

  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );

  if not exists (
    select 1 from public.profiles as profile
    where profile.user_id = p_renter_id and profile.account_status = 'active'
  ) then
    raise exception 'an active profile is required' using errcode = '42501';
  end if;
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

  insert into public.booking_meetup_plans (
    booking_id, renter_city_label, venue_name,
    venue_address, venue_city, venue_latitude, venue_longitude, provider,
    provider_config_version, attribution
  ) values (
    booking_id, btrim(p_renter_city_label), btrim(p_venue_name),
    btrim(p_venue_address), btrim(p_venue_city),
    round(p_venue_latitude, 3), round(p_venue_longitude, 3), 'geoapify',
    btrim(p_provider_config_version),
    '© OpenStreetMap contributors · Powered by Geoapify'
  );

  insert into public.booking_state_history (
    booking_id, from_state, to_state, actor_user_id, actor_type, reason_code, operation_id
  ) values (
    booking_id, null, 'FOR_REVIEW', p_renter_id, 'renter', 'booking_requested', operation_id
  );

  perform private.write_audit(
    operation_id, 'request_booking', 'booking', booking_id, 'success',
    'rental request',
    jsonb_build_object('meetup_snapshot', true)
  );
  return booking_id;
end;
$$;

create function api.request_booking_schedule_with_meetup(
  p_renter_id uuid,
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint,
  p_intended_use text,
  p_expected_location text,
  p_renter_city_label text,
  p_venue_name text,
  p_venue_address text,
  p_venue_city text,
  p_venue_latitude numeric,
  p_venue_longitude numeric,
  p_provider_config_version text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_booking_schedule_with_meetup(
    p_renter_id, p_camera_id, p_pickup_date, p_return_date, p_handoff_time,
    p_policy_version, p_intended_use, p_expected_location,
    p_renter_city_label, p_venue_name,
    p_venue_address, p_venue_city, p_venue_latitude, p_venue_longitude,
    p_provider_config_version
  );
$$;

create function private.attach_meetup_contract_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required boolean;
  plan public.booking_meetup_plans%rowtype;
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
    new.snapshot := new.snapshot || jsonb_build_object(
      'meetup', jsonb_build_object(
        'renter_city', plan.renter_city_label,
        'venue_name', plan.venue_name,
        'venue_address', plan.venue_address,
        'venue_city', plan.venue_city,
        'venue_latitude', plan.venue_latitude,
        'venue_longitude', plan.venue_longitude,
        'provider', plan.provider,
        'provider_config_version', plan.provider_config_version,
        'attribution', plan.attribution
      )
    );
    new.snapshot_schema_version := greatest(new.snapshot_schema_version, 2);
    new.content_sha256 := extensions.digest(
      convert_to(new.snapshot::text, 'UTF8'), 'sha256'
    );
  end if;
  return new;
end;
$$;

create trigger contract_versions_attach_meetup_snapshot
before insert on public.contract_versions
for each row execute function private.attach_meetup_contract_snapshot();

revoke all on function private.get_meetup_recommendation_context(uuid, date, date, time without time zone, bigint) from public, anon, authenticated;
revoke all on function private.request_booking_schedule_with_meetup(uuid, uuid, date, date, time without time zone, bigint, text, text, text, text, text, text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function private.protect_meetup_requirement() from public, anon, authenticated;
revoke all on function private.attach_meetup_contract_snapshot() from public, anon, authenticated;
revoke all on function api.get_meetup_recommendation_context(uuid, date, date, time without time zone, bigint) from public, anon, authenticated;
revoke all on function api.request_booking_schedule_with_meetup(uuid, uuid, date, date, time without time zone, bigint, text, text, text, text, text, text, numeric, numeric, text) from public, anon, authenticated;

grant execute on function api.get_meetup_recommendation_context(uuid, date, date, time without time zone, bigint) to service_role;
grant execute on function api.request_booking_schedule_with_meetup(uuid, uuid, date, date, time without time zone, bigint, text, text, text, text, text, text, numeric, numeric, text) to service_role;
grant execute on function private.get_meetup_recommendation_context(uuid, date, date, time without time zone, bigint) to service_role;
grant execute on function private.request_booking_schedule_with_meetup(uuid, uuid, date, date, time without time zone, bigint, text, text, text, text, text, text, numeric, numeric, text) to service_role;

comment on table public.booking_meetup_plans is
  'Immutable city-level renter context and public venue snapshot for one booking; exact browser coordinates are never stored.';
