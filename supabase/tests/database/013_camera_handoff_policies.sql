begin;

select '1..1';

insert into auth.users (id) values
  ('b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002');

insert into private.admin_accounts (user_id)
values ('b0000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone) values
  ('b0000000-0000-4000-8000-000000000001', 'Handoff Admin', '+639600000001'),
  ('b0000000-0000-4000-8000-000000000002', 'Handoff Renter', '+639600000002');

insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at, archived_at
) values
  (
    'b0100000-0000-4000-8000-000000000001',
    'handoff-published', 'PRIVATE-HANDOFF-SERIAL-001', 'Handoff Published',
    'Published handoff fixture.', 'published', 1000, 4000,
    statement_timestamp(), null
  ),
  (
    'b0100000-0000-4000-8000-000000000002',
    'handoff-draft', 'PRIVATE-HANDOFF-SERIAL-002', 'Handoff Draft',
    null, 'draft', null, null, null, null
  ),
  (
    'b0100000-0000-4000-8000-000000000003',
    'handoff-legacy', 'PRIVATE-HANDOFF-SERIAL-003', 'Handoff Legacy',
    'Published legacy fixture.', 'published', 900, 3000,
    statement_timestamp(), null
  ),
  (
    'b0100000-0000-4000-8000-000000000004',
    'handoff-archived', 'PRIVATE-HANDOFF-SERIAL-004', 'Handoff Archived',
    'Archived handoff fixture.', 'archived', 900, 3000,
    statement_timestamp(), statement_timestamp()
  );

set local role authenticated;
set local "request.jwt.claim.sub" = 'b0000000-0000-4000-8000-000000000001';

do $$
declare
  version bigint;
  policy jsonb;
begin
  version := api.replace_camera_handoff_policy(
    'b0100000-0000-4000-8000-000000000001',
    0,
    'Cebu City',
    'provider:cebu-city',
    'PH',
    10.31570,
    123.88540,
    array[1, 3, 5]::smallint[],
    array['09:00', '17:00']::time[],
    true
  );
  if version <> 1 then
    raise exception 'first policy version was not one';
  end if;

  policy := api.get_camera_handoff_policy_admin(
    'b0100000-0000-4000-8000-000000000001'
  );
  if policy ->> 'provider_city_id' <> 'provider:cebu-city'
    or policy ->> 'city_label' <> 'Cebu City'
    or policy ->> 'timezone' <> 'Asia/Manila'
    or (policy ->> 'version')::bigint <> 1
    or jsonb_array_length(policy -> 'approved_times') <> 2
  then
    raise exception 'admin read-back did not match the committed policy';
  end if;

  if (
    select count(*)
    from public.camera_handoff_policies
    where camera_id = 'b0100000-0000-4000-8000-000000000003'
  ) <> 0 then
    raise exception 'legacy camera received a fabricated policy';
  end if;

  begin
    perform api.replace_camera_handoff_policy(
      'b0100000-0000-4000-8000-000000000001',
      1,
      'Cebu City',
      'provider:cebu-city',
      'PH',
      10.31570,
      123.88540,
      array[1, 1]::smallint[],
      array['09:00']::time[],
      true
    );
    raise exception 'duplicate weekday unexpectedly committed';
  exception
    when sqlstate '22023' then null;
  end;

  if (
    select count(*)
    from public.camera_handoff_slots
    where camera_id = 'b0100000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'invalid replacement partially changed slots';
  end if;

  begin
    perform api.replace_camera_handoff_policy(
      'b0100000-0000-4000-8000-000000000001',
      0,
      'Cebu City',
      'provider:cebu-city',
      'PH',
      10.31570,
      123.88540,
      array[1]::smallint[],
      array['10:00']::time[],
      true
    );
    raise exception 'stale update unexpectedly committed';
  exception
    when sqlstate '40001' then null;
  end;

  begin
    perform api.replace_camera_handoff_policy(
      'b0100000-0000-4000-8000-000000000004',
      0,
      'Cebu City',
      'provider:cebu-city',
      'PH',
      10.31570,
      123.88540,
      array[1]::smallint[],
      array['10:00']::time[],
      true
    );
    raise exception 'archived camera policy unexpectedly committed';
  exception
    when sqlstate '22023' then null;
  end;

  perform api.replace_camera_handoff_policy(
    'b0100000-0000-4000-8000-000000000002',
    0,
    'Mandaue City',
    'provider:mandaue-city',
    'PH',
    10.32360,
    123.92230,
    array[2, 4]::smallint[],
    array['10:00']::time[],
    true
  );
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from private.audit_logs as audit
    where audit.action = 'replace_camera_handoff_policy'
      and audit.entity_id = 'b0100000-0000-4000-8000-000000000001'
      and audit.outcome = 'success'
      and audit.metadata @> '{"policy_version":1,"slot_count":2}'::jsonb
      and audit.metadata::text !~ '(provider:|10.31570|123.88540)'
  ) then
    raise exception 'safe policy audit evidence was not recorded';
  end if;
end;
$$;

set local role anon;

do $$
declare
  projection jsonb;
begin
  select to_jsonb(policy) into projection
  from public.public_camera_handoff_policies as policy
  where policy.camera_id = 'b0100000-0000-4000-8000-000000000001';

  if projection is null
    or projection ->> 'city_label' <> 'Cebu City'
    or projection ->> 'timezone' <> 'Asia/Manila'
    or projection ?| array['provider_city_id', 'latitude', 'longitude', 'updated_by', 'created_at', 'updated_at']
  then
    raise exception 'anonymous safe handoff projection is missing or widened';
  end if;

  if exists (
    select 1 from public.public_camera_handoff_policies
    where camera_id = 'b0100000-0000-4000-8000-000000000002'
  ) then
    raise exception 'anonymous projection exposed a draft camera policy';
  end if;

  if exists (
    select 1 from public.public_camera_handoff_policies
    where camera_id = 'b0100000-0000-4000-8000-000000000003'
  ) then
    raise exception 'legacy camera did not remain explicitly unconfigured';
  end if;

  select to_jsonb(policy) into projection
  from public.camera_handoff_policies as policy
  where policy.camera_id = 'b0100000-0000-4000-8000-000000000001';
  if projection ?| array['provider_city_id', 'latitude', 'longitude', 'updated_by', 'created_at', 'updated_at'] then
    raise exception 'anonymous direct policy read exposed private metadata';
  end if;

  begin
    execute 'select * from private.camera_lender_city_anchors';
    raise exception 'anonymous caller read private lender anchors';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.get_camera_handoff_policy_admin(
      'b0100000-0000-4000-8000-000000000001'
    );
    raise exception 'anonymous caller invoked the admin policy RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'b0000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform api.get_camera_handoff_policy_admin(
      'b0100000-0000-4000-8000-000000000001'
    );
    raise exception 'renter read the admin policy contract';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.replace_camera_handoff_policy(
      'b0100000-0000-4000-8000-000000000001',
      1,
      'Attacker City',
      'attacker:city',
      'PH',
      1,
      1,
      array[1]::smallint[],
      array['09:00']::time[],
      true
    );
    raise exception 'renter mutated the handoff policy';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.camera_handoff_slots (camera_id, local_time)
    values ('b0100000-0000-4000-8000-000000000001', '12:00');
    raise exception 'renter inserted a direct handoff slot';
  exception
    when insufficient_privilege then null;
  end;

  if (
    select count(*)
    from public.public_camera_handoff_policies
    where camera_id = 'b0100000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'renter could not read the safe published schedule';
  end if;
end;
$$;

reset role;

select 'ok 1 - camera handoff policies are atomic, versioned, authorized, private, and legacy-safe';

rollback;
