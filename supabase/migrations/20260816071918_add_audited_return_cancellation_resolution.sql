-- Sprint 6 replaces the dormant return, cancellation, deposit, and refund
-- scaffolds with one audited resolution lifecycle. PostgreSQL owns actor and
-- state checks, exact return facts, append-only issue decisions, deposit
-- liability reconciliation, external-refund records, and immutable reversals.

-- A prior broad operation did not persist enough evidence to reconstruct the
-- new decision-linked history safely. Refuse to reinterpret any such durable
-- outcome before changing the old API; a rollout that encounters one needs a
-- separately reviewed mapping migration based on the real source records.
do $$
begin
  if exists (
    select 1
    from public.booking_cancellation_requests
    where disposition <> 'pending'
  ) or exists (
    select 1
    from public.deposit_settlements
    where refund_amount <> 0 or deduction_amount <> 0
  ) or exists (
    select 1
    from public.payment_transactions
    where direction = 'outgoing'
  ) then
    raise exception 'legacy_resolution_history_requires_reviewed_mapping'
      using errcode = '0A000';
  end if;
end;
$$;

drop function if exists api.request_cancellation(uuid, text);
drop function if exists private.request_cancellation(uuid, text);
drop function if exists api.decide_cancellation(uuid, boolean, text);
drop function if exists private.decide_cancellation(uuid, boolean, text);
drop function if exists api.record_return(uuid, timestamptz, text, jsonb, boolean, boolean, text);
drop function if exists private.record_return(uuid, timestamptz, text, jsonb, boolean, boolean, text);
drop function if exists api.decide_return_review(uuid, boolean, text);
drop function if exists private.decide_return_review(uuid, boolean, text);
drop function if exists api.complete_issue_review(uuid, text);
drop function if exists private.complete_issue_review(uuid, text);
drop function if exists api.record_refund(uuid, numeric, text, text);
drop function if exists private.record_refund(uuid, numeric, text, text);
drop function if exists api.finalize_deposit_settlement(uuid, numeric, numeric, text, uuid);
drop function if exists private.finalize_deposit_settlement(uuid, numeric, numeric, text, uuid);

alter table public.booking_cancellation_requests
  add column operation_id uuid;

create unique index booking_cancellation_requests_operation_id_idx
on public.booking_cancellation_requests (operation_id)
where operation_id is not null;

alter table public.deposit_settlements
  add column issue_decision_id uuid,
  add column operation_id uuid;

create unique index deposit_settlements_operation_id_idx
on public.deposit_settlements (operation_id)
where operation_id is not null;

alter table private.condition_photo_upload_intents
  add column supersedes_photo_id uuid
    references public.condition_photos (id) on delete restrict;

create table public.return_issue_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  condition_report_id uuid not null
    references public.condition_reports (id) on delete restrict,
  note text not null check (length(btrim(note)) between 2 and 2000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  operation_id uuid not null unique
);

create index return_issue_notes_booking_created_idx
on public.return_issue_notes (booking_id, created_at, id);

create table public.return_issue_decisions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique
    references public.bookings (id) on delete restrict,
  condition_report_id uuid not null
    references public.condition_reports (id) on delete restrict,
  decision_kind text not null check (
    decision_kind in ('damage', 'missing_item', 'late_return', 'mixed', 'other')
  ),
  deduction_amount numeric(12,2) not null check (deduction_amount >= 0),
  internal_reason text not null
    check (length(btrim(internal_reason)) between 2 and 2000),
  customer_explanation text not null
    check (length(btrim(customer_explanation)) between 2 and 500),
  decided_by uuid not null references auth.users (id) on delete restrict,
  decided_at timestamptz not null default statement_timestamp(),
  operation_id uuid not null unique
);

create index return_issue_decisions_report_idx
on public.return_issue_decisions (condition_report_id);

create table public.deposit_deductions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  issue_decision_id uuid not null unique
    references public.return_issue_decisions (id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reason_snapshot text not null
    check (length(btrim(reason_snapshot)) between 2 and 2000),
  recorded_by uuid not null references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default statement_timestamp(),
  operation_id uuid not null unique
);

create index deposit_deductions_booking_idx
on public.deposit_deductions (booking_id, recorded_at, id);

create table public.deposit_refund_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  transaction_id uuid not null unique
    references public.payment_transactions (id) on delete restrict,
  entry_kind text not null check (entry_kind in ('refund', 'reversal')),
  amount numeric(12,2) not null check (amount > 0),
  external_moved_at timestamptz not null,
  reversal_of uuid references public.deposit_refund_records (id) on delete restrict,
  reversal_reason text,
  recorded_by uuid not null references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default statement_timestamp(),
  operation_id uuid not null unique,
  check (
    (entry_kind = 'refund' and reversal_of is null and reversal_reason is null)
    or (
      entry_kind = 'reversal'
      and reversal_of is not null
      and length(btrim(reversal_reason)) between 2 and 1000
    )
  )
);

create unique index deposit_refund_records_one_reversal_idx
on public.deposit_refund_records (reversal_of)
where reversal_of is not null;

create index deposit_refund_records_booking_idx
on public.deposit_refund_records (booking_id, recorded_at, id);

create table public.cancellation_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique
    references public.booking_cancellation_requests (id) on delete restrict,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  outcome text not null check (outcome in ('accepted', 'declined')),
  booking_state_at_decision public.booking_state not null,
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),
  refund_liability_amount numeric(12,2) not null default 0
    check (refund_liability_amount >= 0),
  reason text not null check (length(btrim(reason)) between 2 and 1000),
  decided_by uuid not null references auth.users (id) on delete restrict,
  decided_at timestamptz not null default statement_timestamp(),
  operation_id uuid not null unique,
  check (
    outcome = 'accepted'
    or (fee_amount = 0 and refund_liability_amount = 0)
  )
);

create index cancellation_decisions_booking_idx
on public.cancellation_decisions (booking_id, decided_at, id);

alter table public.deposit_settlements
  add constraint deposit_settlements_issue_decision_id_fkey
  foreign key (issue_decision_id)
  references public.return_issue_decisions (id)
  on delete restrict;

alter table public.return_issue_notes enable row level security;
alter table public.return_issue_decisions enable row level security;
alter table public.deposit_deductions enable row level security;
alter table public.deposit_refund_records enable row level security;
alter table public.cancellation_decisions enable row level security;

revoke all on public.return_issue_notes from anon, authenticated;
revoke all on public.return_issue_decisions from anon, authenticated;
revoke all on public.deposit_deductions from anon, authenticated;
revoke all on public.deposit_refund_records from anon, authenticated;
revoke all on public.cancellation_decisions from anon, authenticated;
revoke all on public.deposit_settlements from anon, authenticated;
revoke all on public.booking_cancellation_requests from anon, authenticated;

-- Preserve the established owner/admin read contract on these two legacy
-- tables; their existing RLS policies still enforce ownership and sole-admin
-- access. Every new Sprint 6 record remains RPC-only.
grant select on public.deposit_settlements to authenticated;
grant select on public.booking_cancellation_requests to authenticated;

create trigger return_issue_notes_append_only
before update or delete on public.return_issue_notes
for each row execute function private.reject_update_or_delete();

create trigger return_issue_decisions_append_only
before update or delete on public.return_issue_decisions
for each row execute function private.reject_update_or_delete();

create trigger deposit_deductions_append_only
before update or delete on public.deposit_deductions
for each row execute function private.reject_update_or_delete();

create trigger deposit_refund_records_append_only
before update or delete on public.deposit_refund_records
for each row execute function private.reject_update_or_delete();

create trigger cancellation_decisions_append_only
before update or delete on public.cancellation_decisions
for each row execute function private.reject_update_or_delete();

create function private.resolution_text_has_forbidden_characters(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
    or p_value ~ '[[:cntrl:]]'
    or strpos(p_value, chr(8203)) > 0
    or strpos(p_value, chr(8204)) > 0
    or strpos(p_value, chr(8205)) > 0
    or strpos(p_value, chr(8288)) > 0
    or strpos(p_value, chr(65279)) > 0;
$$;

create function private.verified_deposit_held(p_booking_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(allocation.amount), 0)::numeric(12,2)
  from public.payment_allocations as allocation
  join public.payment_transactions as payment
    on payment.id = allocation.transaction_id
  where allocation.booking_id = p_booking_id
    and allocation.kind = 'security_deposit'
    and payment.direction = 'incoming'
    and payment.status = 'verified'
    and payment.reversal_of is null;
$$;

create function private.deposit_deduction_total(p_booking_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(deduction.amount), 0)::numeric(12,2)
  from public.deposit_deductions as deduction
  where deduction.booking_id = p_booking_id;
$$;

create function private.net_refund_total(p_booking_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case record.entry_kind when 'refund' then record.amount else -record.amount end
  ), 0)::numeric(12,2)
  from public.deposit_refund_records as record
  where record.booking_id = p_booking_id;
$$;

create function private.replace_deposit_settlement(
  p_booking_id uuid,
  p_issue_decision_id uuid,
  p_operation_id uuid,
  p_actor uuid
)
returns public.deposit_settlements
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_settlement public.deposit_settlements%rowtype;
  created public.deposit_settlements%rowtype;
  held numeric(12,2) := private.verified_deposit_held(p_booking_id);
  deducted numeric(12,2) := private.deposit_deduction_total(p_booking_id);
  refunded numeric(12,2) := private.net_refund_total(p_booking_id);
  latest_refund_transaction_id uuid;
  deduction_reason text;
begin
  if p_booking_id is null or p_operation_id is null or p_actor is null then
    raise exception 'deposit_settlement_input_invalid' using errcode = '22023';
  end if;
  if deducted < 0 or refunded < 0 or deducted + refunded > held then
    raise exception 'deposit_liability_does_not_reconcile' using errcode = '23514';
  end if;

  select * into current_settlement
  from public.deposit_settlements
  where booking_id = p_booking_id
    and status in ('pending', 'final')
  for update;

  if current_settlement.operation_id = p_operation_id then
    return current_settlement;
  end if;

  select transaction_id into latest_refund_transaction_id
  from public.deposit_refund_records
  where booking_id = p_booking_id and entry_kind = 'refund'
  order by recorded_at desc, id desc
  limit 1;

  select internal_reason into deduction_reason
  from public.return_issue_decisions
  where id = p_issue_decision_id;

  if current_settlement.id is not null then
    update public.deposit_settlements
    set status = 'reversed'
    where id = current_settlement.id;
  end if;

  insert into public.deposit_settlements (
    booking_id,
    held_amount,
    refund_amount,
    deduction_amount,
    deduction_reason,
    status,
    decided_at,
    decided_by,
    refund_transaction_id,
    supersedes_id,
    issue_decision_id,
    operation_id
  ) values (
    p_booking_id,
    held,
    refunded,
    deducted,
    case when deducted > 0 then deduction_reason end,
    case
      when held = refunded + deducted
        then 'final'::public.deposit_settlement_status
      else 'pending'::public.deposit_settlement_status
    end,
    statement_timestamp(),
    p_actor,
    latest_refund_transaction_id,
    current_settlement.id,
    p_issue_decision_id,
    p_operation_id
  ) returning * into created;

  return created;
end;
$$;

alter table public.payment_transactions
  drop constraint payment_transactions_sprint4_incoming_facts_check;

alter table public.payment_transactions
  add constraint payment_transactions_sprint4_incoming_facts_check check (
    direction <> 'incoming'
    or reversal_of is not null
    or (
      submission_attempt_id is not null
      and contract_version_id is not null
      and recipient_config_version is not null
      and nullif(btrim(recipient_name_snapshot), '') is not null
      and nullif(btrim(recipient_account_snapshot), '') is not null
      and length(reference_canonical) between 4 and 64
    )
  ) not valid;

create or replace function private.guard_payment_transaction_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payment transactions are append-only' using errcode = '55000';
  end if;

  if old.direction <> 'incoming'
    or old.reversal_of is not null
    or old.status <> 'submitted'
    or new.status not in ('verified', 'rejected')
    or nullif(current_setting('camnook.payment_operation_id', true), '') is null
    or old.id is distinct from new.id
    or old.booking_id is distinct from new.booking_id
    or old.direction is distinct from new.direction
    or old.method is distinct from new.method
    or old.amount is distinct from new.amount
    or old.currency is distinct from new.currency
    or old.reference is distinct from new.reference
    or old.counterparty_display_name is distinct from new.counterparty_display_name
    or old.submitted_at is distinct from new.submitted_at
    or old.submitted_by is distinct from new.submitted_by
    or old.reversal_of is distinct from new.reversal_of
    or old.submission_attempt_id is distinct from new.submission_attempt_id
    or old.contract_version_id is distinct from new.contract_version_id
    or old.recipient_config_version is distinct from new.recipient_config_version
    or old.recipient_name_snapshot is distinct from new.recipient_name_snapshot
    or old.recipient_account_snapshot is distinct from new.recipient_account_snapshot
    or old.supersedes_id is distinct from new.supersedes_id
    or old.decided_at is not null
    or old.decided_by is not null
    or new.decided_at is null
    or new.decided_by is null
    or (
      new.status = 'verified'
      and (new.rejection_reason is not null or new.rejection_reason_code is not null)
    )
    or (
      new.status = 'rejected'
      and (
        new.rejection_reason_code is null
        or new.rejection_reason is distinct from new.rejection_reason_code
      )
    )
  then
    raise exception 'submitted payment facts and final decisions are immutable'
      using errcode = '55000';
  end if;

  return new;
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
  payment public.payment_transactions%rowtype;
  allocation_count integer;
  allocation_total numeric(12,2);
  refund_allocation_total numeric(12,2);
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

  select * into payment
  from public.payment_transactions
  where id = target_transaction_id;
  if payment.id is null then
    return null;
  end if;

  select
    count(*)::integer,
    coalesce(sum(amount), 0),
    coalesce(sum(amount) filter (where kind = 'deposit_refund'), 0)
  into allocation_count, allocation_total, refund_allocation_total
  from public.payment_allocations
  where transaction_id = payment.id;

  if payment.status <> 'verified' and allocation_count <> 0 then
    raise exception 'unverified payments cannot have allocations'
      using errcode = '23514';
  end if;

  if payment.status = 'verified'
    and (payment.direction = 'outgoing' or payment.reversal_of is not null)
    and (
      allocation_count <> 1
      or allocation_total <> payment.amount
      or refund_allocation_total <> payment.amount
    )
  then
    raise exception 'verified refund movements require one balanced deposit allocation'
      using errcode = '23514';
  end if;

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
  payment public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  allocation_count integer;
  allocation_total numeric(12,2);
  rental_total numeric(12,2);
  deposit_total numeric(12,2);
  refund_total numeric(12,2);
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

  select * into payment
  from public.payment_transactions
  where id = target_transaction_id;
  if payment.id is null then
    return null;
  end if;

  select
    count(*)::integer,
    coalesce(sum(amount), 0),
    coalesce(sum(amount) filter (where kind = 'rental_payment'), 0),
    coalesce(sum(amount) filter (where kind = 'security_deposit'), 0),
    coalesce(sum(amount) filter (where kind = 'deposit_refund'), 0)
  into allocation_count, allocation_total, rental_total, deposit_total, refund_total
  from public.payment_allocations
  where transaction_id = payment.id;

  if payment.direction = 'incoming'
    and payment.status = 'verified'
    and payment.reversal_of is null
  then
    select * into booking from public.bookings where id = payment.booking_id;
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
  elsif payment.status = 'verified'
    and (payment.direction = 'outgoing' or payment.reversal_of is not null)
  then
    if allocation_count <> 1
      or allocation_total <> payment.amount
      or refund_total <> payment.amount
    then
      raise exception 'verified refund movements are not balanced'
        using errcode = '23514';
    end if;
  elsif payment.status <> 'verified' and allocation_count <> 0 then
    raise exception 'unverified payments cannot have allocations'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create function private.request_cancellation(
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

create function private.decide_cancellation(
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

create function private.record_return(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_camera_serial text,
  p_condition_summary text,
  p_accessory_results jsonb,
  p_camera_has_damage boolean,
  p_notes text,
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
  version public.contract_versions%rowtype;
  pickup public.handoffs%rowtype;
  existing_handoff public.handoffs%rowtype;
  expected_accessories jsonb;
  recorded_accessories jsonb;
  expected_count integer;
  has_missing_items boolean;
  has_damage boolean;
  handoff_id uuid;
  report_id uuid;
begin
  if p_booking_id is null
    or p_actual_at is null
    or p_operation_id is null
    or p_camera_serial is null
    or nullif(btrim(p_camera_serial), '') is null
    or length(btrim(p_camera_serial)) > 160
    or private.resolution_text_has_forbidden_characters(p_camera_serial)
    or p_condition_summary is null
    or length(btrim(p_condition_summary)) not between 2 and 2000
    or private.resolution_text_has_forbidden_characters(p_condition_summary)
    or p_accessory_results is null
    or jsonb_typeof(p_accessory_results) <> 'array'
    or p_camera_has_damage is null
    or (
      p_notes is not null
      and nullif(btrim(p_notes), '') is not null
      and (
        length(btrim(p_notes)) > 2000
        or private.resolution_text_has_forbidden_characters(p_notes)
      )
    )
  then
    raise exception 'return_checklist_invalid' using errcode = '22023';
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null then
    raise exception 'return_booking_not_found' using errcode = 'P0002';
  end if;

  select * into existing_handoff
  from public.handoffs
  where booking_id = booking.id
    and type = 'return'
    and operation_id = p_operation_id;
  if existing_handoff.id is not null then
    select report.id into report_id
    from public.condition_reports as report
    where report.handoff_id = existing_handoff.id;
    return jsonb_build_object(
      'booking_id', booking.id,
      'booking_state', booking.state,
      'handoff_id', existing_handoff.id,
      'condition_report_id', report_id,
      'created', false
    );
  end if;

  if booking.state <> 'ACTIVE' then
    raise exception 'return_stale_booking_state' using errcode = '40001';
  end if;

  select * into pickup
  from public.handoffs
  where booking_id = booking.id and type = 'pickup'
  for share;
  select * into version
  from public.contract_versions
  where id = booking.current_contract_version_id
    and booking_id = booking.id
    and status = 'issued'
  for share;

  if pickup.id is null
    or version.id is null
    or p_actual_at < pickup.actual_at
    or p_actual_at > clock_timestamp()
  then
    raise exception 'return_actual_time_or_contract_invalid' using errcode = '23514';
  end if;
  if btrim(p_camera_serial) <> version.snapshot #>> '{camera,serial_number}' then
    raise exception 'return_camera_serial_mismatch' using errcode = '23514';
  end if;

  expected_accessories := coalesce(
    version.snapshot #> '{camera,accessories}',
    '[]'::jsonb
  );
  if jsonb_typeof(expected_accessories) <> 'array' then
    raise exception 'return_contract_accessories_invalid' using errcode = '23514';
  end if;
  expected_count := jsonb_array_length(expected_accessories);

  if jsonb_array_length(p_accessory_results) <> expected_count
    or exists (
      select 1
      from jsonb_array_elements(p_accessory_results) as observed(item)
      where jsonb_typeof(observed.item) <> 'object'
        or not (observed.item ? 'id' and observed.item ? 'status')
        or observed.item - array['id', 'status']::text[] <> '{}'::jsonb
        or observed.item ->> 'status' not in ('returned', 'missing', 'damaged')
    )
    or (
      select count(distinct (observed.item ->> 'id')::uuid)
      from jsonb_array_elements(p_accessory_results) as observed(item)
    ) <> expected_count
    or exists (
      select 1
      from jsonb_array_elements(expected_accessories) as expected(item)
      where not exists (
        select 1
        from jsonb_array_elements(p_accessory_results) as observed(item)
        where (observed.item ->> 'id')::uuid = (expected.item ->> 'id')::uuid
      )
    )
  then
    raise exception 'return_accessory_checklist_invalid' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(
    expected.item || jsonb_build_object(
      'return_status', observed.item ->> 'status'
    ) order by expected.ordinal
  ), '[]'::jsonb)
  into recorded_accessories
  from jsonb_array_elements(expected_accessories) with ordinality
    as expected(item, ordinal)
  join jsonb_array_elements(p_accessory_results) as observed(item)
    on (observed.item ->> 'id')::uuid = (expected.item ->> 'id')::uuid;

  select
    coalesce(bool_or(observed.item ->> 'status' = 'missing'), false),
    p_camera_has_damage
      or coalesce(bool_or(observed.item ->> 'status' = 'damaged'), false)
  into has_missing_items, has_damage
  from jsonb_array_elements(p_accessory_results) as observed(item);

  insert into public.handoffs (
    booking_id,
    type,
    conducted_by,
    named_renter_present,
    original_id_checked,
    original_id_matched,
    camera_serial_checked,
    accessory_checklist_completed,
    actual_at,
    notes,
    operation_id,
    contract_version_id,
    payment_transaction_id
  ) values (
    booking.id,
    'return',
    caller,
    null,
    null,
    null,
    true,
    true,
    p_actual_at,
    nullif(btrim(p_notes), ''),
    p_operation_id,
    version.id,
    pickup.payment_transaction_id
  ) returning id into handoff_id;

  insert into public.condition_reports (
    handoff_id,
    camera_condition_summary,
    accessory_checklist_snapshot,
    has_damage,
    has_missing_items,
    notes,
    reported_by
  ) values (
    handoff_id,
    btrim(p_condition_summary),
    recorded_accessories,
    has_damage,
    has_missing_items,
    nullif(btrim(p_notes), ''),
    caller
  ) returning id into report_id;

  perform private.transition_booking(
    booking.id,
    'ACTIVE',
    'RETURN_REVIEW',
    'admin',
    'return_recorded',
    null,
    p_operation_id
  );

  perform private.write_audit(
    p_operation_id,
    'record_return',
    'booking',
    booking.id,
    'success',
    'physical return inspection',
    jsonb_build_object(
      'handoff_id', handoff_id,
      'condition_report_id', report_id,
      'has_damage', has_damage,
      'has_missing_items', has_missing_items,
      'late_return', p_actual_at > booking.return_at,
      'accessory_count', expected_count
    )
  );

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', 'RETURN_REVIEW',
    'handoff_id', handoff_id,
    'condition_report_id', report_id,
    'created', true
  );
end;
$$;

create function private.decide_return_review(
  p_booking_id uuid,
  p_outcome text,
  p_note text,
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
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  existing_state public.booking_state;
  has_issue boolean;
  late_return boolean;
  evidence_count integer;
  note_id uuid;
  settlement public.deposit_settlements%rowtype;
  target_state public.booking_state;
begin
  if p_booking_id is null
    or p_outcome not in ('clear', 'issue')
    or p_operation_id is null
    or (
      p_outcome = 'issue'
      and (
        p_note is null
        or length(btrim(p_note)) not between 2 and 2000
        or private.resolution_text_has_forbidden_characters(p_note)
      )
    )
    or (
      p_note is not null
      and nullif(btrim(p_note), '') is not null
      and (
        length(btrim(p_note)) > 2000
        or private.resolution_text_has_forbidden_characters(p_note)
      )
    )
  then
    raise exception 'return_review_decision_invalid' using errcode = '22023';
  end if;

  select to_state into existing_state
  from public.booking_state_history
  where booking_id = p_booking_id and operation_id = p_operation_id
  order by id desc
  limit 1;
  if existing_state in ('ISSUE_REVIEW', 'COMPLETED') then
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'booking_state', existing_state,
      'outcome', case when existing_state = 'COMPLETED' then 'clear' else 'issue' end,
      'created', false
    );
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null or booking.state <> 'RETURN_REVIEW' then
    raise exception 'return_review_stale_booking_state' using errcode = '40001';
  end if;

  select * into handoff
  from public.handoffs
  where booking_id = booking.id and type = 'return'
  for share;
  select * into report
  from public.condition_reports
  where handoff_id = handoff.id
  for share;
  if handoff.id is null or report.id is null then
    raise exception 'return_report_not_found' using errcode = 'P0002';
  end if;

  late_return := handoff.actual_at > booking.return_at;
  has_issue := report.has_damage or report.has_missing_items or late_return;
  if (p_outcome = 'issue') <> has_issue then
    raise exception 'return_outcome_must_match_recorded_facts' using errcode = '23514';
  end if;

  select count(*)::integer into evidence_count
  from public.condition_photos
  where condition_report_id = report.id
    and finalized_at is not null
    and deleted_at is null;
  if p_outcome = 'issue'
    and (report.has_damage or report.has_missing_items)
    and evidence_count = 0
  then
    raise exception 'return_issue_evidence_required' using errcode = '23514';
  end if;

  if p_outcome = 'issue' then
    insert into public.return_issue_notes (
      booking_id, condition_report_id, note, created_by, operation_id
    ) values (
      booking.id, report.id, btrim(p_note), caller, p_operation_id
    ) returning id into note_id;
  end if;

  settlement := private.replace_deposit_settlement(
    booking.id, null, p_operation_id, caller
  );
  target_state := case
    when p_outcome = 'clear' then 'COMPLETED'::public.booking_state
    else 'ISSUE_REVIEW'::public.booking_state
  end;

  perform private.transition_booking(
    booking.id,
    'RETURN_REVIEW',
    target_state,
    'admin',
    case when p_outcome = 'clear' then 'return_cleared' else 'return_issue_opened' end,
    nullif(btrim(p_note), ''),
    p_operation_id
  );
  if target_state = 'COMPLETED' then
    perform private.release_booking_block(booking.id, caller);
  end if;

  perform private.write_audit(
    p_operation_id,
    'decide_return_review',
    'booking',
    booking.id,
    'success',
    'return inspection decision',
    jsonb_build_object(
      'resulting_state', target_state,
      'condition_report_id', report.id,
      'issue_note_id', note_id,
      'deposit_settlement_id', settlement.id,
      'evidence_count', evidence_count,
      'late_return', late_return
    )
  );

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', target_state,
    'outcome', p_outcome,
    'created', true
  );
end;
$$;

create function private.add_return_issue_note(
  p_booking_id uuid,
  p_note text,
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
  report_id uuid;
  existing public.return_issue_notes%rowtype;
  note_id uuid;
begin
  if p_booking_id is null
    or p_operation_id is null
    or p_note is null
    or length(btrim(p_note)) not between 2 and 2000
    or private.resolution_text_has_forbidden_characters(p_note)
  then
    raise exception 'issue_note_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.return_issue_notes
  where operation_id = p_operation_id;
  if existing.id is not null then
    return jsonb_build_object(
      'note_id', existing.id,
      'booking_id', existing.booking_id,
      'created', false
    );
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null or booking.state <> 'ISSUE_REVIEW' then
    raise exception 'issue_review_stale_booking_state' using errcode = '40001';
  end if;

  select report.id into report_id
  from public.handoffs as handoff
  join public.condition_reports as report on report.handoff_id = handoff.id
  where handoff.booking_id = booking.id and handoff.type = 'return';
  if report_id is null then
    raise exception 'return_report_not_found' using errcode = 'P0002';
  end if;

  insert into public.return_issue_notes (
    booking_id, condition_report_id, note, created_by, operation_id
  ) values (
    booking.id, report_id, btrim(p_note), caller, p_operation_id
  ) returning id into note_id;

  perform private.write_audit(
    p_operation_id,
    'add_return_issue_note',
    'booking',
    booking.id,
    'success',
    'return issue review',
    jsonb_build_object('note_id', note_id, 'condition_report_id', report_id)
  );

  return jsonb_build_object(
    'note_id', note_id,
    'booking_id', booking.id,
    'created', true
  );
end;
$$;

create function private.resolve_return_issue(
  p_booking_id uuid,
  p_decision_kind text,
  p_deduction_amount numeric,
  p_internal_reason text,
  p_customer_explanation text,
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
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  existing public.return_issue_decisions%rowtype;
  held numeric(12,2);
  late_return boolean;
  issue_count integer;
  evidence_count integer;
  decision_id uuid;
  deduction_id uuid;
  settlement public.deposit_settlements%rowtype;
begin
  if p_booking_id is null
    or p_decision_kind not in ('damage', 'missing_item', 'late_return', 'mixed', 'other')
    or p_deduction_amount is null
    or p_deduction_amount < 0
    or p_internal_reason is null
    or length(btrim(p_internal_reason)) not between 2 and 2000
    or private.resolution_text_has_forbidden_characters(p_internal_reason)
    or p_customer_explanation is null
    or length(btrim(p_customer_explanation)) not between 2 and 500
    or private.resolution_text_has_forbidden_characters(p_customer_explanation)
    or p_operation_id is null
  then
    raise exception 'issue_decision_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.return_issue_decisions
  where operation_id = p_operation_id;
  if existing.id is not null then
    return jsonb_build_object(
      'decision_id', existing.id,
      'booking_id', existing.booking_id,
      'booking_state', 'COMPLETED',
      'deduction_amount', existing.deduction_amount,
      'created', false
    );
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null or booking.state <> 'ISSUE_REVIEW' then
    raise exception 'issue_review_stale_booking_state' using errcode = '40001';
  end if;

  select * into handoff
  from public.handoffs
  where booking_id = booking.id and type = 'return'
  for share;
  select * into report
  from public.condition_reports
  where handoff_id = handoff.id
  for share;
  if handoff.id is null or report.id is null then
    raise exception 'return_report_not_found' using errcode = 'P0002';
  end if;

  late_return := handoff.actual_at > booking.return_at;
  issue_count := (report.has_damage::integer)
    + (report.has_missing_items::integer)
    + (late_return::integer);
  if issue_count = 0
    or (p_decision_kind = 'damage' and not report.has_damage)
    or (p_decision_kind = 'missing_item' and not report.has_missing_items)
    or (p_decision_kind = 'late_return' and not late_return)
    or (p_decision_kind = 'mixed' and issue_count < 2)
  then
    raise exception 'issue_decision_does_not_match_return_facts'
      using errcode = '23514';
  end if;

  select count(*)::integer into evidence_count
  from public.condition_photos
  where condition_report_id = report.id
    and finalized_at is not null
    and deleted_at is null;
  if (report.has_damage or report.has_missing_items) and evidence_count = 0 then
    raise exception 'return_issue_evidence_required' using errcode = '23514';
  end if;
  if private.net_refund_total(booking.id) <> 0 then
    raise exception 'refunds_must_be_recorded_after_issue_decision'
      using errcode = '23514';
  end if;

  held := private.verified_deposit_held(booking.id);
  if p_deduction_amount > held then
    raise exception 'deduction_exceeds_verified_deposit' using errcode = '23514';
  end if;

  insert into public.return_issue_decisions (
    booking_id,
    condition_report_id,
    decision_kind,
    deduction_amount,
    internal_reason,
    customer_explanation,
    decided_by,
    operation_id
  ) values (
    booking.id,
    report.id,
    p_decision_kind,
    p_deduction_amount,
    btrim(p_internal_reason),
    btrim(p_customer_explanation),
    caller,
    p_operation_id
  ) returning id into decision_id;

  if p_deduction_amount > 0 then
    insert into public.deposit_deductions (
      booking_id,
      issue_decision_id,
      amount,
      reason_snapshot,
      recorded_by,
      operation_id
    ) values (
      booking.id,
      decision_id,
      p_deduction_amount,
      btrim(p_internal_reason),
      caller,
      p_operation_id
    ) returning id into deduction_id;
  end if;

  settlement := private.replace_deposit_settlement(
    booking.id, decision_id, p_operation_id, caller
  );

  perform private.transition_booking(
    booking.id,
    'ISSUE_REVIEW',
    'COMPLETED',
    'admin',
    'issue_review_resolved',
    btrim(p_customer_explanation),
    p_operation_id
  );
  perform private.release_booking_block(booking.id, caller);

  perform private.write_audit(
    p_operation_id,
    'resolve_return_issue',
    'booking',
    booking.id,
    'success',
    'manual issue resolution',
    jsonb_build_object(
      'condition_report_id', report.id,
      'decision_id', decision_id,
      'deduction_id', deduction_id,
      'deduction_amount', p_deduction_amount,
      'deposit_settlement_id', settlement.id,
      'evidence_count', evidence_count,
      'late_return', late_return,
      'amount_is_manual', true
    )
  );

  return jsonb_build_object(
    'decision_id', decision_id,
    'booking_id', booking.id,
    'booking_state', 'COMPLETED',
    'deduction_amount', p_deduction_amount,
    'created', true
  );
end;
$$;

create function private.record_external_refund(
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

create function private.reverse_external_refund(
  p_refund_record_id uuid,
  p_reference text,
  p_counterparty_name text,
  p_external_moved_at timestamptz,
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
  caller uuid := private.require_admin();
  original public.deposit_refund_records%rowtype;
  original_transaction public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  existing public.deposit_refund_records%rowtype;
  decision_id uuid;
  transaction_id uuid;
  record_id uuid;
  settlement public.deposit_settlements%rowtype;
begin
  if p_refund_record_id is null
    or p_reference is null
    or length(btrim(p_reference)) not between 4 and 120
    or private.resolution_text_has_forbidden_characters(p_reference)
    or length(private.normalize_gcash_reference(p_reference)) not between 4 and 64
    or p_counterparty_name is null
    or length(btrim(p_counterparty_name)) not between 2 and 160
    or private.resolution_text_has_forbidden_characters(p_counterparty_name)
    or p_external_moved_at is null
    or p_reason is null
    or length(btrim(p_reason)) not between 2 and 1000
    or private.resolution_text_has_forbidden_characters(p_reason)
    or p_operation_id is null
  then
    raise exception 'refund_reversal_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.deposit_refund_records
  where operation_id = p_operation_id;
  if existing.id is not null then
    return jsonb_build_object(
      'refund_record_id', existing.id,
      'transaction_id', existing.transaction_id,
      'booking_id', existing.booking_id,
      'entry_kind', existing.entry_kind,
      'amount', existing.amount,
      'created', false
    );
  end if;

  select * into original
  from public.deposit_refund_records
  where id = p_refund_record_id
  for update;
  if original.id is null or original.entry_kind <> 'refund' then
    raise exception 'refund_record_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.deposit_refund_records
    where reversal_of = original.id
  ) then
    raise exception 'refund_already_reversed' using errcode = '40001';
  end if;

  select * into booking
  from public.bookings
  where id = original.booking_id
  for update;
  select * into original_transaction
  from public.payment_transactions
  where id = original.transaction_id
  for share;
  if booking.id is null
    or booking.state not in ('COMPLETED', 'CANCELLED')
    or original_transaction.id is null
    or original_transaction.direction <> 'outgoing'
    or original_transaction.status <> 'verified'
    or original_transaction.amount <> original.amount
  then
    raise exception 'refund_reversal_source_invalid' using errcode = '23514';
  end if;
  if p_external_moved_at < original.external_moved_at
    or p_external_moved_at > clock_timestamp()
  then
    raise exception 'refund_reversal_time_invalid' using errcode = '22023';
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
    decided_by,
    reversal_of
  ) values (
    booking.id,
    'incoming',
    'gcash_manual',
    'verified',
    original.amount,
    'PHP',
    btrim(p_reference),
    btrim(p_counterparty_name),
    p_external_moved_at,
    caller,
    statement_timestamp(),
    caller,
    original_transaction.id
  ) returning id into transaction_id;

  insert into public.payment_allocations (
    transaction_id, booking_id, kind, amount
  ) values (
    transaction_id, booking.id, 'deposit_refund', original.amount
  );

  insert into public.deposit_refund_records (
    booking_id,
    transaction_id,
    entry_kind,
    amount,
    external_moved_at,
    reversal_of,
    reversal_reason,
    recorded_by,
    operation_id
  ) values (
    booking.id,
    transaction_id,
    'reversal',
    original.amount,
    p_external_moved_at,
    original.id,
    btrim(p_reason),
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
    'reverse_external_refund',
    'payment_transaction',
    transaction_id,
    'success',
    'manual GCash refund reversal',
    jsonb_build_object(
      'booking_id', booking.id,
      'refund_record_id', record_id,
      'reversal_of_refund_record_id', original.id,
      'amount', original.amount,
      'reference_last4', right(private.normalize_gcash_reference(p_reference), 4),
      'deposit_settlement_id', settlement.id,
      'remaining_liability',
        private.verified_deposit_held(booking.id)
        - private.deposit_deduction_total(booking.id)
        - private.net_refund_total(booking.id)
    )
  );

  return jsonb_build_object(
    'refund_record_id', record_id,
    'transaction_id', transaction_id,
    'booking_id', booking.id,
    'entry_kind', 'reversal',
    'amount', original.amount,
    'remaining_liability',
      private.verified_deposit_held(booking.id)
      - private.deposit_deduction_total(booking.id)
      - private.net_refund_total(booking.id),
    'created', true
  );
end;
$$;

create function private.create_condition_photo_intent_internal(
  p_intent_id uuid,
  p_condition_report_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_supersedes_photo_id uuid,
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
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  superseded public.condition_photos%rowtype;
  active_intent private.condition_photo_upload_intents%rowtype;
  created_intent private.condition_photo_upload_intents%rowtype;
  expected_hash bytea;
  extension text;
  photo_id uuid;
  target_path text;
  evidence_category text;
begin
  if p_intent_id is null
    or p_condition_report_id is null
    or p_operation_id is null
    or p_sha256_hex is null
    or p_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'condition_photo_intent_invalid' using errcode = '22023';
  end if;

  extension := private.condition_photo_extension(p_media_type);
  if extension is null or p_byte_size is null or p_byte_size not between 1 and 5242880 then
    raise exception 'condition_photo_file_invalid' using errcode = '22023';
  end if;
  expected_hash := decode(p_sha256_hex, 'hex');

  select * into report
  from public.condition_reports
  where id = p_condition_report_id
  for share;
  select * into handoff
  from public.handoffs
  where id = report.handoff_id
    and type in ('pickup', 'return')
  for share;
  select * into booking
  from public.bookings
  where id = handoff.booking_id
  for update;

  if report.id is null
    or handoff.id is null
    or booking.id is null
    or (handoff.type = 'pickup' and booking.state <> 'ACTIVE')
    or (
      handoff.type = 'return'
      and booking.state not in ('RETURN_REVIEW', 'ISSUE_REVIEW')
    )
  then
    raise exception 'condition_photo_report_not_found' using errcode = 'P0002';
  end if;
  evidence_category := case
    when handoff.type = 'pickup' then 'pickup_condition'
    else 'return_condition'
  end;

  if p_supersedes_photo_id is not null then
    select * into superseded
    from public.condition_photos
    where id = p_supersedes_photo_id
      and condition_report_id = report.id
      and finalized_at is not null
      and deleted_at is null
    for share;
    if superseded.id is null or exists (
      select 1 from public.condition_photos
      where supersedes_id = superseded.id
    ) then
      raise exception 'condition_photo_supersession_invalid' using errcode = '23514';
    end if;
  elsif (
    select count(*)
    from public.condition_photos as photo
    where photo.condition_report_id = report.id
      and photo.finalized_at is not null
      and photo.deleted_at is null
      and not exists (
        select 1 from public.condition_photos as successor
        where successor.supersedes_id = photo.id
      )
  ) >= 6 then
    raise exception 'condition_photo_limit_reached' using errcode = '22023';
  end if;

  select * into active_intent
  from private.condition_photo_upload_intents
  where condition_report_id = report.id
    and status in ('awaiting_upload', 'cleanup_pending')
  order by created_at desc, id desc
  limit 1
  for update;

  if active_intent.id is not null then
    if active_intent.status = 'cleanup_pending' then
      return private.condition_photo_intent_json(active_intent, true);
    end if;
    if active_intent.expires_at <= clock_timestamp() then
      if exists (
        select 1 from storage.objects as object
        where object.bucket_id = 'condition-evidence'
          and object.name = active_intent.object_path
      ) then
        update private.condition_photo_upload_intents
        set status = 'cleanup_pending',
            cleanup_requested_at = coalesce(cleanup_requested_at, clock_timestamp())
        where id = active_intent.id
        returning * into active_intent;
        return private.condition_photo_intent_json(active_intent, true);
      end if;
      update private.condition_photo_upload_intents
      set status = 'expired'
      where id = active_intent.id;
      active_intent := null;
    elsif active_intent.id = p_intent_id
      and active_intent.expected_media_type = p_media_type
      and active_intent.expected_byte_size = p_byte_size
      and active_intent.expected_sha256 = expected_hash
      and active_intent.supersedes_photo_id is not distinct from p_supersedes_photo_id
    then
      return private.condition_photo_intent_json(active_intent, true);
    else
      raise exception 'condition_photo_upload_in_progress' using errcode = '55000';
    end if;
  end if;

  photo_id := gen_random_uuid();
  target_path := format(
    '%s/%s/%s.%s', booking.id, report.id, photo_id, extension
  );

  insert into private.condition_photo_upload_intents (
    id,
    booking_id,
    condition_report_id,
    photo_id,
    object_path,
    expected_media_type,
    expected_byte_size,
    expected_sha256,
    created_by,
    expires_at,
    supersedes_photo_id
  ) values (
    p_intent_id,
    booking.id,
    report.id,
    photo_id,
    target_path,
    p_media_type,
    p_byte_size,
    expected_hash,
    caller,
    clock_timestamp() + interval '15 minutes',
    p_supersedes_photo_id
  ) returning * into created_intent;

  perform private.write_audit(
    p_operation_id,
    'create_condition_photo_upload_intent',
    'condition_report',
    report.id,
    'success',
    evidence_category || ' evidence upload',
    jsonb_build_object(
      'photo_intent_id', created_intent.id,
      'media_type', p_media_type,
      'byte_size', p_byte_size,
      'supersedes_photo_id', p_supersedes_photo_id
    )
  );

  return private.condition_photo_intent_json(created_intent, true);
end;
$$;

create or replace function private.create_condition_photo_upload_intent(
  p_intent_id uuid,
  p_condition_report_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.create_condition_photo_intent_internal(
    p_intent_id,
    p_condition_report_id,
    p_media_type,
    p_byte_size,
    p_sha256_hex,
    null,
    p_operation_id
  );
$$;

create function private.create_condition_photo_replacement_intent(
  p_intent_id uuid,
  p_condition_report_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_supersedes_photo_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.create_condition_photo_intent_internal(
    p_intent_id,
    p_condition_report_id,
    p_media_type,
    p_byte_size,
    p_sha256_hex,
    p_supersedes_photo_id,
    p_operation_id
  );
$$;

create or replace function private.finalize_condition_photo_upload(
  p_intent_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
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
  target_booking_id uuid;
  target private.condition_photo_upload_intents%rowtype;
  booking public.bookings%rowtype;
  handoff public.handoffs%rowtype;
  stored_object storage.objects%rowtype;
  existing_photo public.condition_photos%rowtype;
  created_photo public.condition_photos%rowtype;
  evidence_category text;
begin
  if p_intent_id is null
    or p_operation_id is null
    or p_verified_sha256_hex is null
    or p_verified_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'condition_photo_finalization_invalid' using errcode = '22023';
  end if;

  select booking_id into target_booking_id
  from private.condition_photo_upload_intents
  where id = p_intent_id;
  if target_booking_id is null then
    raise exception 'condition_photo_intent_not_found' using errcode = 'P0002';
  end if;

  select * into booking
  from public.bookings
  where id = target_booking_id
  for update;
  select * into target
  from private.condition_photo_upload_intents
  where id = p_intent_id
  for update;
  select source_handoff.* into handoff
  from public.condition_reports as report
  join public.handoffs as source_handoff
    on source_handoff.id = report.handoff_id
  where report.id = target.condition_report_id
  for share of source_handoff;

  if target.id is null
    or booking.id is null
    or handoff.id is null
    or target.created_by <> caller
    or (handoff.type = 'pickup' and booking.state <> 'ACTIVE')
    or (
      handoff.type = 'return'
      and booking.state not in ('RETURN_REVIEW', 'ISSUE_REVIEW')
    )
  then
    raise exception 'condition_photo_intent_not_found' using errcode = 'P0002';
  end if;
  evidence_category := case
    when handoff.type = 'pickup' then 'pickup_condition'
    else 'return_condition'
  end;

  if target.status = 'finalized' then
    select * into existing_photo
    from public.condition_photos
    where upload_intent_id = target.id;
    if existing_photo.id is null or existing_photo.id <> target.photo_id then
      raise exception 'condition_photo_finalization_inconsistent'
        using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', 'finalized',
      'booking_id', booking.id,
      'condition_report_id', target.condition_report_id,
      'photo_id', target.photo_id,
      'created', false
    );
  end if;

  if target.status <> 'awaiting_upload'
    or target.expires_at <= clock_timestamp()
    or p_verified_media_type is distinct from target.expected_media_type
    or p_verified_byte_size is distinct from target.expected_byte_size
    or decode(p_verified_sha256_hex, 'hex') is distinct from target.expected_sha256
  then
    raise exception 'condition_photo_bytes_do_not_match_intent'
      using errcode = '23514';
  end if;

  if target.supersedes_photo_id is not null and (
    not exists (
      select 1 from public.condition_photos
      where id = target.supersedes_photo_id
        and condition_report_id = target.condition_report_id
        and finalized_at is not null
        and deleted_at is null
    )
    or exists (
      select 1 from public.condition_photos
      where supersedes_id = target.supersedes_photo_id
    )
  ) then
    raise exception 'condition_photo_supersession_stale' using errcode = '40001';
  end if;

  select * into stored_object
  from storage.objects as object
  where object.bucket_id = 'condition-evidence'
    and object.name = target.object_path;
  if stored_object.id is null or stored_object.created_at > target.expires_at then
    raise exception 'condition_photo_object_missing_or_late' using errcode = 'P0002';
  end if;
  if coalesce(stored_object.metadata ->> 'mimetype', '') <> target.expected_media_type
    or coalesce(stored_object.metadata ->> 'size', '') !~ '^[0-9]+$'
    or (stored_object.metadata ->> 'size')::bigint <> target.expected_byte_size
  then
    raise exception 'condition_photo_storage_metadata_invalid'
      using errcode = '23514';
  end if;

  insert into public.condition_photos (
    id,
    condition_report_id,
    object_path,
    media_type,
    byte_size,
    sha256,
    evidence_category,
    upload_intent_id,
    finalized_at,
    supersedes_id
  ) values (
    target.photo_id,
    target.condition_report_id,
    target.object_path,
    target.expected_media_type,
    target.expected_byte_size,
    target.expected_sha256,
    evidence_category,
    target.id,
    clock_timestamp(),
    target.supersedes_photo_id
  ) returning * into created_photo;

  update private.condition_photo_upload_intents
  set status = 'finalized', finalized_at = clock_timestamp()
  where id = target.id;

  perform private.write_audit(
    p_operation_id,
    'finalize_condition_photo_upload',
    'condition_report',
    target.condition_report_id,
    'success',
    evidence_category || ' evidence upload',
    jsonb_build_object(
      'photo_id', created_photo.id,
      'media_type', created_photo.media_type,
      'byte_size', created_photo.byte_size,
      'supersedes_photo_id', created_photo.supersedes_id
    )
  );

  return jsonb_build_object(
    'status', 'finalized',
    'booking_id', booking.id,
    'condition_report_id', target.condition_report_id,
    'photo_id', created_photo.id,
    'created', true
  );
end;
$$;

create or replace function private.can_insert_condition_photo(
  p_object_path text,
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.condition_photo_upload_intents as intent
      join public.bookings as booking on booking.id = intent.booking_id
      join public.condition_reports as report
        on report.id = intent.condition_report_id
      join public.handoffs as handoff on handoff.id = report.handoff_id
      where intent.object_path = p_object_path
        and (
          (handoff.type = 'pickup' and booking.state = 'ACTIVE')
          or (
            handoff.type = 'return'
            and booking.state in ('RETURN_REVIEW', 'ISSUE_REVIEW')
          )
        )
        and intent.status = 'awaiting_upload'
        and intent.expires_at > statement_timestamp()
        and coalesce(p_metadata ->> 'mimetype', '') = intent.expected_media_type
        and coalesce(p_metadata ->> 'size', '') ~ '^[0-9]+$'
        and (p_metadata ->> 'size')::bigint = intent.expected_byte_size
    );
$$;

create or replace function private.authorize_condition_photo_access(
  p_photo_id uuid,
  p_purpose text,
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
  photo public.condition_photos%rowtype;
  report public.condition_reports%rowtype;
  handoff public.handoffs%rowtype;
  required_purpose text;
begin
  if p_photo_id is null
    or p_operation_id is null
    or p_purpose not in (
      'pickup_condition_review', 'return_condition_review'
    )
  then
    raise exception 'condition_photo_access_invalid' using errcode = '22023';
  end if;

  select * into photo
  from public.condition_photos
  where id = p_photo_id
    and finalized_at is not null
    and deleted_at is null
  for share;
  select * into report
  from public.condition_reports
  where id = photo.condition_report_id
  for share;
  select * into handoff
  from public.handoffs
  where id = report.handoff_id and type in ('pickup', 'return')
  for share;
  required_purpose := case
    when handoff.type = 'pickup' then 'pickup_condition_review'
    else 'return_condition_review'
  end;

  if photo.id is null
    or report.id is null
    or handoff.id is null
  then
    raise exception 'condition_photo_unavailable' using errcode = 'P0002';
  end if;
  if p_purpose <> required_purpose then
    raise exception 'condition_photo_access_invalid' using errcode = '22023';
  end if;

  perform private.write_audit(
    p_operation_id,
    'authorize_condition_photo_access',
    'condition_report',
    report.id,
    'authorized',
    replace(required_purpose, '_', ' '),
    jsonb_build_object('photo_id', photo.id, 'expires_in_seconds', 60)
  );

  return jsonb_build_object(
    'booking_id', handoff.booking_id,
    'condition_report_id', report.id,
    'photo_id', photo.id,
    'object_path', photo.object_path,
    'expires_in_seconds', 60
  );
end;
$$;

create or replace function private.authorize_my_condition_photo_access(
  p_booking_id uuid,
  p_photo_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  photo public.condition_photos%rowtype;
  report public.condition_reports%rowtype;
  handoff public.handoffs%rowtype;
  booking public.bookings%rowtype;
begin
  select * into photo
  from public.condition_photos
  where id = p_photo_id
    and finalized_at is not null
    and deleted_at is null;
  select * into report
  from public.condition_reports
  where id = photo.condition_report_id;
  select * into handoff
  from public.handoffs
  where id = report.handoff_id and type in ('pickup', 'return');
  select * into booking
  from public.bookings
  where id = handoff.booking_id
    and id = p_booking_id
    and renter_id = caller;

  if photo.id is null
    or report.id is null
    or handoff.id is null
    or booking.id is null
  then
    raise exception 'condition_photo_unavailable' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'booking_id', booking.id,
    'condition_report_id', report.id,
    'photo_id', photo.id,
    'object_path', photo.object_path,
    'expires_in_seconds', 60
  );
end;
$$;

create function private.deposit_outcome_json(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with amounts as (
    select
      private.verified_deposit_held(p_booking_id) as held,
      private.deposit_deduction_total(p_booking_id) as deducted,
      private.net_refund_total(p_booking_id) as refunded
  )
  select jsonb_build_object(
    'held_amount', held,
    'deduction_amount', deducted,
    'refunded_amount', refunded,
    'remaining_refund_liability', greatest(held - deducted - refunded, 0),
    'status', case
      when held = 0 then 'none'
      when held - deducted - refunded > 0 then 'pending_refund'
      when refunded > 0 then 'refunded'
      else 'resolved_by_deduction'
    end
  )
  from amounts;
$$;

create function private.get_resolution_queues()
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

  select jsonb_build_object(
    'return_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', booking.id,
        'camera_name', camera.name,
        'renter_legal_name', profile.legal_name,
        'renter_phone', profile.phone,
        'expected_return_at', booking.return_at,
        'actual_pickup_at', pickup.actual_at,
        'urgency', case
          when booking.return_at < statement_timestamp() then 'overdue'
          when (booking.return_at at time zone 'Asia/Manila')::date
            = (statement_timestamp() at time zone 'Asia/Manila')::date
          then 'due_today'
          else 'upcoming'
        end
      ) order by booking.return_at, booking.id)
      from public.bookings as booking
      join public.cameras as camera on camera.id = booking.camera_id
      join public.profiles as profile on profile.user_id = booking.renter_id
      join public.handoffs as pickup
        on pickup.booking_id = booking.id and pickup.type = 'pickup'
      where booking.state = 'ACTIVE'
    ), '[]'::jsonb),
    'issue_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', booking.id,
        'camera_name', camera.name,
        'renter_legal_name', profile.legal_name,
        'actual_return_at', handoff.actual_at,
        'has_damage', report.has_damage,
        'has_missing_items', report.has_missing_items,
        'late_return', handoff.actual_at > booking.return_at,
        'evidence_count', (
          select count(*)::integer
          from public.condition_photos as photo
          where photo.condition_report_id = report.id
            and photo.finalized_at is not null
            and photo.deleted_at is null
        )
      ) order by handoff.actual_at, booking.id)
      from public.bookings as booking
      join public.cameras as camera on camera.id = booking.camera_id
      join public.profiles as profile on profile.user_id = booking.renter_id
      join public.handoffs as handoff
        on handoff.booking_id = booking.id and handoff.type = 'return'
      join public.condition_reports as report on report.handoff_id = handoff.id
      where booking.state = 'ISSUE_REVIEW'
    ), '[]'::jsonb),
    'deposit_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', booking.id,
        'camera_name', camera.name,
        'renter_legal_name', profile.legal_name,
        'held_amount', (outcome.value ->> 'held_amount')::numeric,
        'deduction_amount', (outcome.value ->> 'deduction_amount')::numeric,
        'refunded_amount', (outcome.value ->> 'refunded_amount')::numeric,
        'remaining_refund_liability',
          (outcome.value ->> 'remaining_refund_liability')::numeric,
        'status', outcome.value ->> 'status'
      ) order by booking.id)
      from public.bookings as booking
      join public.cameras as camera on camera.id = booking.camera_id
      join public.profiles as profile on profile.user_id = booking.renter_id
      cross join lateral private.deposit_outcome_json(booking.id) as outcome(value)
      where booking.state in ('COMPLETED', 'CANCELLED')
        and (outcome.value ->> 'held_amount')::numeric > 0
    ), '[]'::jsonb),
    'cancellation_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', request.id,
        'booking_id', booking.id,
        'booking_state', booking.state,
        'camera_name', camera.name,
        'renter_legal_name', profile.legal_name,
        'reason', request.reason,
        'requested_at', request.requested_at,
        'acceptance_enabled', booking.state in (
          'FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY'
        )
      ) order by request.requested_at, request.id)
      from public.booking_cancellation_requests as request
      join public.bookings as booking on booking.id = request.booking_id
      join public.cameras as camera on camera.id = booking.camera_id
      join public.profiles as profile on profile.user_id = booking.renter_id
      left join public.cancellation_decisions as decision
        on decision.request_id = request.id
      where decision.id is null and request.disposition = 'pending'
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create function private.get_resolution_detail(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  camera public.cameras%rowtype;
  profile public.profiles%rowtype;
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  issue_decision public.return_issue_decisions%rowtype;
  cancellation_request public.booking_cancellation_requests%rowtype;
  cancellation_decision public.cancellation_decisions%rowtype;
  return_json jsonb;
  photos jsonb;
  issue_notes jsonb;
  refunds jsonb;
  cancellation_json jsonb;
begin
  perform private.require_admin();

  select * into booking from public.bookings where id = p_booking_id;
  if booking.id is null then
    raise exception 'resolution_booking_not_found' using errcode = 'P0002';
  end if;
  select * into camera from public.cameras where id = booking.camera_id;
  select * into profile from public.profiles where user_id = booking.renter_id;

  select * into handoff
  from public.handoffs
  where booking_id = booking.id and type = 'return';
  select * into report
  from public.condition_reports
  where handoff_id = handoff.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'photo_id', photo.id,
    'media_type', photo.media_type,
    'byte_size', photo.byte_size,
    'created_at', photo.created_at,
    'supersedes_photo_id', photo.supersedes_id
  ) order by photo.created_at, photo.id), '[]'::jsonb)
  into photos
  from public.condition_photos as photo
  where photo.condition_report_id = report.id
    and photo.finalized_at is not null
    and photo.deleted_at is null;

  if report.id is not null then
    return_json := jsonb_build_object(
      'handoff_id', handoff.id,
      'condition_report_id', report.id,
      'actual_at', handoff.actual_at,
      'expected_return_at', booking.return_at,
      'late_return', handoff.actual_at > booking.return_at,
      'camera_condition_summary', report.camera_condition_summary,
      'camera_has_damage', report.has_damage,
      'has_missing_items', report.has_missing_items,
      'notes', report.notes,
      'accessories', report.accessory_checklist_snapshot,
      'photos', photos
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'note_id', note.id,
    'note', note.note,
    'created_at', note.created_at
  ) order by note.created_at, note.id), '[]'::jsonb)
  into issue_notes
  from public.return_issue_notes as note
  where note.booking_id = booking.id;

  select * into issue_decision
  from public.return_issue_decisions
  where booking_id = booking.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'refund_record_id', record.id,
    'entry_kind', record.entry_kind,
    'amount', record.amount,
    'external_moved_at', record.external_moved_at,
    'reference_last4', right(payment.reference_canonical, 4),
    'reversal_of_refund_record_id', record.reversal_of,
    'reversal_reason', record.reversal_reason
  ) order by record.recorded_at, record.id), '[]'::jsonb)
  into refunds
  from public.deposit_refund_records as record
  join public.payment_transactions as payment on payment.id = record.transaction_id
  where record.booking_id = booking.id;

  select * into cancellation_request
  from public.booking_cancellation_requests
  where booking_id = booking.id
  order by requested_at desc, id desc
  limit 1;
  select * into cancellation_decision
  from public.cancellation_decisions
  where request_id = cancellation_request.id;
  if cancellation_request.id is not null then
    cancellation_json := jsonb_build_object(
      'request_id', cancellation_request.id,
      'reason', cancellation_request.reason,
      'requested_at', cancellation_request.requested_at,
      'disposition', cancellation_request.disposition,
      'acceptance_enabled', booking.state in (
        'FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY'
      ),
      'decision', case when cancellation_decision.id is null then null else
        jsonb_build_object(
          'decision_id', cancellation_decision.id,
          'outcome', cancellation_decision.outcome,
          'reason', cancellation_decision.reason,
          'fee_amount', cancellation_decision.fee_amount,
          'refund_liability_amount', cancellation_decision.refund_liability_amount,
          'decided_at', cancellation_decision.decided_at
        )
      end
    );
  end if;

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', booking.state,
    'camera', jsonb_build_object(
      'id', camera.id,
      'name', camera.name
    ),
    'renter', jsonb_build_object(
      'legal_name', profile.legal_name,
      'phone', profile.phone
    ),
    'pickup_at', booking.pickup_at,
    'return_at', booking.return_at,
    'expected_accessories', coalesce((
      select version.snapshot #> '{camera,accessories}'
      from public.contract_versions as version
      where version.id = booking.current_contract_version_id
    ), '[]'::jsonb),
    'return_inspection', return_json,
    'issue_notes', issue_notes,
    'issue_decision', case when issue_decision.id is null then null else
      jsonb_build_object(
        'decision_id', issue_decision.id,
        'decision_kind', issue_decision.decision_kind,
        'deduction_amount', issue_decision.deduction_amount,
        'internal_reason', issue_decision.internal_reason,
        'customer_explanation', issue_decision.customer_explanation,
        'decided_at', issue_decision.decided_at
      )
    end,
    'deposit', private.deposit_outcome_json(booking.id),
    'refunds', refunds,
    'cancellation', cancellation_json
  );
end;
$$;

create function private.get_my_resolution_state(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  issue_decision public.return_issue_decisions%rowtype;
  cancellation_request public.booking_cancellation_requests%rowtype;
  cancellation_decision public.cancellation_decisions%rowtype;
  photos jsonb;
  return_json jsonb;
  cancellation_json jsonb;
begin
  select * into booking
  from public.bookings
  where id = p_booking_id and renter_id = caller;
  if booking.id is null then
    raise exception 'resolution_booking_not_found' using errcode = 'P0002';
  end if;

  select * into handoff
  from public.handoffs
  where booking_id = booking.id and type = 'return';
  select * into report
  from public.condition_reports
  where handoff_id = handoff.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'photo_id', photo.id,
    'media_type', photo.media_type,
    'byte_size', photo.byte_size,
    'created_at', photo.created_at,
    'supersedes_photo_id', photo.supersedes_id
  ) order by photo.created_at, photo.id), '[]'::jsonb)
  into photos
  from public.condition_photos as photo
  where photo.condition_report_id = report.id
    and photo.finalized_at is not null
    and photo.deleted_at is null;
  if report.id is not null then
    return_json := jsonb_build_object(
      'actual_at', handoff.actual_at,
      'expected_return_at', booking.return_at,
      'late_return', handoff.actual_at > booking.return_at,
      'camera_has_damage', report.has_damage,
      'has_missing_items', report.has_missing_items,
      'accessories', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', accessory.item ->> 'id',
          'name', accessory.item ->> 'name',
          'quantity', (accessory.item ->> 'quantity')::integer,
          'return_status', accessory.item ->> 'return_status'
        ) order by accessory.ordinal)
        from jsonb_array_elements(report.accessory_checklist_snapshot)
          with ordinality as accessory(item, ordinal)
      ), '[]'::jsonb),
      'photos', photos
    );
  end if;

  select * into issue_decision
  from public.return_issue_decisions
  where booking_id = booking.id;
  select * into cancellation_request
  from public.booking_cancellation_requests
  where booking_id = booking.id
  order by requested_at desc, id desc
  limit 1;
  select * into cancellation_decision
  from public.cancellation_decisions
  where request_id = cancellation_request.id;
  if cancellation_request.id is not null then
    cancellation_json := jsonb_build_object(
      'request_id', cancellation_request.id,
      'reason', cancellation_request.reason,
      'requested_at', cancellation_request.requested_at,
      'disposition', cancellation_request.disposition,
      'decision', case when cancellation_decision.id is null then null else
        jsonb_build_object(
          'outcome', cancellation_decision.outcome,
          'reason', cancellation_decision.reason,
          'fee_amount', cancellation_decision.fee_amount,
          'refund_liability_amount', cancellation_decision.refund_liability_amount,
          'decided_at', cancellation_decision.decided_at
        )
      end
    );
  end if;

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', booking.state,
    'can_request_cancellation', booking.state in (
      'FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY', 'PAYMENT_REVIEW', 'CONFIRMED'
    ) and cancellation_request.id is null,
    'return_inspection', return_json,
    'issue_decision', case when issue_decision.id is null then null else
      jsonb_build_object(
        'decision_kind', issue_decision.decision_kind,
        'deduction_amount', issue_decision.deduction_amount,
        'customer_explanation', issue_decision.customer_explanation,
        'decided_at', issue_decision.decided_at
      )
    end,
    'deposit', private.deposit_outcome_json(booking.id),
    'cancellation', cancellation_json
  );
end;
$$;

create function api.request_cancellation_resolution(
  p_booking_id uuid,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_cancellation(p_booking_id, p_reason, p_operation_id);
$$;

create function api.decide_cancellation_resolution(
  p_request_id uuid,
  p_accept boolean,
  p_reason text,
  p_fee_amount numeric,
  p_refund_liability_amount numeric,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.decide_cancellation(
    p_request_id,
    p_accept,
    p_reason,
    p_fee_amount,
    p_refund_liability_amount,
    p_operation_id
  );
$$;

create function api.record_return_inspection(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_camera_serial text,
  p_condition_summary text,
  p_accessory_results jsonb,
  p_camera_has_damage boolean,
  p_notes text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_return(
    p_booking_id,
    p_actual_at,
    p_camera_serial,
    p_condition_summary,
    p_accessory_results,
    p_camera_has_damage,
    p_notes,
    p_operation_id
  );
$$;

create function api.decide_return_inspection(
  p_booking_id uuid,
  p_outcome text,
  p_note text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.decide_return_review(
    p_booking_id, p_outcome, p_note, p_operation_id
  );
$$;

create function api.add_return_issue_note(
  p_booking_id uuid,
  p_note text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.add_return_issue_note(p_booking_id, p_note, p_operation_id);
$$;

create function api.resolve_return_issue(
  p_booking_id uuid,
  p_decision_kind text,
  p_deduction_amount numeric,
  p_internal_reason text,
  p_customer_explanation text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.resolve_return_issue(
    p_booking_id,
    p_decision_kind,
    p_deduction_amount,
    p_internal_reason,
    p_customer_explanation,
    p_operation_id
  );
$$;

create function api.record_external_refund(
  p_booking_id uuid,
  p_amount numeric,
  p_reference text,
  p_recipient_name text,
  p_external_moved_at timestamptz,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_external_refund(
    p_booking_id,
    p_amount,
    p_reference,
    p_recipient_name,
    p_external_moved_at,
    p_operation_id
  );
$$;

create function api.reverse_external_refund(
  p_refund_record_id uuid,
  p_reference text,
  p_counterparty_name text,
  p_external_moved_at timestamptz,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.reverse_external_refund(
    p_refund_record_id,
    p_reference,
    p_counterparty_name,
    p_external_moved_at,
    p_reason,
    p_operation_id
  );
$$;

create function api.get_resolution_queues()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_resolution_queues(); $$;

create function api.get_resolution_detail(p_booking_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_resolution_detail(p_booking_id); $$;

create function api.get_my_resolution_state(p_booking_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_my_resolution_state(p_booking_id); $$;

create function api.create_condition_photo_replacement_intent(
  p_intent_id uuid,
  p_condition_report_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_supersedes_photo_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_condition_photo_replacement_intent(
    p_intent_id,
    p_condition_report_id,
    p_media_type,
    p_byte_size,
    p_sha256_hex,
    p_supersedes_photo_id,
    p_operation_id
  );
$$;

revoke execute on function private.request_cancellation(uuid, text, uuid)
from public, anon, authenticated;
revoke execute on function private.decide_cancellation(
  uuid, boolean, text, numeric, numeric, uuid
) from public, anon, authenticated;
revoke execute on function private.record_return(
  uuid, timestamptz, text, text, jsonb, boolean, text, uuid
) from public, anon, authenticated;
revoke execute on function private.decide_return_review(uuid, text, text, uuid)
from public, anon, authenticated;
revoke execute on function private.add_return_issue_note(uuid, text, uuid)
from public, anon, authenticated;
revoke execute on function private.resolve_return_issue(
  uuid, text, numeric, text, text, uuid
) from public, anon, authenticated;
revoke execute on function private.record_external_refund(
  uuid, numeric, text, text, timestamptz, uuid
) from public, anon, authenticated;
revoke execute on function private.reverse_external_refund(
  uuid, text, text, timestamptz, text, uuid
) from public, anon, authenticated;
revoke execute on function private.get_resolution_queues()
from public, anon, authenticated;
revoke execute on function private.get_resolution_detail(uuid)
from public, anon, authenticated;
revoke execute on function private.get_my_resolution_state(uuid)
from public, anon, authenticated;
revoke execute on function private.create_condition_photo_replacement_intent(
  uuid, uuid, text, bigint, text, uuid, uuid
) from public, anon, authenticated;

grant execute on function private.request_cancellation(uuid, text, uuid)
to authenticated;
grant execute on function private.decide_cancellation(
  uuid, boolean, text, numeric, numeric, uuid
) to authenticated;
grant execute on function private.record_return(
  uuid, timestamptz, text, text, jsonb, boolean, text, uuid
) to authenticated;
grant execute on function private.decide_return_review(uuid, text, text, uuid)
to authenticated;
grant execute on function private.add_return_issue_note(uuid, text, uuid)
to authenticated;
grant execute on function private.resolve_return_issue(
  uuid, text, numeric, text, text, uuid
) to authenticated;
grant execute on function private.record_external_refund(
  uuid, numeric, text, text, timestamptz, uuid
) to authenticated;
grant execute on function private.reverse_external_refund(
  uuid, text, text, timestamptz, text, uuid
) to authenticated;
grant execute on function private.get_resolution_queues() to authenticated;
grant execute on function private.get_resolution_detail(uuid) to authenticated;
grant execute on function private.get_my_resolution_state(uuid) to authenticated;
grant execute on function private.create_condition_photo_replacement_intent(
  uuid, uuid, text, bigint, text, uuid, uuid
) to authenticated;

revoke execute on function api.request_cancellation_resolution(uuid, text, uuid)
from public, anon, authenticated;
revoke execute on function api.decide_cancellation_resolution(
  uuid, boolean, text, numeric, numeric, uuid
) from public, anon, authenticated;
revoke execute on function api.record_return_inspection(
  uuid, timestamptz, text, text, jsonb, boolean, text, uuid
) from public, anon, authenticated;
revoke execute on function api.decide_return_inspection(uuid, text, text, uuid)
from public, anon, authenticated;
revoke execute on function api.add_return_issue_note(uuid, text, uuid)
from public, anon, authenticated;
revoke execute on function api.resolve_return_issue(
  uuid, text, numeric, text, text, uuid
) from public, anon, authenticated;
revoke execute on function api.record_external_refund(
  uuid, numeric, text, text, timestamptz, uuid
) from public, anon, authenticated;
revoke execute on function api.reverse_external_refund(
  uuid, text, text, timestamptz, text, uuid
) from public, anon, authenticated;
revoke execute on function api.get_resolution_queues()
from public, anon, authenticated;
revoke execute on function api.get_resolution_detail(uuid)
from public, anon, authenticated;
revoke execute on function api.get_my_resolution_state(uuid)
from public, anon, authenticated;
revoke execute on function api.create_condition_photo_replacement_intent(
  uuid, uuid, text, bigint, text, uuid, uuid
) from public, anon, authenticated;

grant execute on function api.request_cancellation_resolution(uuid, text, uuid)
to authenticated;
grant execute on function api.decide_cancellation_resolution(
  uuid, boolean, text, numeric, numeric, uuid
) to authenticated;
grant execute on function api.record_return_inspection(
  uuid, timestamptz, text, text, jsonb, boolean, text, uuid
) to authenticated;
grant execute on function api.decide_return_inspection(uuid, text, text, uuid)
to authenticated;
grant execute on function api.add_return_issue_note(uuid, text, uuid)
to authenticated;
grant execute on function api.resolve_return_issue(
  uuid, text, numeric, text, text, uuid
) to authenticated;
grant execute on function api.record_external_refund(
  uuid, numeric, text, text, timestamptz, uuid
) to authenticated;
grant execute on function api.reverse_external_refund(
  uuid, text, text, timestamptz, text, uuid
) to authenticated;
grant execute on function api.get_resolution_queues() to authenticated;
grant execute on function api.get_resolution_detail(uuid) to authenticated;
grant execute on function api.get_my_resolution_state(uuid) to authenticated;
grant execute on function api.create_condition_photo_replacement_intent(
  uuid, uuid, text, bigint, text, uuid, uuid
) to authenticated;

-- These public-schema tables are intentionally not exposed directly to anon or
-- authenticated Data API callers. Only the explicit RPC grants above are the
-- application contract; RLS remains enabled as defense in depth.

-- Selected compatibility adapters keep safe pre-Sprint-6 callers replayable.
-- The ambiguous legacy return/review operations remain removed; product code
-- uses the explicit operation-id signatures above for deterministic retry.
create function api.request_cancellation(p_booking_id uuid, p_reason text)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select (
    private.request_cancellation(p_booking_id, p_reason, gen_random_uuid())
    ->> 'request_id'
  )::uuid;
$$;

create function api.decide_cancellation(
  p_request_id uuid,
  p_accept boolean,
  p_note text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform private.decide_cancellation(
    p_request_id, p_accept, p_note, 0, 0, gen_random_uuid()
  );
end;
$$;

create function api.record_refund(
  p_booking_id uuid,
  p_amount numeric,
  p_reference text,
  p_recipient_name text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select (
    private.record_external_refund(
      p_booking_id,
      p_amount,
      p_reference,
      p_recipient_name,
      statement_timestamp(),
      gen_random_uuid()
    ) ->> 'transaction_id'
  )::uuid;
$$;

create function api.finalize_deposit_settlement(
  p_booking_id uuid,
  p_refund_amount numeric,
  p_deduction_amount numeric,
  p_deduction_reason text,
  p_refund_transaction_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settlement public.deposit_settlements%rowtype;
begin
  perform private.require_admin();
  select * into settlement
  from public.deposit_settlements
  where booking_id = p_booking_id and status in ('pending', 'final');
  if settlement.id is null
    or settlement.refund_amount <> p_refund_amount
    or settlement.deduction_amount <> p_deduction_amount
    or settlement.deduction_reason is distinct from p_deduction_reason
    or settlement.refund_transaction_id is distinct from p_refund_transaction_id
  then
    raise exception 'deposit_settlement_does_not_match_immutable_ledger'
      using errcode = '23514';
  end if;
  return settlement.id;
end;
$$;

revoke execute on function api.request_cancellation(uuid, text)
from public, anon, authenticated;
revoke execute on function api.decide_cancellation(uuid, boolean, text)
from public, anon, authenticated;
revoke execute on function api.record_refund(uuid, numeric, text, text)
from public, anon, authenticated;
revoke execute on function api.finalize_deposit_settlement(
  uuid, numeric, numeric, text, uuid
) from public, anon, authenticated;

grant execute on function api.request_cancellation(uuid, text) to authenticated;
grant execute on function api.decide_cancellation(uuid, boolean, text)
to authenticated;
grant execute on function api.record_refund(uuid, numeric, text, text)
to authenticated;
grant execute on function api.finalize_deposit_settlement(
  uuid, numeric, numeric, text, uuid
) to authenticated;

revoke execute on function private.resolution_text_has_forbidden_characters(text)
from public, anon, authenticated;
revoke execute on function private.verified_deposit_held(uuid)
from public, anon, authenticated;
revoke execute on function private.deposit_deduction_total(uuid)
from public, anon, authenticated;
revoke execute on function private.net_refund_total(uuid)
from public, anon, authenticated;
revoke execute on function private.replace_deposit_settlement(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
revoke execute on function private.create_condition_photo_intent_internal(
  uuid, uuid, text, bigint, text, uuid, uuid
) from public, anon, authenticated;
revoke execute on function private.deposit_outcome_json(uuid)
from public, anon, authenticated;
