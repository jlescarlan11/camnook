create or replace function private.configure_gcash_recipient(
  p_recipient_name text,
  p_recipient_account text,
  p_enabled boolean,
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
  configured private.gcash_payment_configuration%rowtype;
  desired_recipient_name text := case
    when p_enabled then btrim(p_recipient_name)
    else null
  end;
  desired_recipient_account text := case
    when p_enabled then btrim(p_recipient_account)
    else null
  end;
begin
  if p_operation_id is null or p_enabled is null then
    raise exception 'payment configuration operation is required'
      using errcode = '22023';
  end if;
  if p_enabled and (
    length(coalesce(desired_recipient_name, '')) not between 2 and 160
    or private.payment_text_has_forbidden_characters(coalesce(desired_recipient_name, ''))
    or coalesce(desired_recipient_account, '') !~ '^(09[0-9]{9}|\\+639[0-9]{9})$'
  ) then
    raise exception 'approved GCash recipient is invalid' using errcode = '22023';
  end if;

  select * into configured
  from private.gcash_payment_configuration
  where singleton
  for update;

  if not found then
    raise exception 'payment configuration is unavailable' using errcode = 'P0002';
  end if;

  -- A retry of an already-live recipient is not a new configuration decision.
  -- Keep its version and append-only audit history stable so a lost action
  -- response cannot manufacture a misleading configuration change.
  if configured.enabled = p_enabled
    and configured.recipient_name is not distinct from desired_recipient_name
    and configured.recipient_account is not distinct from desired_recipient_account
  then
    return jsonb_build_object(
      'enabled', configured.enabled,
      'version', configured.version
    );
  end if;

  update private.gcash_payment_configuration
  set version = version + 1,
      enabled = p_enabled,
      recipient_name = desired_recipient_name,
      recipient_account = desired_recipient_account,
      updated_at = clock_timestamp(),
      updated_by = caller
  where singleton
  returning * into configured;

  insert into private.audit_logs (
    actor_user_id,
    operation_id,
    action,
    entity_type,
    outcome,
    purpose,
    metadata
  ) values (
    caller,
    p_operation_id,
    'configure_gcash_recipient',
    'payment_configuration',
    'success',
    'manual GCash payment configuration',
    jsonb_build_object(
      'enabled', configured.enabled,
      'version', configured.version
    )
  );

  return jsonb_build_object(
    'enabled', configured.enabled,
    'version', configured.version
  );
end;
$$;

revoke all on function private.configure_gcash_recipient(text, text, boolean, uuid)
from public, anon, authenticated, service_role;

grant execute on function private.configure_gcash_recipient(text, text, boolean, uuid)
to authenticated;
