create or replace function private.ensure_profile(p_legal_name text, p_phone text)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  result public.profiles;
begin
  if nullif(btrim(p_legal_name), '') is null or nullif(btrim(p_phone), '') is null then
    raise exception 'legal name and phone are required' using errcode = '22023';
  end if;

  select * into result
  from public.profiles as profile
  where profile.user_id = caller
  for update;

  if result.user_id is not null and result.account_status = 'suspended' then
    return result;
  end if;

  insert into public.profiles (user_id, legal_name, phone)
  values (caller, btrim(p_legal_name), btrim(p_phone))
  on conflict (user_id) do update
    set legal_name = excluded.legal_name,
        phone = excluded.phone
  returning * into result;

  return result;
end;
$$;

create function private.assert_active_booking_profile(p_renter_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile_status public.account_status;
begin
  select profile.account_status into profile_status
  from public.profiles as profile
  where profile.user_id = p_renter_id
  for share;

  if profile_status is null then
    raise exception 'booking_profile_required' using errcode = '42501';
  end if;
  if profile_status <> 'active' then
    raise exception 'booking_profile_suspended' using errcode = '42501';
  end if;
end;
$$;

create or replace function api.request_booking_schedule_with_meetup_idempotent(
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
  request_fingerprint text := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'camera_id', p_camera_id, 'expected_location', p_expected_location,
      'handoff_time', p_handoff_time, 'intended_use', p_intended_use,
      'pickup_date', p_pickup_date, 'policy_version', p_policy_version,
      'provider_config_version', p_provider_config_version, 'renter_city_label', p_renter_city_label,
      'return_date', p_return_date, 'venue_address', p_venue_address,
      'venue_city', p_venue_city, 'venue_latitude', p_venue_latitude,
      'venue_longitude', p_venue_longitude, 'venue_name', p_venue_name
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
begin
  perform private.assert_active_booking_profile(p_renter_id);
  booking_id := private.claim_booking_request_operation(
    p_renter_id, p_operation_id, request_fingerprint
  );
  if booking_id is not null then return booking_id; end if;
  booking_id := private.request_booking_schedule_with_meetup(
    p_renter_id, p_camera_id, p_pickup_date, p_return_date, p_handoff_time,
    p_policy_version, p_intended_use, p_expected_location, p_renter_city_label,
    p_venue_name, p_venue_address, p_venue_city, p_venue_latitude,
    p_venue_longitude, p_provider_config_version
  );
  perform private.complete_booking_request_operation(
    p_renter_id, p_operation_id, booking_id
  );
  return booking_id;
end;
$$;

revoke all on function private.assert_active_booking_profile(uuid)
from public, anon, authenticated, service_role;
revoke all on function api.request_booking_schedule_with_meetup_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text,
  text, text, text, text, numeric, numeric, text, uuid
) from public, anon, authenticated;
grant execute on function api.request_booking_schedule_with_meetup_idempotent(
  uuid, uuid, date, date, time without time zone, bigint, text, text,
  text, text, text, text, numeric, numeric, text, uuid
) to service_role;
