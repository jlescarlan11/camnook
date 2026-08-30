create function private.get_admin_contract_context(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  if not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'contract_booking_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', version.booking_id,
        'id', version.id,
        'issued_at', version.issued_at,
        'snapshot', version.snapshot,
        'status', version.status,
        'supersedes_id', version.supersedes_id,
        'version_no', version.version_no,
        'signature', case when signature.id is null then null else
          jsonb_build_object(
            'id', signature.id,
            'signed_at', signature.signed_at
          )
        end
      ) order by version.version_no)
      from public.contract_versions as version
      left join public.contract_signatures as signature
        on signature.contract_version_id = version.id
      where version.booking_id = p_booking_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'audit_id', audit.audit_id,
        'action', audit.action,
        'actor_user_id', audit.actor_user_id,
        'actor_type', audit.actor_type,
        'contract_version_id', audit.contract_version_id,
        'version_no', audit.version_no,
        'outcome', audit.outcome,
        'occurred_at', audit.occurred_at
      ) order by audit.occurred_at, audit.audit_id)
      from private.get_contract_audit_history(p_booking_id) as audit
    ), '[]'::jsonb),
    'cameras', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', camera.id,
        'name', camera.name
      ) order by camera.name, camera.id)
      from public.cameras as camera
      where camera.status = 'published'
        and camera.archived_at is null
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create function api.get_admin_contract_context(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_admin_contract_context(p_booking_id);
$$;

revoke all on function private.get_admin_contract_context(uuid)
from public, anon, authenticated;
revoke all on function api.get_admin_contract_context(uuid)
from public, anon, authenticated;
grant execute on function api.get_admin_contract_context(uuid)
to authenticated;
