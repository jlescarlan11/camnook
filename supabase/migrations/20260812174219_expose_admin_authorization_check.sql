-- Expose a narrow, read-only authorization check to authenticated clients.
-- The admin account table remains private and is never returned through the
-- Data API; callers can only ask whether their own authenticated user is the
-- configured CamNook administrator.

create function api.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function api.is_admin() from public, anon, authenticated;
grant execute on function api.is_admin() to authenticated;

comment on function api.is_admin() is
  'Returns whether the authenticated caller is CamNook''s application admin.';
