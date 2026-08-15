begin;

select '1..1';

insert into auth.users (id) values
  ('30000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('30000000-0000-4000-8000-000000000003')
on conflict (singleton) do update
set user_id = excluded.user_id;

insert into public.profiles (user_id, legal_name, phone) values
  ('30000000-0000-4000-8000-000000000001', 'Verification Owner A', '+639300000001'),
  ('30000000-0000-4000-8000-000000000002', 'Verification Owner B', '+639300000002'),
  ('30000000-0000-4000-8000-000000000003', 'Verification Admin', '+639300000003');

update private.verification_evidence_policies
set enabled = false
where singleton;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000000',
      'philippine_passport',
      'image/jpeg',
      4,
      repeat('00', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      '39000000-0000-4000-8000-000000000000',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'authenticated renter bypassed the server-only evidence boundary';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role service_role;

do $$
begin
  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000000',
      'philippine_passport',
      'image/jpeg',
      4,
      repeat('00', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      '39000000-0000-4000-8000-000000000000',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'disabled privacy gate issued an upload intent';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

reset role;

update private.verification_evidence_policies
set
  enabled = true,
  activated_at = statement_timestamp()
where singleton;

set local role service_role;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  result jsonb;
  target_path text;
begin
  if (api.get_verification_upload_policy() ->> 'enabled')::boolean is not true then
    raise exception 'test fixture government-ID policy is not enabled';
  end if;

  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000005',
      'philippine_passport',
      'image/jpeg',
      4,
      repeat('05', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      false,
      '39000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'missing notice-specific consent issued an upload intent';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000001',
      'philippine_passport',
      'image/jpeg',
      4,
      repeat('01', 32),
      'government-id-evidence-v2',
      'wrong-notice-version',
      true,
      '39000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'privacy-version mismatch issued an upload intent';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000002',
      'unsupported-id',
      'image/jpeg',
      4,
      repeat('02', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      '39000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'unsupported ID type issued an upload intent';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000003',
      'philippine_passport',
      'image/gif',
      4,
      repeat('03', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      '39000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'unsupported media type issued an upload intent';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000006',
      'philippine_passport',
      'application/pdf',
      5,
      repeat('06', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      '39000000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'PDF evidence bypassed the v2 image-only policy';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform api.create_verification_upload_intent(
      '31000000-0000-4000-8000-000000000004',
      'philippine_passport',
      'image/jpeg',
      5242881,
      repeat('04', 32),
      'government-id-evidence-v2',
      'government-id-privacy-v2',
      true,
      '39000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'oversized ID issued an upload intent';
  exception
    when invalid_parameter_value then null;
  end;

  result := api.create_verification_upload_intent(
    '31000000-0000-4000-8000-000000000010',
    'philippine_passport',
    'image/jpeg',
    4,
    repeat('10', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '39000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );
  target_path := result ->> 'object_path';

  if target_path !~ '^30000000-0000-4000-8000-000000000001/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    or target_path like '%passport%'
    or target_path like '%Verification%'
  then
    raise exception 'verification upload path is not opaque and owner-scoped';
  end if;

  if exists (
    select 1 from public.verification_records
    where user_id = '30000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'upload intent created pending verification before object finalization';
  end if;

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'verification-documents',
    target_path,
    '30000000-0000-4000-8000-000000000001',
    jsonb_build_object('mimetype', 'image/jpeg', 'size', 4)
  );

  perform api.finalize_verification_upload(
    '31000000-0000-4000-8000-000000000010',
    'image/jpeg',
    4,
    repeat('10', 32),
    '39000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

  if (
    select count(*) from public.verification_records
    where user_id = '30000000-0000-4000-8000-000000000001'
      and status = 'pending'
  ) <> 1 then
    raise exception 'finalization did not create exactly one pending verification';
  end if;

  if (
    select count(*) from public.verification_documents
    where owner_user_id = '30000000-0000-4000-8000-000000000001'
      and superseded_at is null
      and verified_deleted_at is null
  ) <> 1 then
    raise exception 'finalization did not create exactly one current document';
  end if;

  perform api.finalize_verification_upload(
    '31000000-0000-4000-8000-000000000010',
    'image/jpeg',
    4,
    repeat('10', 32),
    '39000000-0000-4000-8000-000000000012',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

  result := api.create_verification_upload_intent(
    '31000000-0000-4000-8000-000000000011',
    'philippine_passport',
    'image/jpeg',
    4,
    repeat('10', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '39000000-0000-4000-8000-000000000013',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

  if result ->> 'status' <> 'finalized'
    or (
      select count(*) from public.verification_records
      where user_id = '30000000-0000-4000-8000-000000000001'
    ) <> 1
    or (
      select count(*) from public.verification_documents
      where owner_user_id = '30000000-0000-4000-8000-000000000001'
    ) <> 1
  then
    raise exception 'finalization/create retry duplicated current verification state';
  end if;

  result := api.get_my_verification_upload_state();
  if result::text like '%' || target_path || '%'
    or result::text like '%' || repeat('10', 32) || '%'
  then
    raise exception 'account verification state exposed a private path or digest';
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1 from private.verification_upload_intents
    where id in (
      '31000000-0000-4000-8000-000000000000',
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      '31000000-0000-4000-8000-000000000003',
      '31000000-0000-4000-8000-000000000004',
      '31000000-0000-4000-8000-000000000005'
    )
  ) then
    raise exception 'a rejected privacy or file-policy request persisted an upload intent';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000002',
  true
);

do $$
declare
  owner_path text;
begin
  select object_path into owner_path
  from public.verification_documents
  where owner_user_id = '30000000-0000-4000-8000-000000000001';

  if owner_path is not null then
    raise exception 'another renter read owner A verification metadata';
  end if;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'verification-documents'
  ) then
    raise exception 'another renter read owner A Storage object';
  end if;

  begin
    perform api.get_verification_upload_intent(
      '31000000-0000-4000-8000-000000000010',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'another renter read owner A upload intent';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.finalize_verification_upload(
      '31000000-0000-4000-8000-000000000010',
      'image/jpeg',
      4,
      repeat('10', 32),
      '39000000-0000-4000-8000-000000000020',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    );
    raise exception 'another renter finalized owner A upload';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'verification-documents',
      '30000000-0000-4000-8000-000000000001/attack/attack.jpg',
      '30000000-0000-4000-8000-000000000002',
      jsonb_build_object('mimetype', 'image/jpeg', 'size', 4)
    );
    raise exception 'another renter uploaded to an unapproved owner path';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000003',
  true
);

do $$
declare
  private_metadata text;
begin
  select object_path into private_metadata
  from public.verification_documents
  where owner_user_id = '30000000-0000-4000-8000-000000000001';

  if private_metadata is not null then
    raise exception 'administrator received government-ID document metadata access';
  end if;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'verification-documents'
  ) then
    raise exception 'administrator received unaudited government-ID byte access';
  end if;
end;
$$;

reset role;

set local role service_role;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  first_document_id uuid;
  first_path text;
  replacement jsonb;
  replacement_path text;
begin
  select id, object_path into first_document_id, first_path
  from public.verification_documents
  where owner_user_id = '30000000-0000-4000-8000-000000000001'
    and superseded_at is null;

  replacement := api.create_verification_upload_intent(
    '31000000-0000-4000-8000-000000000020',
    'drivers_license',
    'image/png',
    8,
    repeat('20', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '39000000-0000-4000-8000-000000000030',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );
  replacement_path := replacement ->> 'object_path';

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'verification-documents',
    replacement_path,
    '30000000-0000-4000-8000-000000000001',
    jsonb_build_object('mimetype', 'image/png', 'size', 8)
  );

  replacement := api.create_verification_upload_intent(
    '31000000-0000-4000-8000-000000000021',
    'drivers_license',
    'image/png',
    8,
    repeat('20', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '39000000-0000-4000-8000-000000000032',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

  if replacement ->> 'id' <> '31000000-0000-4000-8000-000000000020'
    or replacement ->> 'object_path' <> replacement_path
  then
    raise exception 'same-file retry did not resume the existing upload intent';
  end if;

  perform api.finalize_verification_upload(
    '31000000-0000-4000-8000-000000000020',
    'image/png',
    8,
    repeat('20', 32),
    '39000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

  if (
    select superseded_at is null
    from public.verification_documents
    where id = first_document_id
  ) or replacement_path = first_path then
    raise exception 'replacement overwrote or failed to supersede earlier evidence';
  end if;

  if not (
    select retention_until <= statement_timestamp()
    from public.verification_documents
    where id = first_document_id
  ) then
    raise exception 'superseded evidence did not become due for deletion';
  end if;

  if (
    select count(*) from public.verification_records
    where user_id = '30000000-0000-4000-8000-000000000001'
      and status in ('pending', 'verified')
  ) <> 1 or (
    select count(*) from public.verification_documents
    where owner_user_id = '30000000-0000-4000-8000-000000000001'
      and superseded_at is null
      and verified_deleted_at is null
  ) <> 1 then
    raise exception 'replacement created ambiguous current verification state';
  end if;

  if (
    select id_type
    from public.verification_records
    where user_id = '30000000-0000-4000-8000-000000000001'
      and status = 'pending'
  ) <> 'drivers_license' then
    raise exception 'replacement retained a stale government ID type';
  end if;

  replacement := api.get_my_verification_upload_state();
  if jsonb_array_length(replacement -> 'documents') <> 2
    or replacement::text like '%' || first_path || '%'
    or replacement::text like '%' || replacement_path || '%'
  then
    raise exception 'safe lifecycle history omitted a version or exposed a private path';
  end if;

  perform api.create_verification_upload_intent(
    '31000000-0000-4000-8000-000000000030',
    'umid',
    'image/png',
    8,
    repeat('30', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '39000000-0000-4000-8000-000000000040',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );
end;
$$;

reset role;

select set_config(
  'test.revoked_verification_path',
  (
    select object_path
    from private.verification_upload_intents
    where id = '31000000-0000-4000-8000-000000000030'
  ),
  false
);

update public.profiles
set account_status = 'suspended'
where user_id = '30000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'verification-documents',
      current_setting('test.revoked_verification_path'),
      '30000000-0000-4000-8000-000000000001',
      jsonb_build_object('mimetype', 'image/png', 'size', 8)
    );
    raise exception 'suspended renter uploaded through an existing intent';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

update public.profiles
set account_status = 'active'
where user_id = '30000000-0000-4000-8000-000000000001';

update private.verification_evidence_policies set enabled = false where singleton;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'verification-documents',
      current_setting('test.revoked_verification_path'),
      '30000000-0000-4000-8000-000000000001',
      jsonb_build_object('mimetype', 'image/png', 'size', 8)
    );
    raise exception 'disabled privacy gate permitted an existing intent upload';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

update private.verification_evidence_policies set enabled = true where singleton;

insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'verification-documents',
  current_setting('test.revoked_verification_path'),
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype', 'image/png', 'size', 8)
);

update public.profiles
set account_status = 'suspended'
where user_id = '30000000-0000-4000-8000-000000000001';

set local role service_role;

do $$
begin
  begin
    perform api.finalize_verification_upload(
      '31000000-0000-4000-8000-000000000030',
      'image/png',
      8,
      repeat('30', 32),
      '39000000-0000-4000-8000-000000000046',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'suspended renter finalized an existing intent';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

update public.profiles
set account_status = 'active'
where user_id = '30000000-0000-4000-8000-000000000001';
update private.verification_evidence_policies set enabled = false where singleton;

set local role service_role;

do $$
begin
  begin
    perform api.finalize_verification_upload(
      '31000000-0000-4000-8000-000000000030',
      'image/png',
      8,
      repeat('30', 32),
      '39000000-0000-4000-8000-000000000047',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'disabled privacy gate finalized an existing intent';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

reset role;

update private.verification_evidence_policies set enabled = true where singleton;

delete from storage.objects
where bucket_id = 'verification-documents'
  and name = current_setting('test.revoked_verification_path');

update private.verification_upload_intents
set created_at = statement_timestamp() - interval '16 minutes',
    expires_at = statement_timestamp() - interval '1 minute'
where id = '31000000-0000-4000-8000-000000000030';

select set_config(
  'test.expired_verification_path',
  (
    select object_path
    from private.verification_upload_intents
    where id = '31000000-0000-4000-8000-000000000030'
  ),
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values (
      'verification-documents',
      current_setting('test.expired_verification_path'),
      '30000000-0000-4000-8000-000000000001',
      jsonb_build_object('mimetype', 'image/png', 'size', 8)
    );
    raise exception 'expired verification intent remained writable';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role service_role;

do $$
declare
  expired_intent jsonb;
  cleanup jsonb;
begin
  expired_intent := api.get_verification_upload_intent(
    '31000000-0000-4000-8000-000000000030',
    '30000000-0000-4000-8000-000000000001'
  );

  begin
    perform api.finalize_verification_upload(
      '31000000-0000-4000-8000-000000000030',
      'image/png',
      8,
      repeat('30', 32),
      '39000000-0000-4000-8000-000000000041',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'expired verification intent finalized';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  cleanup := api.prepare_verification_upload_cleanup(
    '31000000-0000-4000-8000-000000000030',
    '39000000-0000-4000-8000-000000000042',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );
  if cleanup ->> 'status' <> 'cleaned' then
    raise exception 'empty expired intent did not expose a safe restart';
  end if;

  cleanup := api.create_verification_upload_intent(
    '31000000-0000-4000-8000-000000000031',
    'umid',
    'image/png',
    8,
    repeat('31', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '39000000-0000-4000-8000-000000000043',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'verification-documents',
    cleanup ->> 'object_path',
    '30000000-0000-4000-8000-000000000001',
    jsonb_build_object('mimetype', 'image/png', 'size', 8)
  );

  cleanup := api.prepare_verification_upload_cleanup(
    '31000000-0000-4000-8000-000000000031',
    '39000000-0000-4000-8000-000000000044',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );
  if (cleanup ->> 'object_present')::boolean is not true
    or cleanup ->> 'status' <> 'cleanup_pending'
  then
    raise exception 'ambiguous object did not fail closed into cleanup';
  end if;

  delete from storage.objects
  where bucket_id = 'verification-documents'
    and name = cleanup ->> 'object_path';

  perform api.finalize_verification_upload_cleanup(
    '31000000-0000-4000-8000-000000000031',
    '39000000-0000-4000-8000-000000000045',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );
end;
$$;

reset role;

update public.verification_documents
set legal_hold_at = statement_timestamp(),
    legal_hold_by = '30000000-0000-4000-8000-000000000003',
    legal_hold_reason = 'Test legal hold',
    retention_until = statement_timestamp() - interval '1 second'
where owner_user_id = '30000000-0000-4000-8000-000000000001'
  and superseded_at is null
  and verified_deleted_at is null;

set local role service_role;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  current_document_id uuid;
begin
  select id into current_document_id
  from public.verification_documents
  where owner_user_id = '30000000-0000-4000-8000-000000000001'
    and superseded_at is null
    and verified_deleted_at is null;

  begin
    perform api.request_verification_document_deletion(
      current_document_id,
      '39000000-0000-4000-8000-000000000050',
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    );
    raise exception 'legal hold allowed document deletion request';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

reset role;

update public.verification_documents
set legal_hold_at = null,
    legal_hold_by = null,
    legal_hold_reason = null,
    retention_until = statement_timestamp() + interval '7 days'
where owner_user_id = '30000000-0000-4000-8000-000000000001'
  and superseded_at is null
  and verified_deleted_at is null;

set local role service_role;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  current_document_id uuid;
  current_path text;
  deletion jsonb;
begin
  select id, object_path into current_document_id, current_path
  from public.verification_documents
  where owner_user_id = '30000000-0000-4000-8000-000000000001'
    and superseded_at is null
    and verified_deleted_at is null;

  deletion := api.request_verification_document_deletion(
    current_document_id,
    '39000000-0000-4000-8000-000000000051',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );
  if deletion ->> 'status' <> 'eligible' then
    raise exception 'pre-deadline owner deletion was not immediately prepared';
  end if;
  if not exists (
    select 1 from public.verification_documents
    where id = current_document_id
      and deletion_request_source = 'renter'
      and deletion_requested_by = '30000000-0000-4000-8000-000000000001'
      and deletion_claimed_at is not null
  ) then
    raise exception 'eligible renter deletion did not acquire an attributed claim';
  end if;

  delete from storage.objects
  where bucket_id = 'verification-documents'
    and name = current_path;

  perform api.finalize_verification_document_deletion(
    current_document_id,
    '39000000-0000-4000-8000-000000000052',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

  if not exists (
    select 1 from public.verification_documents
    where id = current_document_id
      and deleted_at is not null
      and verified_deleted_at is not null
  ) then
    raise exception 'verified deletion lifecycle was not persisted';
  end if;
  if not exists (
    select 1 from public.verification_records
    where user_id = '30000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'verified deletion erased the verification decision record';
  end if;

  deletion := api.get_my_verification_upload_state();
  if deletion -> 'document' is distinct from 'null'::jsonb then
    raise exception 'verified-deleted evidence remained the current document';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(deletion -> 'documents') as retained(value)
    where retained.value ->> 'id' = current_document_id::text
      and retained.value ->> 'verified_deleted_at' is not null
  ) then
    raise exception 'verified deletion erased the path-free evidence history';
  end if;
end;
$$;

reset role;

set local role service_role;

do $$
declare
  abandoned jsonb;
begin
  abandoned := api.create_verification_upload_intent(
    '31000000-0000-4000-8000-000000000040',
    'philsys_id',
    'image/jpeg',
    4,
    repeat('40', 32),
    'government-id-evidence-v2',
    'government-id-privacy-v2',
    true,
    '39000000-0000-4000-8000-000000000060',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002'
  );

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'verification-documents',
    abandoned ->> 'object_path',
    '30000000-0000-4000-8000-000000000002',
    jsonb_build_object('mimetype', 'image/jpeg', 'size', 4)
  );
end;
$$;

reset role;

update private.verification_upload_intents
set created_at = statement_timestamp() - interval '16 minutes',
    expires_at = statement_timestamp() - interval '1 minute'
where id = '31000000-0000-4000-8000-000000000040';

update public.verification_documents
set retention_until = statement_timestamp() - interval '1 second'
where verified_deleted_at is null;

set local role service_role;

do $$
declare
  claim jsonb;
begin
  claim := api.claim_verification_evidence_cleanup(
    100,
    '39000000-0000-4000-8000-000000000061'
  );

  if jsonb_array_length(claim) < 2 then
    raise exception 'automatic cleanup did not claim expired intents and due documents';
  end if;

  perform set_config('test.verification_cleanup_claim', claim::text, false);
end;
$$;

reset role;

do $$
declare
  claimed_document_id uuid;
begin
  select (value ->> 'id')::uuid into claimed_document_id
  from jsonb_array_elements(
    current_setting('test.verification_cleanup_claim')::jsonb
  )
  where value ->> 'kind' = 'verification_document'
  limit 1;

  if claimed_document_id is null then
    raise exception 'automatic cleanup omitted a due verification document';
  end if;

  if not exists (
    select 1 from public.verification_documents
    where id = claimed_document_id
      and deletion_request_source = 'retention'
      and deletion_requested_by is null
      and deletion_claimed_at is not null
  ) then
    raise exception 'automatic cleanup misattributed its retention request';
  end if;

  begin
    update public.verification_documents
    set legal_hold_at = statement_timestamp(),
        legal_hold_by = '30000000-0000-4000-8000-000000000003',
        legal_hold_reason = 'Late hold race'
    where id = claimed_document_id;
    raise exception 'legal hold began after deletion cleanup was claimed';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

set local role service_role;

do $$
declare
  claim jsonb := current_setting('test.verification_cleanup_claim')::jsonb;
  item jsonb;
  retry_claim jsonb;
begin
  retry_claim := api.claim_verification_evidence_cleanup(
    100,
    '39000000-0000-4000-8000-000000000063'
  );
  if jsonb_array_length(retry_claim) < jsonb_array_length(claim) then
    raise exception 'durable cleanup claims were not returned for retry';
  end if;
  claim := retry_claim;

  for item in select value from jsonb_array_elements(claim)
  loop
    delete from storage.objects
    where bucket_id = 'verification-documents'
      and name = item ->> 'object_path';

    if item ->> 'kind' = 'upload_intent' then
      perform api.finalize_due_verification_upload_cleanup(
        (item ->> 'id')::uuid,
        gen_random_uuid(),
        (item ->> 'owner_user_id')::uuid
      );
    else
      perform api.finalize_due_verification_document_deletion(
        (item ->> 'id')::uuid,
        gen_random_uuid(),
        (item ->> 'owner_user_id')::uuid
      );
    end if;
  end loop;

  claim := api.claim_verification_evidence_cleanup(
    100,
    '39000000-0000-4000-8000-000000000062'
  );
  if jsonb_array_length(claim) <> 0 then
    raise exception 'automatic cleanup failed to persist verified absence';
  end if;

end;
$$;

reset role;

do $$
declare
  private_path text;
begin
  select object_path into private_path
  from public.verification_documents
  where owner_user_id = '30000000-0000-4000-8000-000000000001'
  order by created_at desc
  limit 1;

  if not exists (
    select 1 from private.audit_logs
    where action = 'finalize_verification_document_deletion'
      and entity_type = 'verification_document'
  ) then
    raise exception 'verification deletion did not preserve audit history';
  end if;

  if not exists (
    select 1 from private.audit_logs
    where action in (
      'claim_expired_verification_upload_cleanup',
      'claim_due_verification_document_deletion'
    )
      and actor_user_id is null
  ) then
    raise exception 'automatic retention cleanup was not audited as a system action';
  end if;

  if exists (
    select 1 from private.audit_logs
    where action like '%verification%'
      and (
        metadata::text like '%' || private_path || '%'
        or metadata::text ~ '[0-9a-f]{64}'
      )
  ) then
    raise exception 'verification audit leaked a private path or digest';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'UPDATE'
  ) then
    raise exception 'private verification evidence became overwritable';
  end if;

  if exists (
    select 1
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'api'
      and proc.proname like '%verification%'
      and array_to_string(proc.proargnames, ',') like '%id_number%'
  ) then
    raise exception 'verification API requests a full government ID number';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'verification-documents'
      and public is false
      and file_size_limit = 5242880
      and allowed_mime_types = array[
        'image/jpeg',
        'image/png'
      ]::text[]
  ) then
    raise exception 'verification bucket restrictions diverged from the approved policy';
  end if;
end;
$$;

select 'ok 1 - verification evidence lifecycle and owner isolation';

rollback;
