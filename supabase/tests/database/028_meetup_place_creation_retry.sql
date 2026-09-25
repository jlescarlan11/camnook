begin;
select '1..1';

insert into auth.users (id) values
  ('f2800000-0000-4000-8000-000000000001'),
  ('f2800000-0000-4000-8000-000000000002');
insert into private.admin_accounts(user_id) values ('f2800000-0000-4000-8000-000000000001');
set local role authenticated;
set local "request.jwt.claim.sub" = 'f2800000-0000-4000-8000-000000000001';

do $$
declare
  input jsonb := jsonb_build_object(
    'creation_id', 'f2810000-0000-4000-8000-000000000001',
    'name', 'Public entrance', 'address', 'Public road, Cebu City',
    'city', 'Cebu City', 'latitude', 10.315712, 'longitude', 123.885423,
    'arrival_instructions', 'Beside the cafe', 'source', 'manual_pin', 'attribution', null
  );
  first_id uuid;
  retry_id uuid;
begin
  first_id := api.save_meetup_place(input);
  retry_id := api.save_meetup_place(input);
  if first_id <> retry_id or (select count(*) from public.meetup_places) <> 1 then
    raise exception 'identical place creation retry created a duplicate';
  end if;
  if (select version from public.meetup_places where id = first_id) <> 1 then
    raise exception 'creation retry incremented the place version';
  end if;

  begin
    perform api.save_meetup_place(input || jsonb_build_object('name', 'Changed entrance'));
    raise exception 'changed creation retry silently overwrote the place';
  exception when raise_exception then
    if sqlerrm <> 'meetup_changed' then raise; end if;
  end;

  perform api.save_meetup_place(input || jsonb_build_object('id', first_id, 'version', 1, 'name', 'Edited entrance'));
  begin
    perform api.save_meetup_place(input);
    raise exception 'creation retry after an edit silently created a place';
  exception when raise_exception then
    if sqlerrm <> 'meetup_changed' then raise; end if;
  end;
  if (select count(*) from public.meetup_places) <> 1 then
    raise exception 'stale retry left duplicate places';
  end if;
end;
$$;

set local "request.jwt.claim.sub" = 'f2800000-0000-4000-8000-000000000002';
do $$ begin
  begin
    perform api.save_meetup_place(jsonb_build_object('creation_id', 'f2810000-0000-4000-8000-000000000001'));
    raise exception 'renter replayed an owner creation';
  exception when insufficient_privilege then null;
  end;
end; $$;
select 'ok 1 - meetup place creation retries are bounded and admin-only';
rollback;
