begin;

select '1..1';

insert into auth.users (id) values
  ('90000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002'),
  ('90000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('90000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('90000000-0000-4000-8000-000000000001', 'Resolution Admin', '+639500000001'),
  ('90000000-0000-4000-8000-000000000002', 'Resolution Renter', '+639500000002'),
  ('90000000-0000-4000-8000-000000000003', 'Other Resolution Renter', '+639500000003');

insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at
) values (
  '90100000-0000-4000-8000-000000000001',
  'resolution-camera',
  'PRIVATE-RESOLUTION-SERIAL-001',
  'Resolution Camera',
  'Camera used for return and cancellation lifecycle acceptance tests.',
  'published',
  1000,
  4000,
  statement_timestamp()
);

insert into public.camera_accessories (
  id, camera_id, name, quantity, sort_position
) values (
  '90200000-0000-4000-8000-000000000001',
  '90100000-0000-4000-8000-000000000001',
  'Battery',
  2,
  10
);

insert into public.contract_templates (
  id, version, schema_version, terms, content_sha256, created_by,
  approved_at, approved_by, activated_at
) values (
  '90300000-0000-4000-8000-000000000001',
  'resolution-template-v1',
  1,
  '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb,
  extensions.digest(
    convert_to(
      '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb::text,
      'UTF8'
    ),
    'sha256'
  ),
  '90000000-0000-4000-8000-000000000001',
  statement_timestamp() - interval '7 days',
  '90000000-0000-4000-8000-000000000001',
  statement_timestamp() - interval '7 days'
);

set constraints all deferred;

insert into public.bookings (
  id, renter_id, camera_id, state, pickup_at, return_at,
  intended_use, expected_location, requested_at, approved_at,
  approval_deadline_at, approved_by, billable_days_snapshot,
  daily_rate_snapshot, rental_amount, security_deposit_amount,
  current_contract_version_id
) values
  (
    '90400000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000002',
    '90100000-0000-4000-8000-000000000001',
    'ACTIVE',
    statement_timestamp() - interval '2 days',
    statement_timestamp() + interval '1 hour',
    'Clear return acceptance test',
    'Resolution counter',
    statement_timestamp() - interval '8 days',
    statement_timestamp() - interval '7 days',
    statement_timestamp() - interval '6 days',
    '90000000-0000-4000-8000-000000000001',
    2,
    1000,
    2000,
    4000,
    '90500000-0000-4000-8000-000000000001'
  ),
  (
    '90400000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000002',
    '90100000-0000-4000-8000-000000000001',
    'ACTIVE',
    statement_timestamp() - interval '2 days',
    statement_timestamp() + interval '1 hour',
    'Damaged return acceptance test',
    'Resolution counter',
    statement_timestamp() - interval '8 days',
    statement_timestamp() - interval '7 days',
    statement_timestamp() - interval '6 days',
    '90000000-0000-4000-8000-000000000001',
    2,
    1000,
    2000,
    4000,
    '90500000-0000-4000-8000-000000000002'
  ),
  (
    '90400000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000002',
    '90100000-0000-4000-8000-000000000001',
    'FOR_REVIEW',
    statement_timestamp() + interval '5 days',
    statement_timestamp() + interval '7 days',
    'Unpaid cancellation acceptance test',
    'Resolution counter',
    statement_timestamp() - interval '1 hour',
    null, null, null, null, null, null, null, null
  ),
  (
    '90400000-0000-4000-8000-000000000004',
    '90000000-0000-4000-8000-000000000002',
    '90100000-0000-4000-8000-000000000001',
    'CONFIRMED',
    statement_timestamp() + interval '8 days',
    statement_timestamp() + interval '10 days',
    'Paid cancellation fail-closed test',
    'Resolution counter',
    statement_timestamp() - interval '8 days',
    statement_timestamp() - interval '7 days',
    statement_timestamp() - interval '6 days',
    '90000000-0000-4000-8000-000000000001',
    2,
    1000,
    2000,
    4000,
    '90500000-0000-4000-8000-000000000004'
  );

insert into public.contract_versions (
  id, booking_id, version_no, template_id, snapshot,
  snapshot_schema_version, content_sha256, issued_at, issued_by
) values
  (
    '90500000-0000-4000-8000-000000000001',
    '90400000-0000-4000-8000-000000000001',
    1,
    '90300000-0000-4000-8000-000000000001',
    '{"booking":{"id":"90400000-0000-4000-8000-000000000001"},"camera":{"id":"90100000-0000-4000-8000-000000000001","serial_number":"PRIVATE-RESOLUTION-SERIAL-001","accessories":[{"id":"90200000-0000-4000-8000-000000000001","name":"Battery","quantity":2,"replacement_value":5000}]}}'::jsonb,
    1,
    extensions.digest(convert_to('resolution-clear-contract', 'UTF8'), 'sha256'),
    statement_timestamp() - interval '6 days',
    '90000000-0000-4000-8000-000000000001'
  ),
  (
    '90500000-0000-4000-8000-000000000002',
    '90400000-0000-4000-8000-000000000002',
    1,
    '90300000-0000-4000-8000-000000000001',
    '{"booking":{"id":"90400000-0000-4000-8000-000000000002"},"camera":{"id":"90100000-0000-4000-8000-000000000001","serial_number":"PRIVATE-RESOLUTION-SERIAL-001","accessories":[{"id":"90200000-0000-4000-8000-000000000001","name":"Battery","quantity":2,"replacement_value":5000}]}}'::jsonb,
    1,
    extensions.digest(convert_to('resolution-issue-contract', 'UTF8'), 'sha256'),
    statement_timestamp() - interval '6 days',
    '90000000-0000-4000-8000-000000000001'
  ),
  (
    '90500000-0000-4000-8000-000000000004',
    '90400000-0000-4000-8000-000000000004',
    1,
    '90300000-0000-4000-8000-000000000001',
    '{"booking":{"id":"90400000-0000-4000-8000-000000000004"},"camera":{"id":"90100000-0000-4000-8000-000000000001","serial_number":"PRIVATE-RESOLUTION-SERIAL-001","accessories":[]}}'::jsonb,
    1,
    extensions.digest(convert_to('resolution-paid-cancellation-contract', 'UTF8'), 'sha256'),
    statement_timestamp() - interval '6 days',
    '90000000-0000-4000-8000-000000000001'
  );

insert into public.payment_transactions (
  id, booking_id, direction, status, amount, reference,
  counterparty_display_name, submitted_at, submitted_by, decided_at,
  decided_by, submission_attempt_id, contract_version_id,
  recipient_config_version, recipient_name_snapshot, recipient_account_snapshot
) values
  (
    '90600000-0000-4000-8000-000000000001',
    '90400000-0000-4000-8000-000000000001',
    'incoming', 'verified', 6000, 'RESOLUTION-INCOMING-001',
    'Resolution Renter', statement_timestamp() - interval '5 days',
    '90000000-0000-4000-8000-000000000002',
    statement_timestamp() - interval '5 days',
    '90000000-0000-4000-8000-000000000001',
    '90600000-0000-4000-8000-000000000011',
    '90500000-0000-4000-8000-000000000001',
    1, 'Approved Recipient', '09171234567'
  ),
  (
    '90600000-0000-4000-8000-000000000002',
    '90400000-0000-4000-8000-000000000002',
    'incoming', 'verified', 6000, 'RESOLUTION-INCOMING-002',
    'Resolution Renter', statement_timestamp() - interval '5 days',
    '90000000-0000-4000-8000-000000000002',
    statement_timestamp() - interval '5 days',
    '90000000-0000-4000-8000-000000000001',
    '90600000-0000-4000-8000-000000000012',
    '90500000-0000-4000-8000-000000000002',
    1, 'Approved Recipient', '09171234567'
  );

insert into public.payment_allocations (transaction_id, booking_id, kind, amount) values
  ('90600000-0000-4000-8000-000000000001', '90400000-0000-4000-8000-000000000001', 'rental_payment', 2000),
  ('90600000-0000-4000-8000-000000000001', '90400000-0000-4000-8000-000000000001', 'security_deposit', 4000),
  ('90600000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000002', 'rental_payment', 2000),
  ('90600000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000002', 'security_deposit', 4000);

insert into public.handoffs (
  id, booking_id, type, conducted_by, named_renter_present,
  original_id_checked, original_id_matched, camera_serial_checked,
  accessory_checklist_completed, actual_at, operation_id,
  contract_version_id, payment_transaction_id
) values
  (
    '90700000-0000-4000-8000-000000000001',
    '90400000-0000-4000-8000-000000000001',
    'pickup', '90000000-0000-4000-8000-000000000001',
    true, true, true, true, true,
    statement_timestamp() - interval '2 days',
    '90700000-0000-4000-8000-000000000011',
    '90500000-0000-4000-8000-000000000001',
    '90600000-0000-4000-8000-000000000001'
  ),
  (
    '90700000-0000-4000-8000-000000000002',
    '90400000-0000-4000-8000-000000000002',
    'pickup', '90000000-0000-4000-8000-000000000001',
    true, true, true, true, true,
    statement_timestamp() - interval '2 days',
    '90700000-0000-4000-8000-000000000012',
    '90500000-0000-4000-8000-000000000002',
    '90600000-0000-4000-8000-000000000002'
  );

insert into public.booking_state_history (
  booking_id, from_state, to_state, actor_user_id, actor_type,
  reason_code, occurred_at
) values
  ('90400000-0000-4000-8000-000000000001', 'CONFIRMED', 'ACTIVE', '90000000-0000-4000-8000-000000000001', 'admin', 'pickup_completed', statement_timestamp() - interval '2 days'),
  ('90400000-0000-4000-8000-000000000002', 'CONFIRMED', 'ACTIVE', '90000000-0000-4000-8000-000000000001', 'admin', 'pickup_completed', statement_timestamp() - interval '2 days'),
  ('90400000-0000-4000-8000-000000000003', null, 'FOR_REVIEW', '90000000-0000-4000-8000-000000000002', 'renter', 'booking_requested', statement_timestamp() - interval '1 hour'),
  ('90400000-0000-4000-8000-000000000004', 'PAYMENT_REVIEW', 'CONFIRMED', '90000000-0000-4000-8000-000000000001', 'admin', 'payment_verified', statement_timestamp() - interval '1 day');

set constraints all immediate;
set constraints all deferred;

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000002';

do $$
declare
  request_result jsonb;
  retry_result jsonb;
  owner_state jsonb;
begin
  request_result := api.request_cancellation_resolution(
    '90400000-0000-4000-8000-000000000003',
    'Plans changed before approval.',
    '90800000-0000-4000-8000-000000000001'
  );
  retry_result := api.request_cancellation_resolution(
    '90400000-0000-4000-8000-000000000003',
    'Plans changed before approval.',
    '90800000-0000-4000-8000-000000000001'
  );
  owner_state := api.get_my_resolution_state('90400000-0000-4000-8000-000000000003');

  if not (request_result ->> 'created')::boolean
    or (retry_result ->> 'created')::boolean
    or request_result ->> 'request_id' <> retry_result ->> 'request_id'
    or request_result ->> 'booking_state' <> 'FOR_REVIEW'
    or owner_state #>> '{cancellation,disposition}' <> 'pending'
    or owner_state::text ~ 'phone|legal_name|internal_reason|reference|PRIVATE-RESOLUTION-SERIAL'
    or not exists (
      select 1 from public.bookings
      where id = '90400000-0000-4000-8000-000000000003'
        and state = 'FOR_REVIEW'
    )
  then
    raise exception 'cancellation request was not owner-scoped, idempotent, state-preserving, or minimized';
  end if;

  perform set_config('test.unpaid_cancellation_request_id', request_result ->> 'request_id', true);

  request_result := api.request_cancellation_resolution(
    '90400000-0000-4000-8000-000000000004',
    'Requesting a review of this paid cancellation.',
    '90800000-0000-4000-8000-000000000002'
  );
  perform set_config('test.paid_cancellation_request_id', request_result ->> 'request_id', true);
end;
$$;

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000003';

do $$
begin
  begin
    perform api.request_cancellation_resolution(
      '90400000-0000-4000-8000-000000000001',
      'Trying to cancel another renters booking.',
      '90800000-0000-4000-8000-000000000003'
    );
    raise exception 'another renter requested cancellation';
  exception
    when sqlstate 'P0002' then null;
  end;

  begin
    perform api.get_my_resolution_state('90400000-0000-4000-8000-000000000001');
    raise exception 'another renter read the owner resolution projection';
  exception
    when sqlstate 'P0002' then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000001';

do $$
declare
  queues jsonb := api.get_resolution_queues();
  decision jsonb;
  detail jsonb;
begin
  if jsonb_array_length(queues -> 'return_queue') <> 2
    or jsonb_array_length(queues -> 'cancellation_queue') <> 2
    or queues::text ~ 'PRIVATE-RESOLUTION-SERIAL|replacement_value|object_path|sha256'
  then
    raise exception 'administrator resolution queues were incomplete or overexposed';
  end if;

  decision := api.decide_cancellation_resolution(
    current_setting('test.unpaid_cancellation_request_id')::uuid,
    true,
    'Accepted before payment under the approved no-fee path.',
    0,
    0,
    '90800000-0000-4000-8000-000000000004'
  );
  detail := api.get_resolution_detail('90400000-0000-4000-8000-000000000003');
  if decision ->> 'booking_state' <> 'CANCELLED'
    or (detail #>> '{cancellation,decision,fee_amount}')::numeric <> 0
    or (detail #>> '{cancellation,decision,refund_liability_amount}')::numeric <> 0
  then
    raise exception 'eligible cancellation was not decided explicitly';
  end if;

  begin
    perform api.decide_cancellation_resolution(
      current_setting('test.paid_cancellation_request_id')::uuid,
      true,
      'Attempt to accept before paid cancellation policy approval.',
      0,
      0,
      '90800000-0000-4000-8000-000000000005'
    );
    raise exception 'paid cancellation was accepted without approved policy';
  exception
    when feature_not_supported then null;
  end;

  perform api.decide_cancellation_resolution(
    current_setting('test.paid_cancellation_request_id')::uuid,
    false,
    'Declined because the paid cancellation policy remains unresolved.',
    0,
    0,
    '90800000-0000-4000-8000-000000000006'
  );
end;
$$;

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000002';

do $$
declare
  retry_result jsonb;
begin
  retry_result := api.request_cancellation_resolution(
    '90400000-0000-4000-8000-000000000003',
    'Plans changed before approval.',
    '90800000-0000-4000-8000-000000000001'
  );
  if (retry_result ->> 'created')::boolean
    or retry_result ->> 'disposition' <> 'accepted'
    or retry_result ->> 'booking_state' <> 'CANCELLED'
  then
    raise exception 'decided cancellation request retry lost its committed outcome';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000001';

do $$
declare
  clear_result jsonb;
  retry_result jsonb;
begin
  begin
    perform api.record_return_inspection(
      '90400000-0000-4000-8000-000000000001',
      statement_timestamp() - interval '1 minute',
      'WRONG-SERIAL',
      'Camera returned clean and working.',
      '[{"id":"90200000-0000-4000-8000-000000000001","status":"returned"}]'::jsonb,
      false,
      null,
      '90900000-0000-4000-8000-000000000001'
    );
    raise exception 'return accepted a mismatched camera serial';
  exception
    when check_violation then null;
  end;

  begin
    perform api.record_return_inspection(
      '90400000-0000-4000-8000-000000000001',
      statement_timestamp() - interval '1 minute',
      'PRIVATE-RESOLUTION-SERIAL-001',
      'Camera returned clean and working.',
      '[]'::jsonb,
      false,
      null,
      '90900000-0000-4000-8000-000000000002'
    );
    raise exception 'return accepted an incomplete accessory checklist';
  exception
    when check_violation then null;
  end;

  clear_result := api.record_return_inspection(
    '90400000-0000-4000-8000-000000000001',
    statement_timestamp() - interval '1 minute',
    'PRIVATE-RESOLUTION-SERIAL-001',
    'Camera returned clean and working.',
    '[{"id":"90200000-0000-4000-8000-000000000001","status":"returned"}]'::jsonb,
    false,
    null,
    '90900000-0000-4000-8000-000000000003'
  );
  retry_result := api.record_return_inspection(
    '90400000-0000-4000-8000-000000000001',
    statement_timestamp() - interval '1 minute',
    'PRIVATE-RESOLUTION-SERIAL-001',
    'Camera returned clean and working.',
    '[{"id":"90200000-0000-4000-8000-000000000001","status":"returned"}]'::jsonb,
    false,
    null,
    '90900000-0000-4000-8000-000000000003'
  );
  if clear_result ->> 'booking_state' <> 'RETURN_REVIEW'
    or not (clear_result ->> 'created')::boolean
    or (retry_result ->> 'created')::boolean
    or clear_result ->> 'handoff_id' <> retry_result ->> 'handoff_id'
  then
    raise exception 'return recording was not complete, atomic, or idempotent';
  end if;
end;
$$;

set constraints all immediate;
set constraints all deferred;

do $$
begin
  perform api.decide_return_inspection(
    '90400000-0000-4000-8000-000000000001',
    'clear',
    'No issue found during review.',
    '90900000-0000-4000-8000-000000000004'
  );
end;
$$;

do $$
declare
  result jsonb;
  intent jsonb;
begin
  result := api.record_return_inspection(
    '90400000-0000-4000-8000-000000000002',
    statement_timestamp() - interval '1 minute',
    'PRIVATE-RESOLUTION-SERIAL-001',
    'Camera body has a new impact mark.',
    '[{"id":"90200000-0000-4000-8000-000000000001","status":"returned"}]'::jsonb,
    true,
    'Inspection paused for evidence and a manual decision.',
    '90900000-0000-4000-8000-000000000005'
  );
  perform set_config('test.issue_report_id', result ->> 'condition_report_id', true);

  begin
    perform api.decide_return_inspection(
      '90400000-0000-4000-8000-000000000002',
      'issue',
      'Impact damage needs manual review.',
      '90900000-0000-4000-8000-000000000006'
    );
    raise exception 'damage issue advanced without finalized evidence';
  exception
    when check_violation then null;
  end;

  intent := api.create_condition_photo_upload_intent(
    '90900000-0000-4000-8000-000000000007',
    current_setting('test.issue_report_id')::uuid,
    'image/png',
    9,
    'ff966b0d6336d379c25a37d1415eb37ca5f61ce92f96796da1aadc4a73eeb86f',
    '90900000-0000-4000-8000-000000000008'
  );
  perform set_config('test.issue_photo_intent_id', intent ->> 'id', true);
  perform set_config('test.issue_photo_path', intent ->> 'object_path', true);
end;
$$;

set constraints all immediate;
set constraints all deferred;

insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'condition-evidence',
  current_setting('test.issue_photo_path'),
  '90000000-0000-4000-8000-000000000001',
  '{"mimetype":"image/png","size":"9"}'::jsonb
);

do $$
declare
  finalized jsonb;
begin
  finalized := api.finalize_condition_photo_upload(
    current_setting('test.issue_photo_intent_id')::uuid,
    'image/png',
    9,
    'ff966b0d6336d379c25a37d1415eb37ca5f61ce92f96796da1aadc4a73eeb86f',
    '90900000-0000-4000-8000-000000000009'
  );
  perform set_config('test.issue_photo_id', finalized ->> 'photo_id', true);

  perform api.decide_return_inspection(
    '90400000-0000-4000-8000-000000000002',
    'issue',
    'Impact damage needs a documented manual decision.',
    '90900000-0000-4000-8000-000000000010'
  );
end;
$$;

set constraints all immediate;
set constraints all deferred;

do $$
begin
  perform api.add_return_issue_note(
    '90400000-0000-4000-8000-000000000002',
    'Compared the return image with the pickup report.',
    '90900000-0000-4000-8000-000000000011'
  );

  begin
    perform api.resolve_return_issue(
      '90400000-0000-4000-8000-000000000002',
      'damage',
      4500,
      'Manual damage estimate exceeds the deposit.',
      'The documented damage was reviewed.',
      '90900000-0000-4000-8000-000000000012'
    );
    raise exception 'deduction exceeded the verified held deposit';
  exception
    when check_violation then null;
  end;

  perform api.resolve_return_issue(
    '90400000-0000-4000-8000-000000000002',
    'damage',
    1000,
    'Approved manual deduction for the documented body repair.',
    'A PHP 1,000 deduction was approved for documented body repair.',
    '90900000-0000-4000-8000-000000000013'
  );
end;
$$;

reset role;

do $$
declare
  mismatch record;
begin
  select booking.id, booking.state, history.to_state
  into mismatch
  from public.bookings as booking
  left join lateral (
    select entry.to_state
    from public.booking_state_history as entry
    where entry.booking_id = booking.id
    order by entry.id desc
    limit 1
  ) as history on true
  where booking.id::text like '90400000-%'
    and booking.state is distinct from history.to_state
  limit 1;
  if mismatch.id is not null then
    raise exception 'resolution fixture history mismatch: booking %, state %, history %',
      mismatch.id, mismatch.state, mismatch.to_state;
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000001';

set constraints all immediate;
set constraints all deferred;

do $$
declare
  clear_refund jsonb;
  issue_refund jsonb;
  reversal jsonb;
  detail jsonb;
begin
  clear_refund := api.record_external_refund(
    '90400000-0000-4000-8000-000000000001',
    4000,
    'RESOLUTION-REFUND-CLEAR-001',
    'Resolution Renter',
    statement_timestamp(),
    '91000000-0000-4000-8000-000000000001'
  );
  issue_refund := api.record_external_refund(
    '90400000-0000-4000-8000-000000000002',
    3000,
    'RESOLUTION-REFUND-ISSUE-001',
    'Resolution Renter',
    statement_timestamp(),
    '91000000-0000-4000-8000-000000000002'
  );

  perform set_config('test.clear_refund_transaction_id', clear_refund ->> 'transaction_id', true);
  perform set_config('test.issue_refund_transaction_id', issue_refund ->> 'transaction_id', true);

  reversal := api.reverse_external_refund(
    (clear_refund ->> 'refund_record_id')::uuid,
    'RESOLUTION-REVERSAL-CLEAR-001',
    'Resolution Renter',
    statement_timestamp(),
    'External refund was returned and must be re-sent.',
    '91000000-0000-4000-8000-000000000003'
  );
  if reversal ->> 'entry_kind' <> 'reversal'
    or (reversal ->> 'remaining_liability')::numeric <> 4000
  then
    raise exception 'refund correction was not an immutable offsetting reversal';
  end if;

  detail := api.get_resolution_detail('90400000-0000-4000-8000-000000000002');
  if detail #>> '{booking_state}' <> 'COMPLETED'
    or (detail #>> '{deposit,deduction_amount}')::numeric <> 1000
    or (detail #>> '{deposit,refunded_amount}')::numeric <> 3000
    or (detail #>> '{deposit,remaining_refund_liability}')::numeric <> 0
    or detail #>> '{deposit,status}' <> 'refunded'
    or detail #>> '{issue_decision,customer_explanation}'
      <> 'A PHP 1,000 deduction was approved for documented body repair.'
    or detail #>> '{refunds,0,reference_last4}' <> 'e001'
    or detail::text ~ 'object_path|sha256|PRIVATE-RESOLUTION-SERIAL'
  then
    raise exception 'administrator resolution detail was inconsistent or exposed private storage metadata';
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from private.audit_logs
    where operation_id = '90900000-0000-4000-8000-000000000013'
      and action = 'resolve_return_issue'
      and (metadata ->> 'deduction_amount')::numeric = 1000
      and (metadata ->> 'amount_is_manual')::boolean
  ) or not exists (
    select 1 from private.audit_logs
    where operation_id = '91000000-0000-4000-8000-000000000003'
      and action = 'reverse_external_refund'
      and metadata ->> 'reference_last4' = 'r001'
      and metadata::text !~ 'RESOLUTION-REVERSAL-CLEAR-001'
  ) then
    raise exception 'resolution decisions or money corrections were not safely audited';
  end if;

  if exists (
    select 1
    from public.payment_allocations as allocation
    where allocation.transaction_id in (
      current_setting('test.clear_refund_transaction_id')::uuid,
      current_setting('test.issue_refund_transaction_id')::uuid
    ) and allocation.kind <> 'deposit_refund'
  ) or (
    select count(*)
    from public.payment_allocations as allocation
    where allocation.transaction_id in (
      current_setting('test.clear_refund_transaction_id')::uuid,
      current_setting('test.issue_refund_transaction_id')::uuid
    )
  ) <> 2 or not exists (
    select 1
    from public.deposit_deductions as deduction
    join public.return_issue_decisions as decision
      on decision.id = deduction.issue_decision_id
    where deduction.booking_id = '90400000-0000-4000-8000-000000000002'
      and deduction.amount = 1000
      and decision.deduction_amount = 1000
  ) then
    raise exception 'deduction or refund accounting was not explicitly linked and balanced';
  end if;

  begin
    update public.return_issue_notes
    set note = 'tampered'
    where booking_id = '90400000-0000-4000-8000-000000000002';
    raise exception 'append-only issue evidence was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.payment_transactions
    set reference = 'MUTATED-REFUND'
    where id = (
      select transaction_id from public.deposit_refund_records
      where operation_id = '91000000-0000-4000-8000-000000000002'
    );
    raise exception 'verified outgoing refund history was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000002';

do $$
declare
  clear_state jsonb := api.get_my_resolution_state('90400000-0000-4000-8000-000000000001');
  issue_state jsonb := api.get_my_resolution_state('90400000-0000-4000-8000-000000000002');
begin
  if clear_state #>> '{booking_state}' <> 'COMPLETED'
    or (clear_state #>> '{deposit,remaining_refund_liability}')::numeric <> 4000
    or clear_state #>> '{deposit,status}' <> 'pending_refund'
    or issue_state #>> '{issue_decision,customer_explanation}'
      <> 'A PHP 1,000 deduction was approved for documented body repair.'
    or (issue_state #>> '{deposit,deduction_amount}')::numeric <> 1000
    or (issue_state #>> '{deposit,remaining_refund_liability}')::numeric <> 0
    or issue_state #>> '{deposit,status}' <> 'refunded'
    or issue_state::text ~ 'internal_reason|reference|phone|legal_name|object_path|sha256|PRIVATE-RESOLUTION-SERIAL'
  then
    raise exception 'renter outcome projection was incomplete, unsafe, or mutable';
  end if;

  begin
    perform count(*) from public.return_issue_decisions;
    raise exception 'renter directly read private issue decisions';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select 'ok 1 - audited return, cancellation, deduction, refund, reversal, and owner isolation invariants';

rollback;
