-- Reject amounts that cannot be represented exactly in the financial ledger.
-- Preserve accepted history, authorization, and retry validation.

create or replace function private.record_external_refund(
  p_booking_id uuid,
  p_amount numeric,
  p_reference text,
  p_recipient_name text,
  p_external_moved_at timestamptz,
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
  booking public.bookings%rowtype;
  existing public.deposit_refund_records%rowtype;
  terminal_at timestamptz;
  held numeric(12,2);
  deducted numeric(12,2);
  refunded numeric(12,2);
  remaining numeric(12,2);
  decision_id uuid;
  transaction_id uuid;
  record_id uuid;
  settlement public.deposit_settlements%rowtype;
begin
  if p_booking_id is null
    or p_amount is null
    or p_amount <= 0
    or p_amount <> round(p_amount, 2)
    or p_reference is null
    or length(btrim(p_reference)) not between 4 and 120
    or private.resolution_text_has_forbidden_characters(p_reference)
    or length(private.normalize_gcash_reference(p_reference)) not between 4 and 64
    or p_recipient_name is null
    or length(btrim(p_recipient_name)) not between 2 and 160
    or private.resolution_text_has_forbidden_characters(p_recipient_name)
    or p_external_moved_at is null
    or p_operation_id is null
  then
    raise exception 'refund_record_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.deposit_refund_records
  where operation_id = p_operation_id;
  if existing.id is not null then
    if existing.entry_kind is distinct from 'refund'
      or existing.booking_id is distinct from p_booking_id
      or existing.amount is distinct from p_amount
      or existing.external_moved_at is distinct from p_external_moved_at
      or existing.recorded_by is distinct from caller
      or not exists (
        select 1 from public.payment_transactions as payment
        where payment.id = existing.transaction_id
          and private.normalize_gcash_reference(payment.reference)
            = private.normalize_gcash_reference(p_reference)
          and payment.counterparty_display_name = btrim(p_recipient_name)
      )
    then
      raise exception 'refund_movement_retry_changed' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'refund_record_id', existing.id,
      'transaction_id', existing.transaction_id,
      'booking_id', existing.booking_id,
      'entry_kind', existing.entry_kind,
      'amount', existing.amount,
      'created', false
    );
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null or booking.state not in ('COMPLETED', 'CANCELLED') then
    raise exception 'refund_booking_not_eligible' using errcode = '40001';
  end if;

  select occurred_at into terminal_at
  from public.booking_state_history
  where booking_id = booking.id and to_state = booking.state
  order by id desc
  limit 1;
  if terminal_at is null
    or p_external_moved_at < terminal_at
    or p_external_moved_at > clock_timestamp()
  then
    raise exception 'refund_external_time_invalid' using errcode = '22023';
  end if;

  held := private.verified_deposit_held(booking.id);
  deducted := private.deposit_deduction_total(booking.id);
  refunded := private.net_refund_total(booking.id);
  remaining := held - deducted - refunded;
  if remaining <= 0 or p_amount > remaining then
    raise exception 'refund_amount_exceeds_pending_liability' using errcode = '23514';
  end if;

  set constraints all deferred;

  insert into public.payment_transactions (
    booking_id,
    direction,
    method,
    status,
    amount,
    currency,
    reference,
    counterparty_display_name,
    submitted_at,
    submitted_by,
    decided_at,
    decided_by
  ) values (
    booking.id,
    'outgoing',
    'gcash_manual',
    'verified',
    p_amount,
    'PHP',
    btrim(p_reference),
    btrim(p_recipient_name),
    p_external_moved_at,
    caller,
    statement_timestamp(),
    caller
  ) returning id into transaction_id;

  insert into public.payment_allocations (
    transaction_id, booking_id, kind, amount
  ) values (
    transaction_id, booking.id, 'deposit_refund', p_amount
  );

  insert into public.deposit_refund_records (
    booking_id,
    transaction_id,
    entry_kind,
    amount,
    external_moved_at,
    recorded_by,
    operation_id
  ) values (
    booking.id,
    transaction_id,
    'refund',
    p_amount,
    p_external_moved_at,
    caller,
    p_operation_id
  ) returning id into record_id;

  select id into decision_id
  from public.return_issue_decisions
  where booking_id = booking.id;
  settlement := private.replace_deposit_settlement(
    booking.id, decision_id, p_operation_id, caller
  );

  perform private.write_audit(
    p_operation_id,
    'record_external_refund',
    'payment_transaction',
    transaction_id,
    'success',
    'manual GCash refund recording',
    jsonb_build_object(
      'booking_id', booking.id,
      'refund_record_id', record_id,
      'amount', p_amount,
      'reference_last4', right(private.normalize_gcash_reference(p_reference), 4),
      'deposit_settlement_id', settlement.id,
      'remaining_liability', held - deducted - refunded - p_amount
    )
  );

  return jsonb_build_object(
    'refund_record_id', record_id,
    'transaction_id', transaction_id,
    'booking_id', booking.id,
    'entry_kind', 'refund',
    'amount', p_amount,
    'remaining_liability', held - deducted - refunded - p_amount,
    'created', true
  );
end;
$$;
