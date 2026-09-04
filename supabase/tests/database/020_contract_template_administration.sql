begin;

select '1..1';

insert into auth.users (id) values
  ('f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002');

insert into private.admin_accounts (user_id)
values ('f0000000-0000-4000-8000-000000000001');

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'f0000000-0000-4000-8000-000000000001';

do $$
declare
  first_result jsonb;
  retry_result jsonb;
  second_result jsonb;
  first_id uuid;
  terms_v1 jsonb := jsonb_build_object(
    'pickup', 'Pickup happens at the agreed time and meetup venue.',
    'return', 'Return includes the camera and every fixed inclusion.',
    'cancellation', 'Cancellation follows the terms displayed in this agreement.',
    'late-return', 'Late returns must be reported and resolved with the owner.',
    'damage', 'The renter is responsible for verified rental-period damage.',
    'loss', 'The renter must report and resolve any verified rental-period loss.',
    'non-transferability', 'Only the named renter may collect and use the camera.'
  );
  terms_v2 jsonb;
begin
  first_result := api.publish_contract_template(
    'rental-v1', terms_v1, null,
    'f1000000-0000-4000-8000-000000000001'
  );
  first_id := (first_result ->> 'id')::uuid;

  if not (first_result ->> 'created')::boolean
    or api.get_contract_template_configuration_admin() #>> '{active,version}' <> 'rental-v1'
  then
    raise exception 'first template was not published and read back';
  end if;

  retry_result := api.publish_contract_template(
    'rental-v1', terms_v1, null,
    'f1000000-0000-4000-8000-000000000002'
  );
  if (retry_result ->> 'created')::boolean
    or (retry_result ->> 'id')::uuid <> first_id
    or (select count(*) from public.contract_templates) <> 1
  then
    raise exception 'same active template retry was not idempotent';
  end if;

  terms_v2 := jsonb_set(
    terms_v1,
    '{cancellation}',
    to_jsonb('Updated cancellation terms apply to new agreements only.'::text)
  );
  second_result := api.publish_contract_template(
    'rental-v2', terms_v2, first_id,
    'f1000000-0000-4000-8000-000000000003'
  );

  if not (second_result ->> 'created')::boolean
    or api.get_contract_template_configuration_admin() #>> '{active,version}' <> 'rental-v2'
    or (select count(*) from public.contract_templates where deactivated_at is null) <> 1
    or (select deactivated_at from public.contract_templates where id = first_id) is null
  then
    raise exception 'replacement did not atomically rotate the active template';
  end if;

  begin
    perform api.publish_contract_template(
      'rental-v3', terms_v1, first_id,
      'f1000000-0000-4000-8000-000000000004'
    );
    raise exception 'stale replacement unexpectedly committed';
  exception when sqlstate '40001' then null;
  end;

  begin
    perform api.publish_contract_template(
      'rental-v3', terms_v1 - 'loss', (second_result ->> 'id')::uuid,
      'f1000000-0000-4000-8000-000000000005'
    );
    raise exception 'incomplete template unexpectedly committed';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'f0000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform api.get_contract_template_configuration_admin();
    raise exception 'non-admin read contract template configuration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api.publish_contract_template(
      'unauthorized-v1',
      '{}'::jsonb,
      null,
      'f1000000-0000-4000-8000-000000000006'
    );
    raise exception 'non-admin published a contract template';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from private.audit_logs as audit
    where audit.action = 'publish_contract_template'
      and audit.entity_type = 'contract_template'
      and audit.outcome = 'success'
      and audit.metadata @> '{"version":"rental-v2","schema_version":1}'::jsonb
      and audit.metadata::text !~ 'Pickup happens|Cancellation follows'
  ) then
    raise exception 'safe contract template audit evidence was not recorded';
  end if;
end;
$$;

select 'ok 1 - contract templates are validated, atomic, idempotent, audited, and admin-only';

rollback;
