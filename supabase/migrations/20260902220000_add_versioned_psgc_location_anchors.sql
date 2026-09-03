-- Versioned offline PSGC reference data and privacy-separated meetup origins.
-- The current Geoapify camera city anchors intentionally remain unchanged and
-- unresolved until an administrator deliberately upgrades each policy.

create type private.psgc_area_type as enum (
  'region', 'province', 'city', 'municipality', 'submunicipality', 'barangay'
);

create type private.location_anchor_precision as enum (
  'city_centroid', 'barangay_centroid', 'precise'
);

create type private.location_anchor_source as enum (
  'provider_centroid', 'device_gps', 'map_pin'
);

create table private.psgc_releases (
  release_key text primary key check (release_key ~ '^[0-9]{4}-q[1-4]$'),
  source_title text not null check (length(btrim(source_title)) between 10 and 240),
  source_url text not null check (source_url ~ '^https://psa\.gov\.ph/'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  effective_on date not null,
  imported_at timestamptz not null default statement_timestamp(),
  activated_at timestamptz,
  active boolean not null default false,
  expected_region_count integer not null check (expected_region_count > 0),
  expected_province_count integer not null check (expected_province_count >= 0),
  expected_locality_count integer not null check (expected_locality_count > 0),
  expected_submunicipality_count integer not null check (expected_submunicipality_count >= 0),
  expected_barangay_count integer not null check (expected_barangay_count > 0),
  check ((active and activated_at is not null) or not active)
);

create unique index psgc_one_active_release_idx
on private.psgc_releases ((active)) where active;

create table private.psgc_areas (
  release_key text not null references private.psgc_releases (release_key) on delete restrict,
  code text not null check (code ~ '^[0-9]{10}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  area_type private.psgc_area_type not null,
  parent_code text,
  city_class text check (city_class is null or city_class in ('CC', 'HUC', 'ICC')),
  active boolean not null default true,
  valid_from date not null,
  valid_until date,
  centroid_latitude numeric(8,5) check (centroid_latitude between 4 and 22),
  centroid_longitude numeric(8,5) check (centroid_longitude between 116 and 127),
  primary key (release_key, code),
  foreign key (release_key, parent_code)
    references private.psgc_areas (release_key, code)
    deferrable initially deferred,
  check ((parent_code is null) = (area_type = 'region')),
  check ((centroid_latitude is null) = (centroid_longitude is null)),
  check (valid_until is null or valid_until >= valid_from),
  check ((area_type = 'city') = (city_class is not null))
);

create index psgc_areas_parent_idx
on private.psgc_areas (release_key, parent_code, area_type, name, code);

create table private.psgc_supersessions (
  from_release_key text not null,
  from_code text not null,
  to_release_key text not null,
  to_code text not null,
  reason text not null check (length(btrim(reason)) between 3 and 240),
  primary key (from_release_key, from_code, to_release_key, to_code),
  foreign key (from_release_key, from_code)
    references private.psgc_areas (release_key, code) on delete restrict,
  foreign key (to_release_key, to_code)
    references private.psgc_areas (release_key, code) on delete restrict
);

create table private.location_anchors (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid references public.cameras (id) on delete cascade,
  renter_id uuid references auth.users (id) on delete cascade,
  release_key text not null,
  area_code text not null,
  precision private.location_anchor_precision not null,
  source private.location_anchor_source not null,
  latitude numeric(8,5) not null check (latitude between 4 and 22),
  longitude numeric(8,5) not null check (longitude between 116 and 127),
  provider_reference text check (
    provider_reference is null
    or length(btrim(provider_reference)) between 2 and 240
  ),
  accuracy_meters numeric(10,2) check (accuracy_meters > 0 and accuracy_meters <= 50000),
  consent_version text check (
    consent_version is null or length(btrim(consent_version)) between 3 and 80
  ),
  provenance_version text not null check (length(btrim(provenance_version)) between 3 and 80),
  captured_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  removed_at timestamptz,
  updated_by uuid not null references auth.users (id) on delete restrict,
  foreign key (release_key, area_code)
    references private.psgc_areas (release_key, code) on delete restrict,
  check ((camera_id is not null)::integer + (renter_id is not null)::integer = 1),
  check (
    (precision = 'precise' and source in ('device_gps', 'map_pin') and consent_version is not null)
    or
    (precision in ('city_centroid', 'barangay_centroid') and source = 'provider_centroid' and consent_version is null)
  )
);

create unique index location_anchors_active_camera_idx
on private.location_anchors (camera_id) where camera_id is not null and removed_at is null;

create unique index location_anchors_active_renter_idx
on private.location_anchors (renter_id) where renter_id is not null and removed_at is null;

create trigger location_anchors_set_updated_at
before update on private.location_anchors
for each row execute function private.set_updated_at();

alter table private.psgc_releases enable row level security;
alter table private.psgc_areas enable row level security;
alter table private.psgc_supersessions enable row level security;
alter table private.location_anchors enable row level security;

create function private.validate_psgc_release(p_release_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  release private.psgc_releases%rowtype;
begin
  select * into release
  from private.psgc_releases
  where release_key = p_release_key;

  if not found then
    raise exception 'psgc_release_unknown' using errcode = '22023';
  end if;

  if (select count(*) from private.psgc_areas where release_key = p_release_key and area_type = 'region') <> release.expected_region_count
    or (select count(*) from private.psgc_areas where release_key = p_release_key and area_type = 'province') <> release.expected_province_count
    or (select count(*) from private.psgc_areas where release_key = p_release_key and area_type in ('city', 'municipality')) <> release.expected_locality_count
    or (select count(*) from private.psgc_areas where release_key = p_release_key and area_type = 'submunicipality') <> release.expected_submunicipality_count
    or (select count(*) from private.psgc_areas where release_key = p_release_key and area_type = 'barangay') <> release.expected_barangay_count
  then
    raise exception 'psgc_release_incomplete' using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.psgc_areas child
    left join private.psgc_areas parent
      on parent.release_key = child.release_key and parent.code = child.parent_code
    where child.release_key = p_release_key
      and child.area_type <> 'region'
      and (
        parent.code is null or not parent.active
        or (child.area_type = 'province' and parent.area_type <> 'region')
        or (child.area_type = 'city' and child.city_class in ('HUC', 'ICC') and parent.area_type <> 'region')
        or (child.area_type = 'city' and child.city_class = 'CC' and parent.area_type <> 'province')
        or (child.area_type = 'municipality' and parent.area_type not in ('region', 'province'))
        or (child.area_type = 'submunicipality' and parent.area_type <> 'city')
        or (child.area_type = 'barangay' and parent.area_type not in ('city', 'municipality', 'submunicipality'))
      )
  ) then
    raise exception 'psgc_hierarchy_invalid' using errcode = '23514';
  end if;
end;
$$;

create function private.activate_psgc_release(p_release_key text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'psgc_refresh_forbidden' using errcode = '42501';
  end if;

  perform private.validate_psgc_release(p_release_key);

  update private.psgc_releases
  set active = false
  where active and release_key <> p_release_key;

  update private.psgc_releases
  set active = true, activated_at = statement_timestamp()
  where release_key = p_release_key;

  if not found then
    raise exception 'psgc_release_unknown' using errcode = '22023';
  end if;
end;
$$;

create function private.list_psgc_area_choices(p_parent_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  active_release text;
  result jsonb;
begin
  select release_key into active_release from private.psgc_releases where active;
  if active_release is null then
    raise exception 'psgc_reference_unavailable' using errcode = '55000';
  end if;

  if p_parent_code is not null and not exists (
    select 1 from private.psgc_areas
    where release_key = active_release and code = p_parent_code and active
  ) then
    raise exception 'psgc_parent_invalid' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', area.code,
    'name', btrim(area.name),
    'type', area.area_type,
    'city_class', area.city_class,
    'has_children', exists (
      select 1 from private.psgc_areas child
      where child.release_key = area.release_key and child.parent_code = area.code and child.active
    )
  ) order by area.name, area.code), '[]'::jsonb) into result
  from private.psgc_areas area
  where area.release_key = active_release
    and area.active
    and area.parent_code is not distinct from p_parent_code;

  return jsonb_build_object('release', active_release, 'choices', result);
end;
$$;

create function private.resolve_psgc_area(p_release_key text, p_area_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.current_user_id();

  with recursive chain as (
    select area.*, 0 depth
    from private.psgc_areas area
    where area.release_key = p_release_key and area.code = p_area_code
    union all
    select parent.*, child.depth + 1
    from chain child
    join private.psgc_areas parent
      on parent.release_key = child.release_key and parent.code = child.parent_code
  )
  select jsonb_build_object(
    'release', p_release_key,
    'code', target.code,
    'name', btrim(target.name),
    'type', target.area_type,
    'active', target.active,
    'current', release.active,
    'city_class', target.city_class,
    'path', (select jsonb_agg(jsonb_build_object('code', code, 'name', btrim(name), 'type', area_type) order by depth desc) from chain)
  ) into result
  from private.psgc_areas target
  join private.psgc_releases release on release.release_key = target.release_key
  where target.release_key = p_release_key and target.code = p_area_code;

  if result is null then
    raise exception 'psgc_area_unknown' using errcode = '22023';
  end if;
  return result;
end;
$$;

create function api.list_psgc_area_choices(p_parent_code text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.list_psgc_area_choices(p_parent_code); $$;

create function api.resolve_psgc_area(p_release_key text, p_area_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.resolve_psgc_area(p_release_key, p_area_code); $$;

revoke all on table private.psgc_releases, private.psgc_areas,
  private.psgc_supersessions, private.location_anchors from public, anon, authenticated;
revoke all on function private.validate_psgc_release(text) from public;
revoke all on function private.activate_psgc_release(text) from public;
revoke all on function private.list_psgc_area_choices(text) from public;
revoke all on function private.resolve_psgc_area(text, text) from public;
revoke all on function api.list_psgc_area_choices(text) from public;
revoke all on function api.resolve_psgc_area(text, text) from public;

grant execute on function private.activate_psgc_release(text) to service_role;
grant execute on function api.list_psgc_area_choices(text) to authenticated;
grant execute on function api.resolve_psgc_area(text, text) to authenticated;
