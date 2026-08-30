create function private.get_my_account_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  profile_json jsonb;
  bookings_json jsonb;
begin
  select jsonb_build_object(
    'legal_name', profile.legal_name,
    'phone', profile.phone,
    'account_status', profile.account_status
  ) into profile_json
  from public.profiles as profile
  where profile.user_id = caller;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking.id,
      'camera_id', booking.camera_id,
      'state', booking.state,
      'pickup_at', booking.pickup_at,
      'return_at', booking.return_at,
      'intended_use', booking.intended_use,
      'expected_location', booking.expected_location,
      'requested_at', booking.requested_at,
      'approved_at', booking.approved_at,
      'approval_deadline_at', booking.approval_deadline_at,
      'billable_days_snapshot', booking.billable_days_snapshot,
      'daily_rate_snapshot', booking.daily_rate_snapshot,
      'rental_amount', booking.rental_amount,
      'security_deposit_amount', booking.security_deposit_amount,
      'total_due', booking.total_due,
      'currency', booking.currency,
      'current_contract_version_id', booking.current_contract_version_id,
      'meetup_snapshot_required', booking.meetup_snapshot_required
    ),
    'camera', case when camera.id is null then null else jsonb_build_object(
      'name', camera.name,
      'slug', camera.slug
    ) end,
    'meetup', case when plan.booking_id is null then null else jsonb_build_object(
      'booking_id', plan.booking_id,
      'renter_city_label', plan.renter_city_label,
      'venue_name', plan.venue_name,
      'venue_address', plan.venue_address,
      'venue_city', plan.venue_city,
      'venue_latitude', plan.venue_latitude,
      'venue_longitude', plan.venue_longitude,
      'provider', plan.provider,
      'provider_config_version', plan.provider_config_version,
      'attribution', plan.attribution,
      'created_at', plan.created_at
    ) end
  ) order by booking.requested_at desc, booking.id), '[]'::jsonb)
  into bookings_json
  from public.bookings as booking
  left join public.cameras as camera
    on camera.id = booking.camera_id
    and camera.status = 'published'
  left join public.booking_meetup_plans as plan
    on plan.booking_id = booking.id
  where booking.renter_id = caller;

  return jsonb_build_object(
    'profile', profile_json,
    'bookings', bookings_json
  );
end;
$$;

create function api.get_my_account_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_my_account_overview();
$$;

revoke all on function private.get_my_account_overview()
from public, anon, authenticated;
revoke all on function api.get_my_account_overview()
from public, anon, authenticated;
grant execute on function api.get_my_account_overview()
to authenticated;
