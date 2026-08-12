create or replace function private.decide_cancellation(
  p_request_id uuid,
  p_accept boolean,
  p_note text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  target public.booking_cancellation_requests%rowtype;
  current_state public.booking_state;
  operation_id uuid := gen_random_uuid();
begin
  select * into target
  from public.booking_cancellation_requests
  where id = p_request_id
  for update;

  if target.id is null or target.disposition <> 'pending' then
    raise exception 'pending cancellation request not found' using errcode = 'P0002';
  end if;

  update public.booking_cancellation_requests
  set disposition = case
        when p_accept then 'accepted'::public.cancellation_disposition
        else 'declined'::public.cancellation_disposition
      end,
      decided_by = caller,
      decided_at = statement_timestamp(),
      decision_note = p_note
  where id = p_request_id;

  if p_accept then
    select state into current_state
    from public.bookings
    where id = target.booking_id
    for update;

    if current_state not in ('FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY', 'PAYMENT_REVIEW', 'CONFIRMED') then
      raise exception 'booking can no longer be cancelled' using errcode = '22023';
    end if;

    if current_state in ('PAYMENT_REVIEW', 'CONFIRMED') then
      raise exception 'paid or submitted-payment cancellation is disabled until OD-03 is approved'
        using errcode = '0A000';
    end if;

    perform private.transition_booking(
      target.booking_id,
      current_state,
      'CANCELLED',
      'admin',
      'cancellation_accepted',
      p_note,
      operation_id
    );
    perform private.release_booking_block(target.booking_id, caller);
  end if;

  perform private.write_audit(
    operation_id,
    'decide_cancellation',
    'booking_cancellation_request',
    p_request_id,
    'success',
    'cancellation review',
    jsonb_build_object('accepted', p_accept)
  );
end;
$$;
