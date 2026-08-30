create function private.get_admin_booking_detail_snapshot(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  quote_json jsonb;
begin
  perform private.require_admin();

  select * into booking
  from public.bookings
  where id = p_booking_id;

  if booking.id is null then
    raise exception 'admin_booking_not_found' using errcode = 'P0002';
  end if;

  if booking.state = 'FOR_REVIEW' then
    begin
      select to_jsonb(quoted)
      into quote_json
      from api.quote_booking(
        booking.camera_id,
        booking.pickup_at,
        booking.return_at
      ) as quoted;
    exception
      when invalid_parameter_value then
        quote_json := null;
    end;
  end if;

  return jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking.id,
      'renter_id', booking.renter_id,
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
    'profile', (
      select jsonb_build_object(
        'legal_name', profile.legal_name,
        'phone', profile.phone,
        'account_status', profile.account_status
      )
      from public.profiles as profile
      where profile.user_id = booking.renter_id
    ),
    'camera', (
      select jsonb_build_object(
        'id', camera.id,
        'slug', camera.slug,
        'name', camera.name,
        'status', camera.status,
        'published_at', camera.published_at,
        'daily_rate', camera.daily_rate,
        'security_deposit', camera.security_deposit
      )
      from public.cameras as camera
      where camera.id = booking.camera_id
    ),
    'accessories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', accessory.id,
        'name', accessory.name,
        'quantity', accessory.quantity,
        'sort_position', accessory.sort_position
      ) order by accessory.sort_position, accessory.name, accessory.id)
      from public.camera_accessories as accessory
      where accessory.camera_id = booking.camera_id
        and accessory.archived_at is null
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_at', availability.starts_at,
        'ends_at', availability.ends_at,
        'reason', availability.reason
      ) order by availability.starts_at)
      from public.public_availability as availability
      where availability.camera_id = booking.camera_id
        and availability.starts_at < booking.return_at
        and availability.ends_at > booking.pickup_at
    ), '[]'::jsonb),
    'template', (
      select jsonb_build_object(
        'id', template.id,
        'version', template.version,
        'schema_version', template.schema_version,
        'terms', template.terms,
        'approved_at', template.approved_at,
        'activated_at', template.activated_at,
        'deactivated_at', template.deactivated_at
      )
      from public.contract_templates as template
      where template.approved_at is not null
        and template.activated_at is not null
        and template.deactivated_at is null
      order by template.id
      limit 1
    ),
    'meetup', (
      select jsonb_build_object(
        'booking_id', meetup.booking_id,
        'renter_city_label', meetup.renter_city_label,
        'venue_name', meetup.venue_name,
        'venue_address', meetup.venue_address,
        'venue_city', meetup.venue_city,
        'venue_latitude', meetup.venue_latitude,
        'venue_longitude', meetup.venue_longitude,
        'provider', meetup.provider,
        'provider_config_version', meetup.provider_config_version,
        'attribution', meetup.attribution,
        'created_at', meetup.created_at
      )
      from public.booking_meetup_plans as meetup
      where meetup.booking_id = booking.id
    ),
    'contract', case
      when booking.current_contract_version_id is null then null
      else (
        select jsonb_build_object(
          'id', contract.id,
          'template_id', contract.template_id,
          'version_no', contract.version_no,
          'status', contract.status,
          'issued_at', contract.issued_at
        )
        from public.contract_versions as contract
        where contract.id = booking.current_contract_version_id
      )
    end,
    'rejection', case
      when booking.state <> 'REJECTED' then null
      else (
        select jsonb_build_object(
          'note', history.note,
          'occurred_at', history.occurred_at
        )
        from public.booking_state_history as history
        where history.booking_id = booking.id
          and history.to_state = 'REJECTED'
        order by history.occurred_at desc, history.id desc
        limit 1
      )
    end,
    'quote', quote_json
  );
end;
$$;

create function api.get_admin_booking_detail_snapshot(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_admin_booking_detail_snapshot(p_booking_id);
$$;

revoke all on function private.get_admin_booking_detail_snapshot(uuid)
from public, anon, authenticated;
revoke all on function api.get_admin_booking_detail_snapshot(uuid)
from public, anon, authenticated;
grant execute on function api.get_admin_booking_detail_snapshot(uuid)
to authenticated;
