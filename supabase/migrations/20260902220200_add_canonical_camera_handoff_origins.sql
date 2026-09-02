-- Canonical camera handoff origins extend the existing versioned transaction.
-- Nullable canonical columns preserve every legacy city-only policy unchanged.

alter table public.camera_handoff_policies
  add column psgc_release_key text,
  add column psgc_area_code text,
  add column approximation_level text not null default 'legacy_city' check (
    approximation_level in ('legacy_city', 'city_centroid', 'barangay_centroid', 'precise')
  ),
  add foreign key (psgc_release_key, psgc_area_code)
    references private.psgc_areas (release_key, code) on delete restrict,
  add check ((psgc_release_key is null) = (psgc_area_code is null)),
  add check (
    (psgc_area_code is null and approximation_level = 'legacy_city')
    or (psgc_area_code is not null and approximation_level <> 'legacy_city')
  );

create or replace view public.public_camera_handoff_policies
with (security_invoker = true)
as
select
  policy.camera_id,
  policy.city_label,
  policy.allowed_weekdays,
  coalesce(
    array_agg(to_char(slot.local_time, 'HH24:MI') order by slot.local_time)
      filter (where slot.local_time is not null),
    '{}'::text[]
  ) as approved_times,
  policy.timezone,
  policy.enabled,
  policy.version,
  policy.psgc_release_key,
  policy.psgc_area_code,
  policy.approximation_level
from public.camera_handoff_policies as policy
left join public.camera_handoff_slots as slot on slot.camera_id = policy.camera_id
group by policy.camera_id;

create or replace function private.get_public_catalog_snapshot_for_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', camera.id, 'slug', camera.slug, 'name', camera.name,
    'description', camera.description, 'daily_rate', camera.daily_rate,
    'security_deposit', camera.security_deposit, 'published_at', camera.published_at,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('object_path', photo.object_path, 'alt_text', photo.alt_text) order by photo.sort_position, photo.id) from public.camera_photos photo where photo.camera_id = camera.id and photo.archived_at is null), '[]'::jsonb),
    'accessories', coalesce((select jsonb_agg(jsonb_build_object('name', accessory.name, 'quantity', accessory.quantity) order by accessory.sort_position, accessory.id) from public.camera_accessories accessory where accessory.camera_id = camera.id and accessory.archived_at is null), '[]'::jsonb),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('starts_at', availability.starts_at, 'ends_at', availability.ends_at, 'reason', case when availability.kind = 'booking' then 'booked' else 'unavailable' end) order by availability.starts_at, availability.id) from public.availability_blocks availability where availability.camera_id = camera.id and availability.released_at is null and availability.period && tstzrange(statement_timestamp(), 'infinity'::timestamptz, '[)')), '[]'::jsonb),
    'handoff_policy', case when policy.camera_id is null then null else jsonb_build_object(
      'city_label', policy.city_label,
      'allowed_weekdays', policy.allowed_weekdays,
      'approved_times', coalesce((select jsonb_agg(to_char(slot.local_time, 'HH24:MI') order by slot.local_time) from public.camera_handoff_slots slot where slot.camera_id = camera.id), '[]'::jsonb),
      'timezone', policy.timezone,
      'enabled', policy.enabled,
      'version', policy.version,
      'psgc_release_key', policy.psgc_release_key,
      'psgc_area_code', policy.psgc_area_code,
      'approximation_level', policy.approximation_level
    ) end
  ) order by camera.published_at desc, camera.id), '[]'::jsonb)
  from public.cameras camera
  left join public.camera_handoff_policies policy on policy.camera_id = camera.id
  where camera.status = 'published' and (p_slug is null or camera.slug = p_slug);
$$;

create function private.get_camera_handoff_policy_admin_v2(p_camera_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb := private.get_camera_handoff_policy_admin(p_camera_id);
  canonical jsonb;
begin
  select jsonb_build_object(
    'release', anchor.release_key,
    'area_code', anchor.area_code,
    'area_name', btrim(area.name),
    'area_type', area.area_type,
    'area_path', (
      with recursive chain as (
        select current_area.*, 0 depth
        from private.psgc_areas current_area
        where current_area.release_key = area.release_key and current_area.code = area.code
        union all
        select parent.*, child.depth + 1
        from chain child
        join private.psgc_areas parent
          on parent.release_key = child.release_key and parent.code = child.parent_code
      )
      select jsonb_agg(jsonb_build_object('code', code, 'name', btrim(name), 'type', area_type) order by depth desc)
      from chain
    ),
    'precision', anchor.precision,
    'source', anchor.source,
    'latitude', anchor.latitude,
    'longitude', anchor.longitude,
    'provider_reference', anchor.provider_reference,
    'accuracy_meters', anchor.accuracy_meters,
    'consent_version', anchor.consent_version,
    'provenance_version', anchor.provenance_version,
    'captured_at', anchor.captured_at,
    'current', release.active,
    'active', area.active
  ) into canonical
  from private.location_anchors anchor
  join private.psgc_areas area
    on area.release_key = anchor.release_key and area.code = anchor.area_code
  join private.psgc_releases release on release.release_key = anchor.release_key
  where anchor.camera_id = p_camera_id and anchor.removed_at is null;

  return result || jsonb_build_object(
    'canonical_anchor', canonical,
    'approximation_level', coalesce(result ->> 'approximation_level',
      case when canonical is null then 'legacy_city' else canonical ->> 'precision' end)
  );
end;
$$;

create function private.replace_camera_handoff_policy_v2(
  p_camera_id uuid,
  p_expected_version bigint,
  p_release_key text,
  p_area_code text,
  p_precision private.location_anchor_precision,
  p_source private.location_anchor_source,
  p_latitude numeric,
  p_longitude numeric,
  p_provider_reference text,
  p_accuracy_meters numeric,
  p_consent_version text,
  p_provenance_version text,
  p_captured_at timestamptz,
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
  caller uuid := private.require_admin();
  area private.psgc_areas%rowtype;
  next_version bigint;
  operation_id uuid := gen_random_uuid();
begin
  select candidate.* into area
  from private.psgc_areas candidate
  join private.psgc_releases release on release.release_key = candidate.release_key
  where candidate.release_key = p_release_key
    and candidate.code = p_area_code
    and candidate.active
    and release.active;

  if not found
    or p_latitude is null or p_latitude not between 4 and 22
    or p_longitude is null or p_longitude not between 116 and 127
    or length(btrim(coalesce(p_provenance_version, ''))) not between 3 and 80
    or p_captured_at is null or p_captured_at > statement_timestamp() + interval '5 minutes'
    or (p_precision = 'city_centroid' and area.area_type not in ('city', 'municipality'))
    or (p_precision = 'barangay_centroid' and area.area_type <> 'barangay')
    or (p_precision in ('city_centroid', 'barangay_centroid') and (
      p_source <> 'provider_centroid' or p_consent_version is not null
      or length(btrim(coalesce(p_provider_reference, ''))) not between 2 and 240
    ))
    or (p_precision = 'precise' and (
      p_source not in ('device_gps', 'map_pin')
      or length(btrim(coalesce(p_consent_version, ''))) not between 3 and 80
      or p_accuracy_meters is null or p_accuracy_meters > 1000
    ))
  then
    raise exception 'handoff_origin_invalid' using errcode = '22023';
  end if;

  next_version := private.replace_camera_handoff_policy(
    p_camera_id,
    p_expected_version,
    btrim(area.name),
    coalesce(nullif(btrim(p_provider_reference), ''), 'canonical:' || area.code),
    'PH',
    p_latitude,
    p_longitude,
    p_allowed_weekdays,
    p_approved_times,
    p_enabled
  );

  update public.camera_handoff_policies
  set psgc_release_key = p_release_key,
      psgc_area_code = p_area_code,
      approximation_level = p_precision::text
  where camera_id = p_camera_id;

  update private.location_anchors
  set removed_at = statement_timestamp(), updated_by = caller
  where camera_id = p_camera_id and removed_at is null;

  insert into private.location_anchors (
    camera_id, release_key, area_code, precision, source, latitude, longitude,
    provider_reference, accuracy_meters, consent_version, provenance_version,
    captured_at, updated_by
  ) values (
    p_camera_id, p_release_key, p_area_code, p_precision, p_source,
    p_latitude, p_longitude, nullif(btrim(p_provider_reference), ''),
    p_accuracy_meters, nullif(btrim(p_consent_version), ''),
    btrim(p_provenance_version), p_captured_at, caller
  );

  perform private.write_audit(
    operation_id,
    'replace_canonical_camera_handoff_origin',
    'camera',
    p_camera_id,
    'success',
    'private meetup origin configuration',
    jsonb_build_object(
      'policy_version', next_version,
      'psgc_release', p_release_key,
      'area_type', area.area_type,
      'precision', p_precision
    )
  );
  return next_version;
end;
$$;

create function api.get_camera_handoff_policy_admin_v2(p_camera_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.get_camera_handoff_policy_admin_v2(p_camera_id); $$;

create function api.replace_camera_handoff_policy_v2(
  p_camera_id uuid,
  p_expected_version bigint,
  p_release_key text,
  p_area_code text,
  p_precision private.location_anchor_precision,
  p_source private.location_anchor_source,
  p_latitude numeric,
  p_longitude numeric,
  p_provider_reference text,
  p_accuracy_meters numeric,
  p_consent_version text,
  p_provenance_version text,
  p_captured_at timestamptz,
  p_allowed_weekdays smallint[],
  p_approved_times time without time zone[],
  p_enabled boolean
)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  select private.replace_camera_handoff_policy_v2(
    p_camera_id, p_expected_version, p_release_key, p_area_code, p_precision,
    p_source, p_latitude, p_longitude, p_provider_reference,
    p_accuracy_meters, p_consent_version, p_provenance_version, p_captured_at,
    p_allowed_weekdays, p_approved_times, p_enabled
  );
$$;

revoke all on function private.get_camera_handoff_policy_admin_v2(uuid) from public;
revoke all on function private.replace_camera_handoff_policy_v2(
  uuid, bigint, text, text, private.location_anchor_precision,
  private.location_anchor_source, numeric, numeric, text, numeric, text, text,
  timestamptz, smallint[], time without time zone[], boolean
) from public;
revoke all on function api.get_camera_handoff_policy_admin_v2(uuid) from public;
revoke all on function api.replace_camera_handoff_policy_v2(
  uuid, bigint, text, text, private.location_anchor_precision,
  private.location_anchor_source, numeric, numeric, text, numeric, text, text,
  timestamptz, smallint[], time without time zone[], boolean
) from public;

grant execute on function api.get_camera_handoff_policy_admin_v2(uuid) to authenticated;
grant execute on function api.replace_camera_handoff_policy_v2(
  uuid, bigint, text, text, private.location_anchor_precision,
  private.location_anchor_source, numeric, numeric, text, numeric, text, text,
  timestamptz, smallint[], time without time zone[], boolean
) to authenticated;
