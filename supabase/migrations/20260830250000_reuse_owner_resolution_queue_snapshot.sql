create or replace function private.get_owner_operations_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  database_now timestamptz := statement_timestamp();
  review_queue jsonb;
  signature_queue jsonb;
  payment_queue jsonb;
  pickup_queue jsonb;
  active_rental_queue jsonb;
  return_queue jsonb;
  issue_queue jsonb;
  held_deposit_queue jsonb;
  pending_refund_queue jsonb;
  identity_review_queue jsonb;
  cancellation_queue jsonb;
  resolution_queues jsonb;
  deposit_reconciliation jsonb;
begin
  perform private.require_admin();

  -- The dashboard consumes two slices of this projection. Compute the full
  -- resolution workload once so both slices share one statement snapshot.
  resolution_queues := private.get_resolution_queues();

  if exists (
    select 1
    from public.bookings as booking
    cross join lateral private.deposit_outcome_json(booking.id) as outcome(value)
    where (outcome.value ->> 'held_amount')::numeric
      - (outcome.value ->> 'deduction_amount')::numeric
      - (outcome.value ->> 'refunded_amount')::numeric < 0
  ) then
    raise exception 'deposit_liability_ledger_is_overdrawn'
      using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', booking.id,
    'camera_name', camera.name,
    'renter_legal_name', profile.legal_name,
    'pickup_at', booking.pickup_at,
    'return_at', booking.return_at,
    'requested_at', booking.requested_at,
    'urgency', case
      when booking.pickup_at < database_now then 'overdue'
      when (booking.pickup_at at time zone 'Asia/Manila')::date
        = (database_now at time zone 'Asia/Manila')::date then 'due_today'
      else 'upcoming'
    end
  ) order by booking.requested_at, booking.id), '[]'::jsonb)
  into review_queue
  from public.bookings as booking
  join public.cameras as camera on camera.id = booking.camera_id
  join public.profiles as profile on profile.user_id = booking.renter_id
  where booking.state = 'FOR_REVIEW';

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', booking.id,
    'camera_name', camera.name,
    'renter_legal_name', profile.legal_name,
    'renter_phone', profile.phone,
    'pickup_at', booking.pickup_at,
    'approval_deadline_at', booking.approval_deadline_at,
    'urgency', case
      when booking.approval_deadline_at <= database_now then 'expired'
      when (booking.approval_deadline_at at time zone 'Asia/Manila')::date
        = (database_now at time zone 'Asia/Manila')::date then 'due_today'
      else 'open'
    end
  ) order by booking.approval_deadline_at, booking.id), '[]'::jsonb)
  into signature_queue
  from public.bookings as booking
  join public.cameras as camera on camera.id = booking.camera_id
  join public.profiles as profile on profile.user_id = booking.renter_id
  where booking.state = 'CONTRACT_PENDING'
    and booking.approval_deadline_at is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'transaction_id', item ->> 'transaction_id',
    'booking_id', item ->> 'booking_id',
    'camera_name', item ->> 'camera_name',
    'renter_legal_name', item ->> 'renter_legal_name',
    'declared_amount', (item ->> 'declared_amount')::numeric,
    'currency', item ->> 'currency',
    'submitted_at', item ->> 'submitted_at',
    'age_seconds', (item ->> 'age_seconds')::bigint,
    'approval_deadline_at', item ->> 'approval_deadline_at',
    'proof_exists', (item ->> 'proof_exists')::boolean,
    'urgency', case
      when (item ->> 'age_seconds')::bigint >= 43200 then 'overdue'
      else 'open'
    end
  ) order by source.position), '[]'::jsonb)
  into payment_queue
  from jsonb_array_elements(private.get_payment_review_queue())
    with ordinality as source(item, position);

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', item ->> 'booking_id',
    'camera_name', item ->> 'camera_name',
    'renter_legal_name', item ->> 'renter_legal_name',
    'pickup_at', item ->> 'pickup_at',
    'return_at', item ->> 'return_at',
    'accessory_count', (item ->> 'accessory_count')::integer
  ) order by source.position), '[]'::jsonb)
  into pickup_queue
  from jsonb_array_elements(private.get_pickup_queue())
    with ordinality as source(item, position);

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', item ->> 'booking_id',
    'camera_name', item ->> 'camera_name',
    'renter_legal_name', item ->> 'renter_legal_name',
    'renter_phone', item ->> 'renter_phone',
    'actual_pickup_at', item ->> 'actual_pickup_at',
    'expected_return_at', item ->> 'expected_return_at',
    'urgency', item ->> 'urgency'
  ) order by source.position), '[]'::jsonb)
  into active_rental_queue
  from jsonb_array_elements(private.get_active_rental_queue())
    with ordinality as source(item, position);

  with return_work as (
    select
      booking.id as booking_id,
      camera.name as camera_name,
      profile.legal_name as renter_legal_name,
      booking.state,
      booking.return_at as expected_return_at,
      handoff.actual_at as actual_return_at,
      case
        when booking.state = 'RETURN_REVIEW' then 'inspection_review'
        else 'awaiting_return'
      end as stage,
      case
        when booking.state = 'RETURN_REVIEW' then 'due_today'
        when booking.return_at < database_now then 'overdue'
        when (booking.return_at at time zone 'Asia/Manila')::date
          = (database_now at time zone 'Asia/Manila')::date then 'due_today'
        else 'upcoming'
      end as urgency
    from public.bookings as booking
    join public.cameras as camera on camera.id = booking.camera_id
    join public.profiles as profile on profile.user_id = booking.renter_id
    left join public.handoffs as handoff
      on handoff.booking_id = booking.id and handoff.type = 'return'
    where booking.state in ('ACTIVE', 'RETURN_REVIEW')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', booking_id,
    'camera_name', camera_name,
    'renter_legal_name', renter_legal_name,
    'booking_state', state,
    'expected_return_at', expected_return_at,
    'actual_return_at', actual_return_at,
    'stage', stage,
    'urgency', urgency
  ) order by expected_return_at, booking_id), '[]'::jsonb)
  into return_queue
  from return_work;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', item ->> 'booking_id',
    'camera_name', item ->> 'camera_name',
    'renter_legal_name', item ->> 'renter_legal_name',
    'actual_return_at', item ->> 'actual_return_at',
    'has_damage', (item ->> 'has_damage')::boolean,
    'has_missing_items', (item ->> 'has_missing_items')::boolean,
    'late_return', (item ->> 'late_return')::boolean,
    'evidence_count', (item ->> 'evidence_count')::integer
  ) order by source.position), '[]'::jsonb)
  into issue_queue
  from jsonb_array_elements(
    resolution_queues -> 'issue_queue'
  ) with ordinality as source(item, position);

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', booking.id,
    'camera_name', camera.name,
    'renter_legal_name', profile.legal_name,
    'held_amount', (outcome.value ->> 'held_amount')::numeric,
    'deduction_amount', (outcome.value ->> 'deduction_amount')::numeric,
    'refunded_amount', (outcome.value ->> 'refunded_amount')::numeric,
    'remaining_liability',
      (outcome.value ->> 'remaining_refund_liability')::numeric
  ) order by booking.return_at, booking.id), '[]'::jsonb)
  into held_deposit_queue
  from public.bookings as booking
  join public.cameras as camera on camera.id = booking.camera_id
  join public.profiles as profile on profile.user_id = booking.renter_id
  cross join lateral private.deposit_outcome_json(booking.id) as outcome(value)
  where booking.state not in ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED')
    and (outcome.value ->> 'remaining_refund_liability')::numeric > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', booking.id,
    'camera_name', camera.name,
    'renter_legal_name', profile.legal_name,
    'booking_state', booking.state,
    'held_amount', (outcome.value ->> 'held_amount')::numeric,
    'deduction_amount', (outcome.value ->> 'deduction_amount')::numeric,
    'refunded_amount', (outcome.value ->> 'refunded_amount')::numeric,
    'remaining_liability',
      (outcome.value ->> 'remaining_refund_liability')::numeric
  ) order by booking.updated_at, booking.id), '[]'::jsonb)
  into pending_refund_queue
  from public.bookings as booking
  join public.cameras as camera on camera.id = booking.camera_id
  join public.profiles as profile on profile.user_id = booking.renter_id
  cross join lateral private.deposit_outcome_json(booking.id) as outcome(value)
  where booking.state in ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED')
    and (outcome.value ->> 'remaining_refund_liability')::numeric > 0;

  -- Preserve the pre-booking privacy review workflow without including the
  -- submitted government-ID type or any evidence metadata on the dashboard.
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', item ->> 'record_id',
    'renter_legal_name', item ->> 'renter_legal_name',
    'submitted_at', item ->> 'submitted_at',
    'age_seconds', (item ->> 'age_seconds')::bigint
  ) order by source.position), '[]'::jsonb)
  into identity_review_queue
  from jsonb_array_elements(private.get_verification_review_queue())
    with ordinality as source(item, position);

  -- Cancellation reasons are intentionally available only on the audited
  -- booking detail, not in the broad dashboard response.
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id', item ->> 'request_id',
    'booking_id', item ->> 'booking_id',
    'booking_state', item ->> 'booking_state',
    'camera_name', item ->> 'camera_name',
    'renter_legal_name', item ->> 'renter_legal_name',
    'requested_at', item ->> 'requested_at',
    'acceptance_enabled', (item ->> 'acceptance_enabled')::boolean
  ) order by source.position), '[]'::jsonb)
  into cancellation_queue
  from jsonb_array_elements(
    resolution_queues -> 'cancellation_queue'
  ) with ordinality as source(item, position);

  with booking_liabilities as (
    select
      booking.state,
      (outcome.value ->> 'held_amount')::numeric as verified_deposit,
      (outcome.value ->> 'deduction_amount')::numeric as deduction,
      (outcome.value ->> 'refunded_amount')::numeric as refunded,
      (outcome.value ->> 'remaining_refund_liability')::numeric as remaining
    from public.bookings as booking
    cross join lateral private.deposit_outcome_json(booking.id) as outcome(value)
  )
  select jsonb_build_object(
    'currency', 'PHP',
    'verified_deposit_total', coalesce(sum(verified_deposit), 0),
    'approved_deduction_total', coalesce(sum(deduction), 0),
    'externally_refunded_total', coalesce(sum(refunded), 0),
    'remaining_liability_total', coalesce(sum(remaining), 0),
    'held_liability_total', coalesce(sum(remaining) filter (
      where state not in ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED')
    ), 0),
    'pending_refund_total', coalesce(sum(remaining) filter (
      where state in ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED')
    ), 0)
  ) into deposit_reconciliation
  from booking_liabilities;

  return jsonb_build_object(
    'generated_at', database_now,
    'time_zone', 'Asia/Manila',
    'queue_counts', jsonb_build_object(
      'review', jsonb_array_length(review_queue),
      'signature', jsonb_array_length(signature_queue),
      'payment', jsonb_array_length(payment_queue),
      'pickup', jsonb_array_length(pickup_queue),
      'active_rental', jsonb_array_length(active_rental_queue),
      'return', jsonb_array_length(return_queue),
      'issue_review', jsonb_array_length(issue_queue),
      'held_deposit', jsonb_array_length(held_deposit_queue),
      'pending_refund', jsonb_array_length(pending_refund_queue)
    ),
    'deposit_reconciliation', deposit_reconciliation,
    'supporting_queue_counts', jsonb_build_object(
      'identity_review', jsonb_array_length(identity_review_queue),
      'cancellation', jsonb_array_length(cancellation_queue)
    ),
    'supporting_queues', jsonb_build_object(
      'identity_review', identity_review_queue,
      'cancellation', cancellation_queue
    ),
    'queues', jsonb_build_object(
      'review', review_queue,
      'signature', signature_queue,
      'payment', payment_queue,
      'pickup', pickup_queue,
      'active_rental', active_rental_queue,
      'return', return_queue,
      'issue_review', issue_queue,
      'held_deposit', held_deposit_queue,
      'pending_refund', pending_refund_queue
    )
  );
end;
$$;
