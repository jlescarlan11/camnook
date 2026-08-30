-- A renter may replace proof while a payment is in review. Verification must
-- bind to the current immutable proof version that the administrator loaded,
-- rather than accepting whichever proof happens to be current at commit time.
drop function api.verify_payment(uuid, numeric, text, boolean, uuid);
drop function private.verify_payment(uuid, numeric, text, boolean, uuid);

create function private.verify_payment(
  p_payment_id uuid,
  p_expected_proof_id uuid,
  p_observed_amount numeric,
  p_observed_reference text,
  p_actual_account_checked boolean,
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
  booking_id uuid;
  booking public.bookings%rowtype;
  payment public.payment_transactions%rowtype;
  current_proof_id uuid;
  observed_reference text := private.normalize_gcash_reference(p_observed_reference);
  decision_time timestamptz;
  allocation_count integer;
begin
  if p_payment_id is null
    or p_expected_proof_id is null
    or p_operation_id is null
    or p_actual_account_checked is not true
    or p_observed_amount is null
    or p_observed_amount <= 0
    or scale(p_observed_amount) > 2
    or length(observed_reference) not between 4 and 64
    or btrim(coalesce(p_observed_reference, '')) !~ '^[A-Za-z0-9 -]+$'
  then
    raise exception 'payment_verification_invalid' using errcode = '22023';
  end if;

  select candidate.booking_id into booking_id
  from public.payment_transactions as candidate
  where candidate.id = p_payment_id;

  select * into booking
  from public.bookings
  where id = booking_id
  for update;

  select * into payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if booking.id is null or payment.id is null or payment.direction <> 'incoming' then
    raise exception 'payment_review_not_found' using errcode = 'P0002';
  end if;

  select proof.id into current_proof_id
  from public.payment_proofs as proof
  where proof.transaction_id = payment.id
    and proof.finalized_at is not null
    and not exists (
      select 1 from public.payment_proofs as successor
      where successor.supersedes_id = proof.id
    )
  order by proof.created_at desc, proof.id desc
  limit 1
  for share;

  if current_proof_id is distinct from p_expected_proof_id then
    raise exception 'payment_proof_review_stale' using errcode = '40001';
  end if;

  if payment.status = 'verified' then
    select count(*)::integer into allocation_count
    from public.payment_allocations
    where transaction_id = payment.id;
    if booking.state <> 'CONFIRMED'
      or allocation_count <> 2
      or p_observed_amount <> payment.amount
      or observed_reference <> payment.reference_canonical
    then
      raise exception 'payment_verification_retry_conflict' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'booking_state', booking.state,
      'created', false,
      'status', payment.status,
      'transaction_id', payment.id
    );
  end if;

  if payment.status <> 'submitted'
    or booking.state <> 'PAYMENT_REVIEW'
    or payment.contract_version_id <> booking.current_contract_version_id
  then
    raise exception 'payment_review_stale' using errcode = '40001';
  end if;
  if payment.submitted_at >= booking.approval_deadline_at then
    raise exception 'payment_submission_not_timely' using errcode = '23514';
  end if;
  if p_observed_amount <> payment.amount
    or payment.amount <> booking.total_due
    or observed_reference <> payment.reference_canonical
  then
    raise exception 'payment_actual_account_mismatch' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.payment_transactions as duplicate
    where duplicate.id <> payment.id
      and duplicate.direction = 'incoming'
      and duplicate.status = 'verified'
      and duplicate.reference_canonical = payment.reference_canonical
  ) then
    raise exception 'payment_reference_already_verified' using errcode = '23505';
  end if;

  decision_time := clock_timestamp();
  perform set_config('camnook.payment_operation_id', p_operation_id::text, true);

  insert into public.payment_allocations (
    transaction_id,
    booking_id,
    kind,
    amount
  ) values
    (payment.id, booking.id, 'rental_payment', booking.rental_amount),
    (payment.id, booking.id, 'security_deposit', booking.security_deposit_amount);

  update public.payment_transactions
  set status = 'verified',
      decided_at = decision_time,
      decided_by = caller,
      rejection_reason = null,
      rejection_reason_code = null
  where id = payment.id;

  perform private.transition_booking(
    booking.id,
    'PAYMENT_REVIEW',
    'CONFIRMED',
    'admin',
    'payment_verified',
    null,
    p_operation_id
  );

  perform private.write_payment_audit(
    caller,
    p_operation_id,
    'verify_payment',
    payment.id,
    'success',
    'manual GCash payment reconciliation',
    jsonb_build_object(
      'booking_id', booking.id,
      'booking_state', 'CONFIRMED',
      'allocation_count', 2,
      'allocation_kinds', jsonb_build_array(
        'rental_payment',
        'security_deposit'
      ),
      'proof_id', current_proof_id
    )
  );

  perform set_config('camnook.payment_operation_id', '', true);

  return jsonb_build_object(
    'booking_state', 'CONFIRMED',
    'created', true,
    'status', 'verified',
    'transaction_id', payment.id
  );
end;
$$;

create function api.verify_payment(
  p_payment_id uuid,
  p_expected_proof_id uuid,
  p_observed_amount numeric,
  p_observed_reference text,
  p_actual_account_checked boolean,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.verify_payment(
    p_payment_id,
    p_expected_proof_id,
    p_observed_amount,
    p_observed_reference,
    p_actual_account_checked,
    p_operation_id
  );
$$;

revoke all on function private.verify_payment(uuid, uuid, numeric, text, boolean, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.verify_payment(uuid, uuid, numeric, text, boolean, uuid)
from public, anon, authenticated, service_role;
grant execute on function private.verify_payment(uuid, uuid, numeric, text, boolean, uuid)
to authenticated;
grant execute on function api.verify_payment(uuid, uuid, numeric, text, boolean, uuid)
to authenticated;

comment on function private.verify_payment(uuid, uuid, numeric, text, boolean, uuid) is
  'Verifies a submitted payment only when the current immutable proof matches the proof version reviewed by the administrator.';
