begin;
select '1..1';
insert into auth.users (id) values ('f2700000-0000-4000-8000-000000000001');
set local role authenticated;
set local "request.jwt.claim.sub" = 'f2700000-0000-4000-8000-000000000001';
do $$
declare catalogue jsonb;
begin
  catalogue := api.list_psgc_address_reference();
  if catalogue ->> 'release' <> '2026-q2' or jsonb_array_length(catalogue -> 'nodes') <> 1756 then
    raise exception 'incomplete address catalogue';
  end if;
  if exists(select 1 from jsonb_array_elements(catalogue -> 'nodes') n
      where n ->> 'type' = 'barangay' or n ? 'latitude' or n ? 'user_id') then
    raise exception 'unexpected personal/leaf data';
  end if;
  if not exists(select 1 from jsonb_array_elements(catalogue -> 'nodes') n
      where n ->> 'code' = '0730600000' and n ->> 'parentCode' = '0700000000')
    or not exists(select 1 from jsonb_array_elements(catalogue -> 'nodes') n
      where n ->> 'code' = '1380602000' and n ->> 'parentCode' = '1380600000') then
    raise exception 'canonical parent lost';
  end if;
  if has_function_privilege('anon', 'api.list_psgc_address_reference()', 'execute') then
    raise exception 'anonymous catalogue execution allowed';
  end if;
end;
$$;
set local role postgres;
update private.psgc_areas set active = false where release_key = '2026-q2' and code = '0700000000';
set local role authenticated;
do $$
begin
  if exists(select 1 from jsonb_array_elements(api.list_psgc_address_reference() -> 'nodes') n
      where n ->> 'code' in ('0700000000','0702200000','0730600000','0702201000')) then
    raise exception 'inactive ancestor exposed';
  end if;
end;
$$;
select 'ok 1 - bounded authenticated address reference';
rollback;
