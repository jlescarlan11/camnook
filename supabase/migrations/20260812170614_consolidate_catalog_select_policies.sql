-- Authenticated users previously evaluated separate permissive policies for
-- published catalog rows and admin access. Combine each pair so PostgreSQL
-- evaluates one SELECT policy per table without changing effective access.

drop policy if exists cameras_select_published_authenticated on public.cameras;
drop policy if exists cameras_select_admin on public.cameras;

create policy cameras_select_published_or_admin
on public.cameras for select to authenticated
using (
  status = 'published'
  or (select private.is_admin())
);

drop policy if exists camera_photos_select_published_authenticated on public.camera_photos;
drop policy if exists camera_photos_select_admin on public.camera_photos;

create policy camera_photos_select_published_or_admin
on public.camera_photos for select to authenticated
using (
  (
    archived_at is null
    and exists (
      select 1
      from public.cameras as camera
      where camera.id = camera_id
        and camera.status = 'published'
    )
  )
  or (select private.is_admin())
);

drop policy if exists camera_accessories_select_published_authenticated on public.camera_accessories;
drop policy if exists camera_accessories_select_admin on public.camera_accessories;

create policy camera_accessories_select_published_or_admin
on public.camera_accessories for select to authenticated
using (
  (
    archived_at is null
    and exists (
      select 1
      from public.cameras as camera
      where camera.id = camera_id
        and camera.status = 'published'
    )
  )
  or (select private.is_admin())
);
