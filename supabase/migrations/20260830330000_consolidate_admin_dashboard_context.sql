create function private.get_admin_dashboard_context(
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  if (p_period_start is null) <> (p_period_end is null) then
    raise exception 'portfolio_period_incomplete' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'operations', private.get_owner_operations_dashboard(),
    'portfolio', case
      when p_period_start is null then null
      else private.get_owner_portfolio_report(p_period_start, p_period_end)
    end,
    'handoff_policies', private.get_camera_handoff_summaries_admin(),
    'gcash_configuration', private.get_gcash_recipient_configuration_admin()
  );
end;
$$;

create function api.get_admin_dashboard_context(
  p_period_start date,
  p_period_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_admin_dashboard_context(p_period_start, p_period_end);
$$;

revoke all on function private.get_admin_dashboard_context(date, date)
from public, anon, authenticated;
revoke all on function api.get_admin_dashboard_context(date, date)
from public, anon, authenticated;
grant execute on function api.get_admin_dashboard_context(date, date)
to authenticated;
