begin;

select '1..1';

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

insert into private.admin_accounts (user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.profiles (user_id, legal_name, phone) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CamNook Admin', '+639000000001'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Second Renter', '+639000000003');

insert into public.cameras (
  id,
  slug,
  serial_number,
  name,
  description,
  status,
  daily_rate,
  security_deposit,
  acquisition_cost,
  replacement_value,
  published_at
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'test-camera',
  'PRIVATE-SERIAL-001',
  'Test Camera',
  'Published only for database verification.',
  'published',
  1200,
  5000,
  40000,
  50000,
  statement_timestamp()
);

insert into public.camera_handoff_policies (
  camera_id, city_label, allowed_weekdays, timezone, enabled, version
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Manila', array[0,1,2,3,4,5,6]::smallint[], 'Asia/Manila', true, 1
);

insert into public.camera_handoff_slots (camera_id, local_time)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '09:00');

insert into public.camera_photos (
  id, camera_id, object_path, alt_text, sort_position
) values (
  'd2000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd/public-catalog.png',
  'Public catalog camera',
  0
);

insert into public.camera_accessories (
  id, camera_id, name, quantity, replacement_value, sort_position
) values (
  'd3000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Battery',
  2,
  2500,
  0
);

insert into public.cameras (
  id,
  slug,
  serial_number,
  name,
  description,
  status,
  daily_rate,
  security_deposit,
  archived_at
) values
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
    'draft-test-camera',
    'PRIVATE-SERIAL-002',
    'Draft Test Camera',
    'Must remain absent from every public availability consumer.',
    'draft',
    900,
    3000,
    null
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddf',
    'archived-test-camera',
    'PRIVATE-SERIAL-003',
    'Archived Test Camera',
    'Must remain absent from every public availability consumer.',
    'archived',
    1000,
    3500,
    statement_timestamp()
  );

insert into public.availability_blocks (
  id,
  camera_id,
  kind,
  starts_at,
  ends_at,
  created_by,
  reason,
  released_at,
  released_by
) values
  (
    'd1000000-0000-4000-8000-000000000001',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'maintenance',
    '2099-01-01 00:00:00+00',
    '2099-01-02 00:00:00+00',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Active public availability fixture',
    null,
    null
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'manual',
    '2099-01-03 00:00:00+00',
    '2099-01-04 00:00:00+00',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Released private availability fixture',
    statement_timestamp(),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    'd1000000-0000-4000-8000-000000000003',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
    'maintenance',
    '2099-01-05 00:00:00+00',
    '2099-01-06 00:00:00+00',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Draft camera private availability fixture',
    null,
    null
  ),
  (
    'd1000000-0000-4000-8000-000000000004',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddf',
    'manual',
    '2099-01-07 00:00:00+00',
    '2099-01-08 00:00:00+00',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Archived camera private availability fixture',
    null,
    null
  );

set local role anon;

do $$
declare
  catalog jsonb := api.get_public_catalog_snapshot();
  targeted_camera jsonb := api.get_public_camera_snapshot('test-camera');
  camera jsonb;
begin
  if (select count(*) from public.public_cameras) <> 1 then
    raise exception 'anonymous discovery must expose the published camera';
  end if;

  if jsonb_array_length(catalog) <> 1 then
    raise exception 'public catalog snapshot exposed an unpublished camera';
  end if;

  camera := catalog -> 0;

  if targeted_camera is distinct from camera
    or api.get_public_camera_snapshot('draft-test-camera') is not null
    or api.get_public_camera_snapshot(null) is not null
  then
    raise exception 'targeted public camera snapshot crossed its slug boundary';
  end if;

  if camera ->> 'id' <> 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    or camera ->> 'slug' <> 'test-camera'
    or camera -> 'photos' <> jsonb_build_array(jsonb_build_object(
      'object_path', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd/public-catalog.png',
      'alt_text', 'Public catalog camera'
    ))
    or camera -> 'accessories' <> jsonb_build_array(jsonb_build_object(
      'name', 'Battery',
      'quantity', 2
    ))
    or camera -> 'availability' -> 0 ->> 'reason' <> 'unavailable'
    or camera -> 'handoff_policy' ->> 'city_label' <> 'Manila'
    or camera -> 'handoff_policy' -> 'approved_times' <> '["09:00"]'::jsonb
  then
    raise exception 'public catalog snapshot omitted or changed approved public fields';
  end if;

  if array(
    select jsonb_object_keys(camera)
    order by 1
  ) <> array[
    'accessories', 'availability', 'daily_rate', 'description',
    'handoff_policy', 'id', 'name', 'photos', 'published_at',
    'security_deposit', 'slug'
  ]::text[]
    or camera::text like '%PRIVATE-SERIAL%'
    or camera::text like '%Active public availability fixture%'
    or camera::text like '%replacement_value%'
    or camera::text like '%provider_city_id%'
    or camera::text like '%latitude%'
    or camera::text like '%longitude%'
    or camera::text like '%booking_id%'
  then
    raise exception 'public catalog snapshot exposed a private field or value';
  end if;

  begin
    perform private.get_public_catalog_snapshot();
    raise exception 'anonymous role unexpectedly called the private catalog snapshot';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform private.get_public_catalog_snapshot_for_slug('test-camera');
    raise exception 'anonymous role unexpectedly called the private targeted catalog snapshot';
  exception
    when insufficient_privilege then null;
  end;

  if (
    select count(*)
    from public.public_availability as availability
    where availability.camera_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) <> 1 then
    raise exception 'anonymous public availability must expose only the active fixture';
  end if;

  if (
    select count(*)
    from public.availability_blocks as availability
    where availability.camera_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) <> 1
  then
    raise exception 'anonymous availability exposed a released fixture';
  end if;

  if exists (
    select 1
    from public.public_availability as availability
    where availability.camera_id in (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddf'
    )
  ) then
    raise exception 'anonymous public availability exposed an unpublished camera';
  end if;

  if exists (
    select 1
    from public.availability_blocks as availability
    where availability.camera_id in (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddf'
    )
  ) then
    raise exception 'anonymous direct availability exposed an unpublished camera';
  end if;

  begin
    execute 'select serial_number from public.cameras';
    raise exception 'anonymous role unexpectedly read a private camera column';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.is_admin();
    raise exception 'anonymous role unexpectedly called the admin check';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform private.is_admin();
    raise exception 'anonymous role unexpectedly called the private admin predicate';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

do $$
declare
  pickup_date date := (statement_timestamp() at time zone 'Asia/Manila')::date + 7;
begin
  if api.is_admin() then
    raise exception 'non-admin account passed the admin authorization check';
  end if;

  perform api.ensure_profile('First Renter', '+639000000002');

  begin
    perform api.request_booking_schedule_idempotent(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      pickup_date,
      pickup_date + 1,
      '09:00',
      1,
      'Portrait session',
      'Makati City',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    );
    raise exception 'schedule-only booking request remained executable';
  exception when insufficient_privilege then null;
  end;

  begin
    perform api.request_booking_idempotent(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      statement_timestamp() + interval '7 days',
      statement_timestamp() + interval '8 days',
      'Portrait session',
      'Makati City',
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    );
    raise exception 'legacy idempotent booking request remained executable';
  exception when insufficient_privilege then null;
  end;

  begin
    perform private.request_booking(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      statement_timestamp() + interval '7 days',
      statement_timestamp() + interval '8 days',
      'Portrait session',
      'Makati City'
    );
    raise exception 'private legacy booking request remained executable';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

insert into public.bookings (
  id, renter_id, camera_id, pickup_at, return_at, intended_use,
  expected_location, meetup_snapshot_required
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  ((statement_timestamp() at time zone 'Asia/Manila')::date + 7 + time '09:00') at time zone 'Asia/Manila',
  ((statement_timestamp() at time zone 'Asia/Manila')::date + 8 + time '09:00') at time zone 'Asia/Manila',
  'Portrait session', 'Makati City', false
);

insert into public.booking_state_history (
  booking_id, from_state, to_state, actor_user_id, actor_type, reason_code
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', null, 'FOR_REVIEW',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'renter', 'booking_requested'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

set constraints all immediate;

do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'renter profile RLS leaked another account';
  end if;
  if (select count(*) from public.bookings) <> 1 then
    raise exception 'renter cannot read their new booking';
  end if;
  if (
    select count(*)
    from public.public_availability as availability
    where availability.camera_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) <> 1
  then
    raise exception 'authenticated renter public availability must expose only the active fixture';
  end if;
  if (
    select count(*)
    from public.availability_blocks as availability
    where availability.camera_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) <> 1 then
    raise exception 'FOR_REVIEW must not create an additional availability block';
  end if;

  if exists (
    select 1
    from public.availability_blocks as availability
    where availability.camera_id in (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddf'
    )
  ) then
    raise exception 'authenticated renter direct availability exposed an unpublished camera';
  end if;

  begin
    update public.bookings set state = 'CANCELLED';
    raise exception 'renter unexpectedly updated booking state directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.approve_booking((select id from public.bookings limit 1));
    raise exception 'non-admin unexpectedly passed approval authorization';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.reject_booking(
      (select id from public.bookings limit 1),
      'Unauthorized rejection attempt'
    );
    raise exception 'non-admin unexpectedly passed rejection authorization';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into private.admin_accounts (singleton, user_id)
    values (true, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'non-admin unexpectedly created an admin authorization record';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.create_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000099',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'Unauthorized catalog photo',
      0,
      'image/png',
      3,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000099'
    );
    raise exception 'non-admin unexpectedly created a catalog photo publication';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform * from api.list_catalog_photo_publications();
    raise exception 'non-admin unexpectedly listed catalog photo publications';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform api.publish_camera(
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'f2000000-0000-4000-8000-000000000027'
    );
    raise exception 'non-admin unexpectedly published a camera';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform * from private.catalog_photo_publications;
    raise exception 'non-admin unexpectedly read private catalog publication state';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'draft-staging',
      'camera-listings/dddddddd-dddd-4ddd-8ddd-ddddddddddde/unauthorized.png',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    raise exception 'non-admin unexpectedly inserted a staged catalog photo';
  exception
    when insufficient_privilege then null;
  end;

  perform api.request_cancellation(
    (select id from public.bookings limit 1),
    'Database test cancellation request'
  );
end;
$$;

set local "request.jwt.claim.sub" = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
begin
  if (select count(*) from public.bookings) <> 0 then
    raise exception 'cross-account booking RLS leak';
  end if;
end;
$$;

reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  publication jsonb;
  staged_path constant text :=
    'camera-listings/dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000001.png';
  public_path constant text :=
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000001.png';
begin
  publication := api.create_catalog_photo_publication(
    'f1000000-0000-4000-8000-000000000001',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
    ' Front view of the test camera ',
    0,
    'image/png',
    3,
    repeat('a', 64),
    'f2000000-0000-4000-8000-000000000001'
  );

  if publication ->> 'status' <> 'awaiting_upload'
    or publication ->> 'staging_object_path' <> staged_path
    or publication ->> 'public_object_path' <> public_path
    or publication ->> 'expected_sha256' <> repeat('a', 64)
  then
    raise exception 'catalog photo publication intent was not persisted exactly';
  end if;

  if (
    api.create_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000001',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'Front view of the test camera',
      0,
      'image/png',
      3,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000002'
    ) ->> 'status'
  ) <> 'awaiting_upload' then
    raise exception 'catalog photo publication creation was not idempotent';
  end if;

  begin
    perform api.create_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000001',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'Conflicting catalog photo',
      0,
      'image/png',
      3,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000003'
    );
    raise exception 'conflicting catalog photo publication retry was accepted';
  exception
    when unique_violation then null;
  end;

  begin
    perform api.create_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000004',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'Invalid catalog photo',
      1,
      'application/pdf',
      3,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000004'
    );
    raise exception 'unsupported catalog media type was accepted';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform api.create_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000005',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'Invalid catalog photo',
      1,
      'image/png',
      10485761,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000005'
    );
    raise exception 'oversized catalog photo was accepted';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform api.create_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000006',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'Published camera photo',
      1,
      'image/png',
      3,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000006'
    );
    raise exception 'catalog workflow accepted a non-draft camera';
  exception
    when invalid_parameter_value then null;
  end;

  if (select count(*) from api.list_catalog_photo_publications()) <> 1 then
    raise exception 'admin catalog photo publication list is inconsistent';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'draft-staging',
      'camera-listings/dddddddd-dddd-4ddd-8ddd-ddddddddddde/unapproved.png',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'admin inserted a staging object without an exact intent';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'camera-listings',
      public_path,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'public catalog object was inserted before source verification';
  exception
    when insufficient_privilege then null;
  end;

  insert into storage.objects (bucket_id, name, owner)
  values (
    'draft-staging',
    staged_path,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  begin
    perform api.mark_catalog_photo_ready(
      'f1000000-0000-4000-8000-000000000001',
      'image/png',
      3,
      'not-a-digest',
      'f2000000-0000-4000-8000-000000000024'
    );
    raise exception 'staging verification accepted a malformed digest';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform api.mark_catalog_photo_ready(
      'f1000000-0000-4000-8000-000000000001',
      'image/png',
      3,
      repeat('b', 64),
      'f2000000-0000-4000-8000-000000000007'
    );
    raise exception 'staging verification accepted a mismatched digest';
  exception
    when check_violation then null;
  end;

  publication := api.mark_catalog_photo_ready(
    'f1000000-0000-4000-8000-000000000001',
    'image/png',
    3,
    repeat('a', 64),
    'f2000000-0000-4000-8000-000000000008'
  );

  if publication ->> 'status' <> 'ready_to_copy' then
    raise exception 'verified catalog photo was not made ready to copy';
  end if;

  if (
    api.mark_catalog_photo_ready(
      'f1000000-0000-4000-8000-000000000001',
      'image/png',
      3,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000009'
    ) ->> 'status'
  ) <> 'ready_to_copy' then
    raise exception 'source verification retry was not idempotent';
  end if;

  insert into storage.objects (bucket_id, name, owner)
  values (
    'camera-listings',
    public_path,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  if exists (
    select 1 from public.camera_photos
    where id = 'f1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'catalog metadata was created before destination finalization';
  end if;

  begin
    perform api.finalize_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000001',
      'image/png',
      4,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000010'
    );
    raise exception 'destination verification accepted a mismatched size';
  exception
    when check_violation then null;
  end;

  publication := api.finalize_catalog_photo_publication(
    'f1000000-0000-4000-8000-000000000001',
    'image/png',
    3,
    repeat('a', 64),
    'f2000000-0000-4000-8000-000000000011'
  );

  if publication ->> 'status' <> 'published'
    or not exists (
      select 1 from public.camera_photos
      where id = 'f1000000-0000-4000-8000-000000000001'
        and camera_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddde'
        and object_path = public_path
        and alt_text = 'Front view of the test camera'
        and archived_at is null
    )
  then
    raise exception 'catalog photo destination finalization was inconsistent';
  end if;

  begin
    perform api.create_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000002',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'Conflicting active position',
      0,
      'image/png',
      3,
      repeat('b', 64),
      'f2000000-0000-4000-8000-000000000012'
    );
    raise exception 'catalog workflow accepted a duplicate active sort position';
  exception
    when unique_violation then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'draft-staging'
      or name = 'dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000001.png'
  ) then
    raise exception 'catalog staging or unpublished destination leaked to a renter';
  end if;

  begin
    perform api.get_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000001'
    );
    raise exception 'non-admin unexpectedly read a catalog publication operation';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
begin
  if (
    api.publish_camera(
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'f2000000-0000-4000-8000-000000000028'
    ) ->> 'status'
  ) <> 'published' then
    raise exception 'guarded camera publication did not commit';
  end if;

  if (
    api.publish_camera(
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'f2000000-0000-4000-8000-000000000029'
    ) ->> 'status'
  ) <> 'published' then
    raise exception 'guarded camera publication retry was not idempotent';
  end if;

  if (
    api.finalize_catalog_photo_publication(
      'f1000000-0000-4000-8000-000000000001',
      'image/png',
      3,
      repeat('a', 64),
      'f2000000-0000-4000-8000-000000000026'
    ) ->> 'status'
  ) <> 'published' then
    raise exception 'published catalog finalization retry was not idempotent';
  end if;

  begin
    perform api.prepare_catalog_photo_archive(
      'f1000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000025'
    );
    raise exception 'published camera lost its last active photo';
  exception
    when check_violation then null;
  end;
end;
$$;

reset role;

update public.cameras
set status = 'draft',
    published_at = null
where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddde';

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  staged_path constant text :=
    'camera-listings/dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000001.png';
  public_path constant text :=
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000001.png';
  abort_staged_path constant text :=
    'camera-listings/dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000002.png';
  abort_public_path constant text :=
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000002.png';
begin
  delete from storage.objects
  where bucket_id = 'draft-staging' and name = staged_path;

  perform api.confirm_catalog_photo_staging_removed(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000013'
  );

  if (
    api.confirm_catalog_photo_staging_removed(
      'f1000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000014'
    ) ->> 'status'
  ) <> 'published' then
    raise exception 'staging cleanup confirmation was not idempotent';
  end if;

  perform api.prepare_catalog_photo_archive(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000015'
  );

  if not exists (
    select 1 from public.camera_photos
    where id = 'f1000000-0000-4000-8000-000000000001'
      and archived_at is not null
  ) then
    raise exception 'catalog metadata remained active during archive cleanup';
  end if;

  delete from storage.objects
  where bucket_id = 'camera-listings' and name = public_path;

  if (
    api.finalize_catalog_photo_archive(
      'f1000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000016'
    ) ->> 'status'
  ) <> 'archived' then
    raise exception 'catalog photo archive did not finalize';
  end if;

  perform api.create_catalog_photo_publication(
    'f1000000-0000-4000-8000-000000000002',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
    'Abort recovery photo',
    0,
    'image/png',
    3,
    repeat('b', 64),
    'f2000000-0000-4000-8000-000000000017'
  );

  insert into storage.objects (bucket_id, name, owner)
  values (
    'draft-staging',
    abort_staged_path,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  perform api.mark_catalog_photo_ready(
    'f1000000-0000-4000-8000-000000000002',
    'image/png',
    3,
    repeat('b', 64),
    'f2000000-0000-4000-8000-000000000018'
  );

  insert into storage.objects (bucket_id, name, owner)
  values (
    'camera-listings',
    abort_public_path,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  perform api.prepare_catalog_photo_abort(
    'f1000000-0000-4000-8000-000000000002',
    'f2000000-0000-4000-8000-000000000019'
  );

  delete from storage.objects
  where (bucket_id = 'draft-staging' and name = abort_staged_path)
    or (bucket_id = 'camera-listings' and name = abort_public_path);

  if (
    api.finalize_catalog_photo_abort(
      'f1000000-0000-4000-8000-000000000002',
      'f2000000-0000-4000-8000-000000000020'
    ) ->> 'status'
  ) <> 'aborted' then
    raise exception 'ambiguous catalog copy abort did not finalize safely';
  end if;

  if exists (
    select 1 from public.camera_photos
    where id = 'f1000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'aborted catalog photo created public metadata';
  end if;
end;
$$;

reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
begin
  perform api.create_catalog_photo_publication(
    'f1000000-0000-4000-8000-000000000003',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
    'Expired upload intent photo',
    1,
    'image/png',
    3,
    repeat('c', 64),
    'f2000000-0000-4000-8000-000000000021'
  );
end;
$$;

reset role;

update private.catalog_photo_publications
set created_at = statement_timestamp() - interval '2 hours',
    expires_at = statement_timestamp() - interval '1 hour'
where id = 'f1000000-0000-4000-8000-000000000003';

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'draft-staging',
      'camera-listings/dddddddd-dddd-4ddd-8ddd-ddddddddddde/f1000000-0000-4000-8000-000000000003.png',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'expired catalog upload intent remained writable';
  exception
    when insufficient_privilege then null;
  end;

  perform api.prepare_catalog_photo_abort(
    'f1000000-0000-4000-8000-000000000003',
    'f2000000-0000-4000-8000-000000000022'
  );
  perform api.finalize_catalog_photo_abort(
    'f1000000-0000-4000-8000-000000000003',
    'f2000000-0000-4000-8000-000000000023'
  );
end;
$$;

reset role;

insert into public.verification_records (
  user_id,
  status,
  id_type,
  document_expiration_date,
  decided_at,
  decided_by
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'verified',
  'passport',
  (statement_timestamp() at time zone 'Asia/Manila')::date + 30,
  statement_timestamp(),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

insert into public.contract_templates (
  id,
  version,
  schema_version,
  terms,
  content_sha256,
  created_by,
  approved_at,
  approved_by,
  activated_at
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'test-v1',
  1,
  '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb,
  extensions.digest(
    convert_to(
      '{"pickup":"p","return":"r","cancellation":"c","late-return":"l","damage":"d","loss":"l","non-transferability":"n"}'::jsonb::text,
      'UTF8'
    ),
    'sha256'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  statement_timestamp(),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  statement_timestamp()
);

set constraints all deferred;
set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  target_booking_id uuid;
  adjacent_block_id uuid;
  cancellation_request_id uuid;
begin
  if not api.is_admin() then
    raise exception 'configured admin failed the admin authorization check';
  end if;

  if (
    select count(*)
    from public.availability_blocks as availability
    where availability.camera_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) <> 2
    or (
      select count(*)
      from public.public_availability as availability
      where availability.camera_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    ) <> 1
  then
    raise exception 'admin availability visibility or public projection changed';
  end if;

  if (
    select count(*)
    from public.availability_blocks as availability
    where availability.camera_id in (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddf'
    )
  ) <> 2
    or exists (
      select 1
      from public.public_availability as availability
      where availability.camera_id in (
        'dddddddd-dddd-4ddd-8ddd-ddddddddddde',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddf'
      )
    )
  then
    raise exception 'admin inventory visibility leaked unpublished availability publicly';
  end if;

  perform
    camera.id,
    camera.slug,
    camera.name,
    camera.status,
    camera.published_at,
    camera.daily_rate,
    camera.security_deposit
  from public.cameras as camera
  limit 1;

  select id into target_booking_id
  from public.bookings
  where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  select id into cancellation_request_id
  from public.booking_cancellation_requests
  where booking_id = target_booking_id
    and disposition = 'pending';

  perform api.decide_cancellation(
    cancellation_request_id,
    false,
    'Declined by database regression test'
  );

  if not exists (
    select 1
    from public.booking_cancellation_requests
    where id = cancellation_request_id
      and disposition = 'declined'
  ) then
    raise exception 'cancellation decision did not persist the enum disposition';
  end if;

  perform api.approve_booking(target_booking_id);

  if not exists (
    select 1
    from public.bookings
    where id = target_booking_id
      and state = 'CONTRACT_PENDING'
      and billable_days_snapshot = 1
      and rental_amount = 1200
      and total_due = 6200
      and current_contract_version_id is not null
  ) then
    raise exception 'approval did not create the authoritative aggregate';
  end if;

  perform api.create_manual_block(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    statement_timestamp() + interval '10 days',
    statement_timestamp() + interval '11 days',
    'maintenance',
    'Database test'
  );

  adjacent_block_id := api.create_manual_block(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    statement_timestamp() + interval '11 days',
    statement_timestamp() + interval '12 days',
    'manual',
    'Half-open adjacency test'
  );

  if adjacent_block_id is null then
    raise exception 'half-open adjacent range was not accepted';
  end if;

  begin
    perform api.create_manual_block(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      statement_timestamp() + interval '10 days 12 hours',
      statement_timestamp() + interval '11 days 12 hours',
      'manual',
      'Expected overlap'
    );
    raise exception 'overlapping active availability block was accepted';
  exception
    when exclusion_violation then null;
  end;
end;
$$;

reset role;
set constraints all immediate;

insert into public.payment_transactions (
  id,
  booking_id,
  direction,
  amount,
  reference,
  counterparty_display_name,
  submitted_by,
  submission_attempt_id,
  contract_version_id,
  recipient_config_version,
  recipient_name_snapshot,
  recipient_account_snapshot
)
select
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  id,
  'incoming',
  6200,
  'VALID-REFERENCE-001',
  'First Renter',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'facefeed-face-4eed-8ace-facefeed0001',
  current_contract_version_id,
  0,
  'Test GCash Recipient',
  '09170000000'
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

set constraints all deferred;

select set_config(
  'camnook.payment_operation_id',
  'facefeed-face-4eed-8ace-facefeed0002',
  true
);

insert into public.payment_proofs (
  id,
  transaction_id,
  owner_user_id,
  object_path,
  media_type,
  byte_size,
  sha256,
  finalized_at
) values (
  'facefeed-face-4eed-8ace-facefeed0003',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'facefeed-face-4eed-8ace-facefeed0003/proof.png',
  'image/png',
  9,
  extensions.digest(convert_to('proof-one', 'UTF8'), 'sha256'),
  statement_timestamp()
);

update public.payment_transactions
set status = 'verified',
    decided_at = statement_timestamp(),
    decided_by = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

insert into public.payment_allocations (transaction_id, booking_id, kind, amount)
select
  'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
  id,
  'rental_payment'::public.payment_allocation_kind,
  1200
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
union all
select
  'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
  id,
  'security_deposit'::public.payment_allocation_kind,
  5000
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

update public.bookings
set state = 'COMPLETED'
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into public.booking_state_history (
  booking_id,
  from_state,
  to_state,
  actor_user_id,
  actor_type,
  reason_code
)
select
  id,
  'CONTRACT_PENDING',
  'COMPLETED',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'admin',
  'test_completed_fixture'
from public.bookings
where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

set constraints all immediate;

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  target_booking_id uuid;
  refund_id uuid;
  settlement_id uuid;
begin
  select id into target_booking_id
  from public.bookings
  where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  refund_id := api.record_refund(
    target_booking_id,
    5000,
    'REFUND-REFERENCE-001',
    'First Renter'
  );

  settlement_id := api.finalize_deposit_settlement(
    target_booking_id,
    5000,
    0,
    null,
    refund_id
  );

  if refund_id is null or settlement_id is null then
    raise exception 'refund and settlement operations did not return identifiers';
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and not relation.relrowsecurity
  ) then
    raise exception 'a public base table is missing RLS';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'UPDATE'
  ) then
    raise exception 'storage overwrite policy must not exist';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'DELETE'
      and policyname not in (
        'catalog_photo_staging_delete',
        'camera_listing_objects_publication_delete',
        'payment_proof_objects_owner_delete_unfinished'
      )
  ) or (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'DELETE'
      and policyname in (
        'catalog_photo_staging_delete',
        'camera_listing_objects_publication_delete',
        'payment_proof_objects_owner_delete_unfinished'
      )
  ) <> 3 then
    raise exception 'storage delete access expanded beyond catalog publication recovery';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'verification_documents%'
  ) then
    raise exception 'retired government-ID Storage access remains enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'SELECT'
      and coalesce(qual, '') like '%is_admin%'
      and policyname not in (
        'catalog_photo_staging_select',
        'camera_listing_objects_publication_select'
      )
  ) then
    raise exception 'private object reads must use a future audited admin flow';
  end if;

  if not exists (
    select 1 from public.deposit_settlements
    where booking_id = (
      select id from public.bookings
      where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
      and status = 'final'
      and held_amount = 5000
      and refund_amount = 5000
      and deduction_amount = 0
  ) then
    raise exception 'manual refund did not produce a balanced final deposit settlement';
  end if;

  begin
    insert into private.admin_accounts (singleton, user_id)
    values (false, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    raise exception 'admin singleton constraint was bypassed';
  exception
    when check_violation then null;
  end;

  begin
    update public.booking_state_history set note = 'tampered';
    raise exception 'append-only booking history was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.bookings
    set approval_deadline_at = approval_deadline_at + interval '1 minute'
    where renter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    raise exception 'immutable approval deadline was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.contract_templates
    set terms = '{"terms":"tampered"}'::jsonb
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    raise exception 'activated contract template was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.payment_transactions
    set amount = amount + 1
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    raise exception 'verified payment was updated';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    insert into public.payment_transactions (
      booking_id,
      direction,
      status,
      amount,
      reference,
      counterparty_display_name,
      submitted_by,
      decided_at,
      decided_by,
      reversal_of
    )
    select
      booking_id,
      'incoming',
      'verified',
      amount,
      'INVALID-REVERSAL-001',
      'First Renter',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      statement_timestamp(),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      id
    from public.payment_transactions
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    raise exception 'same-direction payment reversal was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

select 'ok 1 - CamNook domain and authorization invariants';

rollback;
