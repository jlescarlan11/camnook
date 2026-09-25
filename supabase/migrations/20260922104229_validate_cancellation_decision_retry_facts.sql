-- A retry acknowledges only the original cancellation decision facts.
-- Preserve paid-cancellation restrictions, immutable decisions, and grants.
create or replace function private.decide_cancellation(
  p_request_id uuid,
  p_accept boolean,
  p_reason text,
  p_fee_amount numeric,
  p_refund_liability_amount numeric,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  request public.booking_cancellation_requests%rowtype;
  booking public.bookings%rowtype;
  existing public.cancellation_decisions%rowtype;
  decision_id uuid;
begin
  if p_request_id is null
    or p_accept is null
    or p_operation_id is null
    or p_reason is null
    or length(btrim(p_reason)) not between 2 and 1000
    or private.resolution_text_has_forbidden_characters(p_reason)
    or p_fee_amount is null
    or p_refund_liability_amount is null
    or p_fee_amount < 0
    or p_refund_liability_amount < 0
  then
    raise exception 'cancellation_decision_invalid' using errcode = '22023';
  end if;

  select * into request
  from public.booking_cancellation_requests
  where id = p_request_id
  for update;
  if request.id is null then
    raise exception 'cancellation_request_not_found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.cancellation_decisions
  where request_id = request.id
  for share;
  if existing.operation_id = p_operation_id then
    if existing.outcome is distinct from (case when p_accept then 'accepted' else 'declined' end)
      or existing.reason is distinct from btrim(p_reason)
      or existing.fee_amount is distinct from p_fee_amount
      or existing.refund_liability_amount is distinct from p_refund_liability_amount
      or existing.decided_by is distinct from caller
    then
      raise exception 'cancellation_decision_retry_changed' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'decision_id', existing.id,
      'request_id', request.id,
      'booking_id', request.booking_id,
      'outcome', existing.outcome,
      'booking_state', case
        when existing.outcome = 'accepted' then 'CANCELLED'
        else existing.booking_state_at_decision::text
      end,
      'created', false
    );
  end if;
  if existing.id is not null or request.disposition <> 'pending' then
    raise exception 'cancellation_request_stale' using errcode = '40001';
  end if;

  select * into booking
  from public.bookings
  where id = request.booking_id
  for update;
  if booking.id is null
    or booking.state not in (
      'FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY', 'PAYMENT_REVIEW', 'CONFIRMED'
    )
  then
    raise exception 'cancellation_state_ineligible' using errcode = '40001';
  end if;

  if not p_accept and (p_fee_amount <> 0 or p_refund_liability_amount <> 0) then
    raise exception 'declined_cancellation_cannot_create_financial_effects'
      using errcode = '23514';
  end if;
  if p_accept and booking.state in ('PAYMENT_REVIEW', 'CONFIRMED') then
    raise exception 'paid_cancellation_policy_not_approved' using errcode = '0A000';
  end if;
  if p_accept and (p_fee_amount <> 0 or p_refund_liability_amount <> 0) then
    raise exception 'cancellation_amount_policy_not_approved' using errcode = '0A000';
  end if;

  insert into public.cancellation_decisions (
    request_id,
    booking_id,
    outcome,
    booking_state_at_decision,
    fee_amount,
    refund_liability_amount,
    reason,
    decided_by,
    operation_id
  ) values (
    request.id,
    booking.id,
    case when p_accept then 'accepted' else 'declined' end,
    booking.state,
    p_fee_amount,
    p_refund_liability_amount,
    btrim(p_reason),
    caller,
    p_operation_id
  ) returning id into decision_id;

  update public.booking_cancellation_requests
  set disposition = case
        when p_accept then 'accepted'::public.cancellation_disposition
        else 'declined'::public.cancellation_disposition
      end,
      decided_by = caller,
      decided_at = statement_timestamp(),
      decision_note = btrim(p_reason)
  where id = request.id;

  if p_accept then
    perform private.transition_booking(
      booking.id,
      booking.state,
      'CANCELLED',
      'admin',
      'cancellation_accepted',
      btrim(p_reason),
      p_operation_id
    );
    perform private.release_booking_block(booking.id, caller);
  end if;

  perform private.write_audit(
    p_operation_id,
    'decide_cancellation',
    'booking_cancellation_request',
    request.id,
    'success',
    'cancellation decision',
    jsonb_build_object(
      'decision_id', decision_id,
      'booking_id', booking.id,
      'outcome', case when p_accept then 'accepted' else 'declined' end,
      'fee_amount', p_fee_amount,
      'refund_liability_amount', p_refund_liability_amount
    )
  );

  return jsonb_build_object(
    'decision_id', decision_id,
    'request_id', request.id,
    'booking_id', booking.id,
    'outcome', case when p_accept then 'accepted' else 'declined' end,
    'booking_state', case when p_accept then 'CANCELLED' else booking.state::text end,
    'created', true
  );
end;
$$;
