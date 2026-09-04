create function private.get_contract_template_configuration_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  active_template jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'id', template.id,
    'version', template.version,
    'schema_version', template.schema_version,
    'terms', template.terms,
    'content_sha256', encode(template.content_sha256, 'hex'),
    'created_at', template.created_at,
    'approved_at', template.approved_at,
    'activated_at', template.activated_at
  )
  into active_template
  from public.contract_templates as template
  where template.activated_at is not null
    and template.deactivated_at is null
  order by template.activated_at desc, template.id
  limit 1;

  return jsonb_build_object('active', active_template);
end;
$$;

create function private.publish_contract_template(
  p_version text,
  p_terms jsonb,
  p_expected_active_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  active_template public.contract_templates%rowtype;
  existing_template public.contract_templates%rowtype;
  published_template public.contract_templates%rowtype;
  published_at timestamptz := clock_timestamp();
  normalized_version text := btrim(p_version);
  required_terms constant text[] := array[
    'pickup',
    'return',
    'cancellation',
    'late-return',
    'damage',
    'loss',
    'non-transferability'
  ];
  term_key text;
  term_value jsonb;
begin
  if p_operation_id is null
    or p_version is null
    or p_terms is null
    or normalized_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    or jsonb_typeof(p_terms) <> 'object'
    or not (p_terms ?& required_terms)
    or (select count(*) from jsonb_object_keys(p_terms)) <> cardinality(required_terms)
  then
    raise exception 'contract_template_invalid' using errcode = '22023';
  end if;

  for term_key, term_value in select * from jsonb_each(p_terms)
  loop
    if jsonb_typeof(term_value) <> 'string'
      or char_length(btrim(term_value #>> '{}')) not between 10 and 4000
      or regexp_replace(term_value #>> '{}', E'[\\n\\r\\t]', '', 'g') ~ '[[:cntrl:]]'
    then
      raise exception 'contract_template_invalid' using errcode = '22023';
    end if;
  end loop;

  if octet_length(convert_to(p_terms::text, 'UTF8')) > 24000 then
    raise exception 'contract_template_invalid' using errcode = '22023';
  end if;

  select template.* into published_template
  from private.audit_logs as audit
  join public.contract_templates as template on template.id = audit.entity_id
  where audit.operation_id = p_operation_id
    and audit.action = 'publish_contract_template'
    and audit.outcome = 'success'
  order by audit.id
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'id', published_template.id,
      'version', published_template.version
    );
  end if;

  lock table public.contract_templates in share row exclusive mode;

  select * into active_template
  from public.contract_templates as template
  where template.activated_at is not null
    and template.deactivated_at is null
  order by template.id
  limit 1
  for update;

  if found
    and active_template.version = normalized_version
    and active_template.schema_version = 1
    and active_template.terms = p_terms
  then
    return jsonb_build_object(
      'created', false,
      'id', active_template.id,
      'version', active_template.version
    );
  end if;

  if active_template.id is distinct from p_expected_active_id then
    raise exception 'contract_template_stale' using errcode = '40001';
  end if;

  select * into existing_template
  from public.contract_templates as template
  where template.version = normalized_version
  limit 1;

  if found then
    raise exception 'contract_template_version_conflict' using errcode = '23505';
  end if;

  if active_template.id is not null then
    update public.contract_templates
    set deactivated_at = published_at
    where id = active_template.id;
  end if;

  insert into public.contract_templates (
    version,
    schema_version,
    terms,
    content_sha256,
    created_at,
    created_by,
    approved_at,
    approved_by,
    activated_at
  ) values (
    normalized_version,
    1,
    p_terms,
    extensions.digest(
      convert_to(jsonb_build_object(
        'schema_version', 1,
        'terms', p_terms,
        'version', normalized_version
      )::text, 'UTF8'),
      'sha256'
    ),
    published_at,
    caller,
    published_at,
    caller,
    published_at
  ) returning * into published_template;

  insert into private.audit_logs (
    occurred_at,
    actor_user_id,
    operation_id,
    action,
    entity_type,
    entity_id,
    outcome,
    purpose,
    metadata
  ) values (
    published_at,
    caller,
    p_operation_id,
    'publish_contract_template',
    'contract_template',
    published_template.id,
    'success',
    'rental agreement template administration',
    jsonb_build_object(
      'replaced_template_id', active_template.id,
      'schema_version', published_template.schema_version,
      'version', published_template.version
    )
  );

  return jsonb_build_object(
    'created', true,
    'id', published_template.id,
    'version', published_template.version
  );
end;
$$;

create function api.get_contract_template_configuration_admin()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_contract_template_configuration_admin();
$$;

create function api.publish_contract_template(
  p_version text,
  p_terms jsonb,
  p_expected_active_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.publish_contract_template(
    p_version,
    p_terms,
    p_expected_active_id,
    p_operation_id
  );
$$;

revoke all on function private.get_contract_template_configuration_admin(),
  private.publish_contract_template(text, jsonb, uuid, uuid),
  api.get_contract_template_configuration_admin(),
  api.publish_contract_template(text, jsonb, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function api.get_contract_template_configuration_admin(),
  api.publish_contract_template(text, jsonb, uuid, uuid)
to authenticated;
