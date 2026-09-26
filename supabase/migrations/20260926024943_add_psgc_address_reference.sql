begin;
create function private.list_psgc_address_reference()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  perform private.current_user_id();
  with recursive current_release as (
    select release_key from private.psgc_releases where active
  ), tree as (
    select a.* from private.psgc_areas a
    join current_release r using (release_key)
    where a.active and a.parent_code is null and a.area_type = 'region'
    union all
    select a.* from private.psgc_areas a
    join tree p on p.release_key = a.release_key and p.code = a.parent_code
    where a.active and a.area_type <> 'barangay'
  )
  select jsonb_build_object(
    'release', r.release_key,
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', a.code, 'name', btrim(a.name), 'type', a.area_type,
        'parentCode', a.parent_code, 'city_class', a.city_class,
        'has_children', exists(select 1 from private.psgc_areas c
          where c.release_key = a.release_key and c.parent_code = a.code and c.active)
      ) order by a.code) from tree a
    ), '[]'::jsonb)
  ) into result from current_release r;
  if result is null or jsonb_array_length(result -> 'nodes') not between 1 and 3000 then
    raise exception 'psgc_reference_unavailable' using errcode = '55000';
  end if;
  return result;
end;
$$;
create function api.list_psgc_address_reference()
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.list_psgc_address_reference(); $$;
revoke all on function private.list_psgc_address_reference() from public, anon, authenticated;
revoke all on function api.list_psgc_address_reference() from public, anon, authenticated;
grant execute on function api.list_psgc_address_reference() to authenticated;
commit;
