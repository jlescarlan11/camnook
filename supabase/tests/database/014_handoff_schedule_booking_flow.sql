begin;

select '1..1';

insert into auth.users (id) values
  ('c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002');

insert into private.admin_accounts (user_id)
values ('c0000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone, account_status) values
  ('c0000000-0000-4000-8000-000000000001', 'Schedule Admin', '+639700000001', 'active'),
  ('c0000000-0000-4000-8000-000000000002', 'Schedule Renter', '+639700000002', 'active');

insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at
) values
  (
    'c0100000-0000-4000-8000-000000000001', 'schedule-camera',
    'PRIVATE-SCHEDULE-SERIAL', 'Schedule Camera', 'Schedule fixture.',
    'published', 750, 3000, statement_timestamp()
  ),
  (
    'c0100000-0000-4000-8000-000000000002', 'legacy-schedule-camera',
    'PRIVATE-LEGACY-SERIAL', 'Legacy Camera', 'Legacy fixture.',
    'published', 500, 2000, statement_timestamp()
  );

insert into public.camera_handoff_policies (
  camera_id, city_label, allowed_weekdays, timezone, enabled, version
) values (
  'c0100000-0000-4000-8000-000000000001',
  'Cebu City', array[1,3,5]::smallint[], 'Asia/Manila', true, 1
);

insert into public.camera_handoff_slots (camera_id, local_time) values
  ('c0100000-0000-4000-8000-000000000001', '09:00'),
  ('c0100000-0000-4000-8000-000000000001', '17:00');

do $$
declare
  monday date :=
    (statement_timestamp() at time zone 'Asia/Manila')::date
    + (((8 - extract(dow from statement_timestamp() at time zone 'Asia/Manila')::integer) % 7) + 7);
begin
  insert into public.availability_blocks (
    camera_id, kind, starts_at, ends_at, created_by, reason
  ) values (
    'c0100000-0000-4000-8000-000000000001',
    'maintenance',
    (monday + 7 + time '09:00') at time zone 'Asia/Manila',
    (monday + 9 + time '09:00') at time zone 'Asia/Manila',
    'c0000000-0000-4000-8000-000000000001',
    'private maintenance detail'
  );
end;
$$;

set local role anon;

do $$
declare
  monday date :=
    (statement_timestamp() at time zone 'Asia/Manila')::date
    + (((8 - extract(dow from statement_timestamp() at time zone 'Asia/Manila')::integer) % 7) + 7);
  quote record;
begin
  select * into quote
  from api.quote_booking_schedule(
    'c0100000-0000-4000-8000-000000000001',
    monday,
    monday + 2,
    '09:00',
    1
  );
  if quote.billable_days <> 2
    or quote.pickup_at at time zone 'Asia/Manila' <> monday + time '09:00'
    or quote.return_at at time zone 'Asia/Manila' <> monday + 2 + time '09:00'
  then
    raise exception 'schedule quote did not preserve Manila endpoints and pricing';
  end if;

  begin
    perform * from api.quote_booking_schedule(
      'c0100000-0000-4000-8000-000000000001',
      monday,
      monday + 2,
      '09:00',
      0
    );
    raise exception 'stale policy version was quoted';
  exception when sqlstate '40001' then null;
  end;

  begin
    perform * from api.quote_booking_schedule(
      'c0100000-0000-4000-8000-000000000001',
      monday,
      monday + 2,
      '10:00',
      1
    );
    raise exception 'unapproved handoff time was quoted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform * from api.quote_booking_schedule(
      'c0100000-0000-4000-8000-000000000001',
      monday,
      monday + 1,
      '09:00',
      1
    );
    raise exception 'disabled return weekday was quoted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform * from api.quote_booking_schedule(
      'c0100000-0000-4000-8000-000000000001',
      monday + 7,
      monday + 9,
      '09:00',
      1
    );
    raise exception 'busy overlap was quoted';
  exception when sqlstate '23P01' then
    if sqlerrm <> 'handoff_period_unavailable' then raise; end if;
  end;

  perform * from api.quote_booking_schedule(
    'c0100000-0000-4000-8000-000000000001',
    monday + 4,
    monday + 7,
    '09:00',
    1
  );
  perform * from api.quote_booking_schedule(
    'c0100000-0000-4000-8000-000000000001',
    monday + 9,
    monday + 11,
    '09:00',
    1
  );

  begin
    perform * from api.quote_booking_schedule(
      'c0100000-0000-4000-8000-000000000002',
      monday,
      monday + 2,
      '09:00',
      1
    );
    raise exception 'legacy camera received a fabricated schedule';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform api.request_booking_schedule(
      'c0100000-0000-4000-8000-000000000001',
      monday,
      monday + 2,
      '09:00',
      1,
      'Unauthorized request',
      'Cebu City'
    );
    raise exception 'anonymous caller created a request';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'c0000000-0000-4000-8000-000000000002';

do $$
declare
  monday date :=
    (statement_timestamp() at time zone 'Asia/Manila')::date
    + (((8 - extract(dow from statement_timestamp() at time zone 'Asia/Manila')::integer) % 7) + 7);
  created_booking_id uuid;
begin
  created_booking_id := api.request_booking_schedule(
    'c0100000-0000-4000-8000-000000000001',
    monday,
    monday + 2,
    '09:00',
    1,
    'Family event',
    'Cebu City'
  );

  if not exists (
    select 1 from public.bookings as booking
    where booking.id = created_booking_id
      and booking.renter_id = auth.uid()
      and booking.state = 'FOR_REVIEW'
      and booking.pickup_at at time zone 'Asia/Manila' = monday + time '09:00'
      and booking.return_at at time zone 'Asia/Manila' = monday + 2 + time '09:00'
  ) then
    raise exception 'validated schedule request was not persisted correctly';
  end if;

  begin
    perform api.request_booking_schedule(
      'c0100000-0000-4000-8000-000000000001',
      monday + 7,
      monday + 9,
      '09:00',
      1,
      'Overlapping event',
      'Private block identity must remain hidden'
    );
    raise exception 'overlapping schedule request was persisted';
  exception when sqlstate '23P01' then
    if sqlerrm <> 'handoff_period_unavailable' then raise; end if;
  end;
end;
$$;

reset role;

do $$
begin
  if (
    select count(*) from public.bookings
    where camera_id = 'c0100000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'failed schedule request left partial booking state';
  end if;
  if exists (
    select 1
    from public.availability_blocks as block
    join public.bookings as booking on booking.id = block.booking_id
    where booking.camera_id = 'c0100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'FOR_REVIEW schedule request reserved inventory';
  end if;
end;
$$;

select 'ok 1 - handoff schedule quote and request paths are Manila-authoritative, stale-safe, private, and non-reserving';

rollback;
