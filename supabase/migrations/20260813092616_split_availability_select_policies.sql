-- Keep public availability readable without granting anonymous callers the
-- private admin predicate. Authenticated admins retain released-block access.

drop policy if exists availability_blocks_select_public
on public.availability_blocks;

create policy availability_blocks_select_anon
on public.availability_blocks for select to anon
using (released_at is null);

create policy availability_blocks_select_authenticated
on public.availability_blocks for select to authenticated
using (
  released_at is null
  or (select private.is_admin())
);
