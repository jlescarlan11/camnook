create function private.get_my_booking_detail_context(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  camera_json jsonb;
  meetup_json jsonb;
  versions_json jsonb;
begin
  select * into booking
  from public.bookings
  where id = p_booking_id
    and renter_id = caller;

  if booking.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'name', camera.name,
    'slug', camera.slug
  ) into camera_json
  from public.cameras as camera
  where camera.id = booking.camera_id
    and camera.status = 'published';

  select jsonb_build_object(
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
  ) into meetup_json
  from public.booking_meetup_plans as plan
  where plan.booking_id = booking.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', version.booking_id,
    'id', version.id,
    'issued_at', version.issued_at,
    'snapshot', version.snapshot,
    'status', version.status,
    'supersedes_id', version.supersedes_id,
    'version_no', version.version_no,
    'signature', case when signature.id is null then null else
      jsonb_build_object(
        'id', signature.id,
        'signed_at', signature.signed_at
      )
    end
  ) order by version.version_no), '[]'::jsonb)
  into versions_json
  from public.contract_versions as version
  left join public.contract_signatures as signature
    on signature.contract_version_id = version.id
    and signature.renter_id = caller
  where version.booking_id = booking.id;

  return jsonb_build_object(
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
    'camera', camera_json,
    'meetup', meetup_json,
    'versions', versions_json,
    'payment', private.get_my_payment_state(booking.id),
    'pickup', private.get_my_pickup_state(booking.id),
    'resolution', private.get_my_resolution_state(booking.id)
  );
end;
$$;

create function api.get_my_booking_detail_context(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_my_booking_detail_context(p_booking_id);
$$;

revoke all on function private.get_my_booking_detail_context(uuid)
from public, anon, authenticated;
revoke all on function api.get_my_booking_detail_context(uuid)
from public, anon, authenticated;
grant execute on function api.get_my_booking_detail_context(uuid)
to authenticated;
