-- Capture only the area preference needed for owner review. Exact public venue
-- coordination remains a post-approval concern.
alter table public.booking_meetup_plans
  drop constraint booking_meetup_plans_variant_check,
  add constraint booking_meetup_plans_variant_check check (
    (
      plan_kind = 'public_venue'
      and area_code is null and area_release is null and area_label is null
      and venue_name is not null and venue_address is not null
      and venue_city is not null and venue_latitude is not null
      and venue_longitude is not null and provider = 'geoapify'
      and provider_config_version is not null
      and attribution = '© OpenStreetMap contributors · Powered by Geoapify'
    )
    or
    (
      plan_kind = 'canonical_area'
      and area_code ~ '^[0-9]{10}$'
      and area_release ~ '^[0-9]{4}-q[1-4]$'
      and length(btrim(area_label)) between 1 and 160
      and venue_name is null and venue_address is null and venue_city is null
      and venue_latitude is null and venue_longitude is null and provider is null
      and provider_config_version is null and attribution is null
    )
    or
    (
      plan_kind = 'preferred_area'
      and area_code is null and area_release is null
      and length(btrim(area_label)) between 2 and 160
      and venue_name is null and venue_address is null and venue_city is null
      and venue_latitude is null and venue_longitude is null and provider is null
      and provider_config_version is null and attribution is null
    )
  );

create function api.request_booking_with_preference_idempotent(
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
  ) values (
    booking_id, 'preferred_area', normalized_area, normalized_area
  );
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

revoke all on function api.request_booking_with_preference_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function api.request_booking_with_preference_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text, text, uuid
) to service_role;

-- A compact owner inventory read model used by Dashboard / Cameras / Bookings.
create function api.get_owner_cameras()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', camera.id,
      'slug', camera.slug,
      'name', camera.name,
      'description', camera.description,
      'status', camera.status,
      'daily_rate', camera.daily_rate,
      'security_deposit', camera.security_deposit,
      'published_at', camera.published_at,
      'photo_count', (select count(*) from public.camera_photos photo where photo.camera_id = camera.id and photo.archived_at is null),
      'accessories', coalesce((select jsonb_agg(jsonb_build_object('name', accessory.name, 'quantity', accessory.quantity) order by accessory.sort_position) from public.camera_accessories accessory where accessory.camera_id = camera.id and accessory.archived_at is null), '[]'::jsonb),
      'upcoming_rentals', (select count(*) from public.bookings booking where booking.camera_id = camera.id and booking.state in ('CONTRACT_PENDING','TO_PAY','PAYMENT_REVIEW','CONFIRMED','ACTIVE','RETURN_REVIEW','ISSUE_REVIEW') and booking.return_at > statement_timestamp()),
      'handoff', (select jsonb_build_object(
        'enabled', policy.enabled,
        'version', policy.version,
        'allowed_weekdays', policy.allowed_weekdays,
        'approved_times', coalesce((select jsonb_agg(to_char(slot.local_time, 'HH24:MI') order by slot.local_time) from public.camera_handoff_slots slot where slot.camera_id = policy.camera_id), '[]'::jsonb),
        'pickup_area', policy.city_label
      ) from public.camera_handoff_policies policy where policy.camera_id = camera.id)
    ) order by camera.created_at desc)
    from public.cameras camera where camera.status <> 'archived'
  ), '[]'::jsonb) else null end;
$$;

create function api.save_camera_draft(p_input jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  v_camera_id uuid := nullif(p_input ->> 'id', '')::uuid;
  camera_name text := btrim(p_input ->> 'name');
  camera_description text := btrim(p_input ->> 'description');
  camera_slug text;
  item jsonb;
  position integer := 0;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or camera_name is null or length(camera_name) not between 2 and 160
    or camera_description is null or length(camera_description) not between 2 and 2000
    or (p_input ->> 'daily_rate')::numeric < 0
    or (p_input ->> 'security_deposit')::numeric < 0
    or jsonb_typeof(p_input -> 'accessories') <> 'array'
  then raise exception 'camera_draft_invalid' using errcode = '22023'; end if;

  if v_camera_id is null then
    v_camera_id := gen_random_uuid();
    camera_slug := trim(both '-' from regexp_replace(lower(camera_name), '[^a-z0-9]+', '-', 'g')) || '-' || left(v_camera_id::text, 8);
    insert into public.cameras (
      id, slug, serial_number, name, description, status, daily_rate,
      security_deposit
    ) values (
      v_camera_id, camera_slug, 'draft-' || v_camera_id::text, camera_name,
      camera_description, 'draft', (p_input ->> 'daily_rate')::numeric,
      (p_input ->> 'security_deposit')::numeric
    );
  else
    update public.cameras set
      name = camera_name,
      description = camera_description,
      daily_rate = (p_input ->> 'daily_rate')::numeric,
      security_deposit = (p_input ->> 'security_deposit')::numeric
    where id = v_camera_id and status in ('draft', 'published') and archived_at is null;
    if not found then raise exception 'camera_not_found' using errcode = 'P0002'; end if;
    update public.camera_accessories set archived_at = statement_timestamp()
    where camera_accessories.camera_id = v_camera_id and archived_at is null;
  end if;

  for item in select * from jsonb_array_elements(p_input -> 'accessories') loop
    if length(btrim(item ->> 'name')) not between 1 and 160
      or coalesce((item ->> 'quantity')::integer, 0) < 1
    then raise exception 'camera_accessory_invalid' using errcode = '22023'; end if;
    insert into public.camera_accessories(camera_id, name, quantity, sort_position)
    values (v_camera_id, btrim(item ->> 'name'), (item ->> 'quantity')::integer, position);
    position := position + 1;
  end loop;
  perform caller;
  return v_camera_id;
end;
$$;

create function api.unpublish_camera(p_camera_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.cameras set status = 'draft', published_at = null
  where id = p_camera_id and status = 'published' and archived_at is null;
  return found;
end;
$$;

revoke all on function api.get_owner_cameras() from public, anon, authenticated;
revoke all on function api.save_camera_draft(jsonb) from public, anon, authenticated;
revoke all on function api.unpublish_camera(uuid) from public, anon, authenticated;
grant execute on function api.get_owner_cameras() to authenticated;
grant execute on function api.save_camera_draft(jsonb) to authenticated;
grant execute on function api.unpublish_camera(uuid) to authenticated;

comment on function api.request_booking_with_preference_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text, text, uuid
) is 'Creates one schedule-bound request with a preferred meetup area; exact venue coordination is deferred until approval.';

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
  from public.bookings as booking where booking.id = new.booking_id;
  select * into plan from public.booking_meetup_plans as stored
  where stored.booking_id = new.booking_id;
  if required and not found then
    raise exception 'approval_meetup_snapshot_missing' using errcode = '23514';
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
    new.content_sha256 := extensions.digest(
      convert_to(new.snapshot::text, 'UTF8'), 'sha256'
    );
  end if;
  return new;
end;
$$;

comment on table public.booking_meetup_plans is
  'Immutable preferred-area, canonical-area, or exact public-venue snapshot for one booking; exact venue coordination may be deferred until approval.';
