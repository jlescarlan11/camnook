begin;

select '1..1';

insert into auth.users (id) values
  ('80000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('80000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('80000000-0000-4000-8000-000000000001', 'Pickup Admin', '+639400000001'),
  ('80000000-0000-4000-8000-000000000002', 'Named Pickup Renter', '+639400000002'),
  ('80000000-0000-4000-8000-000000000003', 'Other Pickup Renter', '+639400000003');

insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  document_expiration_date,
  decided_at,
  decided_by
) values (
  '80100000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002',
  'verified',
  'passport',
  (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
  statement_timestamp() - interval '1 day',
  '80000000-0000-4000-8000-000000000001'
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
    '80200000-0000-4000-8000-000000000001',
    'pickup-camera',
    'PRIVATE-PICKUP-SERIAL-001',
    'Pickup Camera',
    'Camera used for pickup lifecycle invariants.',
    'published',
    1000,
    4000,
    statement_timestamp()
  ),
  (
    '80200000-0000-4000-8000-000000000002',
    'blocked-pickup-camera',
    'PRIVATE-PICKUP-SERIAL-002',
    'Blocked Pickup Camera',
    'Camera used for an ineligible confirmed fixture.',
    'published',
    1000,
    4000,
    statement_timestamp()
  );

insert into public.camera_accessories (
  id,
  camera_id,
  name,
  quantity,
  sort_position
) values (
  '80300000-0000-4000-8000-000000000001',
  '80200000-0000-4000-8000-000000000001',
  'Battery',
  2,
  10
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
  '80400000-0000-4000-8000-000000000001',
  'pickup-template-v1',
  1,
  '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb,
  extensions.digest(
    convert_to(
      '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb::text,
      'UTF8'
    ),
    'sha256'
  ),
  '80000000-0000-4000-8000-000000000001',
  statement_timestamp() - interval '3 days',
  '80000000-0000-4000-8000-000000000001',
  statement_timestamp() - interval '3 days'
);

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
) values
  (
    '80500000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002',
    '80200000-0000-4000-8000-000000000001',
    'CONFIRMED',
    statement_timestamp() - interval '10 minutes',
    statement_timestamp() + interval '47 hours 50 minutes',
    'Pickup lifecycle acceptance test',
    'Private pickup counter',
    statement_timestamp() - interval '3 days',
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '1 day',
    '80000000-0000-4000-8000-000000000001',
    2,
    1000,
    2000,
    4000,
    '80600000-0000-4000-8000-000000000001'
  ),
  (
    '80500000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000003',
    '80200000-0000-4000-8000-000000000002',
    'CONFIRMED',
    statement_timestamp() + interval '1 day',
    statement_timestamp() + interval '3 days',
    'Blocked pickup queue fixture',
    'Private pickup counter',
    statement_timestamp() - interval '3 days',
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '1 day',
    '80000000-0000-4000-8000-000000000001',
    2,
    1000,
    2000,
    4000,
    '80600000-0000-4000-8000-000000000002'
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
) values
(
  '80600000-0000-4000-8000-000000000001',
  '80500000-0000-4000-8000-000000000001',
  1,
  '80400000-0000-4000-8000-000000000001',
  '{
    "booking":{"id":"80500000-0000-4000-8000-000000000001"},
    "renter":{"legal_name":"Named Pickup Renter"},
    "camera":{
      "id":"80200000-0000-4000-8000-000000000001",
      "serial_number":"PRIVATE-PICKUP-SERIAL-001",
      "accessories":[{
        "id":"80300000-0000-4000-8000-000000000001",
        "name":"Battery",
        "quantity":2,
        "replacement_value":5000
      }]
    }
  }'::jsonb,
  1,
  extensions.digest(convert_to('pickup-contract', 'UTF8'), 'sha256'),
  statement_timestamp() - interval '2 days',
  '80000000-0000-4000-8000-000000000001'
),
(
  '80600000-0000-4000-8000-000000000002',
  '80500000-0000-4000-8000-000000000002',
  1,
  '80400000-0000-4000-8000-000000000001',
  '{
    "booking":{"id":"80500000-0000-4000-8000-000000000002"},
    "renter":{"legal_name":"Other Pickup Renter"},
    "camera":{
      "id":"80200000-0000-4000-8000-000000000002",
      "serial_number":"PRIVATE-PICKUP-SERIAL-002",
      "accessories":[]
    }
  }'::jsonb,
  1,
  extensions.digest(convert_to('blocked-pickup-contract', 'UTF8'), 'sha256'),
  statement_timestamp() - interval '2 days',
  '80000000-0000-4000-8000-000000000001'
);

insert into public.contract_signatures (
  contract_version_id,
  renter_id,
  signature_intent,
  attestation_text,
  signed_at,
  acknowledged_content_sha256
) values (
  '80600000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002',
  'electronic_signature',
  'I agree to this exact contract version.',
  statement_timestamp() - interval '1 day',
  extensions.digest(convert_to('pickup-contract', 'UTF8'), 'sha256')
);

insert into public.payment_transactions (
  id,
  booking_id,
  direction,
  status,
  amount,
  reference,
  counterparty_display_name,
  submitted_at,
  submitted_by,
  decided_at,
  decided_by,
  submission_attempt_id,
  contract_version_id,
  recipient_config_version,
  recipient_name_snapshot,
  recipient_account_snapshot
) values (
  '80700000-0000-4000-8000-000000000001',
  '80500000-0000-4000-8000-000000000001',
  'incoming',
  'verified',
  6000,
  'PICKUP-PAYMENT-001',
  'Named Pickup Renter',
  statement_timestamp() - interval '1 day',
  '80000000-0000-4000-8000-000000000002',
  statement_timestamp() - interval '12 hours',
  '80000000-0000-4000-8000-000000000001',
  '80700000-0000-4000-8000-000000000002',
  '80600000-0000-4000-8000-000000000001',
  1,
  'Approved Recipient',
  '09171234567'
);

insert into public.payment_allocations (
  transaction_id,
  booking_id,
  kind,
  amount
) values
  (
    '80700000-0000-4000-8000-000000000001',
    '80500000-0000-4000-8000-000000000001',
    'rental_payment',
    2000
  ),
  (
    '80700000-0000-4000-8000-000000000001',
    '80500000-0000-4000-8000-000000000001',
    'security_deposit',
    4000
  );

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code,
  occurred_at
) values
  (
    '80500000-0000-4000-8000-000000000001',
    null,
    'FOR_REVIEW',
    '80000000-0000-4000-8000-000000000002',
    'renter',
    'booking_requested',
    statement_timestamp() - interval '3 days'
  ),
  (
    '80500000-0000-4000-8000-000000000001',
    'FOR_REVIEW',
    'CONTRACT_PENDING',
    '80000000-0000-4000-8000-000000000001',
    'admin',
    'booking_approved',
    statement_timestamp() - interval '2 days'
  ),
  (
    '80500000-0000-4000-8000-000000000001',
    'CONTRACT_PENDING',
    'TO_PAY',
    '80000000-0000-4000-8000-000000000002',
    'renter',
    'contract_signed',
    statement_timestamp() - interval '1 day'
  ),
  (
    '80500000-0000-4000-8000-000000000001',
    'TO_PAY',
    'PAYMENT_REVIEW',
    '80000000-0000-4000-8000-000000000002',
    'renter',
    'payment_submitted',
    statement_timestamp() - interval '13 hours'
  ),
  (
    '80500000-0000-4000-8000-000000000001',
    'PAYMENT_REVIEW',
    'CONFIRMED',
    '80000000-0000-4000-8000-000000000001',
    'admin',
    'payment_verified',
    statement_timestamp() - interval '12 hours'
  ),
  (
    '80500000-0000-4000-8000-000000000002',
    null,
    'FOR_REVIEW',
    '80000000-0000-4000-8000-000000000003',
    'renter',
    'booking_requested',
    statement_timestamp() - interval '3 days'
  ),
  (
    '80500000-0000-4000-8000-000000000002',
    'PAYMENT_REVIEW',
    'CONFIRMED',
    '80000000-0000-4000-8000-000000000001',
    'admin',
    'synthetic_ineligible_confirmation',
    statement_timestamp() - interval '1 day'
  );

set constraints all immediate;
set constraints all deferred;

set local role authenticated;
set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000002';

do $$
declare
  owner_state jsonb := api.get_my_pickup_state('80500000-0000-4000-8000-000000000001');
begin
  if owner_state ->> 'booking_state' <> 'CONFIRMED'
    or owner_state -> 'handoff' <> 'null'::jsonb
    or owner_state::text ~ 'PRIVATE-PICKUP-SERIAL|object_path|sha256|Named Pickup Renter|\+6394|total_due|rental_amount'
  then
    raise exception 'confirmed owner projection was incomplete or overexposed';
  end if;

  begin
    perform api.get_pickup_queue();
    raise exception 'renter accessed the administrator pickup queue';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000003';

do $$
begin
  begin
    perform api.get_my_pickup_state('80500000-0000-4000-8000-000000000001');
    raise exception 'another renter accessed the owner pickup projection';
  exception
    when sqlstate 'P0002' then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000001';

do $$
declare
  queue jsonb := api.get_pickup_queue();
  detail jsonb := api.get_pickup_detail('80500000-0000-4000-8000-000000000001');
begin
  if jsonb_array_length(queue) <> 1
    or queue #>> '{0,booking_id}' <> '80500000-0000-4000-8000-000000000001'
    or not (queue #>> '{0,readiness,eligible}')::boolean
    or jsonb_array_length(queue #> '{0,required_checks}') <> 6
    or queue::text ~ 'PRIVATE-PICKUP-SERIAL|object_path|sha256|\+6394|total_due|rental_amount'
    or detail #>> '{accessories,0,name}' <> 'Battery'
    or detail::text ~ 'replacement_value|PRIVATE-PICKUP-SERIAL|object_path|sha256|\+6394|total_due|rental_amount'
  then
    raise exception 'pickup queue/detail eligibility or minimization is incorrect';
  end if;

  begin
    perform count(*) from public.condition_photos;
    raise exception 'administrator retained direct private photo metadata access';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.complete_pickup(
      '80500000-0000-4000-8000-000000000001',
      statement_timestamp(),
      true,
      true,
      false,
      'PRIVATE-PICKUP-SERIAL-001',
      array['80300000-0000-4000-8000-000000000001']::uuid[],
      'No visible damage; clean and functional.',
      '',
      '80800000-0000-4000-8000-000000000001'
    );
    raise exception 'incomplete original-ID match activated pickup';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform api.complete_pickup(
      '80500000-0000-4000-8000-000000000001',
      statement_timestamp(),
      true,
      true,
      true,
      'WRONG-SERIAL',
      array['80300000-0000-4000-8000-000000000001']::uuid[],
      'No visible damage; clean and functional.',
      '',
      '80800000-0000-4000-8000-000000000002'
    );
    raise exception 'serial mismatch activated pickup';
  exception
    when check_violation then null;
  end;

  begin
    perform api.complete_pickup(
      '80500000-0000-4000-8000-000000000001',
      statement_timestamp(),
      true,
      true,
      true,
      'PRIVATE-PICKUP-SERIAL-001',
      array[]::uuid[],
      'No visible damage; clean and functional.',
      '',
      '80800000-0000-4000-8000-000000000003'
    );
    raise exception 'missing accessory fact activated pickup';
  exception
    when check_violation then null;
  end;

  if exists (
    select 1 from public.handoffs
    where booking_id = '80500000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.bookings
    where id = '80500000-0000-4000-8000-000000000001'
      and state = 'ACTIVE'
  ) then
    raise exception 'failed pickup left a partial handoff or ACTIVE state';
  end if;
end;
$$;

do $$
declare
  first_result jsonb;
  retry_result jsonb;
begin
  first_result := api.complete_pickup(
    '80500000-0000-4000-8000-000000000001',
    statement_timestamp(),
    true,
    true,
    true,
    'PRIVATE-PICKUP-SERIAL-001',
    array['80300000-0000-4000-8000-000000000001']::uuid[],
    'No visible damage; clean and functional.',
    '',
    '80800000-0000-4000-8000-000000000004'
  );
  retry_result := api.complete_pickup(
    '80500000-0000-4000-8000-000000000001',
    statement_timestamp(),
    true,
    true,
    true,
    'PRIVATE-PICKUP-SERIAL-001',
    array['80300000-0000-4000-8000-000000000001']::uuid[],
    'No visible damage; clean and functional.',
    '',
    '80800000-0000-4000-8000-000000000004'
  );

  if not (first_result ->> 'created')::boolean
    or (retry_result ->> 'created')::boolean
    or first_result ->> 'handoff_id' <> retry_result ->> 'handoff_id'
    or first_result ->> 'condition_report_id' <> retry_result ->> 'condition_report_id'
  then
    raise exception 'pickup retry was not idempotent';
  end if;

  perform set_config('test.pickup_report_id', first_result ->> 'condition_report_id', true);

  begin
    perform api.complete_pickup(
      '80500000-0000-4000-8000-000000000001',
      statement_timestamp(),
      true,
      true,
      true,
      'PRIVATE-PICKUP-SERIAL-001',
      array['80300000-0000-4000-8000-000000000001']::uuid[],
      'No visible damage; clean and functional.',
      '',
      '80800000-0000-4000-8000-000000000005'
    );
    raise exception 'a different operation completed ACTIVE pickup again';
  exception
    when serialization_failure then null;
  end;
end;
$$;

set constraints all immediate;

do $$
declare
  active_queue jsonb := api.get_active_rental_queue();
  detail jsonb := api.get_pickup_detail('80500000-0000-4000-8000-000000000001');
begin
  if (select count(*) from public.handoffs where booking_id = '80500000-0000-4000-8000-000000000001' and type = 'pickup') <> 1
    or (select count(*) from public.condition_reports where id = current_setting('test.pickup_report_id')::uuid) <> 1
    or (select count(*) from public.booking_state_history where booking_id = '80500000-0000-4000-8000-000000000001' and to_state = 'ACTIVE') <> 1
    or not exists (
      select 1
      from public.handoffs
      where booking_id = '80500000-0000-4000-8000-000000000001'
        and operation_id = '80800000-0000-4000-8000-000000000004'
        and verification_record_id = '80100000-0000-4000-8000-000000000001'
        and contract_version_id = '80600000-0000-4000-8000-000000000001'
        and payment_transaction_id = '80700000-0000-4000-8000-000000000001'
    )
    or detail #>> '{handoff,condition_summary}' <> 'No visible damage; clean and functional.'
    or jsonb_array_length(detail #> '{handoff,photos}') <> 0
    or jsonb_array_length(active_queue) <> 1
    or active_queue #>> '{0,renter_phone}' <> '+639400000002'
    or active_queue::text ~ 'amount|price|deposit|PRIVATE-PICKUP-SERIAL|object_path|sha256'
  then
    raise exception 'pickup commit, optional-photo validity, or active queue is inconsistent';
  end if;

  begin
    update public.condition_reports
    set camera_condition_summary = 'tampered'
    where id = current_setting('test.pickup_report_id')::uuid;
    raise exception 'immutable condition report was updated';
  exception
    when insufficient_privilege or object_not_in_prerequisite_state then null;
  end;
end;
$$;

set constraints all deferred;

do $$
declare
  intent jsonb;
begin
  intent := api.create_condition_photo_upload_intent(
    '80900000-0000-4000-8000-000000000001',
    current_setting('test.pickup_report_id')::uuid,
    'image/png',
    9,
    'ff966b0d6336d379c25a37d1415eb37ca5f61ce92f96796da1aadc4a73eeb86f',
    '80900000-0000-4000-8000-000000000002'
  );

  if intent ->> 'status' <> 'awaiting_upload'
    or intent ->> 'object_path' !~ ('^80500000-0000-4000-8000-000000000001/' || current_setting('test.pickup_report_id') || '/[0-9a-f-]+\.png$')
    or intent::text ~ 'Named Pickup Renter|\+6394|PRIVATE-PICKUP-SERIAL'
  then
    raise exception 'condition photo intent was not opaque and exact';
  end if;

  perform set_config('test.pickup_photo_intent_id', intent ->> 'id', true);
  perform set_config('test.pickup_photo_path', intent ->> 'object_path', true);
end;
$$;

do $$
declare
  updated_count integer;
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'condition-evidence',
      current_setting('test.pickup_photo_path'),
      '80000000-0000-4000-8000-000000000001',
      '{"mimetype":"image/png","size":"8"}'::jsonb
    );
    raise exception 'condition photo accepted mismatched storage metadata';
  exception
    when insufficient_privilege then null;
  end;

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'condition-evidence',
    current_setting('test.pickup_photo_path'),
    '80000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/png","size":"9"}'::jsonb
  );

  update storage.objects
  set metadata = '{"mimetype":"image/png","size":"10"}'::jsonb
  where bucket_id = 'condition-evidence'
    and name = current_setting('test.pickup_photo_path');
  get diagnostics updated_count = row_count;
  if updated_count <> 0 then
    raise exception 'condition photo object was overwritten';
  end if;

  begin
    perform api.finalize_condition_photo_upload(
      current_setting('test.pickup_photo_intent_id')::uuid,
      'image/png',
      9,
      repeat('0', 64),
      '80900000-0000-4000-8000-000000000003'
    );
    raise exception 'condition photo accepted a mismatched digest';
  exception
    when check_violation then null;
  end;
end;
$$;

do $$
declare
  finalized jsonb;
  access_grant jsonb;
  detail jsonb;
begin
  finalized := api.finalize_condition_photo_upload(
    current_setting('test.pickup_photo_intent_id')::uuid,
    'image/png',
    9,
    'ff966b0d6336d379c25a37d1415eb37ca5f61ce92f96796da1aadc4a73eeb86f',
    '80900000-0000-4000-8000-000000000004'
  );
  if finalized ->> 'status' <> 'finalized' then
    raise exception 'condition photo was not finalized';
  end if;

  begin
    perform api.authorize_condition_photo_access(
      (finalized ->> 'photo_id')::uuid,
      'general_admin_browsing',
      '80900000-0000-4000-8000-000000000005'
    );
    raise exception 'condition photo accepted an unapproved admin purpose';
  exception
    when invalid_parameter_value then null;
  end;

  access_grant := api.authorize_condition_photo_access(
    (finalized ->> 'photo_id')::uuid,
    'pickup_condition_review',
    '80900000-0000-4000-8000-000000000006'
  );
  detail := api.get_pickup_detail('80500000-0000-4000-8000-000000000001');

  if access_grant ->> 'object_path' <> current_setting('test.pickup_photo_path')
    or (access_grant ->> 'expires_in_seconds')::integer <> 60
    or detail::text ~ 'object_path|sha256|PRIVATE-PICKUP-SERIAL'
    or jsonb_array_length(detail #> '{handoff,photos}') <> 1
  then
    raise exception 'condition photo projection or audited access is incorrect';
  end if;

  perform set_config('test.pickup_photo_id', finalized ->> 'photo_id', true);
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from private.audit_logs
    where operation_id = '80900000-0000-4000-8000-000000000006'
      and action = 'authorize_condition_photo_access'
      and purpose = 'pickup condition review'
      and metadata ->> 'photo_id' = current_setting('test.pickup_photo_id')
      and metadata::text !~ 'object_path|sha256'
  ) then
    raise exception 'condition photo administrator access was not safely audited';
  end if;
end;
$$;

set local role authenticated;

set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000003';

do $$
begin
  begin
    perform api.authorize_my_condition_photo_access(
      '80500000-0000-4000-8000-000000000001',
      current_setting('test.pickup_photo_id')::uuid
    );
    raise exception 'another renter authorized the owner condition photo';
  exception
    when sqlstate 'P0002' then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '80000000-0000-4000-8000-000000000002';

do $$
declare
  owner_state jsonb := api.get_my_pickup_state('80500000-0000-4000-8000-000000000001');
  access_grant jsonb;
begin
  access_grant := api.authorize_my_condition_photo_access(
    '80500000-0000-4000-8000-000000000001',
    current_setting('test.pickup_photo_id')::uuid
  );

  if owner_state ->> 'booking_state' <> 'ACTIVE'
    or owner_state #>> '{handoff,actual_at}' is null
    or jsonb_array_length(owner_state #> '{handoff,photos}') <> 1
    or owner_state::text ~ 'PRIVATE-PICKUP-SERIAL|object_path|sha256|Named Pickup Renter|\+6394|condition_summary|notes|total_due|rental_amount'
    or access_grant ->> 'object_path' <> current_setting('test.pickup_photo_path')
    or (access_grant ->> 'expires_in_seconds')::integer <> 60
  then
    raise exception 'active owner summary or private photo authorization is unsafe';
  end if;
end;
$$;

reset role;

select 'ok 1 - pickup, active rental, private condition photo, and owner isolation invariants';

rollback;
