begin;
select '1..1';

insert into auth.users(id) values
  ('f2900000-0000-4000-8000-000000000001'),
  ('f2900000-0000-4000-8000-000000000002');
insert into private.admin_accounts(user_id) values ('f2900000-0000-4000-8000-000000000001');
set local role authenticated;
set local "request.jwt.claim.sub" = 'f2900000-0000-4000-8000-000000000001';

do $$
declare
  input jsonb := jsonb_build_object(
    'name', 'Synthetic draft camera', 'description', 'Synthetic camera validation fixture.',
    'daily_rate', 450, 'security_deposit', 1000,
    'accessories', jsonb_build_array(jsonb_build_object('name', 'Battery', 'quantity', 2))
  );
  v_camera_id uuid;
  invalid jsonb;
begin
  v_camera_id := api.save_camera_draft(input);
  input := input || jsonb_build_object('id', v_camera_id, 'daily_rate', 500);
  for invalid in select payload from (values
    (input - 'accessories'),
    (input || '{"accessories":null}'::jsonb),
    (input || '{"accessories":{}}'::jsonb)
  ) as cases(payload) loop
    begin
      perform api.save_camera_draft(invalid);
      raise exception 'camera save accepted an absent or invalid accessory list';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  if (select daily_rate from public.cameras where id = v_camera_id) <> 450
    or (select count(*) from public.camera_accessories as accessory where accessory.camera_id = v_camera_id and archived_at is null) <> 1
  then raise exception 'invalid camera input partially changed price or inclusions'; end if;

  perform api.save_camera_draft(input || '{"accessories":[]}'::jsonb);
  if (select daily_rate from public.cameras where id = v_camera_id) <> 500
    or exists (select 1 from public.camera_accessories as accessory where accessory.camera_id = v_camera_id and archived_at is null)
    or (select count(*) from public.camera_accessories as accessory where accessory.camera_id = v_camera_id and archived_at is not null) <> 1
  then raise exception 'explicit empty accessory list failed to preserve archived history'; end if;
end;
$$;

set local "request.jwt.claim.sub" = 'f2900000-0000-4000-8000-000000000002';
do $$ begin
  begin
    perform api.save_camera_draft('{}'::jsonb);
    raise exception 'renter reached camera mutation';
  exception when insufficient_privilege then null;
  end;
end; $$;
select 'ok 1 - camera edits require explicit accessory intent and preserve history';
rollback;
