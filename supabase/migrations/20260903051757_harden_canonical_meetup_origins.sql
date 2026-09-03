-- Retired location origins are not historical records: replacement/removal must
-- erase the exact point and related private provenance promised by the UI.
delete from private.location_anchors where removed_at is not null;

create function private.delete_retired_location_anchor()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if new.removed_at is not null then
    delete from private.location_anchors where id = new.id;
  end if;
  return null;
end;
$$;

create trigger location_anchors_delete_retired
after update of removed_at on private.location_anchors
for each row
when (new.removed_at is not null)
execute function private.delete_retired_location_anchor();

revoke all on function private.delete_retired_location_anchor() from public, anon, authenticated;

-- The legacy API remains available for legacy policies and schedule-only saves,
-- but may not change the route origin underneath canonical PSGC metadata.
create or replace function api.replace_camera_handoff_policy(
  p_camera_id uuid,
  p_expected_version bigint,
  p_city_label text,
  p_provider_city_id text,
  p_country_code text,
  p_latitude numeric,
  p_longitude numeric,
  p_allowed_weekdays smallint[],
  p_approved_times time without time zone[],
  p_enabled boolean
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  next_version bigint;
begin
  perform private.require_admin();

  if exists (
    select 1
    from public.camera_handoff_policies policy
    join private.camera_lender_city_anchors anchor on anchor.camera_id = policy.camera_id
    where policy.camera_id = p_camera_id
      and policy.psgc_release_key is not null
      and (
        policy.city_label is distinct from btrim(p_city_label)
        or anchor.provider_city_id is distinct from btrim(p_provider_city_id)
        or anchor.country_code is distinct from upper(btrim(p_country_code))
        or anchor.latitude is distinct from p_latitude
        or anchor.longitude is distinct from p_longitude
      )
  ) then
    raise exception 'handoff_canonical_origin_requires_v2' using errcode = '22023';
  end if;

  next_version := private.replace_camera_handoff_policy(
    p_camera_id, p_expected_version, p_city_label, p_provider_city_id,
    p_country_code, p_latitude, p_longitude, p_allowed_weekdays,
    p_approved_times, p_enabled
  );
  return next_version;
end;
$$;

revoke all on function api.replace_camera_handoff_policy(
  uuid, bigint, text, text, text, numeric, numeric, smallint[],
  time without time zone[], boolean
) from public, anon;
grant execute on function api.replace_camera_handoff_policy(
  uuid, bigint, text, text, text, numeric, numeric, smallint[],
  time without time zone[], boolean
) to authenticated;

-- Canonical policies may route only while their exact release/area remains the
-- active validated reference. Policies with no canonical identity retain the
-- explicit legacy compatibility path.
create or replace function private.get_meetup_recommendation_context(
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pickup_at timestamptz;
  return_at timestamptz;
  result jsonb;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'meetup_context_unauthorized' using errcode = '42501';
  end if;
  if p_pickup_date is null or p_return_date is null or p_handoff_time is null then
    raise exception 'meetup_context_invalid' using errcode = '22023';
  end if;

  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );

  select jsonb_build_object(
    'camera_id', camera.id,
    'policy_version', policy.version,
    'city_label', policy.city_label,
    'provider_city_id', anchor.provider_city_id,
    'country_code', anchor.country_code,
    'latitude', anchor.latitude,
    'longitude', anchor.longitude
  ) into result
  from public.cameras camera
  join public.camera_handoff_policies policy on policy.camera_id = camera.id
  join private.camera_lender_city_anchors anchor on anchor.camera_id = camera.id
  where camera.id = p_camera_id
    and camera.status = 'published'
    and camera.archived_at is null
    and policy.enabled
    and (
      (policy.psgc_release_key is null and policy.psgc_area_code is null)
      or (
        policy.psgc_release_key is not null
        and policy.psgc_area_code is not null
        and exists (
          select 1
          from private.location_anchors canonical
          join private.psgc_releases release
            on release.release_key = canonical.release_key and release.active
          join private.psgc_areas area
            on area.release_key = canonical.release_key
            and area.code = canonical.area_code
            and area.active
          where canonical.camera_id = camera.id
            and canonical.removed_at is null
            and canonical.release_key = policy.psgc_release_key
            and canonical.area_code = policy.psgc_area_code
        )
      )
    );

  if result is null then
    raise exception 'meetup_context_unavailable' using errcode = '22023';
  end if;
  return result;
end;
$$;

revoke all on function private.get_meetup_recommendation_context(
  uuid, date, date, time without time zone, bigint
) from public, anon, authenticated;
grant execute on function private.get_meetup_recommendation_context(
  uuid, date, date, time without time zone, bigint
) to service_role;

-- JSON request envelopes preserve intentional nulls in the generated client
-- contract. PostgreSQL function parameters do not expose nullability metadata to
-- the type generator, while jsonb accurately represents these optional facts.
create function api.replace_camera_handoff_policy_v3(p_input jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'handoff_origin_invalid' using errcode = '22023';
  end if;
  return private.replace_camera_handoff_policy_v2(
    (p_input ->> 'camera_id')::uuid,
    (p_input ->> 'expected_version')::bigint,
    p_input ->> 'release_key',
    p_input ->> 'area_code',
    (p_input ->> 'precision')::private.location_anchor_precision,
    (p_input ->> 'source')::private.location_anchor_source,
    (p_input ->> 'latitude')::numeric,
    (p_input ->> 'longitude')::numeric,
    p_input ->> 'provider_reference',
    (p_input ->> 'accuracy_meters')::numeric,
    p_input ->> 'consent_version',
    p_input ->> 'provenance_version',
    (p_input ->> 'captured_at')::timestamptz,
    array(
      select value::smallint
      from jsonb_array_elements_text(p_input -> 'allowed_weekdays') value
    ),
    array(
      select value::time without time zone
      from jsonb_array_elements_text(p_input -> 'approved_times') value
    ),
    (p_input ->> 'enabled')::boolean
  );
end;
$$;

create function api.replace_my_meetup_origin_v2(p_input jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'meetup_origin_invalid' using errcode = '22023';
  end if;
  return private.replace_my_meetup_origin(
    p_input ->> 'release_key',
    p_input ->> 'area_code',
    (p_input ->> 'precision')::private.location_anchor_precision,
    (p_input ->> 'source')::private.location_anchor_source,
    (p_input ->> 'latitude')::numeric,
    (p_input ->> 'longitude')::numeric,
    p_input ->> 'provider_reference',
    (p_input ->> 'accuracy_meters')::numeric,
    p_input ->> 'consent_version',
    p_input ->> 'provenance_version',
    (p_input ->> 'captured_at')::timestamptz
  );
end;
$$;

revoke all on function api.replace_camera_handoff_policy_v3(jsonb) from public, anon;
revoke all on function api.replace_my_meetup_origin_v2(jsonb) from public, anon;
grant execute on function api.replace_camera_handoff_policy_v3(jsonb) to authenticated;
grant execute on function api.replace_my_meetup_origin_v2(jsonb) to authenticated;
