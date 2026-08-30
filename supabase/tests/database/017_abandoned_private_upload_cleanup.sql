begin;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'api.claim_abandoned_private_upload_cleanup(integer,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'api.finalize_abandoned_private_upload_cleanup(text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'ordinary authenticated callers can run automatic upload cleanup';
  end if;

  if not has_function_privilege(
    'service_role',
    'api.claim_abandoned_private_upload_cleanup(integer,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'api.finalize_abandoned_private_upload_cleanup(text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service role cannot run automatic upload cleanup';
  end if;
end;
$$;

set session_replication_role = replica;

insert into private.payment_proof_upload_intents (
  id,
  transaction_id,
  owner_user_id,
  proof_id,
  object_path,
  expected_media_type,
  expected_byte_size,
  expected_sha256,
  status,
  created_at,
  expires_at
) values (
  'f1700000-0000-4000-8000-000000000001',
  'f1700000-0000-4000-8000-000000000002',
  'f1700000-0000-4000-8000-000000000003',
  'f1700000-0000-4000-8000-000000000004',
  'f1700000-0000-4000-8000-000000000001/proof.jpg',
  'image/jpeg',
  12,
  decode(repeat('11', 32), 'hex'),
  'awaiting_upload',
  statement_timestamp() - interval '20 minutes',
  statement_timestamp() - interval '5 minutes'
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
  status,
  created_by,
  created_at,
  expires_at
) values (
  'f1700000-0000-4000-8000-000000000005',
  'f1700000-0000-4000-8000-000000000006',
  'f1700000-0000-4000-8000-000000000007',
  'f1700000-0000-4000-8000-000000000008',
  'booking/report/f1700000-0000-4000-8000-000000000008.png',
  'image/png',
  13,
  decode(repeat('22', 32), 'hex'),
  'awaiting_upload',
  'f1700000-0000-4000-8000-000000000009',
  statement_timestamp() - interval '20 minutes',
  statement_timestamp() - interval '5 minutes'
);

insert into storage.objects (bucket_id, name, metadata) values
  (
    'payment-proofs',
    'f1700000-0000-4000-8000-000000000001/proof.jpg',
    '{"mimetype":"image/jpeg","size":"12"}'::jsonb
  ),
  (
    'condition-evidence',
    'booking/report/f1700000-0000-4000-8000-000000000008.png',
    '{"mimetype":"image/png","size":"13"}'::jsonb
  );

set local role service_role;

do $$
declare
  claim jsonb := api.claim_abandoned_private_upload_cleanup(
    100,
    'f1700000-0000-4000-8000-000000000010'
  );
begin
  if jsonb_array_length(claim) <> 2
    or not claim @> '[{"kind":"payment_proof_upload_intent","bucket_id":"payment-proofs"}]'::jsonb
    or not claim @> '[{"kind":"condition_photo_upload_intent","bucket_id":"condition-evidence"}]'::jsonb
  then
    raise exception 'expired private uploads were not claimed with exact buckets';
  end if;

  begin
    perform api.finalize_abandoned_private_upload_cleanup(
      'payment_proof_upload_intent',
      'f1700000-0000-4000-8000-000000000001',
      'f1700000-0000-4000-8000-000000000011'
    );
    raise exception 'cleanup finalized while the private object still existed';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

reset role;

set session_replication_role = origin;

delete from storage.objects
where (bucket_id, name) in (
  ('payment-proofs', 'f1700000-0000-4000-8000-000000000001/proof.jpg'),
  ('condition-evidence', 'booking/report/f1700000-0000-4000-8000-000000000008.png')
);

set session_replication_role = replica;

set local role service_role;

select api.finalize_abandoned_private_upload_cleanup(
  'payment_proof_upload_intent',
  'f1700000-0000-4000-8000-000000000001',
  'f1700000-0000-4000-8000-000000000012'
);
select api.finalize_abandoned_private_upload_cleanup(
  'condition_photo_upload_intent',
  'f1700000-0000-4000-8000-000000000005',
  'f1700000-0000-4000-8000-000000000013'
);

-- Finalization is idempotent after verified absence.
select api.finalize_abandoned_private_upload_cleanup(
  'payment_proof_upload_intent',
  'f1700000-0000-4000-8000-000000000001',
  'f1700000-0000-4000-8000-000000000014'
);

reset role;

set session_replication_role = origin;

do $$
begin
  if (select status from private.payment_proof_upload_intents
      where id = 'f1700000-0000-4000-8000-000000000001') <> 'cleaned'
    or (select status from private.condition_photo_upload_intents
      where id = 'f1700000-0000-4000-8000-000000000005') <> 'cleaned'
  then
    raise exception 'verified object absence was not durably finalized';
  end if;

  if not exists (
    select 1 from private.audit_logs
    where operation_id = 'f1700000-0000-4000-8000-000000000010'
      and action = 'claim_expired_payment_proof_upload_cleanup'
      and actor_user_id is null
  ) or not exists (
    select 1 from private.audit_logs
    where operation_id = 'f1700000-0000-4000-8000-000000000010'
      and action = 'claim_expired_condition_photo_upload_cleanup'
      and actor_user_id is null
  ) then
    raise exception 'automatic cleanup claims were not safely audited';
  end if;
end;
$$;

select 'ok 1 - abandoned private payment and condition uploads are bounded, retryable, and service-only';

rollback;
