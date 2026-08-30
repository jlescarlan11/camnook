create function private.get_camera_handoff_summaries_admin()
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'camera_id', camera.id,
    'camera_name', camera.name,
    'camera_status', camera.status,
    'city_label', policy.city_label,
    'enabled', coalesce(policy.enabled, false),
    'version', coalesce(policy.version, 0)
  ) order by camera.name, camera.id), '[]'::jsonb)
  into result
  from public.cameras as camera
  left join public.camera_handoff_policies as policy
    on policy.camera_id = camera.id
  where camera.status <> 'archived';

  return result;
end;
$$;

create function api.get_camera_handoff_summaries_admin()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_camera_handoff_summaries_admin();
$$;

revoke all on function private.get_camera_handoff_summaries_admin()
from public, anon, authenticated;
revoke all on function api.get_camera_handoff_summaries_admin()
from public, anon, authenticated;
grant execute on function api.get_camera_handoff_summaries_admin()
to authenticated;
