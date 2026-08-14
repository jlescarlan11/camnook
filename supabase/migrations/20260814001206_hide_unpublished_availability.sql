-- Availability is a public catalog projection only while its camera is
-- published. Administrators retain direct visibility for inventory work.

drop policy if exists availability_blocks_select_anon
on public.availability_blocks;

create policy availability_blocks_select_anon
on public.availability_blocks for select to anon
using (
  released_at is null
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
  and camera.status = 'published';
