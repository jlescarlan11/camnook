create function private.get_public_catalog_snapshot_for_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', camera.id,
    'slug', camera.slug,
    'name', camera.name,
    'description', camera.description,
    'daily_rate', camera.daily_rate,
    'security_deposit', camera.security_deposit,
    'published_at', camera.published_at,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'object_path', photo.object_path,
        'alt_text', photo.alt_text
      ) order by photo.sort_position, photo.id)
      from public.camera_photos as photo
      where photo.camera_id = camera.id
        and photo.archived_at is null
    ), '[]'::jsonb),
    'accessories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', accessory.name,
        'quantity', accessory.quantity
      ) order by accessory.sort_position, accessory.id)
      from public.camera_accessories as accessory
      where accessory.camera_id = camera.id
        and accessory.archived_at is null
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_at', availability.starts_at,
        'ends_at', availability.ends_at,
        'reason', case
          when availability.kind = 'booking' then 'booked'
          else 'unavailable'
        end
      ) order by availability.starts_at, availability.id)
      from public.availability_blocks as availability
      where availability.camera_id = camera.id
        and availability.released_at is null
    ), '[]'::jsonb),
    'handoff_policy', case when policy.camera_id is null then null else
      jsonb_build_object(
        'city_label', policy.city_label,
        'allowed_weekdays', policy.allowed_weekdays,
        'approved_times', coalesce((
          select jsonb_agg(to_char(slot.local_time, 'HH24:MI') order by slot.local_time)
          from public.camera_handoff_slots as slot
          where slot.camera_id = camera.id
        ), '[]'::jsonb),
        'timezone', policy.timezone,
        'enabled', policy.enabled,
        'version', policy.version
      )
    end
  ) order by camera.published_at desc, camera.id), '[]'::jsonb)
  from public.cameras as camera
  left join public.camera_handoff_policies as policy
    on policy.camera_id = camera.id
  where camera.status = 'published'
    and (p_slug is null or camera.slug = p_slug);
$$;

create or replace function private.get_public_catalog_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_public_catalog_snapshot_for_slug(null::text);
$$;

create function api.get_public_camera_snapshot(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_slug is null then null else
    private.get_public_catalog_snapshot_for_slug(p_slug) -> 0
  end;
$$;

revoke all on function private.get_public_catalog_snapshot_for_slug(text)
from public, anon, authenticated;
revoke all on function private.get_public_catalog_snapshot()
from public, anon, authenticated;
revoke all on function api.get_public_camera_snapshot(text)
from public, anon, authenticated;
grant execute on function api.get_public_camera_snapshot(text)
to anon, authenticated;
