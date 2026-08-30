begin;

select '1..1';

insert into auth.users (id) values
  ('60000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('60000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('60000000-0000-4000-8000-000000000001', 'Payment Admin', '+639300000001'),
  ('60000000-0000-4000-8000-000000000002', 'Payment Renter', '+639300000002'),
  ('60000000-0000-4000-8000-000000000003', 'Other Payment Renter', '+639300000003');

insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  document_expiration_date,
  decided_at,
  decided_by
) values (
  '60100000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002',
  'verified',
  'passport',
  '2099-12-31',
  statement_timestamp(),
  '60000000-0000-4000-8000-000000000001'
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
) values (
  '60200000-0000-4000-8000-000000000001',
  'payment-camera',
  'PAYMENT-CAMERA-001',
  'Payment Camera',
  'Camera used for payment lifecycle invariants.',
  'published',
  1000.00,
  4000.00,
  statement_timestamp()
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
  '60300000-0000-4000-8000-000000000001',
  'payment-template-v1',
  1,
  '{"pickup":"pickup","return":"return","cancellation":"cancel","late-return":"late","damage":"damage","loss":"loss","non-transferability":"named-renter"}'::jsonb,
  extensions.digest(
    convert_to(
      '{"pickup":"pickup","return":"return","cancellation":"cancel","late-return":"late","damage":"damage","loss":"loss","non-transferability":"named-renter"}'::jsonb::text,
      'UTF8'
    ),
    'sha256'
  ),
  '60000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  '60000000-0000-4000-8000-000000000001',
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
) values
  (
    '60400000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    '60200000-0000-4000-8000-000000000001',
    '2099-11-01 00:00:00+00',
    '2099-11-03 00:00:00+00',
    'Payment lifecycle test one',
    'Makati City'
  ),
  (
    '60400000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002',
    '60200000-0000-4000-8000-000000000001',
    '2099-12-01 00:00:00+00',
    '2099-12-03 00:00:00+00',
    'Payment lifecycle test two',
    'Taguig City'
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
    '60400000-0000-4000-8000-000000000001',
    null,
    'FOR_REVIEW',
    '60000000-0000-4000-8000-000000000002',
    'renter',
    'booking_requested'
  ),
  (
    '60400000-0000-4000-8000-000000000002',
    null,
    'FOR_REVIEW',
    '60000000-0000-4000-8000-000000000002',
    'renter',
    'booking_requested'
  );

set constraints all immediate;
set constraints all deferred;

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';

select api.approve_booking('60400000-0000-4000-8000-000000000001');
select api.approve_booking('60400000-0000-4000-8000-000000000002');

set constraints all immediate;
set constraints all deferred;

reset role;

select set_config(
  'test.payment_deadline_one',
  (select approval_deadline_at::text from public.bookings where id = '60400000-0000-4000-8000-000000000001'),
  true
);
select set_config(
  'test.payment_deadline_two',
  (select approval_deadline_at::text from public.bookings where id = '60400000-0000-4000-8000-000000000002'),
  true
);

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';

select * from api.sign_contract(
  (select current_contract_version_id from public.bookings where id = '60400000-0000-4000-8000-000000000001'),
  true
);
select * from api.sign_contract(
  (select current_contract_version_id from public.bookings where id = '60400000-0000-4000-8000-000000000002'),
  true
);

set constraints all immediate;
set constraints all deferred;

do $$
declare
  state jsonb;
begin
  state := api.get_my_payment_state('60400000-0000-4000-8000-000000000001');
  if state -> 'instructions' <> 'null'::jsonb
    or (state ->> 'can_submit')::boolean
    or state ->> 'instructions_error' <> 'recipient_unavailable'
  then
    raise exception 'disabled recipient configuration did not fail closed';
  end if;

  begin
    perform count(*) from public.payment_transactions;
    raise exception 'renter retained direct payment transaction access';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000003';

do $$
begin
  begin
    perform api.get_my_payment_state('60400000-0000-4000-8000-000000000001');
    raise exception 'another renter read owner payment instructions';
  exception
    when sqlstate 'P0002' then null;
  end;
end;
$$;

set constraints all immediate;
set constraints all deferred;

set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';

select api.configure_gcash_recipient(
  'CamNook Approved Recipient',
  '09171234567',
  true,
  '60500000-0000-4000-8000-000000000001'
);

do $$
declare
  configuration jsonb := api.get_gcash_recipient_configuration_admin();
begin
  if not (configuration ->> 'enabled')::boolean
    or configuration ->> 'recipient_name' <> 'CamNook Approved Recipient'
    or configuration ->> 'recipient_account' <> '09171234567'
    or (configuration ->> 'version')::integer < 1
  then
    raise exception 'admin GCash configuration projection is incomplete';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';

do $$
declare
  state jsonb;
  first_submission jsonb;
  retry_submission jsonb;
begin
  state := api.get_my_payment_state('60400000-0000-4000-8000-000000000001');
  if not (state ->> 'can_submit')::boolean
    or state #>> '{instructions,recipient_name}' <> 'CamNook Approved Recipient'
    or state #>> '{instructions,recipient_account}' <> '09171234567'
    or (state #>> '{instructions,rental_amount}')::numeric <> (
      select rental_amount from public.bookings where id = '60400000-0000-4000-8000-000000000001'
    )
    or (state #>> '{instructions,security_deposit}')::numeric <> (
      select security_deposit_amount from public.bookings where id = '60400000-0000-4000-8000-000000000001'
    )
    or (state #>> '{instructions,total_due}')::numeric <> (
      select total_due from public.bookings where id = '60400000-0000-4000-8000-000000000001'
    )
    or (state ->> 'approval_deadline_at')::timestamptz
      <> current_setting('test.payment_deadline_one')::timestamptz
  then
    raise exception 'owner payment instructions were not authoritative';
  end if;

  first_submission := api.submit_payment(
    '60400000-0000-4000-8000-000000000001',
    '60500000-0000-4000-8000-000000000002',
    'GCASH-REF-ONE'
  );
  retry_submission := api.submit_payment(
    '60400000-0000-4000-8000-000000000001',
    '60500000-0000-4000-8000-000000000002',
    'GCASH REF ONE'
  );

  if not (first_submission ->> 'created')::boolean
    or (retry_submission ->> 'created')::boolean
    or first_submission ->> 'transaction_id' <> retry_submission ->> 'transaction_id'
    or first_submission ->> 'booking_state' <> 'PAYMENT_REVIEW'
  then
    raise exception 'payment submission retry was not idempotent';
  end if;

  perform set_config(
    'test.payment_transaction_one',
    first_submission ->> 'transaction_id',
    true
  );

  begin
    perform api.submit_payment(
      '60400000-0000-4000-8000-000000000001',
      '60500000-0000-4000-8000-000000000003',
      'GCASH-REF-OTHER'
    );
    raise exception 'second pending payment submission was accepted';
  exception
    when serialization_failure then null;
  end;
end;
$$;

set constraints all immediate;
set constraints all deferred;

set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';

select api.expire_due_bookings('60500000-0000-4000-8000-000000000004');

reset role;

do $$
begin
  if not exists (
    select 1 from public.bookings
    where id = '60400000-0000-4000-8000-000000000001'
      and state = 'PAYMENT_REVIEW'
      and approval_deadline_at = current_setting('test.payment_deadline_one')::timestamptz
  ) then
    raise exception 'expiry rewrote a timely pending payment or its deadline';
  end if;
end;
$$;

select set_config(
  'test.payment_proof_digest_one',
  encode(extensions.digest(convert_to('proof-one', 'UTF8'), 'sha256'), 'hex'),
  true
);
select set_config(
  'test.payment_proof_digest_two',
  encode(extensions.digest(convert_to('proof-two', 'UTF8'), 'sha256'), 'hex'),
  true
);

set local role service_role;

do $$
declare
  intent jsonb;
begin
  begin
    perform api.create_payment_proof_upload_intent(
      '60600000-0000-4000-8000-000000000001',
      current_setting('test.payment_transaction_one')::uuid,
      'application/pdf',
      4,
      current_setting('test.payment_proof_digest_one'),
      '60600000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000002'
    );
    raise exception 'unsupported payment proof media type was accepted';
  exception
    when invalid_parameter_value then null;
  end;

  intent := api.create_payment_proof_upload_intent(
    '60600000-0000-4000-8000-000000000003',
    current_setting('test.payment_transaction_one')::uuid,
    'image/png',
    9,
    current_setting('test.payment_proof_digest_one'),
    '60600000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002'
  );

  if intent ->> 'status' <> 'awaiting_upload'
    or intent ->> 'object_path' !~ '^60600000-0000-4000-8000-000000000003/[0-9a-f-]+\.png$'
  then
    raise exception 'payment proof intent was not exact and opaque';
  end if;
  perform set_config('test.payment_proof_intent_one', intent ->> 'id', true);
  perform set_config('test.payment_proof_path_one', intent ->> 'object_path', true);
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'payment-proofs',
      current_setting('test.payment_proof_path_one'),
      '60000000-0000-4000-8000-000000000002',
      '{"mimetype":"image/png","size":"8"}'::jsonb
    );
    raise exception 'payment proof upload accepted mismatched metadata';
  exception
    when insufficient_privilege then null;
  end;

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'payment-proofs',
    current_setting('test.payment_proof_path_one'),
    '60000000-0000-4000-8000-000000000002',
    '{"mimetype":"image/png","size":"9"}'::jsonb
  );
end;
$$;

set local role service_role;

do $$
declare
  finalized jsonb;
  replacement jsonb;
begin
  begin
    perform api.finalize_payment_proof_upload(
      current_setting('test.payment_proof_intent_one')::uuid,
      'image/png',
      9,
      repeat('0', 64),
      '60600000-0000-4000-8000-000000000005',
      '60000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000002'
    );
    raise exception 'payment proof finalization accepted a mismatched digest';
  exception
    when check_violation then null;
  end;

  finalized := api.finalize_payment_proof_upload(
    current_setting('test.payment_proof_intent_one')::uuid,
    'image/png',
    9,
    current_setting('test.payment_proof_digest_one'),
    '60600000-0000-4000-8000-000000000006',
    '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002'
  );
  if finalized ->> 'status' <> 'finalized' then
    raise exception 'payment proof was not finalized';
  end if;

  replacement := api.create_payment_proof_upload_intent(
    '60600000-0000-4000-8000-000000000007',
    current_setting('test.payment_transaction_one')::uuid,
    'image/png',
    9,
    current_setting('test.payment_proof_digest_two'),
    '60600000-0000-4000-8000-000000000008',
    '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002'
  );
  perform set_config('test.payment_proof_intent_two', replacement ->> 'id', true);
  perform set_config('test.payment_proof_path_two', replacement ->> 'object_path', true);
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';

insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'payment-proofs',
  current_setting('test.payment_proof_path_two'),
  '60000000-0000-4000-8000-000000000002',
  '{"mimetype":"image/png","size":"9"}'::jsonb
);

set local role service_role;

select api.finalize_payment_proof_upload(
  current_setting('test.payment_proof_intent_two')::uuid,
  'image/png',
  9,
  current_setting('test.payment_proof_digest_two'),
  '60600000-0000-4000-8000-000000000009',
  '60000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000002'
);

reset role;

do $$
begin
  if (select count(*) from public.payment_proofs where transaction_id = current_setting('test.payment_transaction_one')::uuid) <> 2
    or (select count(*) from public.payment_proofs as proof where transaction_id = current_setting('test.payment_transaction_one')::uuid and not exists (select 1 from public.payment_proofs as successor where successor.supersedes_id = proof.id)) <> 1
  then
    raise exception 'corrected payment proof did not preserve one immutable supersession chain';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';

do $$
begin
  perform api.authorize_payment_proof_access(
    current_setting('test.payment_transaction_one')::uuid,
    'payment_reconciliation',
    '60700000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001'
  );
  raise exception 'authenticated clients received a private payment proof path';
exception
  when insufficient_privilege then null;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  access_grant jsonb;
begin
  begin
    perform api.authorize_payment_proof_access(
      current_setting('test.payment_transaction_one')::uuid,
      'payment_reconciliation',
      '60700000-0000-4000-8000-000000000000',
      '60000000-0000-4000-8000-000000000002'
    );
    raise exception 'service operation accepted a non-admin proof actor';
  exception
    when insufficient_privilege then null;
  end;

  access_grant := api.authorize_payment_proof_access(
    current_setting('test.payment_transaction_one')::uuid,
    'payment_reconciliation',
    '60700000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001'
  );
  if (access_grant ->> 'expires_in_seconds')::integer <> 60
    or access_grant ->> 'object_path' <> current_setting('test.payment_proof_path_two')
  then
    raise exception 'admin payment proof access was not current and short-lived';
  end if;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';

do $$
declare
  queue jsonb := api.get_payment_review_queue();
  detail jsonb := api.get_payment_review_detail(current_setting('test.payment_transaction_one')::uuid);
  verified jsonb;
  retry jsonb;
  summary jsonb;
begin
  if jsonb_array_length(queue) <> 1
    or queue #>> '{0,transaction_id}' <> current_setting('test.payment_transaction_one')
    or not (queue #>> '{0,proof_exists}')::boolean
    or queue::text ~ 'object_path|sha256|signed_url'
    or detail::text ~ 'object_path|sha256|signed_url'
    or detail #>> '{reference}' <> 'GCASH-REF-ONE'
  then
    raise exception 'admin payment projections are incomplete or overexposed';
  end if;

  begin
    perform api.verify_payment(
      current_setting('test.payment_transaction_one')::uuid,
      '60000000-0000-4000-8000-000000000003',
      (detail ->> 'total_due')::numeric,
      'GCASH REF ONE',
      true,
      '60700000-0000-4000-8000-000000000001'
    );
    raise exception 'payment verification accepted a proof version that was not reviewed';
  exception
    when serialization_failure then null;
  end;

  verified := api.verify_payment(
    current_setting('test.payment_transaction_one')::uuid,
    (detail #>> '{proof,proof_id}')::uuid,
    (detail ->> 'total_due')::numeric,
    'GCASH REF ONE',
    true,
    '60700000-0000-4000-8000-000000000002'
  );
  retry := api.verify_payment(
    current_setting('test.payment_transaction_one')::uuid,
    (detail #>> '{proof,proof_id}')::uuid,
    (detail ->> 'total_due')::numeric,
    'GCASH-REF-ONE',
    true,
    '60700000-0000-4000-8000-000000000003'
  );
  summary := api.get_payment_accounting_summary();

  if verified ->> 'booking_state' <> 'CONFIRMED'
    or not (verified ->> 'created')::boolean
    or (retry ->> 'created')::boolean
    or (summary ->> 'verified_rental_revenue')::numeric <> 2000
    or (summary ->> 'security_deposit_liability')::numeric <> 4000
  then
    raise exception 'verification was not atomic, idempotent, or accounting-safe';
  end if;

  begin
    perform api.reject_payment(
      current_setting('test.payment_transaction_one')::uuid,
      'unconfirmed_transfer',
      '60700000-0000-4000-8000-000000000004'
    );
    raise exception 'verified payment was later rejected';
  exception
    when serialization_failure then null;
  end;
end;
$$;

set constraints all immediate;
set constraints all deferred;

reset role;
set constraints all immediate;

do $$
begin
  if not exists (
    select 1 from public.bookings
    where id = '60400000-0000-4000-8000-000000000001'
      and state = 'CONFIRMED'
      and approval_deadline_at::text = current_setting('test.payment_deadline_one')
  )
    or (select count(*) from public.payment_allocations where transaction_id = current_setting('test.payment_transaction_one')::uuid) <> 2
    or (select sum(amount) from public.payment_allocations where transaction_id = current_setting('test.payment_transaction_one')::uuid) <> 6000
    or not exists (
      select 1 from public.availability_blocks
      where booking_id = '60400000-0000-4000-8000-000000000001'
        and released_at is null
    )
    or exists (
      select 1 from private.audit_logs
      where entity_type = 'payment_transaction'
        and metadata::text ~ 'object_path|signed_url|sha256|GCASH-REF-ONE'
    )
  then
    raise exception 'verified payment history, allocations, block, deadline, or audit is inconsistent';
  end if;

  begin
    update public.payment_transactions
    set amount = amount + 1
    where id = current_setting('test.payment_transaction_one')::uuid;
    raise exception 'verified incoming transaction was mutated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.payment_allocations
    set amount = amount + 1
    where transaction_id = current_setting('test.payment_transaction_one')::uuid;
    raise exception 'verified allocation was mutated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    delete from public.payment_proofs
    where transaction_id = current_setting('test.payment_transaction_one')::uuid;
    raise exception 'payment proof history was deleted';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

set constraints all deferred;
set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000002';

do $$
declare
  state jsonb := api.get_my_payment_state('60400000-0000-4000-8000-000000000002');
  submitted jsonb;
begin
  submitted := api.submit_payment(
    '60400000-0000-4000-8000-000000000002',
    '60800000-0000-4000-8000-000000000001',
    'GCASH REF ONE'
  );
  perform set_config('test.payment_transaction_two', submitted ->> 'transaction_id', true);
end;
$$;

set constraints all immediate;
set constraints all deferred;

reset role;
insert into public.payment_proofs (
  id,
  transaction_id,
  owner_user_id,
  object_path,
  media_type,
  byte_size,
  sha256,
  finalized_at
) values (
  '60800000-0000-4000-8000-000000000004',
  current_setting('test.payment_transaction_two')::uuid,
  '60000000-0000-4000-8000-000000000002',
  '60800000-0000-4000-8000-000000000004/proof.png',
  'image/png',
  9,
  extensions.digest(convert_to('proof-three', 'UTF8'), 'sha256'),
  statement_timestamp()
);

set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  detail jsonb := api.get_payment_review_detail(current_setting('test.payment_transaction_two')::uuid);
  rejected jsonb;
begin
  begin
    perform api.verify_payment(
      current_setting('test.payment_transaction_two')::uuid,
      (detail #>> '{proof,proof_id}')::uuid,
      (detail ->> 'total_due')::numeric,
      'GCASH-REF-ONE',
      true,
      '60800000-0000-4000-8000-000000000002'
    );
    raise exception 'duplicate verified normalized GCash reference was accepted';
  exception
    when unique_violation then null;
  end;

  rejected := api.reject_payment(
    current_setting('test.payment_transaction_two')::uuid,
    'duplicate_reference',
    '60800000-0000-4000-8000-000000000003'
  );
  if rejected ->> 'booking_state' <> 'TO_PAY'
    or (select approval_deadline_at from public.bookings where id = '60400000-0000-4000-8000-000000000002')
      <> current_setting('test.payment_deadline_two')::timestamptz
  then
    raise exception 'pre-deadline rejection reset the deadline or chose the wrong state';
  end if;
end;
$$;

set constraints all immediate;
set constraints all deferred;

reset role;

-- A direct historical fixture lets the database-clock rejection boundary be
-- exercised without sleeping or changing the immutable deadline of live rows.
set constraints all deferred;

insert into public.bookings (
  id,
  renter_id,
  camera_id,
  state,
  pickup_at,
  return_at,
  intended_use,
  expected_location,
  requested_at,
  approved_at,
  approval_deadline_at,
  approved_by,
  billable_days_snapshot,
  daily_rate_snapshot,
  rental_amount,
  security_deposit_amount,
  current_contract_version_id
) values (
  '60400000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000002',
  '60200000-0000-4000-8000-000000000001',
  'PAYMENT_REVIEW',
  '2100-01-01 00:00:00+00',
  '2100-01-03 00:00:00+00',
  'Historical deadline test',
  'Pasig City',
  statement_timestamp() - interval '26 hours',
  statement_timestamp() - interval '25 hours',
  statement_timestamp() - interval '1 hour',
  '60000000-0000-4000-8000-000000000001',
  2,
  1000,
  2000,
  4000,
  '60900000-0000-4000-8000-000000000001'
);

insert into public.contract_versions (
  id,
  booking_id,
  version_no,
  template_id,
  snapshot,
  snapshot_schema_version,
  content_sha256,
  issued_at,
  issued_by
) values (
  '60900000-0000-4000-8000-000000000001',
  '60400000-0000-4000-8000-000000000003',
  1,
  '60300000-0000-4000-8000-000000000001',
  '{"pricing":{"rental_amount":2000,"security_deposit":4000,"total_due":6000,"currency":"PHP"}}'::jsonb,
  1,
  extensions.digest(convert_to('{"pricing":{"rental_amount":2000,"security_deposit":4000,"total_due":6000,"currency":"PHP"}}'::jsonb::text, 'UTF8'), 'sha256'),
  clock_timestamp() - interval '25 hours',
  '60000000-0000-4000-8000-000000000001'
);

insert into public.contract_signatures (
  contract_version_id,
  renter_id,
  signature_intent,
  attestation_text,
  signed_at,
  acknowledged_content_sha256
) select
  id,
  '60000000-0000-4000-8000-000000000002',
  'electronic_signature',
  'I have reviewed and agree to this exact rental contract version.',
  clock_timestamp() - interval '2 hours',
  content_sha256
from public.contract_versions
where id = '60900000-0000-4000-8000-000000000001';

insert into public.availability_blocks (
  camera_id,
  booking_id,
  starts_at,
  ends_at,
  kind,
  reason,
  created_by
) values (
  '60200000-0000-4000-8000-000000000001',
  '60400000-0000-4000-8000-000000000003',
  '2100-01-01 00:00:00+00',
  '2100-01-03 00:00:00+00',
  'booking',
  'Historical payment rejection fixture',
  '60000000-0000-4000-8000-000000000001'
);

insert into public.payment_transactions (
  id,
  booking_id,
  direction,
  amount,
  reference,
  counterparty_display_name,
  submitted_at,
  submitted_by,
  submission_attempt_id,
  contract_version_id,
  recipient_config_version,
  recipient_name_snapshot,
  recipient_account_snapshot
) values (
  '60900000-0000-4000-8000-000000000002',
  '60400000-0000-4000-8000-000000000003',
  'incoming',
  6000,
  'GCASH-PAST-REF',
  'Payment Renter',
  clock_timestamp() - interval '2 hours',
  '60000000-0000-4000-8000-000000000002',
  '60900000-0000-4000-8000-000000000003',
  '60900000-0000-4000-8000-000000000001',
  1,
  'CamNook Approved Recipient',
  '09171234567'
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
    '60400000-0000-4000-8000-000000000003',
    null,
    'FOR_REVIEW',
    '60000000-0000-4000-8000-000000000002',
    'renter',
    'booking_requested'
  ),
  (
    '60400000-0000-4000-8000-000000000003',
    'FOR_REVIEW',
    'CONTRACT_PENDING',
    '60000000-0000-4000-8000-000000000001',
    'admin',
    'booking_approved'
  ),
  (
    '60400000-0000-4000-8000-000000000003',
    'CONTRACT_PENDING',
    'TO_PAY',
    '60000000-0000-4000-8000-000000000002',
    'renter',
    'contract_signed'
  ),
  (
    '60400000-0000-4000-8000-000000000003',
    'TO_PAY',
    'PAYMENT_REVIEW',
    '60000000-0000-4000-8000-000000000002',
    'renter',
    'payment_submitted'
  );

set constraints all immediate;
set constraints all deferred;

set local role authenticated;
set local "request.jwt.claim.sub" = '60000000-0000-4000-8000-000000000001';

select api.expire_due_bookings('60900000-0000-4000-8000-000000000004');

do $$
declare
  rejected jsonb;
begin
  if (select state from public.bookings where id = '60400000-0000-4000-8000-000000000003') <> 'PAYMENT_REVIEW' then
    raise exception 'ordinary expiry consumed a timely pending payment';
  end if;

  rejected := api.reject_payment(
    '60900000-0000-4000-8000-000000000002',
    'not_found_in_gcash',
    '60900000-0000-4000-8000-000000000005'
  );
  if rejected ->> 'booking_state' <> 'EXPIRED' then
    raise exception 'post-deadline rejection did not expire the booking';
  end if;
end;
$$;

set constraints all immediate;

reset role;

do $$
begin
  if exists (
    select 1 from public.availability_blocks
    where booking_id = '60400000-0000-4000-8000-000000000003'
      and released_at is null
  ) then
    raise exception 'post-deadline rejection did not release availability';
  end if;
end;
$$;

select 'ok 1 - manual GCash submission, private proof, reconciliation, accounting, rejection, and audit invariants';

rollback;
