-- One actor-owned default meetup origin. Ordinary account projections contain
-- canonical labels and approximation only; routing coordinates stay private.

create function private.get_my_meetup_origin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  result jsonb;
begin
  select jsonb_build_object(
    'release', anchor.release_key,
    'area_code', anchor.area_code,
    'area_name', btrim(area.name),
    'area_type', area.area_type,
    'precision', anchor.precision,
    'current', release.active,
    'active', area.active,
    'path', (
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
    )
  ) into result
  from private.location_anchors anchor
  join private.psgc_areas area
    on area.release_key = anchor.release_key and area.code = anchor.area_code
  join private.psgc_releases release on release.release_key = anchor.release_key
  where anchor.renter_id = caller and anchor.removed_at is null;
  return result;
end;
$$;

create function private.get_my_meetup_origin_for_routing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  result jsonb;
begin
  select jsonb_build_object(
    'release', anchor.release_key,
    'area_code', anchor.area_code,
    'area_name', btrim(area.name),
    'precision', anchor.precision,
    'latitude', anchor.latitude,
    'longitude', anchor.longitude,
    'current', release.active,
    'active', area.active
  ) into result
  from private.location_anchors anchor
  join private.psgc_areas area
    on area.release_key = anchor.release_key and area.code = anchor.area_code
  join private.psgc_releases release on release.release_key = anchor.release_key
  where anchor.renter_id = caller and anchor.removed_at is null;
  return result;
end;
$$;

create function private.replace_my_meetup_origin(
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
  p_captured_at timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  area private.psgc_areas%rowtype;
  anchor_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.user_id = caller and profile.account_status = 'active'
  ) then
    raise exception 'meetup_origin_profile_inactive' using errcode = '42501';
  end if;

  select candidate.* into area
  from private.psgc_areas candidate
  join private.psgc_releases release on release.release_key = candidate.release_key
  where candidate.release_key = p_release_key
    and candidate.code = p_area_code
    and candidate.active and release.active;

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
    raise exception 'meetup_origin_invalid' using errcode = '22023';
  end if;

  update private.location_anchors
  set removed_at = statement_timestamp(), updated_by = caller
  where renter_id = caller and removed_at is null;

  insert into private.location_anchors (
    renter_id, release_key, area_code, precision, source, latitude, longitude,
    provider_reference, accuracy_meters, consent_version, provenance_version,
    captured_at, updated_by
  ) values (
    caller, p_release_key, p_area_code, p_precision, p_source, p_latitude,
    p_longitude, nullif(btrim(p_provider_reference), ''), p_accuracy_meters,
    nullif(btrim(p_consent_version), ''), btrim(p_provenance_version),
    p_captured_at, caller
  ) returning id into anchor_id;

  perform private.write_audit(
    operation_id, 'replace_renter_meetup_origin', 'profile', caller, 'success',
    'renter meetup default',
    jsonb_build_object('psgc_release', p_release_key, 'area_type', area.area_type, 'precision', p_precision)
  );
  return anchor_id;
end;
$$;

create function private.remove_my_meetup_origin()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  changed boolean;
begin
  update private.location_anchors
  set removed_at = statement_timestamp(), updated_by = caller
  where renter_id = caller and removed_at is null;
  changed := found;
  if changed then
    perform private.write_audit(gen_random_uuid(), 'remove_renter_meetup_origin', 'profile', caller, 'success', 'renter meetup default', '{}'::jsonb);
  end if;
  return changed;
end;
$$;

create function api.get_my_meetup_origin()
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.get_my_meetup_origin(); $$;

create function api.get_my_meetup_origin_for_routing()
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.get_my_meetup_origin_for_routing(); $$;

create function api.replace_my_meetup_origin(
  p_release_key text, p_area_code text,
  p_precision private.location_anchor_precision,
  p_source private.location_anchor_source,
  p_latitude numeric, p_longitude numeric, p_provider_reference text,
  p_accuracy_meters numeric, p_consent_version text,
  p_provenance_version text, p_captured_at timestamptz
)
returns uuid language sql volatile security definer set search_path = ''
as $$
  select private.replace_my_meetup_origin(
    p_release_key, p_area_code, p_precision, p_source, p_latitude, p_longitude,
    p_provider_reference, p_accuracy_meters, p_consent_version,
    p_provenance_version, p_captured_at
  );
$$;

create function api.remove_my_meetup_origin()
returns boolean language sql volatile security definer set search_path = ''
as $$ select private.remove_my_meetup_origin(); $$;

revoke all on function private.get_my_meetup_origin() from public;
revoke all on function private.get_my_meetup_origin_for_routing() from public;
revoke all on function private.replace_my_meetup_origin(text, text, private.location_anchor_precision, private.location_anchor_source, numeric, numeric, text, numeric, text, text, timestamptz) from public;
revoke all on function private.remove_my_meetup_origin() from public;
revoke all on function api.get_my_meetup_origin() from public;
revoke all on function api.get_my_meetup_origin_for_routing() from public;
revoke all on function api.replace_my_meetup_origin(text, text, private.location_anchor_precision, private.location_anchor_source, numeric, numeric, text, numeric, text, text, timestamptz) from public;
revoke all on function api.remove_my_meetup_origin() from public;

grant execute on function api.get_my_meetup_origin() to authenticated;
grant execute on function api.get_my_meetup_origin_for_routing() to authenticated;
grant execute on function api.replace_my_meetup_origin(text, text, private.location_anchor_precision, private.location_anchor_source, numeric, numeric, text, numeric, text, text, timestamptz) to authenticated;
grant execute on function api.remove_my_meetup_origin() to authenticated;
