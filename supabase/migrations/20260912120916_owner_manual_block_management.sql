-- Owner management IDs stay outside the public availability projection.
create function private.get_owner_manual_blocks(p_camera_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', block.id,
      'kind', block.kind,
      'starts_at', block.starts_at,
      'ends_at', block.ends_at
    ) order by block.starts_at, block.id)
    from public.availability_blocks as block
    where block.camera_id = p_camera_id
      and block.booking_id is null
      and block.kind in ('manual', 'maintenance')
      and block.released_at is null
      and block.ends_at > statement_timestamp()
  ), '[]'::jsonb);
end;
$$;

create function api.get_owner_manual_blocks(p_camera_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_owner_manual_blocks(p_camera_id); $$;

revoke all on function private.get_owner_manual_blocks(uuid) from public, anon, authenticated;
revoke all on function api.get_owner_manual_blocks(uuid) from public, anon, authenticated;
grant execute on function private.get_owner_manual_blocks(uuid) to authenticated;
grant execute on function api.get_owner_manual_blocks(uuid) to authenticated;
