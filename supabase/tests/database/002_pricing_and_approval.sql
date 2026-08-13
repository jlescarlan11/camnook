begin;

select '1..1';

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000006');

insert into private.admin_accounts (user_id)
values ('10000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone, account_status) values
  ('10000000-0000-4000-8000-000000000001', 'Pricing Admin', '+639100000001', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'Verified Renter', '+639100000002', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'Expired Renter', '+639100000003', 'active'),
  ('10000000-0000-4000-8000-000000000004', 'Suspended Renter', '+639100000004', 'suspended'),
  ('10000000-0000-4000-8000-000000000005', 'Rejected Renter', '+639100000005', 'active'),
  ('10000000-0000-4000-8000-000000000006', 'Explicitly Expired Renter', '+639100000006', 'active');

insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  document_expiration_date,
  decided_at,
  decided_by,
  rejection_reason
) values
  (
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'verified',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
    statement_timestamp(),
    '10000000-0000-4000-8000-000000000001',
    null
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    'verified',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date - 1,
    statement_timestamp() - interval '30 days',
    '10000000-0000-4000-8000-000000000001',
    null
  ),
  (
    '11000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    'verified',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
    statement_timestamp(),
    '10000000-0000-4000-8000-000000000001',
    null
  ),
  (
    '11000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
    'verified',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
    statement_timestamp() - interval '2 days',
    '10000000-0000-4000-8000-000000000001',
    null
  ),
  (
    '11000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000005',
    'rejected',
    'passport',
    null,
    statement_timestamp() - interval '1 day',
    '10000000-0000-4000-8000-000000000001',
    'Identity could not be verified'
  ),
  (
    '11000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000006',
    'verified',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
    statement_timestamp() - interval '2 days',
    '10000000-0000-4000-8000-000000000001',
    null
  ),
  (
    '11000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000006',
    'expired',
    'passport',
    (statement_timestamp() at time zone 'Asia/Manila')::date - 1,
    statement_timestamp() - interval '1 day',
    '10000000-0000-4000-8000-000000000001',
    null
  );

insert into public.cameras (
  id,
  slug,
  serial_number,
  name,
  description,
  status,
  daily_rate,
  security_deposit,
  published_at
) values
  (
    '12000000-0000-4000-8000-000000000001',
    'pricing-camera',
    'PRIVATE-PRICING-SERIAL',
    'Pricing Camera',
    'Published camera for pricing and approval tests.',
    'published',
    1200.00,
    5000.00,
    statement_timestamp()
  ),
  (
    '12000000-0000-4000-8000-000000000002',
    'draft-pricing-camera',
    'PRIVATE-DRAFT-SERIAL',
    'Draft Pricing Camera',
    'Draft camera for an approval guard test.',
    'draft',
    900.00,
    3000.00,
    null
  );

insert into public.camera_accessories (
  id,
  camera_id,
  name,
  quantity,
  sort_position,
  archived_at
) values
  (
    '13000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001',
    'Battery',
    2,
    20,
    null
  ),
  (
    '13000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000001',
    'Camera bag',
    1,
    10,
    null
  ),
  (
    '13000000-0000-4000-8000-000000000003',
    '12000000-0000-4000-8000-000000000001',
    'Archived strap',
    1,
    0,
    statement_timestamp()
  );

do $$
declare
  priced record;
  offset_price jsonb;
  utc_price jsonb;
begin
  select * into priced
  from private.calculate_booking_price(
    '2099-01-01 00:00:00+00',
    '2099-01-01 00:00:00.000001+00',
    1200.00,
    5000.00
  );
  if priced.billable_days <> 1 or priced.rental_amount <> 1200.00 or priced.total_due <> 6200.00 then
    raise exception 'one microsecond must be one billable day';
  end if;

  select * into priced
  from private.calculate_booking_price(
    '2099-01-01 00:00:00+00',
    '2099-01-01 23:59:59.999+00',
    1200.00,
    5000.00
  );
  if priced.billable_days <> 1 then
    raise exception 'a period shorter than 24 hours must be one billable day';
  end if;

  select * into priced
  from private.calculate_booking_price(
    '2099-01-01 00:00:00+00',
    '2099-01-02 00:00:00+00',
    1200.00,
    5000.00
  );
  if priced.billable_days <> 1 then
    raise exception 'exactly 24 hours must not add a billable day';
  end if;

  select * into priced
  from private.calculate_booking_price(
    '2099-01-01 00:00:00+00',
    '2099-01-02 00:00:00.000001+00',
    1200.00,
    5000.00
  );
  if priced.billable_days <> 2 or priced.rental_amount <> 2400.00 or priced.total_due <> 7400.00 then
    raise exception '24 hours plus one microsecond must be two billable days';
  end if;

  select * into priced
  from private.calculate_booking_price(
    '2099-01-01 00:00:00+00',
    '2099-01-03 00:00:00+00',
    1200.00,
    5000.00
  );
  if priced.billable_days <> 2 then
    raise exception 'exactly 48 hours must be two billable days';
  end if;

  select * into priced
  from private.calculate_booking_price(
    '2099-01-01 23:30:00+08',
    '2099-01-02 00:30:00+08',
    1200.00,
    5000.00
  );
  if priced.billable_days <> 1 then
    raise exception 'crossing Manila midnight must not use calendar-day pricing';
  end if;

  select to_jsonb(price) into offset_price
  from private.calculate_booking_price(
    '2099-01-01 08:00:00+08',
    '2099-01-02 08:00:00+08',
    1200.00,
    5000.00
  ) as price;

  select to_jsonb(price) into utc_price
  from private.calculate_booking_price(
    '2099-01-01 00:00:00+00',
    '2099-01-02 00:00:00+00',
    1200.00,
    5000.00
  ) as price;

  if offset_price is distinct from utc_price then
    raise exception 'equivalent offset instants produced different full pricing: % <> %',
      offset_price,
      utc_price;
  end if;

  begin
    perform * from private.calculate_booking_price(null, '2099-01-02', 1200.00, 5000.00);
    raise exception 'missing timestamps were accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_invalid_period' then raise; end if;
  end;

  begin
    perform * from private.calculate_booking_price('2099-01-01', '2099-01-01', 1200.00, 5000.00);
    raise exception 'zero-length pricing was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_invalid_period' then raise; end if;
  end;

  begin
    perform * from private.calculate_booking_price('2099-01-02', '2099-01-01', 1200.00, 5000.00);
    raise exception 'reversed pricing was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_invalid_period' then raise; end if;
  end;

  begin
    perform * from private.calculate_booking_price(
      '2000-01-01',
      '9999-12-31',
      9999999999.99,
      9999999999.99
    );
    raise exception 'unrepresentable money was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_amount_unrepresentable' then raise; end if;
  end;
end;
$$;

set local role anon;

do $$
declare
  quote_json jsonb;
begin
  select to_jsonb(quote_row) into quote_json
  from api.quote_booking(
    '12000000-0000-4000-8000-000000000001',
    '2099-02-01 08:00:00+08',
    '2099-02-02 08:00:00.000001+08'
  ) as quote_row;

  if quote_json <> jsonb_build_object(
    'camera_id', '12000000-0000-4000-8000-000000000001'::uuid,
    'pickup_at', '2099-02-01 00:00:00+00'::timestamptz,
    'return_at', '2099-02-02 00:00:00.000001+00'::timestamptz,
    'billable_days', 2,
    'daily_rate', 1200.00,
    'rental_amount', 2400.00,
    'security_deposit', 5000.00,
    'total_due', 7400.00,
    'currency', 'PHP'
  ) then
    raise exception 'anonymous quote returned a non-sanitized or inconsistent shape: %', quote_json;
  end if;

  begin
    perform * from api.quote_booking(
      '12000000-0000-4000-8000-000000000002',
      '2099-02-01',
      '2099-02-02'
    );
    raise exception 'draft camera was quoted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_camera_unavailable' then raise; end if;
  end;

  begin
    perform * from api.quote_booking(
      '12000000-0000-4000-8000-000000000099',
      '2099-02-01',
      '2099-02-02'
    );
    raise exception 'missing camera was quoted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_camera_unavailable' then raise; end if;
  end;

  begin
    perform * from api.quote_booking(
      '12000000-0000-4000-8000-000000000001',
      statement_timestamp() - interval '2 hours',
      statement_timestamp() - interval '1 hour'
    );
    raise exception 'past-facing quote was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_invalid_period' then raise; end if;
  end;

  begin
    perform * from api.quote_booking(
      '12000000-0000-4000-8000-000000000001',
      null,
      '2099-02-02'
    );
    raise exception 'public quote accepted a missing pickup instant';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_invalid_period' then raise; end if;
  end;

  begin
    perform * from api.quote_booking(
      '12000000-0000-4000-8000-000000000001',
      '2099-02-02',
      '2099-02-02'
    );
    raise exception 'public quote accepted a zero-length period';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_invalid_period' then raise; end if;
  end;

  begin
    perform * from api.quote_booking(
      '12000000-0000-4000-8000-000000000001',
      '2099-02-03',
      '2099-02-02'
    );
    raise exception 'public quote accepted a reversed period';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'quote_invalid_period' then raise; end if;
  end;

  begin
    perform private.approve_booking('14000000-0000-4000-8000-000000000099');
    raise exception 'anonymous role directly called a private approval function';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';

do $$
begin
  if (
    select quote.billable_days
    from api.quote_booking(
      '12000000-0000-4000-8000-000000000001',
      '2099-02-01 00:00:00+00',
      '2099-02-02 00:00:00+00'
    ) as quote
  ) <> 1 then
    raise exception 'authenticated quote did not use the public pricing contract';
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (select 1 from public.bookings)
    or exists (select 1 from public.contract_versions)
    or exists (select 1 from public.availability_blocks)
    or exists (select 1 from private.audit_logs)
  then
    raise exception 'quote created persistent state';
  end if;
end;
$$;

set constraints all deferred;

insert into public.bookings (
  id,
  renter_id,
  camera_id,
  pickup_at,
  return_at,
  intended_use,
  expected_location
) values
  (
    '14000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000001',
    '2099-03-01 00:00:00+00',
    '2099-03-02 00:00:00.000001+00',
    'Success approval',
    'Makati City'
  ),
  (
    '14000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '12000000-0000-4000-8000-000000000001',
    '2099-04-01 00:00:00+00',
    '2099-04-02 00:00:00+00',
    'Expired verification guard',
    'Quezon City'
  ),
  (
    '14000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000002',
    '2099-05-01 00:00:00+00',
    '2099-05-02 00:00:00+00',
    'Draft camera guard',
    'Taguig City'
  ),
  (
    '14000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000001',
    '2099-06-01 00:00:00+00',
    '2099-06-02 00:00:00+00',
    'Overlap rollback guard',
    'Pasig City'
  ),
  (
    '14000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000004',
    '12000000-0000-4000-8000-000000000001',
    '2099-07-01 00:00:00+00',
    '2099-07-02 00:00:00+00',
    'Suspended profile guard',
    'Manila'
  ),
  (
    '14000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001',
    '2099-07-03 00:00:00+00',
    '2099-07-04 00:00:00+00',
    'Missing verification guard',
    'Manila'
  ),
  (
    '14000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000005',
    '12000000-0000-4000-8000-000000000001',
    '2099-07-05 00:00:00+00',
    '2099-07-06 00:00:00+00',
    'Newer rejected verification guard',
    'Manila'
  ),
  (
    '14000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000006',
    '12000000-0000-4000-8000-000000000001',
    '2099-07-07 00:00:00+00',
    '2099-07-08 00:00:00+00',
    'Newer explicit expired verification guard',
    'Manila'
  ),
  (
    '14000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000001',
    '2000-01-01 00:00:00+00',
    '2000-01-02 00:00:00+00',
    'Elapsed pickup guard',
    'Makati City'
  );

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code
)
select
  booking.id,
  null,
  'FOR_REVIEW',
  booking.renter_id,
  'renter',
  'booking_requested'
from public.bookings as booking;

set constraints all immediate;
set constraints all deferred;

set local role anon;

do $$
begin
  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000001');
    raise exception 'anonymous caller unexpectedly invoked public approval RPC';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.reject_booking(
      '14000000-0000-4000-8000-000000000001',
      'Anonymous rejection attempt'
    );
    raise exception 'anonymous caller unexpectedly invoked public rejection RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege(
    'anon',
    'api.approve_booking(uuid)',
    'EXECUTE'
  )
    or has_function_privilege(
      'anon',
      'api.reject_booking(uuid,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'api.approve_booking(uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'api.reject_booking(uuid,text)',
      'EXECUTE'
    )
  then
    raise exception 'booking decision API execute privileges are unsafe';
  end if;

  if not has_function_privilege(
    'anon',
    'api.quote_booking(uuid,timestamptz,timestamptz)',
    'EXECUTE'
  )
    or not has_function_privilege(
      'anon',
      'private.calculate_booking_price(timestamptz,timestamptz,numeric,numeric)',
      'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname in ('api', 'private')
        and has_function_privilege('anon', procedure.oid, 'EXECUTE')
        and procedure.oid not in (
          'api.quote_booking(uuid,timestamptz,timestamptz)'::regprocedure::oid,
          'private.calculate_booking_price(timestamptz,timestamptz,numeric,numeric)'::regprocedure::oid
        )
    )
  then
    raise exception 'anonymous operation execute allowlist is unsafe';
  end if;

  if not exists (
    select 1
    from public.bookings
    where id = '14000000-0000-4000-8000-000000000001'
      and state = 'FOR_REVIEW'
      and approved_at is null
      and approval_deadline_at is null
      and approved_by is null
      and billable_days_snapshot is null
      and daily_rate_snapshot is null
      and rental_amount is null
      and security_deposit_amount is null
      and current_contract_version_id is null
  )
    or exists (
      select 1 from public.contract_versions
      where booking_id = '14000000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1 from public.availability_blocks
      where booking_id = '14000000-0000-4000-8000-000000000001'
    )
  then
    raise exception 'anonymous public approval denial changed the booking aggregate';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000001');
    raise exception 'non-admin approval was accepted';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'approval_unauthorized' then raise; end if;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000099');
    raise exception 'missing booking approval was accepted';
  exception
    when sqlstate 'P0002' then
      if sqlerrm <> 'approval_booking_not_found' then raise; end if;
  end;

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000001');
    raise exception 'approval without an active template was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_template_unavailable' then raise; end if;
  end;

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000002');
    raise exception 'approval with expired verification was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_verification_invalid' then raise; end if;
  end;

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000003');
    raise exception 'approval of a draft camera was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_camera_unavailable' then raise; end if;
  end;

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000005');
    raise exception 'approval for a suspended profile was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_profile_inactive' then raise; end if;
  end;

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000006');
    raise exception 'approval without verification was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_verification_invalid' then raise; end if;
  end;

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000007');
    raise exception 'approval bypassed a newer rejected verification decision';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_verification_invalid' then raise; end if;
  end;

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000008');
    raise exception 'approval bypassed a newer explicit expired verification decision';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_verification_invalid' then raise; end if;
  end;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.bookings
    where id in (
      '14000000-0000-4000-8000-000000000007',
      '14000000-0000-4000-8000-000000000008'
    )
      and (
        state <> 'FOR_REVIEW'
        or approved_at is not null
        or approval_deadline_at is not null
        or approved_by is not null
        or billable_days_snapshot is not null
        or daily_rate_snapshot is not null
        or rental_amount is not null
        or security_deposit_amount is not null
        or current_contract_version_id is not null
      )
  )
    or exists (
      select 1
      from public.contract_versions
      where booking_id in (
        '14000000-0000-4000-8000-000000000007',
        '14000000-0000-4000-8000-000000000008'
      )
    )
    or exists (
      select 1
      from public.availability_blocks
      where booking_id in (
        '14000000-0000-4000-8000-000000000007',
        '14000000-0000-4000-8000-000000000008'
      )
    )
  then
    raise exception 'current-verification guard left a partial approval aggregate';
  end if;
end;
$$;

do $$
begin
  begin
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
      '15000000-0000-4000-8000-000000000099',
      'invalid-template',
      1,
      '{"pickup":"only one required term"}'::jsonb,
      decode(repeat('00', 32), 'hex'),
      '10000000-0000-4000-8000-000000000001',
      statement_timestamp(),
      '10000000-0000-4000-8000-000000000001',
      statement_timestamp()
    );

    perform api.approve_booking('14000000-0000-4000-8000-000000000001');
    raise exception 'approval accepted an incomplete terms object';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_template_invalid' then raise; end if;
  end;
end;
$$;

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
  '15000000-0000-4000-8000-000000000001',
  'pricing-template-v1',
  7,
  jsonb_build_object(
    'pickup', 'Present the original ID at pickup.',
    'return', 'Return the camera at the agreed instant.',
    'cancellation', 'Cancellation terms remain subject to OD-03.',
    'late-return', 'Late-return amounts are decided manually.',
    'damage', 'Damage is assessed manually.',
    'loss', 'Loss is assessed manually.',
    'non-transferability', 'Only the named renter may collect the camera.'
  ),
  extensions.digest(
    convert_to(
      jsonb_build_object(
        'pickup', 'Present the original ID at pickup.',
        'return', 'Return the camera at the agreed instant.',
        'cancellation', 'Cancellation terms remain subject to OD-03.',
        'late-return', 'Late-return amounts are decided manually.',
        'damage', 'Damage is assessed manually.',
        'loss', 'Loss is assessed manually.',
        'non-transferability', 'Only the named renter may collect the camera.'
      )::text,
      'UTF8'
    ),
    'sha256'
  ),
  '10000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  '10000000-0000-4000-8000-000000000001',
  statement_timestamp()
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000009');
    raise exception 'approval accepted a booking after its pickup instant';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'approval_invalid_period' then raise; end if;
  end;
end;
$$;

reset role;

do $$
declare
  violated_constraint text;
begin
  if not exists (
    select 1
    from public.bookings
    where id = '14000000-0000-4000-8000-000000000009'
      and state = 'FOR_REVIEW'
      and approved_at is null
      and approval_deadline_at is null
      and approved_by is null
      and billable_days_snapshot is null
      and daily_rate_snapshot is null
      and rental_amount is null
      and security_deposit_amount is null
      and current_contract_version_id is null
  )
    or exists (
      select 1 from public.contract_versions
      where booking_id = '14000000-0000-4000-8000-000000000009'
    )
    or exists (
      select 1 from public.availability_blocks
      where booking_id = '14000000-0000-4000-8000-000000000009'
    )
    or exists (
      select 1 from public.booking_state_history
      where booking_id = '14000000-0000-4000-8000-000000000009'
        and to_state = 'CONTRACT_PENDING'
    )
    or exists (
      select 1 from private.audit_logs
      where action = 'approve_booking'
        and entity_id = '14000000-0000-4000-8000-000000000009'
        and outcome = 'success'
    )
  then
    raise exception 'elapsed-pickup denial left a partial approval aggregate';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_approval_precedes_pickup'
      and contype = 'c'
      and convalidated
  ) then
    raise exception 'approved-before-pickup invariant is missing or unvalidated';
  end if;

  begin
    update public.bookings
    set approved_at = statement_timestamp(),
        approval_deadline_at = statement_timestamp() + interval '24 hours',
        approved_by = '10000000-0000-4000-8000-000000000001',
        billable_days_snapshot = 1,
        daily_rate_snapshot = 1200.00,
        rental_amount = 1200.00,
        security_deposit_amount = 5000.00
    where id = '14000000-0000-4000-8000-000000000009';

    raise exception 'direct write bypassed approved-before-pickup invariant';
  exception
    when check_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint <> 'bookings_approval_precedes_pickup' then
        raise;
      end if;
  end;
end;
$$;

insert into public.availability_blocks (
  id,
  camera_id,
  kind,
  starts_at,
  ends_at,
  created_by,
  reason
) values (
  '16000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'maintenance',
  '2099-06-01 12:00:00+00',
  '2099-06-03 00:00:00+00',
  '10000000-0000-4000-8000-000000000001',
  'Overlap rollback fixture'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000004');
    raise exception 'overlapping approval was accepted';
  exception
    when sqlstate '23P01' then
      if sqlerrm <> 'approval_overlap' then raise; end if;
  end;

  perform api.approve_booking('14000000-0000-4000-8000-000000000001');

  begin
    perform api.approve_booking('14000000-0000-4000-8000-000000000001');
    raise exception 'repeated approval was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'approval_stale_booking_state' then raise; end if;
  end;

  begin
    perform api.reject_booking(
      '14000000-0000-4000-8000-000000000001',
      'Stale rejection boundary test'
    );
    raise exception 'rejection after approval was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'booking state changed or transition precondition failed' then
        raise;
      end if;
  end;
end;
$$;

reset role;

do $$
declare
  issued_snapshot jsonb;
  issued_hash bytea;
begin
  if not exists (
    select 1
    from public.bookings
    where id = '14000000-0000-4000-8000-000000000004'
      and state = 'FOR_REVIEW'
      and approved_at is null
      and approval_deadline_at is null
      and approved_by is null
      and billable_days_snapshot is null
      and daily_rate_snapshot is null
      and rental_amount is null
      and security_deposit_amount is null
      and current_contract_version_id is null
  )
    or exists (
      select 1 from public.contract_versions
      where booking_id = '14000000-0000-4000-8000-000000000004'
    )
    or exists (
      select 1 from public.availability_blocks
      where booking_id = '14000000-0000-4000-8000-000000000004'
    )
    or exists (
      select 1 from public.booking_state_history
      where booking_id = '14000000-0000-4000-8000-000000000004'
        and to_state = 'CONTRACT_PENDING'
    )
    or exists (
      select 1 from private.audit_logs
      where action = 'approve_booking'
        and entity_id = '14000000-0000-4000-8000-000000000004'
        and outcome = 'success'
    )
  then
    raise exception 'overlap failure left a partial approval aggregate';
  end if;

  if not exists (
    select 1
    from public.bookings
    where id = '14000000-0000-4000-8000-000000000001'
      and state = 'CONTRACT_PENDING'
      and approved_at is not null
      and approval_deadline_at = approved_at + interval '24 hours'
      and approved_by = '10000000-0000-4000-8000-000000000001'
      and billable_days_snapshot = 2
      and daily_rate_snapshot = 1200.00
      and rental_amount = 2400.00
      and security_deposit_amount = 5000.00
      and total_due = 7400.00
      and currency = 'PHP'
      and current_contract_version_id is not null
  ) then
    raise exception 'successful approval did not persist authoritative booking facts';
  end if;

  if (select count(*) from public.availability_blocks where booking_id = '14000000-0000-4000-8000-000000000001' and released_at is null) <> 1
    or (select count(*) from public.contract_versions where booking_id = '14000000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.booking_state_history where booking_id = '14000000-0000-4000-8000-000000000001' and to_state = 'CONTRACT_PENDING') <> 1
    or (select count(*) from public.booking_state_history where booking_id = '14000000-0000-4000-8000-000000000001' and to_state = 'REJECTED') <> 0
    or (select count(*) from private.audit_logs where action = 'approve_booking' and entity_id = '14000000-0000-4000-8000-000000000001' and outcome = 'success') <> 1
    or (select count(*) from private.audit_logs where action = 'reject_booking' and entity_id = '14000000-0000-4000-8000-000000000001') <> 0
  then
    raise exception 'successful approval aggregate was missing or duplicated';
  end if;

  select snapshot, content_sha256
    into issued_snapshot, issued_hash
  from public.contract_versions
  where booking_id = '14000000-0000-4000-8000-000000000001'
    and version_no = 1
    and status = 'issued'
    and snapshot_schema_version = 1;

  if issued_snapshot is null
    or issued_hash <> extensions.digest(convert_to(issued_snapshot::text, 'UTF8'), 'sha256')
    or issued_snapshot #>> '{booking,pickup_at}' <> '2099-03-01T00:00:00.000000Z'
    or issued_snapshot #>> '{booking,return_at}' <> '2099-03-02T00:00:00.000001Z'
    or issued_snapshot #>> '{booking,intended_use}' <> 'Success approval'
    or issued_snapshot #>> '{booking,expected_location}' <> 'Makati City'
    or issued_snapshot #>> '{renter,legal_name}' <> 'Verified Renter'
    or issued_snapshot #>> '{renter,phone}' <> '+639100000002'
    or issued_snapshot #>> '{camera,id}' <> '12000000-0000-4000-8000-000000000001'
    or issued_snapshot #>> '{camera,name}' <> 'Pricing Camera'
    or issued_snapshot #>> '{camera,serial_number}' <> 'PRIVATE-PRICING-SERIAL'
    or issued_snapshot #> '{camera,accessories}' <> '[{"id":"13000000-0000-4000-8000-000000000002","name":"Camera bag","quantity":1},{"id":"13000000-0000-4000-8000-000000000001","name":"Battery","quantity":2}]'::jsonb
    or issued_snapshot #>> '{pricing,billable_days}' <> '2'
    or (issued_snapshot #>> '{pricing,daily_rate}')::numeric <> 1200.00
    or (issued_snapshot #>> '{pricing,rental_amount}')::numeric <> 2400.00
    or (issued_snapshot #>> '{pricing,security_deposit}')::numeric <> 5000.00
    or (issued_snapshot #>> '{pricing,total_due}')::numeric <> 7400.00
    or issued_snapshot #>> '{pricing,currency}' <> 'PHP'
    or issued_snapshot #>> '{template,id}' <> '15000000-0000-4000-8000-000000000001'
    or issued_snapshot #>> '{template,version}' <> 'pricing-template-v1'
    or issued_snapshot #>> '{template,schema_version}' <> '7'
    or issued_snapshot #>> '{template,content_sha256}' <> (
      select encode(template.content_sha256, 'hex')
      from public.contract_templates as template
      where template.id = '15000000-0000-4000-8000-000000000001'
    )
    or not ((issued_snapshot #> '{template,terms}') ?& array[
      'pickup', 'return', 'cancellation', 'late-return', 'damage', 'loss', 'non-transferability'
    ])
  then
    raise exception 'issued contract snapshot is incomplete or its digest is invalid: %', issued_snapshot;
  end if;

  update public.profiles
  set legal_name = 'Changed Renter', phone = '+639199999999'
  where user_id = '10000000-0000-4000-8000-000000000002';

  update public.cameras
  set name = 'Changed Camera', serial_number = 'CHANGED-SERIAL'
  where id = '12000000-0000-4000-8000-000000000001';

  update public.camera_accessories
  set name = 'Changed bag', quantity = 9
  where id = '13000000-0000-4000-8000-000000000002';

  if (select snapshot from public.contract_versions where booking_id = '14000000-0000-4000-8000-000000000001') <> issued_snapshot then
    raise exception 'issued snapshot changed with mutable source records';
  end if;

  begin
    update public.bookings
    set billable_days_snapshot = 3
    where id = '14000000-0000-4000-8000-000000000001';
    raise exception 'approved billable-day snapshot was mutable';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.contract_versions
    set snapshot = jsonb_set(snapshot, '{pricing,billable_days}', '3')
    where booking_id = '14000000-0000-4000-8000-000000000001';
    raise exception 'issued contract snapshot was mutable';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.bookings
    set billable_days_snapshot = 1
    where id = '14000000-0000-4000-8000-000000000002';
    raise exception 'pre-approval booking accepted a billable-day snapshot';
  exception
    when check_violation then null;
  end;
end;
$$;

select 'ok 1 - authoritative pricing, quote, and atomic approval invariants';

rollback;
