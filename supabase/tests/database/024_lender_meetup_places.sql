begin;

select '1..1';

insert into auth.users (id) values
  ('d0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000003');

insert into private.admin_accounts (user_id)
values ('d0000000-0000-4000-8000-000000000001');

insert into public.profiles (user_id, legal_name, phone, account_status) values
  ('d0000000-0000-4000-8000-000000000001', 'Meetup Admin', '+639800000001', 'active'),
  ('d0000000-0000-4000-8000-000000000002', 'Meetup Renter', '+639800000002', 'active'),
  ('d0000000-0000-4000-8000-000000000003', 'Other Renter', '+639800000003', 'active');

insert into public.cameras (
  id, slug, serial_number, name, description, status,
  daily_rate, security_deposit, published_at
) values (
  'd0100000-0000-4000-8000-000000000001', 'meetup-camera',
  'PRIVATE-MEETUP-SERIAL', 'Meetup Camera', 'Saved place fixture.',
  'published', 900, 3500, statement_timestamp()
);

insert into public.camera_handoff_policies (
  camera_id, city_label, allowed_weekdays, timezone, enabled, version
) values (
  'd0100000-0000-4000-8000-000000000001', 'Cebu City',
  array[0,1,2,3,4,5,6]::smallint[], 'Asia/Manila', true, 1
);

insert into public.camera_handoff_slots (camera_id, local_time)
values ('d0100000-0000-4000-8000-000000000001', '09:00');

update public.camera_handoff_policies set
  psgc_release_key = '2026-q2', psgc_area_code = '0730600041',
  approximation_level = 'barangay_centroid'
where camera_id = 'd0100000-0000-4000-8000-000000000001';
insert into private.location_anchors (
  camera_id, release_key, area_code, precision, source, latitude, longitude,
  provider_reference, provenance_version, captured_at, updated_by
) values (
  'd0100000-0000-4000-8000-000000000001', '2026-q2', '0730600041',
  'barangay_centroid', 'provider_centroid', 10.333, 123.897,
  'provider:meetup-lahug', 'meetup-test-v1', statement_timestamp(),
  'd0000000-0000-4000-8000-000000000001'
);

insert into private.camera_lender_city_anchors (
  camera_id, provider_city_id, country_code, latitude, longitude, updated_by
) values (
  'd0100000-0000-4000-8000-000000000001', 'provider:cebu-city', 'PH',
  10.31570, 123.88540, 'd0000000-0000-4000-8000-000000000001'
);

insert into public.contract_templates (
  id, version, schema_version, terms, content_sha256, approved_at, approved_by,
  activated_at, created_by
) values (
  'd0200000-0000-4000-8000-000000000001', 'meetup-v1', 1,
  jsonb_build_object(
    'pickup', 'Meet at the planned public venue.',
    'return', 'Return at the same planned public venue.',
    'cancellation', 'Cancellation terms.',
    'late-return', 'Late return terms.',
    'damage', 'Damage terms.',
    'loss', 'Loss terms.',
    'non-transferability', 'Named renter only.'
  ), extensions.digest(convert_to('meetup-template', 'UTF8'), 'sha256'),
  statement_timestamp(), 'd0000000-0000-4000-8000-000000000001',
  statement_timestamp(), 'd0000000-0000-4000-8000-000000000001'
);

update private.gcash_payment_configuration set enabled = true,
  recipient_name = 'Meetup Owner', recipient_account = '09171234567',
  updated_by = 'd0000000-0000-4000-8000-000000000001';


set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000002';
select api.save_my_kyc_profile(jsonb_build_object('legal_name','Meetup Renter','phone','+639800000002','birth_date','1990-01-01','address_line1','Unit 4, 123 Mango Avenue','release_key','2026-q2','area_code','0730600041'));
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000001';
select set_config('test.place',api.save_meetup_place(jsonb_build_object('name','Mall main entrance','address','Public entrance, Cebu City','city','Cebu City','latitude',10.315712,'longitude',123.885423,'arrival_instructions','Beside the café','source','manual_pin'))::text,true);
select api.assign_camera_meetup_places('d0100000-0000-4000-8000-000000000001',array[current_setting('test.place')::uuid]);
do $$ begin
 begin
  perform api.assign_camera_meetup_places('d0100000-0000-4000-8000-000000000001',array[current_setting('test.place')::uuid,current_setting('test.place')::uuid]);
  raise exception 'duplicate assignments accepted';
 exception when raise_exception then if sqlerrm <> 'invalid_meetup_places' then raise; end if; end;
end; $$;
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000002';
do $$ begin
 if (select count(*) from public.meetup_places) <> 0 then raise exception 'renter can read owner library'; end if;
 if api.get_camera_meetup_places('d0100000-0000-4000-8000-000000000001')->0->>'latitude' <> '10.315712' then raise exception 'coordinate lost precision'; end if;
 begin
  perform api.archive_meetup_place(current_setting('test.place')::uuid,1);
  raise exception 'renter archived a place';
 exception when insufficient_privilege then null; end;
 begin
  update public.meetup_places set latitude=0;
  raise exception 'renter wrote place data';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role service_role;
select set_config('test.booking',api.request_booking_with_place_idempotent('d0000000-0000-4000-8000-000000000002','d0100000-0000-4000-8000-000000000001','2099-08-24','2099-08-26','09:00',1,'Family portraits','Cebu City',current_setting('test.place')::uuid,1,'d0400000-0000-4000-8000-000000000001')::text,true);
reset role;
do $$ begin
 if not exists(select 1 from public.booking_meetup_plans where booking_id=current_setting('test.booking')::uuid and plan_kind='lender_place' and venue_latitude=10.315712 and venue_longitude=123.885423 and arrival_instructions='Beside the café' and renter_city_label is null) then raise exception 'missing precise snapshot'; end if;
 begin
  update public.booking_meetup_plans set venue_latitude=0 where booking_id=current_setting('test.booking')::uuid;
  raise exception 'snapshot was mutable';
 exception when sqlstate '55000' then null; end;
end; $$;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000001';
select api.save_meetup_place(jsonb_build_object('id',current_setting('test.place'),'version',1,'name','Mall side entrance','address','Another entrance, Cebu City','city','Cebu City','latitude',10.999999,'longitude',123.999999,'arrival_instructions','New entrance','source','manual_pin'));
reset role;
set local role service_role;
do $$ begin
 if api.request_booking_with_place_idempotent('d0000000-0000-4000-8000-000000000002','d0100000-0000-4000-8000-000000000001','2099-08-24','2099-08-26','09:00',1,'Family portraits','Cebu City',current_setting('test.place')::uuid,1,'d0400000-0000-4000-8000-000000000001') <> current_setting('test.booking')::uuid then raise exception 'retry did not return original'; end if;
 begin
  perform api.request_booking_with_place_idempotent('d0000000-0000-4000-8000-000000000002','d0100000-0000-4000-8000-000000000001','2099-08-24','2099-08-26','09:00',1,'Family portraits','Cebu City',current_setting('test.place')::uuid,1,'d0400000-0000-4000-8000-000000000002');
  raise exception 'stale selection accepted';
 exception when raise_exception then if sqlerrm <> 'meetup_changed' then raise; end if; end;
 begin
  perform api.request_booking_with_place_idempotent('d0000000-0000-4000-8000-000000000002','d0100000-0000-4000-8000-000000000001','2099-08-24','2099-08-26','09:00',1,'Family portraits','Cebu City',current_setting('test.place')::uuid,2,'d0400000-0000-4000-8000-000000000001');
  raise exception 'changed retry payload accepted';
 exception when sqlstate '22023' then if sqlerrm <> 'booking request operation payload does not match' then raise; end if; end;
end; $$;
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000001';
select api.archive_meetup_place(current_setting('test.place')::uuid,2);
do $$ begin
 if api.get_camera_meetup_places('d0100000-0000-4000-8000-000000000001') <> '[]'::jsonb then raise exception 'archived place still selectable'; end if;
end; $$;
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000002';
do $$ declare detail jsonb; begin
 detail:=api.get_my_booking_detail_context(current_setting('test.booking')::uuid);
 if detail->'meetup'->>'venue_name' <> 'Mall main entrance' or detail->'meetup'->>'plan_kind' <> 'lender_place' or detail->'meetup'->>'arrival_instructions' <> 'Beside the café' then raise exception 'booking display changed with library'; end if;
end; $$;
reset role;
do $$ begin
 if (select count(*) from public.bookings where renter_id='d0000000-0000-4000-8000-000000000002') <> 1 then raise exception 'failed request left orphan booking'; end if;
end; $$;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd0000000-0000-4000-8000-000000000001';
select api.approve_booking(current_setting('test.booking')::uuid);
reset role;
do $$ declare saved jsonb; begin
 select snapshot into saved from public.contract_versions where booking_id=current_setting('test.booking')::uuid;
 if saved#>>'{meetup,kind}' <> 'lender_place' or saved#>>'{meetup,venue_name}' <> 'Mall main entrance' or (saved#>>'{meetup,venue_latitude}')::numeric <> 10.315712 or saved#>>'{meetup,arrival_instructions}' <> 'Beside the café' then raise exception 'contract did not preserve the selected entrance'; end if;
end; $$;
select 'ok 1 - saved places enforce permissions, explicit versions, immutable precise snapshots, idempotency and archive recovery';
rollback;
