begin;
select '1..1';

insert into auth.users (id) values
  ('b6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000002');
insert into private.admin_accounts (user_id) values ('b6000000-0000-4000-8000-000000000001');
insert into public.profiles (user_id, legal_name, phone) values
  ('b6000000-0000-4000-8000-000000000002', 'Block test renter', '+639600000002');
insert into public.cameras (id, slug, serial_number, name, status) values
  ('b6100000-0000-4000-8000-000000000001', 'manual-block-fixture', 'BLOCK-FIXTURE-1', 'Block test camera', 'draft'),
  ('b6100000-0000-4000-8000-000000000002', 'other-block-fixture', 'BLOCK-FIXTURE-2', 'Other camera', 'draft');
insert into public.bookings (id, renter_id, camera_id, state, pickup_at, return_at, intended_use, expected_location) values
  ('b6200000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000002', 'b6100000-0000-4000-8000-000000000001', 'FOR_REVIEW', statement_timestamp() + interval '10 days', statement_timestamp() + interval '11 days', 'Block guard fixture', 'Cebu');
insert into public.availability_blocks (id, camera_id, booking_id, kind, starts_at, ends_at, created_by, released_at, released_by) values
  ('b6300000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000001', null, 'manual', statement_timestamp() + interval '2 days', statement_timestamp() + interval '3 days', 'b6000000-0000-4000-8000-000000000001', null, null),
  ('b6300000-0000-4000-8000-000000000002', 'b6100000-0000-4000-8000-000000000001', null, 'maintenance', statement_timestamp() - interval '1 day', statement_timestamp() + interval '1 day', 'b6000000-0000-4000-8000-000000000001', null, null),
  ('b6300000-0000-4000-8000-000000000003', 'b6100000-0000-4000-8000-000000000001', null, 'manual', statement_timestamp() + interval '4 days', statement_timestamp() + interval '5 days', 'b6000000-0000-4000-8000-000000000001', statement_timestamp(), 'b6000000-0000-4000-8000-000000000001'),
  ('b6300000-0000-4000-8000-000000000004', 'b6100000-0000-4000-8000-000000000001', null, 'manual', statement_timestamp() - interval '3 days', statement_timestamp() - interval '2 days', 'b6000000-0000-4000-8000-000000000001', null, null),
  ('b6300000-0000-4000-8000-000000000005', 'b6100000-0000-4000-8000-000000000002', null, 'manual', statement_timestamp() + interval '2 days', statement_timestamp() + interval '3 days', 'b6000000-0000-4000-8000-000000000001', null, null),
  ('b6300000-0000-4000-8000-000000000006', 'b6100000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000001', 'booking', statement_timestamp() + interval '10 days', statement_timestamp() + interval '11 days', 'b6000000-0000-4000-8000-000000000001', null, null);

set local role anon;
do $$ begin
  begin
    perform api.get_owner_manual_blocks('b6100000-0000-4000-8000-000000000001');
    raise exception 'anonymous caller read management IDs';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role authenticated;
set local "request.jwt.claim.sub" = 'b6000000-0000-4000-8000-000000000002';
do $$ begin
  begin
    perform api.get_owner_manual_blocks('b6100000-0000-4000-8000-000000000001');
    raise exception 'renter read management IDs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api.release_manual_block('b6300000-0000-4000-8000-000000000001');
    raise exception 'renter removed a block';
  exception when insufficient_privilege then null;
  end;
end $$;

set local "request.jwt.claim.sub" = 'b6000000-0000-4000-8000-000000000001';
do $$ declare blocks jsonb; begin
  blocks := api.get_owner_manual_blocks('b6100000-0000-4000-8000-000000000001');
  if jsonb_array_length(blocks) <> 2
    or blocks -> 0 ->> 'id' <> 'b6300000-0000-4000-8000-000000000002'
    or blocks -> 1 ->> 'id' <> 'b6300000-0000-4000-8000-000000000001' then
    raise exception 'owner projection failed to filter or order blocks: %', blocks;
  end if;
  if (blocks -> 0) - array['id', 'kind', 'starts_at', 'ends_at'] <> '{}'::jsonb then
    raise exception 'owner projection returned unnecessary fields';
  end if;
  begin
    perform api.release_manual_block('b6300000-0000-4000-8000-000000000006');
    raise exception 'booking block was removed';
  exception when no_data_found then null;
  end;
  perform api.release_manual_block('b6300000-0000-4000-8000-000000000001');
  blocks := api.get_owner_manual_blocks('b6100000-0000-4000-8000-000000000001');
  if jsonb_array_length(blocks) <> 1 or blocks -> 0 ->> 'kind' <> 'maintenance' then
    raise exception 'released block remains in owner projection';
  end if;
end $$;
reset role;
do $$ begin
  if has_column_privilege('anon', 'public.availability_blocks', 'id', 'SELECT')
    or has_column_privilege('authenticated', 'public.availability_blocks', 'id', 'SELECT') then
    raise exception 'public block ID permissions were widened';
  end if;
  if not exists (select 1 from public.availability_blocks where id = 'b6300000-0000-4000-8000-000000000001' and released_at is not null and released_by = 'b6000000-0000-4000-8000-000000000001') then
    raise exception 'removal did not preserve its audit record';
  end if;
end $$;
select 'ok 1 - owner block listing and removal preserve authorization and booking guards';
rollback;
