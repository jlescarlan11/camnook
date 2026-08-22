begin;

select '1..1';

select set_config('camnook.hosted_owner_a', gen_random_uuid()::text, true);
select set_config('camnook.hosted_owner_b', gen_random_uuid()::text, true);
select set_config('camnook.hosted_intent_a', gen_random_uuid()::text, true);
select set_config('camnook.hosted_intent_b', gen_random_uuid()::text, true);
select set_config('camnook.hosted_operation_a', gen_random_uuid()::text, true);
select set_config('camnook.hosted_operation_b', gen_random_uuid()::text, true);

insert into auth.users (id) values
  (current_setting('camnook.hosted_owner_a')::uuid),
  (current_setting('camnook.hosted_owner_b')::uuid);

insert into public.profiles (user_id, legal_name, phone) values
  (
    current_setting('camnook.hosted_owner_a')::uuid,
    'Hosted RLS Owner A',
    '+639600000001'
  ),
  (
    current_setting('camnook.hosted_owner_b')::uuid,
    'Hosted RLS Owner B',
    '+639600000002'
  );

-- Activation is transaction-local test setup. ROLLBACK restores the hosted
-- policy's disabled state even when every assertion passes.
update private.verification_evidence_policies
set
  enabled = true,
  activated_at = statement_timestamp()
where singleton;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_owner_a'),
  true
);

do $$
begin
  begin
    perform api.create_verification_upload_intent(
      current_setting('camnook.hosted_intent_a')::uuid,
      'philippine_passport',
      'image/jpeg',
      4,
      repeat('61', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      current_setting('camnook.hosted_operation_a')::uuid,
      current_setting('camnook.hosted_owner_a')::uuid,
      current_setting('camnook.hosted_owner_a')::uuid
    );
    raise exception 'authenticated renter bypassed the server-only RPC boundary';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_owner_a'),
  true
);
select set_config(
  'camnook.hosted_test_object_path',
  api.create_verification_upload_intent(
    current_setting('camnook.hosted_intent_b')::uuid,
    'philippine_passport',
    'image/jpeg',
    4,
    repeat('62', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    current_setting('camnook.hosted_operation_b')::uuid,
    current_setting('camnook.hosted_owner_a')::uuid,
    current_setting('camnook.hosted_owner_a')::uuid
  ) ->> 'object_path',
  true
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_owner_b'),
  true
);

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'verification-documents',
      current_setting('camnook.hosted_test_object_path'),
      current_setting('camnook.hosted_owner_a')::uuid,
      jsonb_build_object('mimetype', 'image/jpeg', 'size', 4)
    );
    raise exception 'cross-owner Storage insert bypassed RLS';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_owner_a'),
  true
);

insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'verification-documents',
  current_setting('camnook.hosted_test_object_path'),
  current_setting('camnook.hosted_owner_a')::uuid,
  jsonb_build_object('mimetype', 'image/jpeg', 'size', 4)
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('camnook.hosted_owner_b'),
  true
);

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'verification-documents'
      and name = current_setting('camnook.hosted_test_object_path')
  ) then
    raise exception 'cross-owner Storage read bypassed RLS';
  end if;
end;
$$;

reset role;

select 'ok 1 - hosted server-only RPC and cross-owner Storage RLS boundaries hold';

rollback;
