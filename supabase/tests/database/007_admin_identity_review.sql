begin;

select '1..1';

insert into auth.users (id) values
  ('40000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003'),
  ('40000000-0000-4000-8000-000000000004');

insert into private.admin_accounts (user_id)
values ('40000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('40000000-0000-4000-8000-000000000001', 'Synthetic Review Admin', '+639400000001'),
  ('40000000-0000-4000-8000-000000000002', 'Synthetic Rejected Renter', '+639400000002'),
  ('40000000-0000-4000-8000-000000000003', 'Synthetic Expired Renter', '+639400000003'),
  ('40000000-0000-4000-8000-000000000004', 'Synthetic Queue Renter', '+639400000004');

update private.verification_evidence_policies
set enabled = true,
    activated_at = statement_timestamp()
where singleton;

insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  submitted_at
) values
  (
    '41000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    'pending',
    'philippine_passport',
    statement_timestamp() - interval '2 hours'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000004',
    'pending',
    'umid',
    statement_timestamp() - interval '3 hours'
  );

insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  document_expiration_date,
  submitted_at,
  decided_at,
  decided_by
) values (
  '41000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000003',
  'verified',
  'drivers_license',
  (statement_timestamp() at time zone 'Asia/Manila')::date - 1,
  '2026-07-01 00:00:00+00',
  '2026-07-01 00:00:00+00',
  '40000000-0000-4000-8000-000000000001'
);

insert into private.verification_decision_history (
  verification_record_id,
  user_id,
  from_status,
  to_status,
  actor_user_id,
  actor_type,
  reason_code,
  approved_id_type,
  document_expiration_date,
  operation_id,
  occurred_at
) values (
  '41000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000003',
  'pending',
  'verified',
  '40000000-0000-4000-8000-000000000001',
  'admin',
  'identity_verified',
  'drivers_license',
  (statement_timestamp() at time zone 'Asia/Manila')::date - 1,
  '49000000-0000-4000-8000-000000000001',
  '2026-07-01 00:00:00+00'
);

insert into storage.objects (id, bucket_id, name, owner, metadata) values
  (
    '42000000-0000-4000-8000-000000000001',
    'verification-documents',
    '40000000-0000-4000-8000-000000000002/41000000-0000-4000-8000-000000000001/42000000-0000-4000-8000-000000000011.png',
    '40000000-0000-4000-8000-000000000002',
    '{"mimetype":"image/png","size":8}'::jsonb
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    'verification-documents',
    '40000000-0000-4000-8000-000000000004/41000000-0000-4000-8000-000000000002/42000000-0000-4000-8000-000000000012.jpg',
    '40000000-0000-4000-8000-000000000004',
    '{"mimetype":"image/jpeg","size":12}'::jsonb
  ),
  (
    '42000000-0000-4000-8000-000000000003',
    'verification-documents',
    '40000000-0000-4000-8000-000000000003/41000000-0000-4000-8000-000000000003/42000000-0000-4000-8000-000000000013.png',
    '40000000-0000-4000-8000-000000000003',
    '{"mimetype":"image/png","size":16}'::jsonb
  );

insert into public.verification_documents (
  id,
  verification_record_id,
  owner_user_id,
  object_path,
  media_type,
  byte_size,
  sha256,
  finalized_at,
  retention_until,
  retention_policy_version,
  privacy_notice_version,
  privacy_acknowledged_at
) values
  (
    '42000000-0000-4000-8000-000000000011',
    '41000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002/41000000-0000-4000-8000-000000000001/42000000-0000-4000-8000-000000000011.png',
    'image/png',
    8,
    decode(repeat('11', 32), 'hex'),
    statement_timestamp(),
    statement_timestamp() + interval '30 days',
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    statement_timestamp()
  ),
  (
    '42000000-0000-4000-8000-000000000012',
    '41000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000004/41000000-0000-4000-8000-000000000002/42000000-0000-4000-8000-000000000012.jpg',
    'image/jpeg',
    12,
    decode(repeat('12', 32), 'hex'),
    statement_timestamp(),
    statement_timestamp() + interval '30 days',
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    statement_timestamp()
  ),
  (
    '42000000-0000-4000-8000-000000000013',
    '41000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003/41000000-0000-4000-8000-000000000003/42000000-0000-4000-8000-000000000013.png',
    'image/png',
    16,
    decode(repeat('13', 32), 'hex'),
    statement_timestamp(),
    statement_timestamp() + interval '30 days',
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    statement_timestamp()
  );

set local role anon;

do $$
begin
  begin
    perform api.get_verification_review_queue();
    raise exception 'anonymous caller read the verification review queue';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.decide_verification(
      '41000000-0000-4000-8000-000000000001',
      '42000000-0000-4000-8000-000000000011',
      'rejected',
      '',
      '',
      'document_not_readable',
      gen_random_uuid()
    );
    raise exception 'anonymous caller decided a verification';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform api.get_verification_review_queue();
    raise exception 'ordinary renter read the verification review queue';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform api.authorize_verification_evidence_access(
      '41000000-0000-4000-8000-000000000001',
      'identity_review',
      gen_random_uuid()
    );
    raise exception 'ordinary renter authorized evidence access';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000001';

do $$
declare
  queue jsonb;
  detail jsonb;
  access_grant jsonb;
  rejected_state jsonb;
begin
  queue := api.get_verification_review_queue();
  if jsonb_array_length(queue) <> 2
    or queue #>> '{0,record_id}' <> '41000000-0000-4000-8000-000000000002'
    or queue::text like '%object_path%'
    or queue::text like '%sha256%'
    or queue::text like '%+6394%'
    or queue::text like '%verification-documents%'
  then
    raise exception 'verification review queue is incomplete, unordered, or leaks private metadata: %', queue;
  end if;

  detail := api.get_verification_review_detail(
    '41000000-0000-4000-8000-000000000001'
  );
  if detail ->> 'renter_legal_name' <> 'Synthetic Rejected Renter'
    or detail ->> 'status' <> 'pending'
    or detail::text like '%object_path%'
    or detail::text like '%sha256%'
  then
    raise exception 'verification review detail is unsafe or incomplete: %', detail;
  end if;

  begin
    perform api.authorize_verification_evidence_access(
      '41000000-0000-4000-8000-000000000001',
      'general_admin_access',
      gen_random_uuid()
    );
    raise exception 'non-review evidence access purpose was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'verification_access_invalid_purpose' then raise; end if;
  end;

  access_grant := api.authorize_verification_evidence_access(
    '41000000-0000-4000-8000-000000000001',
    'identity_review',
    '49000000-0000-4000-8000-000000000010'
  );
  if access_grant ->> 'expires_in_seconds' <> '60'
    or access_grant ->> 'object_path' not like '40000000-0000-4000-8000-000000000002/%'
  then
    raise exception 'audited evidence access did not return the exact short-lived target';
  end if;

  begin
    perform api.decide_verification(
      '41000000-0000-4000-8000-000000000001',
      '42000000-0000-4000-8000-000000000012',
      'rejected',
      '',
      '',
      'document_not_readable',
      gen_random_uuid()
    );
    raise exception 'a decision accepted evidence that the admin did not review';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'verification_decision_evidence_unavailable' then raise; end if;
  end;

  begin
    perform api.decide_verification(
      '41000000-0000-4000-8000-000000000001',
      '42000000-0000-4000-8000-000000000011',
      'rejected',
      '',
      '',
      'free text with sensitive details',
      gen_random_uuid()
    );
    raise exception 'unapproved renter-facing rejection text was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'verification_decision_metadata_invalid' then raise; end if;
  end;

  rejected_state := api.decide_verification(
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000011',
    'rejected',
    '',
    '',
    'document_not_readable',
    '49000000-0000-4000-8000-000000000011'
  );
  if rejected_state ->> 'status' <> 'rejected' then
    raise exception 'verification rejection did not persist';
  end if;

  begin
    perform api.decide_verification(
      '41000000-0000-4000-8000-000000000002',
      '42000000-0000-4000-8000-000000000012',
      'verified',
      'umid',
      (statement_timestamp() at time zone 'Asia/Manila')::date::text,
      '',
      gen_random_uuid()
    );
    raise exception 'verification with a non-future expiration date was accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'verification_decision_metadata_invalid' then raise; end if;
  end;

  perform api.decide_verification(
    '41000000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000012',
    'verified',
    'umid',
    ((statement_timestamp() at time zone 'Asia/Manila')::date + 30)::text,
    '',
    '49000000-0000-4000-8000-000000000012'
  );
end;
$$;

reset role;

insert into auth.users (id)
select md5('verification-expiry-user-' || series.value::text)::uuid
from generate_series(1, 101) as series(value);

insert into public.profiles (user_id, legal_name, phone)
select
  md5('verification-expiry-user-' || series.value::text)::uuid,
  'Verification expiry batch user ' || series.value::text,
  '+63941' || lpad(series.value::text, 7, '0')
from generate_series(1, 101) as series(value);

insert into public.verification_records (
  user_id,
  status,
  id_type,
  document_expiration_date,
  submitted_at,
  decided_at,
  decided_by
)
select
  md5('verification-expiry-user-' || series.value::text)::uuid,
  'verified',
  'drivers_license',
  (statement_timestamp() at time zone 'Asia/Manila')::date - 1,
  statement_timestamp() - interval '1 day' - series.value * interval '1 second',
  statement_timestamp() - interval '1 day',
  '40000000-0000-4000-8000-000000000001'
from generate_series(1, 101) as series(value);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  first_count integer;
  second_count integer;
begin
  first_count := api.expire_due_verifications(
    '49000000-0000-4000-8000-000000000022'
  );
  second_count := api.expire_due_verifications(
    '49000000-0000-4000-8000-000000000023'
  );
  if first_count <> 100 or second_count <> 1 then
    raise exception 'verification expiry batch is not bounded and drainable: %, %',
      first_count,
      second_count;
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from private.audit_logs
    where operation_id = '49000000-0000-4000-8000-000000000010'
      and actor_user_id = '40000000-0000-4000-8000-000000000001'
      and action = 'authorize_verification_evidence_access'
      and outcome = 'authorized'
      and purpose = 'identity verification review'
      and occurred_at is not null
      and metadata ->> 'expires_in_seconds' = '60'
      and metadata::text not like '%verification-documents%'
      and metadata::text not like '%token%'
  ) then
    raise exception 'evidence access audit is missing or contains sensitive access material';
  end if;

  if not exists (
    select 1
    from private.verification_decision_history
    where verification_record_id = '41000000-0000-4000-8000-000000000001'
      and from_status = 'pending'
      and to_status = 'rejected'
      and renter_facing_reason_code = 'document_not_readable'
      and actor_user_id = '40000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'append-only rejection history is missing';
  end if;

  if not exists (
    select 1
    from private.audit_logs
    where operation_id = '49000000-0000-4000-8000-000000000011'
      and actor_user_id = '40000000-0000-4000-8000-000000000001'
      and action = 'reject_renter_identity'
      and purpose = 'identity verification decision'
      and outcome = 'success'
      and occurred_at is not null
      and metadata ->> 'reviewed_document_id'
        = '42000000-0000-4000-8000-000000000011'
  ) or not exists (
    select 1
    from private.audit_logs
    where operation_id = '49000000-0000-4000-8000-000000000012'
      and actor_user_id = '40000000-0000-4000-8000-000000000001'
      and action = 'verify_renter_identity'
      and purpose = 'identity verification decision'
      and outcome = 'success'
      and occurred_at is not null
      and metadata ->> 'reviewed_document_id'
        = '42000000-0000-4000-8000-000000000012'
  ) or exists (
    select 1
    from private.audit_logs
    where operation_id in (
      '49000000-0000-4000-8000-000000000011',
      '49000000-0000-4000-8000-000000000012'
    )
      and (
        metadata::text like '%verification-documents%'
        or metadata::text like '%token%'
        or metadata::text like '%content%'
      )
  ) then
    raise exception 'verification decision audit is missing or contains access material';
  end if;

end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000002';

do $$
declare
  renter_state jsonb := api.get_my_verification_upload_state();
begin
  if renter_state #>> '{record,status}' <> 'rejected'
    or renter_state #>> '{record,rejection_reason_code}' <> 'document_not_readable'
    or renter_state::text like '%object_path%'
    or renter_state::text like '%sha256%'
  then
    raise exception 'renter rejection state is unsafe or incomplete: %', renter_state;
  end if;
end;
$$;

reset role;

insert into public.verification_records (
  id,
  user_id,
  status,
  id_type,
  submitted_at
) values (
  '41000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000002',
  'pending',
  'drivers_license',
  statement_timestamp()
);

insert into storage.objects (id, bucket_id, name, owner, metadata)
values (
  '42000000-0000-4000-8000-000000000004',
  'verification-documents',
  '40000000-0000-4000-8000-000000000002/41000000-0000-4000-8000-000000000004/42000000-0000-4000-8000-000000000014.png',
  '40000000-0000-4000-8000-000000000002',
  '{"mimetype":"image/png","size":20}'::jsonb
);

insert into public.verification_documents (
  id,
  verification_record_id,
  owner_user_id,
  object_path,
  media_type,
  byte_size,
  sha256,
  finalized_at,
  retention_until,
  retention_policy_version,
  privacy_notice_version,
  privacy_acknowledged_at
) values (
  '42000000-0000-4000-8000-000000000014',
  '41000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002/41000000-0000-4000-8000-000000000004/42000000-0000-4000-8000-000000000014.png',
  'image/png',
  20,
  decode(repeat('14', 32), 'hex'),
  statement_timestamp(),
  statement_timestamp() + interval '30 days',
  'government-id-evidence-v2',
  'government-id-privacy-v2',
  statement_timestamp()
);

do $$
begin
  if (
    select supersedes_id
    from public.verification_records
    where id = '41000000-0000-4000-8000-000000000004'
  ) <> '41000000-0000-4000-8000-000000000001'
    or (
      select supersedes_id
      from public.verification_documents
      where id = '42000000-0000-4000-8000-000000000014'
    ) <> '42000000-0000-4000-8000-000000000011'
    or not (
      select superseded_at is not null and retention_until <= statement_timestamp()
      from public.verification_documents
      where id = '42000000-0000-4000-8000-000000000011'
    )
    or (
      select status
      from public.verification_records
      where id = '41000000-0000-4000-8000-000000000001'
    ) <> 'rejected'
  then
    raise exception 'replacement did not preserve and supersede earlier verification history';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000002';

do $$
declare
  state jsonb := api.get_my_verification_upload_state();
begin
  if state #>> '{record,id}' <> '41000000-0000-4000-8000-000000000004'
    or state #>> '{record,status}' <> 'pending'
    or state #>> '{record,supersedes_id}' <> '41000000-0000-4000-8000-000000000001'
  then
    raise exception 'only-latest verification projection is incorrect: %', state;
  end if;
end;
$$;

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  first_count integer;
  second_count integer;
begin
  first_count := api.expire_due_verifications(
    '49000000-0000-4000-8000-000000000020'
  );
  second_count := api.expire_due_verifications(
    '49000000-0000-4000-8000-000000000021'
  );
  if first_count <> 1 or second_count <> 0 then
    raise exception 'Manila-date verification expiry is not idempotent: %, %',
      first_count,
      second_count;
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.verification_records
    where id = '41000000-0000-4000-8000-000000000003'
      and status = 'expired'
      and decided_by = '40000000-0000-4000-8000-000000000001'
      and decided_at = '2026-07-01 00:00:00+00'
  ) then
    raise exception 'expiry rewrote or failed to update the current verification projection';
  end if;

  if (
    select count(*)
    from private.verification_decision_history
    where verification_record_id = '41000000-0000-4000-8000-000000000003'
  ) <> 2
    or not exists (
      select 1
      from private.audit_logs
      where operation_id = '49000000-0000-4000-8000-000000000020'
        and actor_user_id is null
        and action = 'expire_renter_identity'
        and purpose = 'identity verification expiry'
        and metadata ->> 'business_time_zone' = 'Asia/Manila'
    )
  then
    raise exception 'expiry did not preserve earlier history or append a safe system audit';
  end if;

  begin
    update private.verification_decision_history
    set reason_code = 'rewritten'
    where verification_record_id = '41000000-0000-4000-8000-000000000003';
    raise exception 'verification decision history was mutable';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from private.audit_logs
    where operation_id = '49000000-0000-4000-8000-000000000020';
    raise exception 'verification audit history was mutable';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  intent jsonb;
begin
  intent := api.create_verification_upload_intent(
    '49000000-0000-4000-8000-000000000030',
    'drivers_license',
    'image/png',
    8,
    repeat('30', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '49000000-0000-4000-8000-000000000031',
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003'
  );

  if intent ->> 'status' <> 'awaiting_upload'
    or intent ->> 'record_id' = '41000000-0000-4000-8000-000000000003'
  then
    raise exception 'expired renter could not begin a new current submission: %', intent;
  end if;
end;
$$;

reset role;

insert into public.cameras (
  id,
  slug,
  serial_number,
  name,
  status
) values (
  '43000000-0000-4000-8000-000000000001',
  'synthetic-rejection-camera',
  'SYNTHETIC-REJECTION-SERIAL',
  'Synthetic Rejection Camera',
  'draft'
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
  '43000000-0000-4000-8000-000000000010',
  'synthetic-pickup-expiry-v1',
  1,
  '{}'::jsonb,
  decode(repeat('21', 32), 'hex'),
  '40000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  '40000000-0000-4000-8000-000000000001',
  statement_timestamp()
);

set constraints all deferred;

insert into public.bookings (
  id,
  renter_id,
  camera_id,
  pickup_at,
  return_at,
  intended_use,
  expected_location,
  state,
  approved_at,
  approval_deadline_at,
  approved_by,
  daily_rate_snapshot,
  rental_amount,
  security_deposit_amount
) values (
  '44000000-0000-4000-8000-000000000010',
  '40000000-0000-4000-8000-000000000003',
  '43000000-0000-4000-8000-000000000001',
  statement_timestamp(),
  statement_timestamp() + interval '1 day',
  'Synthetic expired pickup guard',
  'Synthetic Manila location',
  'CONFIRMED',
  statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '1 day',
  '40000000-0000-4000-8000-000000000001',
  1,
  1,
  1
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
    '44000000-0000-4000-8000-000000000010', null, 'FOR_REVIEW',
    '40000000-0000-4000-8000-000000000003', 'renter', 'booking_requested'
  ),
  (
    '44000000-0000-4000-8000-000000000010', 'FOR_REVIEW', 'CONTRACT_PENDING',
    '40000000-0000-4000-8000-000000000001', 'admin', 'booking_approved'
  ),
  (
    '44000000-0000-4000-8000-000000000010', 'CONTRACT_PENDING', 'TO_PAY',
    '40000000-0000-4000-8000-000000000003', 'renter', 'contract_signed'
  ),
  (
    '44000000-0000-4000-8000-000000000010', 'TO_PAY', 'PAYMENT_REVIEW',
    '40000000-0000-4000-8000-000000000003', 'renter', 'payment_submitted'
  ),
  (
    '44000000-0000-4000-8000-000000000010', 'PAYMENT_REVIEW', 'CONFIRMED',
    '40000000-0000-4000-8000-000000000001', 'admin', 'payment_verified'
  );

insert into public.contract_versions (
  id,
  booking_id,
  version_no,
  template_id,
  snapshot,
  snapshot_schema_version,
  content_sha256,
  issued_by
) values (
  '45000000-0000-4000-8000-000000000010',
  '44000000-0000-4000-8000-000000000010',
  1,
  '43000000-0000-4000-8000-000000000010',
  '{}'::jsonb,
  1,
  decode(repeat('22', 32), 'hex'),
  '40000000-0000-4000-8000-000000000001'
);

update public.bookings
set current_contract_version_id = '45000000-0000-4000-8000-000000000010'
where id = '44000000-0000-4000-8000-000000000010';

insert into public.contract_signatures (
  contract_version_id,
  renter_id,
  signature_intent,
  attestation_text,
  acknowledged_content_sha256
) values (
  '45000000-0000-4000-8000-000000000010',
  '40000000-0000-4000-8000-000000000003',
  'Synthetic signature intent',
  'Synthetic contract attestation',
  decode(repeat('22', 32), 'hex')
);

set constraints all immediate;

set constraints all deferred;

insert into public.bookings (
  id,
  renter_id,
  camera_id,
  pickup_at,
  return_at,
  intended_use,
  expected_location,
  state
) values (
  '44000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000001',
  statement_timestamp() + interval '10 days',
  statement_timestamp() + interval '11 days',
  'Synthetic rejection workflow test',
  'Synthetic Manila location',
  'FOR_REVIEW'
);

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code
) values (
  '44000000-0000-4000-8000-000000000001',
  null,
  'FOR_REVIEW',
  '40000000-0000-4000-8000-000000000002',
  'renter',
  'booking_requested'
);

insert into public.availability_blocks (
  camera_id,
  booking_id,
  kind,
  starts_at,
  ends_at,
  created_by,
  reason
) values (
  '43000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  'booking',
  statement_timestamp() + interval '10 days',
  statement_timestamp() + interval '11 days',
  '40000000-0000-4000-8000-000000000001',
  'synthetic_preexisting_block'
);

set constraints all immediate;
set constraints all deferred;

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000001';

select api.reject_booking(
  '44000000-0000-4000-8000-000000000001',
  'Request does not meet the documented rental requirements.'
);

set constraints all immediate;
reset role;

do $$
begin
  if not exists (
    select 1
    from public.bookings
    where id = '44000000-0000-4000-8000-000000000001'
      and state = 'REJECTED'
  )
    or not exists (
      select 1
      from public.booking_state_history
      where booking_id = '44000000-0000-4000-8000-000000000001'
        and from_state = 'FOR_REVIEW'
        and to_state = 'REJECTED'
    )
    or exists (
      select 1
      from public.availability_blocks
      where booking_id = '44000000-0000-4000-8000-000000000001'
        and released_at is null
    )
    or not exists (
      select 1
      from private.audit_logs
      where action = 'reject_booking'
        and entity_id = '44000000-0000-4000-8000-000000000001'
        and outcome = 'success'
    )
  then
    raise exception 'booking rejection did not append history, audit, and release its hold';
  end if;
end;
$$;

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform api.reject_booking(
      '44000000-0000-4000-8000-000000000001',
      'Repeated rejection must fail.'
    );
    raise exception 'non-FOR_REVIEW booking was rejected again';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$$;

reset role;

select 'ok 1 - audited identity review, replacement, expiry, and safe booking rejection';

rollback;
