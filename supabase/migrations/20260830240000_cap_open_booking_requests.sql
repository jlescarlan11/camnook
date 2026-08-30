-- Bound durable review-queue amplification per renter. Locking the profile row
-- makes the count-and-insert admission rule safe across concurrent requests.
create index bookings_open_review_renter_idx
on public.bookings (renter_id)
where state = 'FOR_REVIEW';

create or replace function private.request_booking_schedule_with_meetup(
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

  perform 1
  from public.profiles as profile
  where profile.user_id = p_renter_id
    and profile.account_status = 'active'
  for update;
  if not found then
    raise exception 'an active profile is required' using errcode = '42501';
  end if;
  if (
    select count(*)
    from public.bookings as booking
    where booking.renter_id = p_renter_id
      and booking.state = 'FOR_REVIEW'
  ) >= 10 then
    raise exception 'booking_request_limit_reached' using errcode = 'P0001';
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

comment on function private.request_booking_schedule_with_meetup(
  uuid, uuid, date, date, time without time zone, bigint,
  text, text, text, text, text, text, numeric, numeric, text
) is
  'Creates a meetup-bound review request server-side while allowing at most 10 open review requests per renter.';
