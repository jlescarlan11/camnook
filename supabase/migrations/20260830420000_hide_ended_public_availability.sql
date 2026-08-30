-- Ended availability is historical inventory data, not current catalog data.
-- Exclude it consistently from direct public reads, the compatibility view,
-- and the consolidated catalog snapshots while preserving administrator access.

drop policy if exists availability_blocks_select_anon
on public.availability_blocks;

create policy availability_blocks_select_anon
on public.availability_blocks for select to anon
using (
  released_at is null
  and ends_at > statement_timestamp()
  and exists (
    select 1
    from public.cameras as camera
    where camera.id = camera_id
      and camera.status = 'published'
  )
);

drop policy if exists availability_blocks_select_authenticated
on public.availability_blocks;

create policy availability_blocks_select_authenticated
on public.availability_blocks for select to authenticated
using (
  (
    released_at is null
    and ends_at > statement_timestamp()
    and exists (
      select 1
      from public.cameras as camera
      where camera.id = camera_id
        and camera.status = 'published'
    )
  )
  or (select private.is_admin())
);

create or replace view public.public_availability
with (security_invoker = true)
as
select
  availability.camera_id,
  availability.starts_at,
  availability.ends_at,
  case
    when availability.kind = 'booking' then 'booked'::text
    else 'unavailable'::text
  end as reason
from public.availability_blocks as availability
join public.cameras as camera on camera.id = availability.camera_id
where availability.released_at is null
  and availability.ends_at > statement_timestamp()
  and camera.status = 'published';

create or replace function private.get_public_catalog_snapshot_for_slug(p_slug text)
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
        and availability.ends_at > statement_timestamp()
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
