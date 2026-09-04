create function private.camera_operational_readiness_reasons(p_camera_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when not exists (
      select 1 from public.cameras camera
      where camera.id = p_camera_id and camera.status = 'published'
        and camera.published_at is not null and camera.daily_rate >= 0
        and camera.security_deposit >= 0
    ) then 'camera_unavailable' end,
    case when not exists (
      select 1 from public.camera_handoff_policies policy
      join private.location_anchors anchor
        on anchor.camera_id = policy.camera_id and anchor.removed_at is null
      join private.psgc_releases release
        on release.release_key = anchor.release_key and release.active
      join private.psgc_areas area
        on area.release_key = anchor.release_key and area.code = anchor.area_code
        and area.active
      where policy.camera_id = p_camera_id and policy.enabled
        and policy.timezone = 'Asia/Manila'
        and cardinality(policy.allowed_weekdays) > 0
        and exists (select 1 from public.camera_handoff_slots slot where slot.camera_id = policy.camera_id)
    ) then 'handoff_unavailable' end,
    case when not exists (
      select 1 from public.contract_templates template
      where template.approved_at is not null and template.activated_at is not null
        and template.deactivated_at is null
        and template.terms ?& array['pickup','return','cancellation','late-return','damage','loss','non-transferability']
    ) then 'template_unavailable' end,
    case when not exists (
      select 1 from private.gcash_payment_configuration configuration
      where configuration.singleton and configuration.enabled
        and nullif(btrim(configuration.recipient_name), '') is not null
        and nullif(btrim(configuration.recipient_account), '') is not null
    ) then 'payment_unavailable' end
  ], null);
$$;

create function private.assert_camera_operational_readiness(p_camera_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if cardinality(private.camera_operational_readiness_reasons(p_camera_id)) > 0 then
    raise exception 'camera_not_requestable' using errcode = '55000';
  end if;
end;
$$;

create or replace function api.quote_booking_schedule(
  p_camera_id uuid, p_pickup_date date, p_return_date date,
  p_handoff_time time without time zone, p_policy_version bigint
)
returns table (
  camera_id uuid, pickup_at timestamptz, return_at timestamptz,
  billable_days integer, daily_rate numeric(12,2), rental_amount numeric(12,2),
  security_deposit numeric(12,2), total_due numeric(12,2), currency text
)
language plpgsql volatile security definer set search_path = ''
as $$
declare pickup_at timestamptz; return_at timestamptz;
begin
  if p_pickup_date is null or p_return_date is null or p_handoff_time is null then
    raise exception 'handoff_invalid_period' using errcode = '22023';
  end if;
  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(p_camera_id, pickup_at, return_at, p_policy_version);
  return query select quoted.* from api.quote_booking(p_camera_id, pickup_at, return_at) quoted;
end;
$$;

create or replace function api.get_booking_request_page_context(
  p_camera_id uuid, p_pickup_date date, p_return_date date,
  p_handoff_time time without time zone, p_policy_version bigint
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare caller uuid := private.current_user_id(); profile_json jsonb; camera_json jsonb; quote_json jsonb;
begin
  perform private.assert_camera_operational_readiness(p_camera_id);
  select jsonb_build_object('legal_name', profile.legal_name, 'phone', profile.phone, 'account_status', profile.account_status)
    into profile_json from public.profiles profile where profile.user_id = caller;
  select jsonb_build_object('id', camera.id, 'name', camera.name, 'slug', camera.slug)
    into camera_json from public.cameras camera where camera.id = p_camera_id and camera.status = 'published';
  select to_jsonb(quote) into quote_json from api.quote_booking_schedule(p_camera_id, p_pickup_date, p_return_date, p_handoff_time, p_policy_version) quote;
  if camera_json is null or quote_json is null then raise exception 'booking_request_context_unavailable' using errcode = '22023'; end if;
  return jsonb_build_object('profile', profile_json, 'camera', camera_json, 'quote', quote_json);
end;
$$;

create or replace function api.request_booking_schedule_with_meetup_v2_idempotent(
  p_renter_id uuid, p_camera_id uuid, p_pickup_date date, p_return_date date,
  p_handoff_time time without time zone, p_policy_version bigint,
  p_intended_use text, p_expected_location text, p_meetup_plan jsonb,
  p_operation_id uuid
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  profile_status public.account_status;
  booking_id uuid;
  request_fingerprint text := encode(extensions.digest(convert_to(jsonb_build_object(
    'camera_id', p_camera_id, 'pickup_date', p_pickup_date,
    'return_date', p_return_date, 'handoff_time', p_handoff_time,
    'policy_version', p_policy_version, 'intended_use', p_intended_use,
    'expected_location', p_expected_location, 'meetup_plan', p_meetup_plan
  )::text, 'UTF8'), 'sha256'), 'hex');
begin
  if current_setting('role', true) <> 'service_role'
    or p_renter_id is null or p_operation_id is null then
    raise exception 'booking_request_forbidden' using errcode = '42501';
  end if;
  perform private.assert_camera_operational_readiness(p_camera_id);
  select profile.account_status into profile_status from public.profiles profile
  where profile.user_id = p_renter_id for update;
  if profile_status is null then raise exception 'booking_profile_required' using errcode = '42501'; end if;
  if profile_status <> 'active' then raise exception 'booking_profile_suspended' using errcode = '42501'; end if;
  booking_id := private.claim_booking_request_operation(p_renter_id, p_operation_id, request_fingerprint);
  if booking_id is not null then return booking_id; end if;
  if (select count(*) from public.bookings booking where booking.renter_id = p_renter_id and booking.state = 'FOR_REVIEW') >= 10 then
    raise exception 'booking_request_limit_reached' using errcode = 'P0001';
  end if;
  booking_id := private.request_booking_schedule_with_meetup_v2(
    p_renter_id, p_camera_id, p_pickup_date, p_return_date, p_handoff_time,
    p_policy_version, p_intended_use, p_expected_location, p_meetup_plan
  );
  perform private.complete_booking_request_operation(p_renter_id, p_operation_id, booking_id);
  return booking_id;
end;
$$;

create function api.get_camera_operational_readiness_admin(p_camera_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare reasons text[];
begin
  perform private.require_admin();
  reasons := private.camera_operational_readiness_reasons(p_camera_id);
  return jsonb_build_object('requestable', cardinality(reasons) = 0, 'reasons', to_jsonb(reasons));
end;
$$;

revoke all on function private.camera_operational_readiness_reasons(uuid),
  private.assert_camera_operational_readiness(uuid) from public, anon, authenticated;
revoke all on function api.get_camera_operational_readiness_admin(uuid) from public, anon, authenticated;
grant execute on function api.get_camera_operational_readiness_admin(uuid) to authenticated;
revoke all on function api.request_booking_schedule_with_meetup_v2_idempotent(uuid,uuid,date,date,time without time zone,bigint,text,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function api.request_booking_schedule_with_meetup_v2_idempotent(uuid,uuid,date,date,time without time zone,bigint,text,text,jsonb,uuid) to service_role;

create or replace function private.get_public_catalog_snapshot_for_slug(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', camera.id, 'slug', camera.slug, 'name', camera.name,
    'description', camera.description, 'daily_rate', camera.daily_rate,
    'security_deposit', camera.security_deposit, 'published_at', camera.published_at,
    'requestable', cardinality(private.camera_operational_readiness_reasons(camera.id)) = 0,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('object_path', photo.object_path, 'alt_text', photo.alt_text) order by photo.sort_position, photo.id) from public.camera_photos photo where photo.camera_id = camera.id and photo.archived_at is null), '[]'::jsonb),
    'accessories', coalesce((select jsonb_agg(jsonb_build_object('name', accessory.name, 'quantity', accessory.quantity) order by accessory.sort_position, accessory.id) from public.camera_accessories accessory where accessory.camera_id = camera.id and accessory.archived_at is null), '[]'::jsonb),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('starts_at', availability.starts_at, 'ends_at', availability.ends_at, 'reason', case when availability.kind = 'booking' then 'booked' else 'unavailable' end) order by availability.starts_at, availability.id) from public.availability_blocks availability where availability.camera_id = camera.id and availability.released_at is null and availability.period && tstzrange(statement_timestamp(), 'infinity'::timestamptz, '[)')), '[]'::jsonb),
    'handoff_policy', case when policy.camera_id is null then null else jsonb_build_object(
      'city_label', policy.city_label, 'allowed_weekdays', policy.allowed_weekdays,
      'approved_times', coalesce((select jsonb_agg(to_char(slot.local_time, 'HH24:MI') order by slot.local_time) from public.camera_handoff_slots slot where slot.camera_id = camera.id), '[]'::jsonb),
      'timezone', policy.timezone, 'enabled', policy.enabled, 'version', policy.version,
      'psgc_release_key', policy.psgc_release_key, 'psgc_area_code', policy.psgc_area_code,
      'approximation_level', policy.approximation_level
    ) end
  ) order by camera.published_at desc, camera.id), '[]'::jsonb)
  from public.cameras camera
  left join public.camera_handoff_policies policy on policy.camera_id = camera.id
  where camera.status = 'published' and (p_slug is null or camera.slug = p_slug);
$$;
