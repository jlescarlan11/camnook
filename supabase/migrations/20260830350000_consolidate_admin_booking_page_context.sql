create function private.get_admin_booking_page_context(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  detail jsonb := private.get_admin_booking_detail_snapshot(p_booking_id);
  booking_state text := detail #>> '{booking,state}';
  current_contract_version_id uuid :=
    nullif(detail #>> '{booking,current_contract_version_id}', '')::uuid;
begin
  return jsonb_build_object(
    'detail', detail,
    'resolution', private.get_resolution_detail(p_booking_id),
    'contract', case
      when current_contract_version_id is null then null
      else private.get_admin_contract_context(p_booking_id)
    end,
    'pickup', case
      when booking_state in ('CONFIRMED', 'ACTIVE')
      then private.get_pickup_detail(p_booking_id)
      else null
    end
  );
end;
$$;

create function api.get_admin_booking_page_context(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_admin_booking_page_context(p_booking_id);
$$;

revoke all on function private.get_admin_booking_page_context(uuid)
from public, anon, authenticated;
revoke all on function api.get_admin_booking_page_context(uuid)
from public, anon, authenticated;
grant execute on function api.get_admin_booking_page_context(uuid)
to authenticated;
