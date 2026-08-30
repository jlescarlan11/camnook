begin;

select '1..1';

insert into auth.users (id) values
  ('50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('50000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('50000000-0000-4000-8000-000000000001', 'Contract Admin', '+639200000001'),
  ('50000000-0000-4000-8000-000000000002', 'Named Renter', '+639200000002'),
  ('50000000-0000-4000-8000-000000000003', 'Other Renter', '+639200000003');

insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  document_expiration_date,
  decided_at,
  decided_by
) values (
  '51000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  'verified',
  'passport',
  '2099-12-31',
  statement_timestamp(),
  '50000000-0000-4000-8000-000000000001'
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
    '52000000-0000-4000-8000-000000000001',
    'contract-camera-one',
    'CONTRACT-SERIAL-ONE',
    'Contract Camera One',
    'Initial agreement camera.',
    'published',
    1000.00,
    4000.00,
    statement_timestamp()
  ),
  (
    '52000000-0000-4000-8000-000000000002',
    'contract-camera-two',
    'CONTRACT-SERIAL-TWO',
    'Contract Camera Two',
    'Replacement agreement camera.',
    'published',
    1500.00,
    5500.00,
    statement_timestamp()
  );

insert into public.camera_accessories (
  id,
  camera_id,
  name,
  quantity,
  sort_position
) values
  (
    '53000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    'Battery',
    1,
    1
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000002',
    'Battery',
    2,
    1
  ),
  (
    '53000000-0000-4000-8000-000000000003',
    '52000000-0000-4000-8000-000000000002',
    'Tripod',
    1,
    2
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
  '54000000-0000-4000-8000-000000000001',
  'contract-template-v1',
  1,
  '{"pickup":"pickup-v1","return":"return-v1","cancellation":"cancel-v1","late-return":"late-v1","damage":"damage-v1","loss":"loss-v1","non-transferability":"named-renter-v1"}'::jsonb,
  extensions.digest(
    convert_to(
      '{"pickup":"pickup-v1","return":"return-v1","cancellation":"cancel-v1","late-return":"late-v1","damage":"damage-v1","loss":"loss-v1","non-transferability":"named-renter-v1"}'::jsonb::text,
      'UTF8'
    ),
    'sha256'
  ),
  '50000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  '50000000-0000-4000-8000-000000000001',
  statement_timestamp()
);

insert into public.bookings (
  id,
  renter_id,
  camera_id,
  pickup_at,
  return_at,
  intended_use,
  expected_location
) values (
  '55000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000001',
  '2099-09-01 00:00:00+00',
  '2099-09-03 00:00:00+00',
  'Documentary project',
  'Makati City'
);

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code
) values (
  '55000000-0000-4000-8000-000000000001',
  null,
  'FOR_REVIEW',
  '50000000-0000-4000-8000-000000000002',
  'renter',
  'booking_requested'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';

select api.approve_booking('55000000-0000-4000-8000-000000000001');

reset role;

select set_config(
  'test.contract_deadline',
  (
    select approval_deadline_at::text
    from public.bookings
    where id = '55000000-0000-4000-8000-000000000001'
  ),
  true
);
select set_config(
  'test.contract_v1',
  (
    select current_contract_version_id::text
    from public.bookings
    where id = '55000000-0000-4000-8000-000000000001'
  ),
  true
);

do $$
declare
  version public.contract_versions%rowtype;
begin
  select * into version
  from public.contract_versions
  where id = current_setting('test.contract_v1')::uuid;

  if version.version_no <> 1
    or version.status <> 'issued'
    or version.snapshot #>> '{renter,legal_name}' <> 'Named Renter'
    or version.snapshot #>> '{camera,name}' <> 'Contract Camera One'
    or version.snapshot #>> '{camera,serial_number}' <> 'CONTRACT-SERIAL-ONE'
    or version.snapshot #>> '{camera,accessories,0,name}' <> 'Battery'
    or version.snapshot #>> '{booking,intended_use}' <> 'Documentary project'
    or version.snapshot #>> '{booking,expected_location}' <> 'Makati City'
    or version.snapshot #>> '{pricing,daily_rate}' <> '1000.00'
    or version.snapshot #>> '{pricing,security_deposit}' <> '4000.00'
    or version.snapshot #>> '{template,version}' <> 'contract-template-v1'
    or version.snapshot #>> '{template,terms,pickup}' <> 'pickup-v1'
    or version.content_sha256 <> extensions.digest(
      convert_to(version.snapshot::text, 'UTF8'),
      'sha256'
    )
  then
    raise exception 'approval did not persist the complete canonical contract v1';
  end if;

  if not exists (
    select 1
    from private.audit_logs
    where action = 'contract_created'
      and entity_id = version.id
      and actor_user_id = '50000000-0000-4000-8000-000000000001'
      and outcome = 'success'
  ) then
    raise exception 'contract creation audit is incomplete';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';

do $$
begin
  if (
    select count(*)
    from public.contract_versions
    where booking_id = '55000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'booking owner cannot read the current contract';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000003';

do $$
begin
  if exists (
    select 1
    from public.contract_versions
    where booking_id = '55000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'another renter read an owner contract';
  end if;

  begin
    perform *
    from api.sign_contract(current_setting('test.contract_v1')::uuid, true);
    raise exception 'another renter signed an owner contract';
  exception
    when sqlstate 'P0002' then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform *
    from api.sign_contract(current_setting('test.contract_v1')::uuid, false);
    raise exception 'contract signing accepted missing consent';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'contract_consent_required' then raise; end if;
  end;
end;
$$;

do $$
declare
  first_result record;
  retry_result record;
begin
  select * into first_result
  from api.sign_contract(current_setting('test.contract_v1')::uuid, true);

  if first_result.created is not true then
    raise exception 'first signature was not reported as created';
  end if;

  select * into retry_result
  from api.sign_contract(current_setting('test.contract_v1')::uuid, true);

  if retry_result.created is not false
    or retry_result.signature_id <> first_result.signature_id
    or retry_result.signed_at <> first_result.signed_at
  then
    raise exception 'successful signature retry was not idempotent';
  end if;

  perform set_config('test.signature_id', first_result.signature_id::text, true);
end;
$$;

reset role;

do $$
declare
  version_hash bytea;
begin
  select content_sha256 into version_hash
  from public.contract_versions
  where id = current_setting('test.contract_v1')::uuid;

  if (
    select state
    from public.bookings
    where id = '55000000-0000-4000-8000-000000000001'
  ) <> 'TO_PAY'
    or (
      select approval_deadline_at::text
      from public.bookings
      where id = '55000000-0000-4000-8000-000000000001'
    ) <> current_setting('test.contract_deadline')
    or (
      select count(*)
      from public.contract_signatures
      where contract_version_id = current_setting('test.contract_v1')::uuid
    ) <> 1
    or (
      select acknowledged_content_sha256
      from public.contract_signatures
      where id = current_setting('test.signature_id')::uuid
    ) <> version_hash
    or not exists (
      select 1
      from public.contract_signatures
      where id = current_setting('test.signature_id')::uuid
        and renter_id = '50000000-0000-4000-8000-000000000002'
        and signature_intent = 'electronic_signature'
        and attestation_text = 'I have reviewed and agree to this exact rental contract version.'
        and signed_at >= (
          select approved_at
          from public.bookings
          where id = '55000000-0000-4000-8000-000000000001'
        )
    )
    or not exists (
      select 1
      from public.availability_blocks
      where booking_id = '55000000-0000-4000-8000-000000000001'
        and camera_id = '52000000-0000-4000-8000-000000000001'
        and starts_at = '2099-09-01 00:00:00+00'
        and ends_at = '2099-09-03 00:00:00+00'
        and released_at is null
    )
    or not exists (
      select 1
      from public.booking_state_history
      where booking_id = '55000000-0000-4000-8000-000000000001'
        and from_state = 'CONTRACT_PENDING'
        and to_state = 'TO_PAY'
        and reason_code = 'contract_signed'
    )
    or not exists (
      select 1
      from private.audit_logs
      where action = 'contract_signed'
        and entity_id = current_setting('test.contract_v1')::uuid
        and metadata ->> 'signature_id' = current_setting('test.signature_id')
        and metadata ->> 'actor_type' = 'renter'
        and occurred_at = (
          select signed_at
          from public.contract_signatures
          where id = current_setting('test.signature_id')::uuid
        )
    )
  then
    raise exception 'signature did not bind exact content and atomically advance state';
  end if;
end;
$$;

-- Activate changed legal terms without rewriting the earlier template.
update public.contract_templates
set deactivated_at = clock_timestamp()
where id = '54000000-0000-4000-8000-000000000001';

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
  '54000000-0000-4000-8000-000000000002',
  'contract-template-v2',
  1,
  '{"pickup":"pickup-v2","return":"return-v2","cancellation":"cancel-v2","late-return":"late-v2","damage":"damage-v2","loss":"loss-v2","non-transferability":"named-renter-v2"}'::jsonb,
  extensions.digest(
    convert_to(
      '{"pickup":"pickup-v2","return":"return-v2","cancellation":"cancel-v2","late-return":"late-v2","damage":"damage-v2","loss":"loss-v2","non-transferability":"named-renter-v2"}'::jsonb::text,
      'UTF8'
    ),
    'sha256'
  ),
  '50000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  '50000000-0000-4000-8000-000000000001',
  statement_timestamp()
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000003';

do $$
begin
  begin
    perform api.supersede_contract(
      '55000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002',
      '2099-10-01 00:00:00+00',
      '2099-10-04 00:00:00+00'
    );
    raise exception 'ordinary renter superseded a contract';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';

select set_config(
  'test.contract_v2',
  api.supersede_contract(
    '55000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000002',
    '2099-10-01 00:00:00+00',
    '2099-10-04 00:00:00+00'
  )::text,
  true
);

reset role;
set constraints bookings_validate_current_contract_pointer immediate;
set constraints bookings_validate_current_contract_pointer deferred;

do $$
declare
  replacement public.contract_versions%rowtype;
begin
  select * into replacement
  from public.contract_versions
  where id = current_setting('test.contract_v2')::uuid;

  if replacement.version_no <> 2
    or replacement.status <> 'issued'
    or replacement.supersedes_id <> current_setting('test.contract_v1')::uuid
    or replacement.snapshot #>> '{camera,name}' <> 'Contract Camera Two'
    or replacement.snapshot #>> '{camera,serial_number}' <> 'CONTRACT-SERIAL-TWO'
    or replacement.snapshot #>> '{camera,accessories,1,name}' <> 'Tripod'
    or replacement.snapshot #>> '{pricing,daily_rate}' <> '1500.00'
    or replacement.snapshot #>> '{pricing,security_deposit}' <> '5500.00'
    or replacement.snapshot #>> '{template,version}' <> 'contract-template-v2'
    or replacement.snapshot #>> '{template,terms,pickup}' <> 'pickup-v2'
    or (
      select status
      from public.contract_versions
      where id = current_setting('test.contract_v1')::uuid
    ) <> 'superseded'
    or (
      select state
      from public.bookings
      where id = '55000000-0000-4000-8000-000000000001'
    ) <> 'CONTRACT_PENDING'
    or (
      select approval_deadline_at::text
      from public.bookings
      where id = '55000000-0000-4000-8000-000000000001'
    ) <> current_setting('test.contract_deadline')
    or (
      select total_due::text
      from public.bookings
      where id = '55000000-0000-4000-8000-000000000001'
    ) <> replacement.snapshot #>> '{pricing,total_due}'
    or not exists (
      select 1
      from public.contract_signatures
      where id = current_setting('test.signature_id')::uuid
        and contract_version_id = current_setting('test.contract_v1')::uuid
    )
    or exists (
      select 1
      from public.contract_signatures
      where contract_version_id = replacement.id
    )
  then
    raise exception 'material amendment did not preserve history and issue exact replacement terms';
  end if;

  if not exists (
    select 1
    from public.availability_blocks
    where booking_id = '55000000-0000-4000-8000-000000000001'
      and camera_id = '52000000-0000-4000-8000-000000000002'
      and starts_at = '2099-10-01 00:00:00+00'
      and ends_at = '2099-10-04 00:00:00+00'
      and released_at is null
  ) then
    raise exception 'supersession did not atomically move the active block';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform *
    from api.sign_contract(current_setting('test.contract_v1')::uuid, true);
    raise exception 'superseded version was signed';
  exception
    when serialization_failure then null;
  end;

  if not exists (
    select 1
    from public.bookings
    where id = '55000000-0000-4000-8000-000000000001'
      and state = 'CONTRACT_PENDING'
      and approval_deadline_at::text = current_setting('test.contract_deadline')
  ) or exists (
    select 1
    from public.contract_signatures
    where contract_version_id = current_setting('test.contract_v2')::uuid
  ) then
    raise exception 'stale signature attempt changed state, deadline, or signature history';
  end if;
end;
$$;

reset role;

-- Persist a due unsigned aggregate to prove system expiry, block release,
-- append-only state/audit history, and idempotency without changing its deadline.
insert into public.bookings (
  id,
  renter_id,
  camera_id,
  state,
  pickup_at,
  return_at,
  intended_use,
  expected_location,
  approved_at,
  approval_deadline_at,
  approved_by,
  billable_days_snapshot,
  daily_rate_snapshot,
  rental_amount,
  security_deposit_amount
) values (
  '55000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000001',
  'CONTRACT_PENDING',
  '2099-11-01 00:00:00+00',
  '2099-11-02 00:00:00+00',
  'Expired unsigned agreement',
  'Manila',
  statement_timestamp() - interval '25 hours',
  statement_timestamp() - interval '1 hour',
  '50000000-0000-4000-8000-000000000001',
  1,
  1000.00,
  1000.00,
  4000.00
);

insert into public.contract_versions (
  id,
  booking_id,
  version_no,
  status,
  template_id,
  snapshot,
  snapshot_schema_version,
  content_sha256,
  issued_at,
  issued_by
) values (
  '56000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000002',
  1,
  'issued',
  '54000000-0000-4000-8000-000000000002',
  '{"expired":"unsigned"}'::jsonb,
  1,
  extensions.digest(convert_to('{"expired":"unsigned"}'::jsonb::text, 'UTF8'), 'sha256'),
  statement_timestamp() - interval '25 hours',
  '50000000-0000-4000-8000-000000000001'
);

update public.bookings
set current_contract_version_id = '56000000-0000-4000-8000-000000000001'
where id = '55000000-0000-4000-8000-000000000002';

insert into public.availability_blocks (
  camera_id,
  booking_id,
  kind,
  starts_at,
  ends_at,
  created_by,
  reason
) values (
  '52000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000002',
  'booking',
  '2099-11-01 00:00:00+00',
  '2099-11-02 00:00:00+00',
  '50000000-0000-4000-8000-000000000001',
  'expired_contract_fixture'
);

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code
) values
  (
    '55000000-0000-4000-8000-000000000002',
    null,
    'FOR_REVIEW',
    '50000000-0000-4000-8000-000000000002',
    'renter',
    'booking_requested'
  ),
  (
    '55000000-0000-4000-8000-000000000002',
    'FOR_REVIEW',
    'CONTRACT_PENDING',
    '50000000-0000-4000-8000-000000000001',
    'admin',
    'booking_approved'
  );

set constraints bookings_validate_current_contract_pointer immediate;
set constraints bookings_validate_current_contract_pointer deferred;

set local role service_role;
set local "request.jwt.claim.sub" = '';

do $$
begin
  if api.expire_due_bookings('57000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'due unsigned contract was not expired exactly once';
  end if;
  if api.expire_due_bookings('57000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'booking expiry retry was not idempotent';
  end if;
end;
$$;

reset role;

do $$
begin
  if (
    select state
    from public.bookings
    where id = '55000000-0000-4000-8000-000000000002'
  ) <> 'EXPIRED'
    or (
      select approval_deadline_at
      from public.bookings
      where id = '55000000-0000-4000-8000-000000000002'
    ) >= statement_timestamp()
    or (
      select status
      from public.contract_versions
      where id = '56000000-0000-4000-8000-000000000001'
    ) <> 'voided'
    or not exists (
      select 1
      from public.availability_blocks
      where booking_id = '55000000-0000-4000-8000-000000000002'
        and released_at is not null
    )
    or not exists (
      select 1
      from public.booking_state_history
      where booking_id = '55000000-0000-4000-8000-000000000002'
        and from_state = 'CONTRACT_PENDING'
        and to_state = 'EXPIRED'
        and actor_type = 'system'
    )
    or not exists (
      select 1
      from private.audit_logs
      where action = 'contract_expired_unsigned'
        and entity_id = '56000000-0000-4000-8000-000000000001'
        and actor_user_id is null
        and metadata ->> 'actor_type' = 'system'
    )
  then
    raise exception 'expiry did not preserve history and release inventory atomically';
  end if;
end;
$$;

-- A large due backlog must be split across bounded transactions while later
-- invocations continue draining it.
create temporary table expiry_batch_fixture (
  booking_id uuid primary key,
  contract_id uuid not null unique
) on commit drop;

insert into expiry_batch_fixture (booking_id, contract_id)
select
  md5('booking-expiry-batch-' || item)::uuid,
  md5('contract-expiry-batch-' || item)::uuid
from generate_series(1, 101) as item;

insert into public.bookings (
  id,
  renter_id,
  camera_id,
  state,
  pickup_at,
  return_at,
  intended_use,
  expected_location,
  approved_at,
  approval_deadline_at,
  approved_by,
  billable_days_snapshot,
  daily_rate_snapshot,
  rental_amount,
  security_deposit_amount
)
select
  fixture.booking_id,
  '50000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000001',
  'CONTRACT_PENDING',
  '2099-12-01 00:00:00+00',
  '2099-12-02 00:00:00+00',
  'Expiry batch fixture',
  'Manila',
  statement_timestamp() - interval '25 hours',
  statement_timestamp() - interval '1 hour',
  '50000000-0000-4000-8000-000000000001',
  1,
  1000.00,
  1000.00,
  4000.00
from expiry_batch_fixture as fixture;

insert into public.contract_versions (
  id,
  booking_id,
  version_no,
  status,
  template_id,
  snapshot,
  snapshot_schema_version,
  content_sha256,
  issued_at,
  issued_by
)
select
  fixture.contract_id,
  fixture.booking_id,
  1,
  'issued',
  '54000000-0000-4000-8000-000000000002',
  jsonb_build_object('expiry_batch_booking_id', fixture.booking_id),
  1,
  extensions.digest(
    convert_to(jsonb_build_object('expiry_batch_booking_id', fixture.booking_id)::text, 'UTF8'),
    'sha256'
  ),
  statement_timestamp() - interval '25 hours',
  '50000000-0000-4000-8000-000000000001'
from expiry_batch_fixture as fixture;

update public.bookings as booking
set current_contract_version_id = fixture.contract_id
from expiry_batch_fixture as fixture
where booking.id = fixture.booking_id;

set constraints bookings_validate_current_contract_pointer immediate;
set constraints bookings_validate_current_contract_pointer deferred;

set local role service_role;
set local "request.jwt.claim.sub" = '';

do $$
begin
  if api.expire_due_bookings('57000000-0000-4000-8000-000000000011') <> 100 then
    raise exception 'booking expiry did not stop at its transaction batch limit';
  end if;
  if api.expire_due_bookings('57000000-0000-4000-8000-000000000012') <> 1 then
    raise exception 'booking expiry did not drain the next backlog batch';
  end if;
  if api.expire_due_bookings('57000000-0000-4000-8000-000000000013') <> 0 then
    raise exception 'booking expiry backlog retry was not idempotent';
  end if;
end;
$$;

reset role;

do $$
begin
  if (
    select count(*)
    from public.bookings as booking
    join expiry_batch_fixture as fixture on fixture.booking_id = booking.id
    where booking.state = 'EXPIRED'
  ) <> 101
    or (
      select count(*)
      from public.contract_versions as version
      join expiry_batch_fixture as fixture on fixture.contract_id = version.id
      where version.status = 'voided'
    ) <> 101
  then
    raise exception 'bounded booking expiry left its drained backlog inconsistent';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform *
    from api.sign_contract('56000000-0000-4000-8000-000000000001', true);
    raise exception 'expired contract version was signed';
  exception
    when serialization_failure then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000001';

do $$
begin
  if (
    select count(*)
    from api.get_contract_audit_history('55000000-0000-4000-8000-000000000001')
    where action in ('contract_created', 'contract_signed', 'contract_superseded')
  ) < 4 then
    raise exception 'admin agreement audit projection omitted lifecycle events';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform *
    from api.get_contract_audit_history('55000000-0000-4000-8000-000000000001');
    raise exception 'renter read private administrative audit history';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  scheduler_active boolean;
begin
  if exists (
    select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron'
  ) then
    execute $check$
      select exists (
        select 1 from cron.job
        where jobname = 'camnook-expire-contract-windows'
          and schedule = '* * * * *'
          and active
      )
    $check$ into scheduler_active;
  end if;

  if scheduler_active is false then
      raise exception 'authoritative contract expiry schedule is missing';
  end if;

  begin
    update public.contract_versions
    set snapshot = '{"tampered":true}'::jsonb
    where id = current_setting('test.contract_v1')::uuid;
    raise exception 'historical contract content was rewritten';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    delete from public.contract_versions
    where id = current_setting('test.contract_v1')::uuid;
    raise exception 'historical contract version was deleted';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.contract_signatures
    set attestation_text = 'tampered'
    where id = current_setting('test.signature_id')::uuid;
    raise exception 'historical signature was rewritten';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.booking_state_history
    set note = 'tampered'
    where booking_id = '55000000-0000-4000-8000-000000000001';
    raise exception 'contract state history was rewritten';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update private.audit_logs
    set outcome = 'tampered'
    where entity_id = current_setting('test.contract_v1')::uuid;
    raise exception 'contract audit history was rewritten';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

select 'ok 1 - versioned contract review, signing, supersession, expiry, authorization, and audit invariants';

rollback;
