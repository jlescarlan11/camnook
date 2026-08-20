-- Per-camera lender handoff schedule and privacy-separated city anchor.
-- Existing cameras intentionally receive no inferred policy.

create table public.camera_handoff_policies (
  camera_id uuid primary key references public.cameras (id) on delete restrict,
  city_label text not null check (length(btrim(city_label)) between 2 and 120),
  allowed_weekdays smallint[] not null default '{}'::smallint[],
  timezone text not null default 'Asia/Manila' check (timezone = 'Asia/Manila'),
  enabled boolean not null default false,
  version bigint not null default 1 check (version > 0),
  check (allowed_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  check (not enabled or cardinality(allowed_weekdays) > 0)
);

create table public.camera_handoff_slots (
  camera_id uuid not null references public.camera_handoff_policies (camera_id) on delete cascade,
  local_time time without time zone not null,
  primary key (camera_id, local_time),
  check (date_part('second', local_time) = 0)
);

create table private.camera_lender_city_anchors (
  camera_id uuid primary key references public.camera_handoff_policies (camera_id) on delete cascade,
  provider_city_id text not null check (length(btrim(provider_city_id)) between 2 and 240),
  country_code text not null default 'PH' check (country_code = 'PH'),
  latitude numeric(8,5) not null check (latitude between -90 and 90),
  longitude numeric(8,5) not null check (longitude between -180 and 180),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid not null references auth.users (id) on delete restrict
);

create trigger camera_lender_city_anchors_set_updated_at
before update on private.camera_lender_city_anchors
for each row execute function private.set_updated_at();

alter table public.camera_handoff_policies enable row level security;
alter table public.camera_handoff_slots enable row level security;
alter table private.camera_lender_city_anchors enable row level security;

create policy camera_handoff_policies_select_anon
on public.camera_handoff_policies for select to anon
using (
  exists (
    select 1
    from public.cameras as camera
    where camera.id = camera_id
      and camera.status = 'published'
  )
);

create policy camera_handoff_policies_select_authenticated
on public.camera_handoff_policies for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.cameras as camera
    where camera.id = camera_id
      and camera.status = 'published'
  )
);

create policy camera_handoff_slots_select_anon
on public.camera_handoff_slots for select to anon
using (
  exists (
    select 1
    from public.cameras as camera
    where camera.id = camera_id
      and camera.status = 'published'
  )
);

create policy camera_handoff_slots_select_authenticated
on public.camera_handoff_slots for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.cameras as camera
    where camera.id = camera_id
      and camera.status = 'published'
  )
);

grant select on public.camera_handoff_policies to anon, authenticated;
grant select on public.camera_handoff_slots to anon, authenticated;

create view public.public_camera_handoff_policies
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
  policy.version
from public.camera_handoff_policies as policy
left join public.camera_handoff_slots as slot on slot.camera_id = policy.camera_id
group by
  policy.camera_id,
  policy.city_label,
  policy.allowed_weekdays,
  policy.timezone,
  policy.enabled,
  policy.version;

grant select on public.public_camera_handoff_policies to anon, authenticated;

create function private.get_camera_handoff_policy_admin(p_camera_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'camera_id', camera.id,
    'camera_name', camera.name,
    'camera_status', camera.status,
    'city_label', policy.city_label,
    'provider_city_id', anchor.provider_city_id,
    'country_code', anchor.country_code,
    'latitude', anchor.latitude,
    'longitude', anchor.longitude,
    'allowed_weekdays', coalesce(to_jsonb(policy.allowed_weekdays), '[]'::jsonb),
    'approved_times', coalesce(
      (
        select jsonb_agg(to_char(slot.local_time, 'HH24:MI') order by slot.local_time)
        from public.camera_handoff_slots as slot
        where slot.camera_id = camera.id
      ),
      '[]'::jsonb
    ),
    'timezone', coalesce(policy.timezone, 'Asia/Manila'),
    'enabled', coalesce(policy.enabled, false),
    'version', coalesce(policy.version, 0)
  ) into result
  from public.cameras as camera
  left join public.camera_handoff_policies as policy on policy.camera_id = camera.id
  left join private.camera_lender_city_anchors as anchor on anchor.camera_id = camera.id
  where camera.id = p_camera_id;

  if result is null then
    raise exception 'handoff_camera_not_found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create function private.replace_camera_handoff_policy(
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
  caller uuid := private.require_admin();
  current_version bigint;
  next_version bigint;
  operation_id uuid := gen_random_uuid();
begin
  if p_camera_id is null
    or p_expected_version is null
    or p_expected_version < 0
    or length(btrim(coalesce(p_city_label, ''))) not between 2 and 120
    or length(btrim(coalesce(p_provider_city_id, ''))) not between 2 and 240
    or upper(btrim(coalesce(p_country_code, ''))) <> 'PH'
    or p_latitude is null
    or p_latitude not between -90 and 90
    or p_longitude is null
    or p_longitude not between -180 and 180
    or p_allowed_weekdays is null
    or p_approved_times is null
    or p_enabled is null
  then
    raise exception 'handoff_policy_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_allowed_weekdays) as weekday(value)
    where weekday.value not between 0 and 6
  )
    or cardinality(p_allowed_weekdays) > 7
    or cardinality(p_allowed_weekdays) <> (
      select count(distinct weekday.value)
      from unnest(p_allowed_weekdays) as weekday(value)
    )
    or cardinality(p_approved_times) > 24
    or cardinality(p_approved_times) <> (
      select count(distinct approved.value)
      from unnest(p_approved_times) as approved(value)
    )
    or exists (
      select 1
      from unnest(p_approved_times) as approved(value)
      where approved.value is null or date_part('second', approved.value) <> 0
    )
    or (p_enabled and (
      cardinality(p_allowed_weekdays) = 0
      or cardinality(p_approved_times) = 0
    ))
  then
    raise exception 'handoff_policy_invalid' using errcode = '22023';
  end if;

  perform 1
  from public.cameras as camera
  where camera.id = p_camera_id
    and camera.status <> 'archived'
  for update;

  if not found then
    raise exception 'handoff_camera_unavailable' using errcode = '22023';
  end if;

  select policy.version into current_version
  from public.camera_handoff_policies as policy
  where policy.camera_id = p_camera_id
  for update;

  if found then
    if current_version <> p_expected_version then
      raise exception 'handoff_policy_stale' using errcode = '40001';
    end if;
    next_version := current_version + 1;

    update public.camera_handoff_policies
    set city_label = btrim(p_city_label),
        allowed_weekdays = p_allowed_weekdays,
        enabled = p_enabled,
        version = next_version
    where camera_id = p_camera_id;
  else
    if p_expected_version <> 0 then
      raise exception 'handoff_policy_stale' using errcode = '40001';
    end if;
    next_version := 1;

    insert into public.camera_handoff_policies (
      camera_id,
      city_label,
      allowed_weekdays,
      enabled,
      version
    ) values (
      p_camera_id,
      btrim(p_city_label),
      p_allowed_weekdays,
      p_enabled,
      next_version
    );
  end if;

  insert into private.camera_lender_city_anchors (
    camera_id,
    provider_city_id,
    country_code,
    latitude,
    longitude,
    updated_by
  ) values (
    p_camera_id,
    btrim(p_provider_city_id),
    'PH',
    p_latitude,
    p_longitude,
    caller
  )
  on conflict (camera_id) do update
    set provider_city_id = excluded.provider_city_id,
        country_code = excluded.country_code,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        updated_by = excluded.updated_by;

  delete from public.camera_handoff_slots where camera_id = p_camera_id;

  insert into public.camera_handoff_slots (camera_id, local_time)
  select p_camera_id, approved.value
  from unnest(p_approved_times) as approved(value)
  order by approved.value;

  perform private.write_audit(
    operation_id,
    'replace_camera_handoff_policy',
    'camera',
    p_camera_id,
    'success',
    'lender handoff configuration',
    jsonb_build_object(
      'enabled', p_enabled,
      'policy_version', next_version,
      'weekday_count', cardinality(p_allowed_weekdays),
      'slot_count', cardinality(p_approved_times)
    )
  );

  return next_version;
end;
$$;

create function api.get_camera_handoff_policy_admin(p_camera_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_camera_handoff_policy_admin(p_camera_id);
$$;

create function api.replace_camera_handoff_policy(
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.replace_camera_handoff_policy(
    p_camera_id,
    p_expected_version,
    p_city_label,
    p_provider_city_id,
    p_country_code,
    p_latitude,
    p_longitude,
    p_allowed_weekdays,
    p_approved_times,
    p_enabled
  );
$$;

revoke all on function private.get_camera_handoff_policy_admin(uuid) from public;
revoke all on function private.replace_camera_handoff_policy(
  uuid, bigint, text, text, text, numeric, numeric, smallint[], time without time zone[], boolean
) from public;
revoke all on function api.get_camera_handoff_policy_admin(uuid) from public;
revoke all on function api.replace_camera_handoff_policy(
  uuid, bigint, text, text, text, numeric, numeric, smallint[], time without time zone[], boolean
) from public;

grant execute on function private.get_camera_handoff_policy_admin(uuid) to authenticated;
grant execute on function private.replace_camera_handoff_policy(
  uuid, bigint, text, text, text, numeric, numeric, smallint[], time without time zone[], boolean
) to authenticated;
grant execute on function api.get_camera_handoff_policy_admin(uuid) to authenticated;
grant execute on function api.replace_camera_handoff_policy(
  uuid, bigint, text, text, text, numeric, numeric, smallint[], time without time zone[], boolean
) to authenticated;
