create table private.booking_request_operations (
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  operation_id uuid not null,
  booking_id uuid references public.bookings (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (actor_user_id, operation_id)
);

create function private.claim_booking_request_operation(
  p_actor_user_id uuid,
  p_operation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing_booking_id uuid;
begin
  if p_actor_user_id is null or p_operation_id is null then
    raise exception 'booking request operation is required' using errcode = '22023';
  end if;

  insert into private.booking_request_operations (actor_user_id, operation_id)
  values (p_actor_user_id, p_operation_id)
  on conflict do nothing;

  if found then
    return null;
  end if;

  select booking_id into existing_booking_id
  from private.booking_request_operations
  where actor_user_id = p_actor_user_id and operation_id = p_operation_id;

  if existing_booking_id is null then
    raise exception 'booking request operation is incomplete' using errcode = '55000';
  end if;
  return existing_booking_id;
end;
$$;

create function private.complete_booking_request_operation(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_booking_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.booking_request_operations
  set booking_id = p_booking_id
  where actor_user_id = p_actor_user_id
    and operation_id = p_operation_id
    and booking_id is null;

  if not found then
    raise exception 'booking request operation completion failed' using errcode = '55000';
  end if;
end;
$$;

create function api.request_booking_idempotent(
  p_camera_id uuid, p_pickup_at timestamptz, p_return_at timestamptz,
  p_intended_use text, p_expected_location text, p_operation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking_id uuid;
begin
  booking_id := private.claim_booking_request_operation(caller, p_operation_id);
  if booking_id is not null then return booking_id; end if;
  booking_id := private.request_booking(p_camera_id, p_pickup_at, p_return_at, p_intended_use, p_expected_location);
  perform private.complete_booking_request_operation(caller, p_operation_id, booking_id);
  return booking_id;
end;
$$;

create function api.request_booking_schedule_idempotent(
  p_camera_id uuid, p_pickup_date date, p_return_date date,
  p_handoff_time time without time zone, p_policy_version bigint,
  p_intended_use text, p_expected_location text, p_operation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking_id uuid;
  pickup_at timestamptz;
  return_at timestamptz;
begin
  booking_id := private.claim_booking_request_operation(caller, p_operation_id);
  if booking_id is not null then return booking_id; end if;
  if p_pickup_date is null or p_return_date is null or p_handoff_time is null then
    raise exception 'handoff_invalid_period' using errcode = '22023';
  end if;
  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(p_camera_id, pickup_at, return_at, p_policy_version);
  booking_id := private.request_booking(p_camera_id, pickup_at, return_at, p_intended_use, p_expected_location);
  perform private.complete_booking_request_operation(caller, p_operation_id, booking_id);
  return booking_id;
end;
$$;

create function api.request_booking_schedule_with_meetup_idempotent(
  p_renter_id uuid, p_camera_id uuid, p_pickup_date date, p_return_date date,
  p_handoff_time time without time zone, p_policy_version bigint,
  p_intended_use text, p_expected_location text, p_renter_city_label text,
  p_venue_name text, p_venue_address text, p_venue_city text,
  p_venue_latitude numeric, p_venue_longitude numeric,
  p_provider_config_version text, p_operation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  booking_id uuid;
begin
  booking_id := private.claim_booking_request_operation(p_renter_id, p_operation_id);
  if booking_id is not null then return booking_id; end if;
  booking_id := private.request_booking_schedule_with_meetup(
    p_renter_id, p_camera_id, p_pickup_date, p_return_date, p_handoff_time,
    p_policy_version, p_intended_use, p_expected_location, p_renter_city_label,
    p_venue_name, p_venue_address, p_venue_city, p_venue_latitude,
    p_venue_longitude, p_provider_config_version
  );
  perform private.complete_booking_request_operation(p_renter_id, p_operation_id, booking_id);
  return booking_id;
end;
$$;

revoke all on table private.booking_request_operations from public, anon, authenticated;
revoke all on function private.claim_booking_request_operation(uuid, uuid) from public, anon, authenticated;
revoke all on function private.complete_booking_request_operation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function api.request_booking_idempotent(uuid, timestamptz, timestamptz, text, text, uuid) from public;
revoke all on function api.request_booking_schedule_idempotent(uuid, date, date, time without time zone, bigint, text, text, uuid) from public;
revoke all on function api.request_booking_schedule_with_meetup_idempotent(uuid, uuid, date, date, time without time zone, bigint, text, text, text, text, text, text, numeric, numeric, text, uuid) from public, anon, authenticated;
grant execute on function api.request_booking_idempotent(uuid, timestamptz, timestamptz, text, text, uuid) to authenticated;
grant execute on function api.request_booking_schedule_idempotent(uuid, date, date, time without time zone, bigint, text, text, uuid) to authenticated;
grant execute on function api.request_booking_schedule_with_meetup_idempotent(uuid, uuid, date, date, time without time zone, bigint, text, text, text, text, text, text, numeric, numeric, text, uuid) to service_role;
