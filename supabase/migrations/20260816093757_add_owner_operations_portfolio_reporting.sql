-- Sprint 7 gives the sole owner one database-owned operating surface and one
-- periodized portfolio report. Financial projections use verified immutable
-- allocations, including offsetting reversals, and never reinterpret deposits
-- or deposit resolution movements as rental revenue.

create index bookings_owner_review_queue_idx
on public.bookings (requested_at, id)
where state = 'FOR_REVIEW';

create index bookings_owner_contract_queue_idx
on public.bookings (approval_deadline_at, id)
where state = 'CONTRACT_PENDING';

create index bookings_owner_utilization_idx
on public.bookings (camera_id, pickup_at, return_at, id)
where state in (
  'CONFIRMED', 'ACTIVE', 'RETURN_REVIEW', 'ISSUE_REVIEW', 'COMPLETED'
);

create index payment_transactions_owner_review_idx
on public.payment_transactions (submitted_at, id)
where direction = 'incoming' and status = 'submitted';

create index payment_transactions_owner_reporting_idx
on public.payment_transactions (decided_at, id)
where status = 'verified';

create index payment_allocations_owner_reporting_idx
on public.payment_allocations (kind, transaction_id, booking_id);

create index availability_blocks_owner_reporting_idx
on public.availability_blocks (camera_id, kind, starts_at, ends_at);

-- A reversal must carry the exact same immutable allocation set as the
-- verified transaction it offsets. This permits legitimate incoming-payment
-- corrections while retaining the existing one-allocation refund lifecycle.
create function private.check_payment_allocation_balance(
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  allocation_count integer;
  allocation_total numeric(12,2);
  rental_total numeric(12,2);
  deposit_total numeric(12,2);
  refund_total numeric(12,2);
  reversal_mismatch boolean;
begin
  select * into payment
  from public.payment_transactions
  where id = p_transaction_id;

  if payment.id is null then
    return;
  end if;

  select
    count(*)::integer,
    coalesce(sum(amount), 0),
    coalesce(sum(amount) filter (where kind = 'rental_payment'), 0),
    coalesce(sum(amount) filter (where kind = 'security_deposit'), 0),
    coalesce(sum(amount) filter (where kind = 'deposit_refund'), 0)
  into
    allocation_count,
    allocation_total,
    rental_total,
    deposit_total,
    refund_total
  from public.payment_allocations
  where transaction_id = payment.id;

  if exists (
    select 1
    from public.payment_allocations as allocation
    where allocation.transaction_id = payment.id
      and allocation.booking_id <> payment.booking_id
  ) then
    raise exception 'payment allocations must use the transaction booking'
      using errcode = '23514';
  end if;

  if payment.status <> 'verified' and allocation_count <> 0 then
    raise exception 'unverified payments cannot have allocations'
      using errcode = '23514';
  end if;

  if payment.status <> 'verified' then
    return;
  end if;

  if payment.reversal_of is not null then
    select exists (
      select 1
      from public.payment_allocations as original
      full join public.payment_allocations as reversal
        on reversal.transaction_id = payment.id
       and reversal.kind = original.kind
      where original.transaction_id = payment.reversal_of
        and (
          reversal.id is null
          or reversal.booking_id is distinct from original.booking_id
          or reversal.amount is distinct from original.amount
        )
    ) or exists (
      select 1
      from public.payment_allocations as reversal
      where reversal.transaction_id = payment.id
        and not exists (
          select 1
          from public.payment_allocations as original
          where original.transaction_id = payment.reversal_of
            and original.kind = reversal.kind
            and original.booking_id = reversal.booking_id
            and original.amount = reversal.amount
        )
    ) into reversal_mismatch;

    if allocation_total <> payment.amount
      or allocation_count = 0
      or reversal_mismatch
    then
      raise exception 'verified reversal allocations must exactly offset the original allocations'
        using errcode = '23514';
    end if;
  elsif payment.direction = 'incoming' then
    select * into booking
    from public.bookings
    where id = payment.booking_id;

    if allocation_count <> 2
      or allocation_total <> payment.amount
      or rental_total <> booking.rental_amount
      or deposit_total <> booking.security_deposit_amount
      or refund_total <> 0
      or payment.amount <> booking.total_due
    then
      raise exception 'verified incoming payment allocations are not balanced'
        using errcode = '23514';
    end if;
  elsif allocation_count <> 1
    or allocation_total <> payment.amount
    or refund_total <> payment.amount
  then
    raise exception 'verified refund movements require one balanced deposit allocation'
      using errcode = '23514';
  end if;

  return;
end;
$$;

create or replace function private.validate_payment_allocations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id uuid;
begin
  if tg_table_name = 'payment_transactions' then
    target_transaction_id := coalesce(
      (to_jsonb(new) ->> 'id')::uuid,
      (to_jsonb(old) ->> 'id')::uuid
    );
  else
    target_transaction_id := coalesce(
      (to_jsonb(new) ->> 'transaction_id')::uuid,
      (to_jsonb(old) ->> 'transaction_id')::uuid
    );
  end if;

  perform private.check_payment_allocation_balance(target_transaction_id);
  return null;
end;
$$;

create or replace function private.assert_payment_allocation_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id uuid;
begin
  if tg_table_name = 'payment_transactions' then
    target_transaction_id := coalesce(
      (to_jsonb(new) ->> 'id')::uuid,
      (to_jsonb(old) ->> 'id')::uuid
    );
  else
    target_transaction_id := coalesce(
      (to_jsonb(new) ->> 'transaction_id')::uuid,
      (to_jsonb(old) ->> 'transaction_id')::uuid
    );
  end if;

  perform private.check_payment_allocation_balance(target_transaction_id);
  return null;
end;
$$;

-- Deposits are liabilities. A verified reversal of an incoming transfer
-- removes the original security-deposit allocation instead of leaving a
-- phantom balance behind.
create or replace function private.verified_deposit_held(p_booking_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case payment.direction when 'incoming' then allocation.amount
      else -allocation.amount end
  ), 0)::numeric(12,2)
  from public.payment_allocations as allocation
  join public.payment_transactions as payment
    on payment.id = allocation.transaction_id
  where allocation.booking_id = p_booking_id
    and allocation.kind = 'security_deposit'
    and payment.status = 'verified';
$$;

create function private.get_owner_operations_dashboard()
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
  deposit_reconciliation jsonb;
begin
  perform private.require_admin();

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
    private.get_resolution_queues() -> 'issue_queue'
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
    private.get_resolution_queues() -> 'cancellation_queue'
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

create function private.get_owner_portfolio_report(
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  period_start_at timestamptz;
  period_end_at timestamptz;
  result jsonb;
begin
  perform private.require_admin();

  if p_period_start is null
    or p_period_end is null
    or p_period_end <= p_period_start
  then
    raise exception 'portfolio_period_must_be_a_nonempty_half_open_date_range'
      using errcode = '22023';
  end if;

  period_start_at := p_period_start::timestamp at time zone 'Asia/Manila';
  period_end_at := p_period_end::timestamp at time zone 'Asia/Manila';

  with
  period_revenue as (
    select
      booking.camera_id,
      coalesce(sum(case payment.direction
        when 'incoming' then allocation.amount
        else -allocation.amount
      end), 0)::numeric(12,2) as amount
    from public.payment_transactions as payment
    join public.payment_allocations as allocation
      on allocation.transaction_id = payment.id
     and allocation.kind = 'rental_payment'
    join public.bookings as booking on booking.id = allocation.booking_id
    where payment.status = 'verified'
      and payment.decided_at >= period_start_at
      and payment.decided_at < period_end_at
    group by booking.camera_id
  ),
  lifetime_revenue as (
    select
      booking.camera_id,
      coalesce(sum(case payment.direction
        when 'incoming' then allocation.amount
        else -allocation.amount
      end), 0)::numeric(12,2) as amount
    from public.payment_transactions as payment
    join public.payment_allocations as allocation
      on allocation.transaction_id = payment.id
     and allocation.kind = 'rental_payment'
    join public.bookings as booking on booking.id = allocation.booking_id
    where payment.status = 'verified'
    group by booking.camera_id
  ),
  camera_windows as (
    select
      camera.*,
      greatest(period_start_at, camera.created_at) as window_start,
      least(
        period_end_at,
        coalesce(camera.archived_at, period_end_at)
      ) as window_end
    from public.cameras as camera
  ),
  rental_ranges as (
    select
      booking.camera_id,
      range_agg(tstzrange(
        greatest(booking.pickup_at, camera.window_start),
        least(booking.return_at, camera.window_end),
        '[)'
      )) as periods
    from public.bookings as booking
    join camera_windows as camera on camera.id = booking.camera_id
    where booking.state in (
      'CONFIRMED', 'ACTIVE', 'RETURN_REVIEW', 'ISSUE_REVIEW', 'COMPLETED'
    )
      and camera.window_start < camera.window_end
      and booking.pickup_at < camera.window_end
      and booking.return_at > camera.window_start
    group by booking.camera_id
  ),
  rental_seconds as (
    select
      rental.camera_id,
      coalesce(sum(extract(epoch from upper(item.period) - lower(item.period))), 0)
        as seconds
    from rental_ranges as rental
    cross join lateral unnest(rental.periods) as item(period)
    group by rental.camera_id
  ),
  unavailability_ranges as (
    select
      block.camera_id,
      block.kind,
      range_agg(tstzrange(
        greatest(block.starts_at, camera.window_start),
        least(
          block.ends_at,
          coalesce(block.released_at, block.ends_at),
          camera.window_end
        ),
        '[)'
      )) as periods
    from public.availability_blocks as block
    join camera_windows as camera on camera.id = block.camera_id
    where block.kind in ('maintenance', 'manual')
      and camera.window_start < camera.window_end
      and block.starts_at < camera.window_end
      and least(
        block.ends_at,
        coalesce(block.released_at, block.ends_at),
        camera.window_end
      ) > greatest(block.starts_at, camera.window_start)
    group by block.camera_id, block.kind
  ),
  unavailability_seconds as (
    select
      blocked.camera_id,
      blocked.kind,
      coalesce(sum(extract(epoch from upper(item.period) - lower(item.period))), 0)
        as seconds
    from unavailability_ranges as blocked
    cross join lateral unnest(blocked.periods) as item(period)
    group by blocked.camera_id, blocked.kind
  ),
  camera_metrics as (
    select
      camera.id,
      camera.name,
      camera.status,
      camera.created_at,
      camera.archived_at,
      greatest(
        extract(epoch from camera.window_end - camera.window_start),
        0
      )::bigint as inventory_window_seconds,
      coalesce(revenue.amount, 0)::numeric(12,2)
        as period_net_verified_rental_revenue,
      coalesce(lifetime.amount, 0)::numeric(12,2)
        as lifetime_net_verified_rental_revenue,
      least(
        coalesce(rental.seconds, 0),
        greatest(
          extract(epoch from camera.window_end - camera.window_start),
          0
        )
      )::bigint as rental_utilized_seconds,
      coalesce(maintenance.seconds, 0)::bigint as maintenance_seconds,
      coalesce(manual.seconds, 0)::bigint as manual_unavailable_seconds,
      camera.acquisition_cost
    from camera_windows as camera
    left join period_revenue as revenue on revenue.camera_id = camera.id
    left join lifetime_revenue as lifetime on lifetime.camera_id = camera.id
    left join rental_seconds as rental on rental.camera_id = camera.id
    left join unavailability_seconds as maintenance
      on maintenance.camera_id = camera.id and maintenance.kind = 'maintenance'
    left join unavailability_seconds as manual
      on manual.camera_id = camera.id and manual.kind = 'manual'
  ),
  camera_rows as (
    select jsonb_build_object(
      'camera_id', camera.id,
      'camera_name', camera.name,
      'camera_status', camera.status,
      'created_at', camera.created_at,
      'archived_at', camera.archived_at,
      'currency', 'PHP',
      'period_net_verified_rental_revenue',
        camera.period_net_verified_rental_revenue,
      'inventory_window_seconds', camera.inventory_window_seconds,
      'rental_utilized_seconds', camera.rental_utilized_seconds,
      'rental_utilization_percent', case
        when camera.inventory_window_seconds = 0 then null
        else round(
          camera.rental_utilized_seconds::numeric
            / camera.inventory_window_seconds::numeric * 100,
          2
        )
      end,
      'maintenance_seconds', camera.maintenance_seconds,
      'manual_unavailable_seconds', camera.manual_unavailable_seconds,
      'acquisition_cost', camera.acquisition_cost,
      'lifetime_net_verified_rental_revenue',
        camera.lifetime_net_verified_rental_revenue,
      'cost_recovery', case
        when camera.acquisition_cost is null or camera.acquisition_cost = 0
          then jsonb_build_object(
            'status', 'unavailable',
            'recovered_amount', null,
            'remaining_amount', null,
            'recovery_percent', null
          )
        else jsonb_build_object(
          'status', 'available',
          'recovered_amount', least(
            greatest(camera.lifetime_net_verified_rental_revenue, 0),
            camera.acquisition_cost
          ),
          'remaining_amount', greatest(
            camera.acquisition_cost
              - greatest(camera.lifetime_net_verified_rental_revenue, 0),
            0
          ),
          'recovery_percent', round(
            least(
              greatest(camera.lifetime_net_verified_rental_revenue, 0),
              camera.acquisition_cost
            ) / camera.acquisition_cost * 100,
            2
          )
        )
      end
    ) as value
    from camera_metrics as camera
    order by camera.name, camera.id
  ),
  portfolio as (
    select
      count(*)::integer as camera_count,
      coalesce(sum(period_net_verified_rental_revenue), 0)::numeric(12,2)
        as period_revenue,
      coalesce(sum(inventory_window_seconds), 0)::bigint as window_seconds,
      coalesce(sum(rental_utilized_seconds), 0)::bigint as rental_seconds,
      coalesce(sum(maintenance_seconds), 0)::bigint as maintenance_seconds,
      coalesce(sum(manual_unavailable_seconds), 0)::bigint as manual_seconds
    from camera_metrics
  )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'start_date', p_period_start,
      'end_date_exclusive', p_period_end,
      'start_at', period_start_at,
      'end_at_exclusive', period_end_at,
      'time_zone', 'Asia/Manila',
      'bounds', '[)'
    ),
    'methodology', jsonb_build_object(
      'revenue_event', 'verified_payment_decided_at',
      'revenue_allocation', 'rental_payment_only',
      'utilization_interval', 'scheduled_booking_pickup_to_return',
      'utilization_states', jsonb_build_array(
        'CONFIRMED', 'ACTIVE', 'RETURN_REVIEW', 'ISSUE_REVIEW', 'COMPLETED'
      ),
      'overlap_rule', 'range_union_before_duration',
      'inventory_window', 'camera_created_at_to_archived_at'
    ),
    'portfolio', jsonb_build_object(
      'currency', 'PHP',
      'camera_count', portfolio.camera_count,
      'period_net_verified_rental_revenue', portfolio.period_revenue,
      'inventory_window_seconds', portfolio.window_seconds,
      'rental_utilized_seconds', portfolio.rental_seconds,
      'rental_utilization_percent', case
        when portfolio.window_seconds = 0 then null
        else round(
          portfolio.rental_seconds::numeric
            / portfolio.window_seconds::numeric * 100,
          2
        )
      end,
      'maintenance_seconds', portfolio.maintenance_seconds,
      'manual_unavailable_seconds', portfolio.manual_seconds
    ),
    'cameras', coalesce(
      (select jsonb_agg(value) from camera_rows),
      '[]'::jsonb
    )
  ) into result
  from portfolio;

  return result;
end;
$$;

create function api.get_owner_operations_dashboard()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_owner_operations_dashboard(); $$;

create function api.get_owner_portfolio_report(
  p_period_start date,
  p_period_end date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_owner_portfolio_report(p_period_start, p_period_end);
$$;

revoke execute on function private.get_owner_operations_dashboard()
from public, anon, authenticated, service_role;
revoke execute on function private.get_owner_portfolio_report(date, date)
from public, anon, authenticated, service_role;
revoke execute on function private.check_payment_allocation_balance(uuid)
from public, anon, authenticated, service_role;
revoke execute on function api.get_owner_operations_dashboard()
from public, anon, authenticated, service_role;
revoke execute on function api.get_owner_portfolio_report(date, date)
from public, anon, authenticated, service_role;

grant execute on function private.get_owner_operations_dashboard()
to authenticated;
grant execute on function private.get_owner_portfolio_report(date, date)
to authenticated;
grant execute on function api.get_owner_operations_dashboard()
to authenticated;
grant execute on function api.get_owner_portfolio_report(date, date)
to authenticated;

comment on function api.get_owner_operations_dashboard() is
  'Sole-admin, minimal operational projection for the nine authoritative rental work queues and reversal-aware deposit liability reconciliation.';
comment on function api.get_owner_portfolio_report(date, date) is
  'Sole-admin Manila half-open period report for reversal-aware verified rental revenue, unioned utilization, per-camera attribution, and private acquisition-cost recovery.';
