begin;

-- One transaction-local synthetic actor. No renter or reference rows are changed.
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
insert into auth.users (id) values (current_setting('request.jwt.claim.sub')::uuid);
set local role authenticated;
do $$
declare catalogue jsonb;
begin
  catalogue := api.list_psgc_address_reference();
  if coalesce(catalogue ->> 'release', '') = ''
    or jsonb_array_length(catalogue -> 'nodes') not between 1 and 3000 then
    raise exception 'invalid current reference catalogue';
  end if;
  if exists(select 1 from jsonb_array_elements(catalogue -> 'nodes') n
    where n ->> 'type' = 'barangay' or n ? 'latitude' or n ? 'user_id') then
    raise exception 'catalogue includes leaf or personal data';
  end if;
  if not exists(select 1 from jsonb_array_elements(catalogue -> 'nodes') n
    where n ->> 'code' = '0730600000' and n ->> 'parentCode' = '0700000000')
    or not exists(select 1 from jsonb_array_elements(catalogue -> 'nodes') n
    where n ->> 'code' = '1380602000' and n ->> 'parentCode' = '1380600000') then
    raise exception 'canonical Cebu/Manila parent unavailable; review reference refresh';
  end if;
  if has_function_privilege('anon','api.list_psgc_address_reference()','execute')
    or has_function_privilege('authenticated','private.list_psgc_address_reference()','execute') then
    raise exception 'unexpected reference function grant';
  end if;
end;
$$;
select unnest(array['1..1', 'ok 1 - authenticated active address catalogue and canonical parents']);
rollback;
