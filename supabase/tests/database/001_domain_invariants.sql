begin;

select '1..1';

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

insert into private.admin_accounts (user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.profiles (user_id, legal_name, phone) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CamNook Admin', '+639000000001'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Second Renter', '+639000000003');

insert into public.cameras (
  id,
  slug,
  serial_number,
  name,
  description,
  status,
  daily_rate,
  security_deposit,
  acquisition_cost,
  replacement_value,
  published_at
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'test-camera',
  'PRIVATE-SERIAL-001',
  'Test Camera',
  'Published only for database verification.',
  'published',
  1200,
  5000,
  40000,
  50000,
  statement_timestamp()
);

set local role anon;

do $$
begin
  if (select count(*) from public.public_cameras) <> 1 then
    raise exception 'anonymous discovery must expose the published camera';
  end if;

  begin
    execute 'select serial_number from public.cameras';
    raise exception 'anonymous role unexpectedly read a private camera column';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.is_admin();
    raise exception 'anonymous role unexpectedly called the admin check';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

do $$
begin
  if api.is_admin() then
    raise exception 'non-admin account passed the admin authorization check';
  end if;

  perform api.ensure_profile('First Renter', '+639000000002');
  perform api.request_booking(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '8 days',
    'Portrait session',
    'Makati City'
  );
end;
$$;

set constraints all immediate;

do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'renter profile RLS leaked another account';
  end if;
  if (select count(*) from public.bookings) <> 1 then
    raise exception 'renter cannot read their new booking';
  end if;
  if (select count(*) from public.availability_blocks) <> 0 then
    raise exception 'FOR_REVIEW must not create an availability block';
  end if;

  begin
    update public.bookings set state = 'CANCELLED';
    raise exception 'renter unexpectedly updated booking state directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.approve_booking((select id from public.bookings limit 1));
    raise exception 'non-admin unexpectedly passed approval authorization';
  exception
    when insufficient_privilege then null;
  end;

  perform api.request_cancellation(
    (select id from public.bookings limit 1),
    'Database test cancellation request'
  );
end;
$$;

set local "request.jwt.claim.sub" = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
begin
  if (select count(*) from public.bookings) <> 0 then
    raise exception 'cross-account booking RLS leak';
  end if;
end;
$$;

reset role;

insert into public.verification_records (
  user_id,
  status,
  id_type,
  document_expiration_date,
  decided_at,
  decided_by
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'verified',
  'passport',
  (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
  statement_timestamp(),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

insert into public.contract_templates (
  id,
  version,
  schema_version,
  terms,
  content_sha256,
  created_by,
  approved_at,
  approved_by,
  activated_at
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'test-v1',
  1,
  '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb,
  extensions.digest(
    convert_to(
      '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb::text,
      'UTF8'
    ),
    'sha256'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  statement_timestamp(),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  statement_timestamp()
);

set constraints all deferred;
set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  target_booking_id uuid;
  adjacent_block_id uuid;
  cancellation_request_id uuid;
begin
  if not api.is_admin() then
    raise exception 'configured admin failed the admin authorization check';
  end if;

  select id into target_booking_id
  from public.bookings
  where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  select id into cancellation_request_id
  from public.booking_cancellation_requests
  where booking_id = target_booking_id
    and disposition = 'pending';

  perform api.decide_cancellation(
    cancellation_request_id,
    false,
    'Declined by database regression test'
  );

  if not exists (
    select 1
    from public.booking_cancellation_requests
    where id = cancellation_request_id
      and disposition = 'declined'
  ) then
    raise exception 'cancellation decision did not persist the enum disposition';
  end if;

  perform api.approve_booking(target_booking_id);

  if not exists (
    select 1
    from public.bookings
    where id = target_booking_id
      and state = 'CONTRACT_PENDING'
      and billable_days_snapshot = 1
      and rental_amount = 1200
      and total_due = 6200
      and current_contract_version_id is not null
  ) then
    raise exception 'approval did not create the authoritative aggregate';
  end if;

  perform api.create_manual_block(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    statement_timestamp() + interval '10 days',
    statement_timestamp() + interval '11 days',
    'maintenance',
    'Database test'
  );

  adjacent_block_id := api.create_manual_block(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    statement_timestamp() + interval '11 days',
    statement_timestamp() + interval '12 days',
    'manual',
    'Half-open adjacency test'
  );

  if adjacent_block_id is null then
    raise exception 'half-open adjacent range was not accepted';
  end if;

  begin
    perform api.create_manual_block(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      statement_timestamp() + interval '10 days 12 hours',
      statement_timestamp() + interval '11 days 12 hours',
      'manual',
      'Expected overlap'
    );
    raise exception 'overlapping active availability block was accepted';
  exception
    when exclusion_violation then null;
  end;
end;
$$;

reset role;
set constraints all immediate;

insert into public.payment_transactions (
  id,
  booking_id,
  direction,
  amount,
  reference,
  counterparty_display_name,
  submitted_by
)
select
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  id,
  'incoming',
  6200,
  'VALID-REFERENCE-001',
  'First Renter',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

set constraints all deferred;

update public.payment_transactions
set status = 'verified',
    decided_at = statement_timestamp(),
    decided_by = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

insert into public.payment_allocations (transaction_id, booking_id, kind, amount)
select
  'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
  id,
  'rental_payment'::public.payment_allocation_kind,
  1200
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
union all
select
  'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
  id,
  'security_deposit'::public.payment_allocation_kind,
  5000
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

update public.bookings
set state = 'COMPLETED'
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code
)
select
  id,
  'CONTRACT_PENDING',
  'COMPLETED',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'admin',
  'test_completed_fixture'
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

set constraints all immediate;

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  target_booking_id uuid;
  refund_id uuid;
  settlement_id uuid;
begin
  select id into target_booking_id
  from public.bookings
  where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  refund_id := api.record_refund(
    target_booking_id,
    5000,
    'REFUND-REFERENCE-001',
    'First Renter'
  );

  settlement_id := api.finalize_deposit_settlement(
    target_booking_id,
    5000,
    0,
    null,
    refund_id
  );

  if refund_id is null or settlement_id is null then
    raise exception 'refund and settlement operations did not return identifiers';
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and not relation.relrowsecurity
  ) then
    raise exception 'a public base table is missing RLS';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'evidence overwrite/delete policy must not exist';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'INSERT'
      and policyname like 'verification_documents%'
  ) then
    raise exception 'government-ID insertion must remain launch-gated';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'SELECT'
      and coalesce(qual, '') like '%is_admin%'
  ) then
    raise exception 'private object reads must use a future audited admin flow';
  end if;

  if not exists (
    select 1 from public.deposit_settlements
    where booking_id = (
      select id from public.bookings
      where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
      and status = 'final'
      and held_amount = 5000
      and refund_amount = 5000
      and deduction_amount = 0
  ) then
    raise exception 'manual refund did not produce a balanced final deposit settlement';
  end if;

  begin
    insert into private.admin_accounts (singleton, user_id)
    values (false, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    raise exception 'admin singleton constraint was bypassed';
  exception
    when check_violation then null;
  end;

  begin
    update public.booking_state_history set note = 'tampered';
    raise exception 'append-only booking history was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.bookings
    set approval_deadline_at = approval_deadline_at + interval '1 minute'
    where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'immutable approval deadline was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.contract_templates
    set terms = '{"terms":"tampered"}'::jsonb
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    raise exception 'activated contract template was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.payment_transactions
    set amount = amount + 1
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    raise exception 'verified payment was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    insert into public.payment_transactions (
      booking_id,
      direction,
      status,
      amount,
      reference,
      counterparty_display_name,
      submitted_by,
      decided_at,
      decided_by,
      reversal_of
    )
    select
      booking_id,
      'incoming',
      'verified',
      amount,
      'INVALID-REVERSAL-001',
      'First Renter',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      statement_timestamp(),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      id
    from public.payment_transactions
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    raise exception 'same-direction payment reversal was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

select 'ok 1 - CamNook domain and authorization invariants';

rollback;
