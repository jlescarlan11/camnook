-- Reusing a cancellation request identity must preserve its original reason.
-- Keep owner checks, decided-request retry recovery, and immutable history.
create or replace function private.request_cancellation(
  p_booking_id uuid,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  existing public.booking_cancellation_requests%rowtype;
  request_id uuid;
begin
  if p_booking_id is null
    or p_operation_id is null
    or p_reason is null
    or length(btrim(p_reason)) not between 2 and 1000
    or private.resolution_text_has_forbidden_characters(p_reason)
  then
    raise exception 'cancellation_request_invalid' using errcode = '22023';
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id and renter_id = caller
  for update;
  if booking.id is null then
    raise exception 'cancellation_booking_not_found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.booking_cancellation_requests
  where booking_id = booking.id
  order by requested_at desc, id desc
  limit 1
  for update;

  if existing.operation_id = p_operation_id then
    if existing.reason is distinct from btrim(p_reason)
      or existing.requester_id is distinct from caller
    then
      raise exception 'cancellation_request_retry_changed' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'request_id', existing.id,
      'booking_id', booking.id,
      'booking_state', booking.state,
      'disposition', existing.disposition,
      'created', false
    );
  end if;

  if booking.state not in (
    'FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY', 'PAYMENT_REVIEW', 'CONFIRMED'
  ) then
    raise exception 'cancellation_state_ineligible' using errcode = '22023';
  end if;
  if existing.id is not null then
    raise exception 'cancellation_request_already_exists' using errcode = '55000';
  end if;

  insert into public.booking_cancellation_requests (
    booking_id, requester_id, reason, operation_id
  ) values (
    booking.id, caller, btrim(p_reason), p_operation_id
  ) returning id into request_id;

  perform private.write_audit(
    p_operation_id,
    'request_cancellation',
    'booking_cancellation_request',
    request_id,
    'success',
    'renter cancellation request',
    jsonb_build_object('booking_id', booking.id, 'booking_state', booking.state)
  );

  return jsonb_build_object(
    'request_id', request_id,
    'booking_id', booking.id,
    'booking_state', booking.state,
    'disposition', 'pending',
    'created', true
  );
end;
$$;
