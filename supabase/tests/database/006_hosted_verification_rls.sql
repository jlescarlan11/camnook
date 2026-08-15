begin;

select plan(1);

insert into auth.users (id) values
  ('60000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002');

insert into public.profiles (user_id, legal_name, phone) values
  ('60000000-0000-4000-8000-000000000001', 'Hosted RLS Owner A', '+639600000001'),
  ('60000000-0000-4000-8000-000000000002', 'Hosted RLS Owner B', '+639600000002');

-- Activation is transaction-local test setup. ROLLBACK restores the hosted
-- policy's disabled state even when the assertions pass.
update private.verification_evidence_policies
set
  enabled = true,
  activated_at = statement_timestamp()
where singleton;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  begin
    perform api.create_verification_upload_intent(
      '61000000-0000-4000-8000-000000000001',
      'philippine_passport',
      'image/jpeg',
      4,
      repeat('61', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      '69000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001'
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
  '60000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'camnook.hosted_test_object_path',
  api.create_verification_upload_intent(
    '61000000-0000-4000-8000-000000000010',
    'philippine_passport',
    'image/jpeg',
    4,
    repeat('62', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '69000000-0000-4000-8000-000000000010',
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001'
  ) ->> 'object_path',
  true
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  true
);

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'verification-documents',
      current_setting('camnook.hosted_test_object_path'),
      '60000000-0000-4000-8000-000000000001',
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
  '60000000-0000-4000-8000-000000000001',
  true
);

insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'verification-documents',
  current_setting('camnook.hosted_test_object_path'),
  '60000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype', 'image/jpeg', 'size', 4)
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
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

select pass('hosted server-only RPC and cross-owner Storage RLS boundaries hold');
select * from finish();

rollback;
