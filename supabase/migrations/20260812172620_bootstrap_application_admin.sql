do $$
declare
  admin_user_id constant uuid := '19768486-6d62-4236-8e96-2560afcd17b0';
begin
  if exists (
    select 1
    from private.admin_accounts
    where user_id <> admin_user_id
  ) then
    raise exception 'a different CamNook application admin is already configured';
  end if;

  -- Auth users are environment-specific and are not part of database seeds.
  -- Skip this project-specific bootstrap in fresh local/preview environments.
  if not exists (
    select 1
    from auth.users
    where id = admin_user_id
      and email_confirmed_at is not null
  ) then
    raise notice 'confirmed CamNook Auth user is absent; skipping admin bootstrap';
    return;
  end if;

  insert into private.admin_accounts (user_id)
  values (admin_user_id)
  on conflict (user_id) do nothing;
end;
$$;
