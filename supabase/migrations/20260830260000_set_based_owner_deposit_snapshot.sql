create function private.get_owner_deposit_dashboard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  with verified_deposits as materialized (
    select
      allocation.booking_id,
      coalesce(sum(
        case payment.direction
          when 'incoming' then allocation.amount
          else -allocation.amount
        end
      ), 0)::numeric(12,2) as held_amount
    from public.payment_allocations as allocation
    join public.payment_transactions as payment
      on payment.id = allocation.transaction_id
    where allocation.kind = 'security_deposit'
      and payment.status = 'verified'
    group by allocation.booking_id
  ),
  deductions as materialized (
    select
      deduction.booking_id,
      coalesce(sum(deduction.amount), 0)::numeric(12,2) as deduction_amount
    from public.deposit_deductions as deduction
    group by deduction.booking_id
  ),
  refunds as materialized (
    select
      record.booking_id,
      coalesce(sum(
        case record.entry_kind
          when 'refund' then record.amount
          else -record.amount
        end
      ), 0)::numeric(12,2) as refunded_amount
    from public.deposit_refund_records as record
    group by record.booking_id
  ),
  booking_liabilities as materialized (
    select
      booking.id as booking_id,
      booking.state,
      booking.return_at,
      booking.updated_at,
      camera.name as camera_name,
      profile.legal_name as renter_legal_name,
      coalesce(deposit.held_amount, 0)::numeric(12,2) as held_amount,
      coalesce(deduction.deduction_amount, 0)::numeric(12,2)
        as deduction_amount,
      coalesce(refund.refunded_amount, 0)::numeric(12,2) as refunded_amount,
      (
        coalesce(deposit.held_amount, 0)
        - coalesce(deduction.deduction_amount, 0)
        - coalesce(refund.refunded_amount, 0)
      )::numeric(12,2) as ledger_balance
    from public.bookings as booking
    join public.cameras as camera on camera.id = booking.camera_id
    join public.profiles as profile on profile.user_id = booking.renter_id
    left join verified_deposits as deposit on deposit.booking_id = booking.id
    left join deductions as deduction on deduction.booking_id = booking.id
    left join refunds as refund on refund.booking_id = booking.id
  )
  select jsonb_build_object(
    'ledger_overdrawn', exists (
      select 1
      from booking_liabilities
      where ledger_balance < 0
    ),
    'held_deposit_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', liability.booking_id,
        'camera_name', liability.camera_name,
        'renter_legal_name', liability.renter_legal_name,
        'held_amount', liability.held_amount,
        'deduction_amount', liability.deduction_amount,
        'refunded_amount', liability.refunded_amount,
        'remaining_liability', greatest(liability.ledger_balance, 0)
      ) order by liability.return_at, liability.booking_id)
      from booking_liabilities as liability
      where liability.state not in (
        'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'
      )
        and liability.ledger_balance > 0
    ), '[]'::jsonb),
    'pending_refund_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', liability.booking_id,
        'camera_name', liability.camera_name,
        'renter_legal_name', liability.renter_legal_name,
        'booking_state', liability.state,
        'held_amount', liability.held_amount,
        'deduction_amount', liability.deduction_amount,
        'refunded_amount', liability.refunded_amount,
        'remaining_liability', greatest(liability.ledger_balance, 0)
      ) order by liability.updated_at, liability.booking_id)
      from booking_liabilities as liability
      where liability.state in (
        'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'
      )
        and liability.ledger_balance > 0
    ), '[]'::jsonb),
    'deposit_reconciliation', (
      select jsonb_build_object(
        'currency', 'PHP',
        'verified_deposit_total', coalesce(sum(held_amount), 0),
        'approved_deduction_total', coalesce(sum(deduction_amount), 0),
        'externally_refunded_total', coalesce(sum(refunded_amount), 0),
        'remaining_liability_total',
          coalesce(sum(greatest(ledger_balance, 0)), 0),
        'held_liability_total', coalesce(sum(greatest(ledger_balance, 0))
          filter (where state not in (
            'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'
          )), 0),
        'pending_refund_total', coalesce(sum(greatest(ledger_balance, 0))
          filter (where state in (
            'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'
          )), 0)
      )
      from booking_liabilities
    )
  )
  into result;

  return result;
end;
$$;

revoke execute on function private.get_owner_deposit_dashboard_snapshot()
from public, anon, authenticated;

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
  deposit_snapshot jsonb;
  deposit_reconciliation jsonb;
begin
  perform private.require_admin();

  -- The dashboard consumes two slices of this projection. Compute the full
  -- resolution workload once so both slices share one statement snapshot.
  resolution_queues := private.get_resolution_queues();
  deposit_snapshot := private.get_owner_deposit_dashboard_snapshot();

  if (deposit_snapshot ->> 'ledger_overdrawn')::boolean then
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

  held_deposit_queue := deposit_snapshot -> 'held_deposit_queue';

  pending_refund_queue := deposit_snapshot -> 'pending_refund_queue';

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

  deposit_reconciliation := deposit_snapshot -> 'deposit_reconciliation';

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
