create table public.meetup_places (
 id uuid primary key default gen_random_uuid(), version bigint not null default 1 check(version > 0),
 name text not null check(length(btrim(name)) between 2 and 200),
 address text not null check(length(btrim(address)) between 2 and 300),
 city text not null check(length(btrim(city)) between 2 and 120),
 latitude numeric(9,6) not null check(latitude between -90 and 90),
 longitude numeric(10,6) not null check(longitude between -180 and 180),
 arrival_instructions text not null default '' check(length(arrival_instructions) <= 500),
 source text not null check(source in ('manual_pin','provider_search')),
 attribution text, archived_at timestamptz,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((source = 'manual_pin' and attribution is null) or (source = 'provider_search' and attribution = '© OpenStreetMap contributors · Powered by Geoapify'))
);
create table public.camera_meetup_places (
 camera_id uuid not null references public.cameras(id), place_id uuid not null references public.meetup_places(id),
 display_order smallint not null check(display_order between 0 and 2), primary key(camera_id,place_id), unique(camera_id,display_order)
);
create index camera_meetup_places_place_idx on public.camera_meetup_places(place_id);
alter table public.meetup_places enable row level security;
alter table public.camera_meetup_places enable row level security;
revoke all on public.meetup_places, public.camera_meetup_places from anon, authenticated;
grant select on public.meetup_places, public.camera_meetup_places to authenticated;
create policy meetup_places_admin on public.meetup_places for select to authenticated using ((select private.is_admin()));
create policy camera_meetup_places_admin on public.camera_meetup_places for select to authenticated using ((select private.is_admin()));

create function api.save_meetup_place(p_input jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare place_id uuid := coalesce(nullif(p_input->>'id','')::uuid, gen_random_uuid()); expected bigint := (p_input->>'version')::bigint;
begin
 if not private.is_admin() then raise exception 'admin authorization required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('camnook_meetup_places',0));
 if nullif(p_input->>'id','') is null then
  insert into public.meetup_places(id,name,address,city,latitude,longitude,arrival_instructions,source,attribution,created_by,updated_by)
  values(place_id,btrim(p_input->>'name'),btrim(p_input->>'address'),btrim(p_input->>'city'),(p_input->>'latitude')::numeric,(p_input->>'longitude')::numeric,coalesce(p_input->>'arrival_instructions',''),p_input->>'source',p_input->>'attribution',auth.uid(),auth.uid());
 else
  update public.meetup_places set name=btrim(p_input->>'name'), address=btrim(p_input->>'address'), city=btrim(p_input->>'city'), latitude=(p_input->>'latitude')::numeric,longitude=(p_input->>'longitude')::numeric,
  arrival_instructions=coalesce(p_input->>'arrival_instructions',''),source=p_input->>'source',attribution=p_input->>'attribution',
  version=version+1,updated_at=now(),updated_by=auth.uid()
  where id=place_id and version=expected and archived_at is null;
  if not found then raise exception 'meetup_changed'; end if;
 end if;
 return place_id;
end; $$;
create function api.archive_meetup_place(p_place_id uuid,p_version bigint) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'admin authorization required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('camnook_meetup_places',0));
 update public.meetup_places set archived_at=now(),version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_place_id and version=p_version and archived_at is null;
 if not found then raise exception 'meetup_changed'; end if;
end; $$;
create function api.assign_camera_meetup_places(p_camera_id uuid,p_place_ids uuid[]) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'admin authorization required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('camnook_meetup_places',0));
 if p_place_ids is null or cardinality(p_place_ids)>3 or not exists(select 1 from public.cameras where id=p_camera_id)
 or (select count(*) from public.meetup_places where id=any(p_place_ids) and archived_at is null) <> cardinality(p_place_ids) then raise exception 'invalid_meetup_places'; end if;
 delete from public.camera_meetup_places where camera_id=p_camera_id;
 insert into public.camera_meetup_places(camera_id,place_id,display_order) select p_camera_id,id,ordinality-1 from unnest(p_place_ids) with ordinality as choice(id,ordinality);
end; $$;
create function api.get_camera_meetup_places(p_camera_id uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'name',p.name,'address',p.address,'city',p.city,'latitude',p.latitude,'longitude',p.longitude,'arrival_instructions',p.arrival_instructions,'attribution',p.attribution) order by a.display_order),'[]'::jsonb)
 from public.meetup_places p join public.camera_meetup_places a on a.place_id=p.id join public.cameras c on c.id=a.camera_id
 where a.camera_id=p_camera_id and p.archived_at is null and c.status='published' and c.archived_at is null and auth.uid() is not null;
$$;
revoke all on function api.save_meetup_place(jsonb),api.archive_meetup_place(uuid,bigint),api.assign_camera_meetup_places(uuid,uuid[]),api.get_camera_meetup_places(uuid) from public,anon,authenticated;
grant execute on function api.save_meetup_place(jsonb),api.archive_meetup_place(uuid,bigint),api.assign_camera_meetup_places(uuid,uuid[]),api.get_camera_meetup_places(uuid) to authenticated;

alter table public.booking_meetup_plans
 alter column venue_latitude type numeric(9,6), alter column venue_longitude type numeric(10,6), alter column renter_city_label drop not null,
 add column source_place_id uuid references public.meetup_places(id), add column source_place_version bigint,
 add column arrival_instructions text;
alter table public.booking_meetup_plans
  drop constraint booking_meetup_plans_variant_check,
  add constraint booking_meetup_plans_variant_check check (
    (
      plan_kind = 'public_venue'
      and area_code is null and area_release is null and area_label is null
      and venue_name is not null and venue_address is not null
      and venue_city is not null and venue_latitude is not null
      and venue_longitude is not null and provider = 'geoapify'
      and provider_config_version is not null
      and attribution = '© OpenStreetMap contributors · Powered by Geoapify'
    )
    or
    (
      plan_kind = 'canonical_area'
      and area_code ~ '^[0-9]{10}$'
      and area_release ~ '^[0-9]{4}-q[1-4]$'
      and length(btrim(area_label)) between 1 and 160
      and venue_name is null and venue_address is null and venue_city is null
      and venue_latitude is null and venue_longitude is null and provider is null
      and provider_config_version is null and attribution is null
    )
    or
    (
      plan_kind = 'preferred_area'
      and area_code is null and area_release is null
      and length(btrim(area_label)) between 2 and 160
      and venue_name is null and venue_address is null and venue_city is null
      and venue_latitude is null and venue_longitude is null and provider is null
      and provider_config_version is null and attribution is null
    )
    or (plan_kind = 'lender_place' and source_place_id is not null and source_place_version > 0 and renter_city_label is null and venue_name is not null and venue_address is not null and venue_city is not null and venue_latitude is not null and venue_longitude is not null and provider is null and provider_config_version is null and arrival_instructions is not null and area_code is null and area_label is null and area_release is null)
  );

alter table public.booking_meetup_plans drop constraint if exists booking_meetup_plans_plan_kind_check;
alter table public.booking_meetup_plans add constraint booking_meetup_plans_plan_kind_check check(plan_kind in ('public_venue','canonical_area','preferred_area','lender_place'));
create or replace function api.request_booking_with_place_idempotent(
  p_renter_id uuid,
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint,
  p_intended_use text,
  p_expected_location text,
  p_place_id uuid,
  p_place_version bigint,
  p_operation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  booking_id uuid;
  pickup_at timestamptz;
  return_at timestamptz;
  profile_status public.account_status;
  place public.meetup_places%rowtype;
  request_fingerprint text := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'camera_id', p_camera_id,
      'expected_location', p_expected_location,
      'handoff_time', p_handoff_time,
      'intended_use', p_intended_use,
      'pickup_date', p_pickup_date,
      'policy_version', p_policy_version,
      'place_id', p_place_id, 'place_version', p_place_version,
      'return_date', p_return_date
    )::text, 'UTF8'), 'sha256'), 'hex');
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'booking_request_unauthorized' using errcode = '42501';
  end if;
  if p_renter_id is null or p_camera_id is null or p_operation_id is null
    or p_pickup_date is null or p_return_date is null or p_handoff_time is null
    or length(btrim(coalesce(p_intended_use, ''))) not between 2 and 1000
    or length(btrim(coalesce(p_expected_location, ''))) not between 2 and 500
    or p_place_id is null or p_place_version is null or p_place_version < 1
  then
    raise exception 'booking_request_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('camnook_meetup_places',0));
  select profile.account_status into profile_status
  from public.profiles as profile
  where profile.user_id = p_renter_id
  for update;
  if profile_status is null then
    raise exception 'booking_profile_required' using errcode = '42501';
  end if;
  if profile_status <> 'active' then
    raise exception 'booking_profile_suspended' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from private.renter_kyc_profiles kyc
    join private.psgc_areas area
      on area.release_key = kyc.release_key and area.code = kyc.area_code
    join private.psgc_releases release
      on release.release_key = kyc.release_key and release.active
    where kyc.user_id = p_renter_id
      and kyc.birth_date <= current_date - interval '18 years'
      and area.area_type = 'barangay' and area.active
  ) then
    raise exception 'booking_kyc_required' using errcode = '42501';
  end if;

  booking_id := private.claim_booking_request_operation(
    p_renter_id, p_operation_id, request_fingerprint
  );
  if booking_id is not null then return booking_id; end if;
  if (
    select count(*) from public.bookings as booking
    where booking.renter_id = p_renter_id and booking.state = 'FOR_REVIEW'
  ) >= 10 then
    raise exception 'booking_request_limit_reached' using errcode = 'P0001';
  end if;

  select p.* into place from public.meetup_places p join public.camera_meetup_places a on a.place_id=p.id
  where p.id=p_place_id and p.version=p_place_version and p.archived_at is null and a.camera_id=p_camera_id;
  if not found then raise exception 'meetup_changed'; end if;
  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';
  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );
  if not exists (
    select 1 from public.cameras as camera
    where camera.id = p_camera_id and camera.status = 'published'
      and camera.archived_at is null
  ) then
    raise exception 'camera is not available for requests' using errcode = '22023';
  end if;

  insert into public.bookings (
    renter_id, camera_id, pickup_at, return_at, intended_use,
    expected_location, meetup_snapshot_required
  ) values (
    p_renter_id, p_camera_id, pickup_at, return_at, btrim(p_intended_use),
    btrim(p_expected_location), true
  ) returning id into booking_id;
  insert into public.booking_meetup_plans (
    booking_id, plan_kind, venue_name,venue_address,venue_city,venue_latitude,venue_longitude,source_place_id,source_place_version,arrival_instructions,attribution
  ) values (booking_id,'lender_place',place.name,place.address,place.city,place.latitude,place.longitude,place.id,place.version,place.arrival_instructions,place.attribution);
  insert into private.booking_kyc_snapshots (
    booking_id, birth_date, address_line1, release_key, area_code
  )
  select booking_id, kyc.birth_date, kyc.address_line1, kyc.release_key, kyc.area_code
  from private.renter_kyc_profiles kyc where kyc.user_id = p_renter_id;
  insert into public.booking_state_history (
    booking_id, from_state, to_state, actor_user_id, actor_type,
    reason_code, operation_id
  ) values (
    booking_id, null, 'FOR_REVIEW', p_renter_id, 'renter',
    'booking_requested', p_operation_id
  );
  perform private.write_audit(
    p_operation_id, 'request_booking', 'booking', booking_id, 'success',
    'rental request', jsonb_build_object(
      'meetup_snapshot', true, 'meetup_plan_kind', 'lender_place'
    )
  );
  perform private.complete_booking_request_operation(
    p_renter_id, p_operation_id, booking_id
  );
  return booking_id;
end;
$$;

revoke all on function api.request_booking_with_place_idempotent(uuid,uuid,date,date,time,bigint,text,text,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function api.request_booking_with_place_idempotent(uuid,uuid,date,date,time,bigint,text,text,uuid,bigint,uuid) to service_role;
create or replace function private.attach_meetup_contract_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required boolean;
  kyc_required boolean;
  plan public.booking_meetup_plans%rowtype;
  meetup_json jsonb;
  kyc_json jsonb;
  address_json jsonb;
  snapshot_changed boolean := false;
begin
  select booking.meetup_snapshot_required into required
  from public.bookings as booking where booking.id = new.booking_id;
  kyc_required := exists (
    select 1 from private.booking_kyc_snapshots stored_kyc
    where stored_kyc.booking_id = new.booking_id
  );
  select * into plan from public.booking_meetup_plans as stored
  where stored.booking_id = new.booking_id;
  if required and not found then
    raise exception 'approval_meetup_snapshot_missing' using errcode = '23514';
  end if;

  if kyc_required then
    select jsonb_strip_nulls(jsonb_build_object(
      'line1', btrim(kyc.address_line1),
      'format_version', kyc.address_format_version,
      'house_number', kyc.house_number,
      'street_name', kyc.street_name,
      'building', kyc.building,
      'address_details', kyc.address_details,
      'postal_code', kyc.postal_code,
      'area_code', kyc.area_code,
      'area_release', kyc.release_key,
      'path', (
        with recursive chain as (
          select current_area.*, 0 depth
          from private.psgc_areas current_area
          where current_area.release_key = kyc.release_key
            and current_area.code = kyc.area_code
          union all
          select parent.*, child.depth + 1
          from chain child join private.psgc_areas parent
            on parent.release_key = child.release_key
            and parent.code = child.parent_code
        )
        select jsonb_agg(
          jsonb_build_object('name', name, 'type', area_type) order by depth desc
        ) from chain
      )
    )) into address_json
    from private.booking_kyc_snapshots kyc where kyc.booking_id = new.booking_id;
    if address_json is null then
      raise exception 'approval_kyc_snapshot_missing' using errcode = '23514';
    end if;
    select jsonb_build_object(
      'birth_date', kyc.birth_date, 'address', address_json
    ) into kyc_json
    from private.booking_kyc_snapshots kyc where kyc.booking_id = new.booking_id;
    new.snapshot := jsonb_set(
      new.snapshot, '{renter}', (new.snapshot -> 'renter') || kyc_json, true
    );
    new.snapshot_schema_version := greatest(new.snapshot_schema_version, 6);
    snapshot_changed := true;
  end if;

  if plan.booking_id is not null then
    meetup_json := jsonb_build_object('renter_city', plan.renter_city_label);
    if plan.plan_kind = 'lender_place' then
      meetup_json := jsonb_build_object('kind','lender_place','venue_name',plan.venue_name,'venue_address',plan.venue_address,'venue_city',plan.venue_city,'venue_latitude',plan.venue_latitude,'venue_longitude',plan.venue_longitude,'arrival_instructions',plan.arrival_instructions,'source_place_id',plan.source_place_id,'source_place_version',plan.source_place_version,'attribution',plan.attribution);
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 5);
    elsif plan.plan_kind = 'public_venue' then
      meetup_json := meetup_json || jsonb_build_object(
        'venue_name', plan.venue_name, 'venue_address', plan.venue_address,
        'venue_city', plan.venue_city, 'venue_latitude', plan.venue_latitude,
        'venue_longitude', plan.venue_longitude, 'provider', plan.provider,
        'provider_config_version', plan.provider_config_version,
        'attribution', plan.attribution
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 2);
    elsif plan.plan_kind = 'canonical_area' then
      meetup_json := meetup_json || jsonb_build_object(
        'kind', 'canonical_area', 'area_code', plan.area_code,
        'area_release', plan.area_release, 'area_label', plan.area_label,
        'venue_status', 'pending_owner_confirmation'
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 3);
    else
      meetup_json := meetup_json || jsonb_build_object(
        'kind', 'preferred_area', 'area_label', plan.area_label,
        'venue_status', 'pending_owner_confirmation'
      );
      new.snapshot_schema_version := greatest(new.snapshot_schema_version, 4);
    end if;
    new.snapshot := new.snapshot || jsonb_build_object('meetup', meetup_json);
    snapshot_changed := true;
  end if;
  if snapshot_changed then
    new.content_sha256 := extensions.digest(
      convert_to(new.snapshot::text, 'UTF8'), 'sha256'
    );
  end if;
  return new;
end;
$$;
CREATE OR REPLACE FUNCTION private.get_my_booking_detail_context(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  camera_json jsonb;
  meetup_json jsonb;
  versions_json jsonb;
begin
  select * into booking
  from public.bookings
  where id = p_booking_id
    and renter_id = caller;

  if booking.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'name', camera.name,
    'slug', camera.slug
  ) into camera_json
  from public.cameras as camera
  where camera.id = booking.camera_id
    and camera.status = 'published';

  select jsonb_build_object(
    'booking_id', plan.booking_id,
    'renter_city_label', plan.renter_city_label,
    'venue_name', plan.venue_name,
    'venue_address', plan.venue_address,
    'venue_city', plan.venue_city,
    'venue_latitude', plan.venue_latitude,
    'plan_kind', plan.plan_kind,'source_place_id',plan.source_place_id,'source_place_version',plan.source_place_version,'arrival_instructions',plan.arrival_instructions,'venue_longitude', plan.venue_longitude,
    'provider', plan.provider,
    'provider_config_version', plan.provider_config_version,
    'attribution', plan.attribution,
    'created_at', plan.created_at
  ) into meetup_json
  from public.booking_meetup_plans as plan
  where plan.booking_id = booking.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', version.booking_id,
    'id', version.id,
    'issued_at', version.issued_at,
    'snapshot', version.snapshot,
    'status', version.status,
    'supersedes_id', version.supersedes_id,
    'version_no', version.version_no,
    'signature', case when signature.id is null then null else
      jsonb_build_object(
        'id', signature.id,
        'signed_at', signature.signed_at
      )
    end
  ) order by version.version_no), '[]'::jsonb)
  into versions_json
  from public.contract_versions as version
  left join public.contract_signatures as signature
    on signature.contract_version_id = version.id
    and signature.renter_id = caller
  where version.booking_id = booking.id;

  return jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking.id,
      'camera_id', booking.camera_id,
      'state', booking.state,
      'pickup_at', booking.pickup_at,
      'return_at', booking.return_at,
      'intended_use', booking.intended_use,
      'expected_location', booking.expected_location,
      'requested_at', booking.requested_at,
      'approved_at', booking.approved_at,
      'approval_deadline_at', booking.approval_deadline_at,
      'billable_days_snapshot', booking.billable_days_snapshot,
      'daily_rate_snapshot', booking.daily_rate_snapshot,
      'rental_amount', booking.rental_amount,
      'security_deposit_amount', booking.security_deposit_amount,
      'total_due', booking.total_due,
      'currency', booking.currency,
      'current_contract_version_id', booking.current_contract_version_id,
      'meetup_snapshot_required', booking.meetup_snapshot_required
    ),
    'camera', camera_json,
    'meetup', meetup_json,
    'versions', versions_json,
    'payment', private.get_my_payment_state(booking.id),
    'pickup', private.get_my_pickup_state(booking.id),
    'resolution', private.get_my_resolution_state(booking.id)
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION private.get_admin_booking_detail_snapshot(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  booking public.bookings%rowtype;
  quote_json jsonb;
begin
  perform private.require_admin();

  select * into booking
  from public.bookings
  where id = p_booking_id;

  if booking.id is null then
    raise exception 'admin_booking_not_found' using errcode = 'P0002';
  end if;

  if booking.state = 'FOR_REVIEW' then
    begin
      select to_jsonb(quoted)
      into quote_json
      from api.quote_booking(
        booking.camera_id,
        booking.pickup_at,
        booking.return_at
      ) as quoted;
    exception
      when invalid_parameter_value then
        quote_json := null;
    end;
  end if;

  return jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking.id,
      'renter_id', booking.renter_id,
      'camera_id', booking.camera_id,
      'state', booking.state,
      'pickup_at', booking.pickup_at,
      'return_at', booking.return_at,
      'intended_use', booking.intended_use,
      'expected_location', booking.expected_location,
      'requested_at', booking.requested_at,
      'approved_at', booking.approved_at,
      'approval_deadline_at', booking.approval_deadline_at,
      'billable_days_snapshot', booking.billable_days_snapshot,
      'daily_rate_snapshot', booking.daily_rate_snapshot,
      'rental_amount', booking.rental_amount,
      'security_deposit_amount', booking.security_deposit_amount,
      'total_due', booking.total_due,
      'currency', booking.currency,
      'current_contract_version_id', booking.current_contract_version_id,
      'meetup_snapshot_required', booking.meetup_snapshot_required
    ),
    'profile', (
      select jsonb_build_object(
        'legal_name', profile.legal_name,
        'phone', profile.phone,
        'account_status', profile.account_status
      )
      from public.profiles as profile
      where profile.user_id = booking.renter_id
    ),
    'camera', (
      select jsonb_build_object(
        'id', camera.id,
        'slug', camera.slug,
        'name', camera.name,
        'status', camera.status,
        'published_at', camera.published_at,
        'daily_rate', camera.daily_rate,
        'security_deposit', camera.security_deposit
      )
      from public.cameras as camera
      where camera.id = booking.camera_id
    ),
    'accessories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', accessory.id,
        'name', accessory.name,
        'quantity', accessory.quantity,
        'sort_position', accessory.sort_position
      ) order by accessory.sort_position, accessory.name, accessory.id)
      from public.camera_accessories as accessory
      where accessory.camera_id = booking.camera_id
        and accessory.archived_at is null
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_at', availability.starts_at,
        'ends_at', availability.ends_at,
        'reason', availability.reason
      ) order by availability.starts_at)
      from public.public_availability as availability
      where availability.camera_id = booking.camera_id
        and availability.starts_at < booking.return_at
        and availability.ends_at > booking.pickup_at
    ), '[]'::jsonb),
    'template', (
      select jsonb_build_object(
        'id', template.id,
        'version', template.version,
        'schema_version', template.schema_version,
        'terms', template.terms,
        'approved_at', template.approved_at,
        'activated_at', template.activated_at,
        'deactivated_at', template.deactivated_at
      )
      from public.contract_templates as template
      where template.approved_at is not null
        and template.activated_at is not null
        and template.deactivated_at is null
      order by template.id
      limit 1
    ),
    'meetup', (
      select jsonb_build_object(
        'booking_id', meetup.booking_id,
        'renter_city_label', meetup.renter_city_label,
        'venue_name', meetup.venue_name,
        'venue_address', meetup.venue_address,
        'venue_city', meetup.venue_city,
        'venue_latitude', meetup.venue_latitude,
        'plan_kind', meetup.plan_kind,'source_place_id',meetup.source_place_id,'source_place_version',meetup.source_place_version,'arrival_instructions',meetup.arrival_instructions,'venue_longitude', meetup.venue_longitude,
        'provider', meetup.provider,
        'provider_config_version', meetup.provider_config_version,
        'attribution', meetup.attribution,
        'created_at', meetup.created_at
      )
      from public.booking_meetup_plans as meetup
      where meetup.booking_id = booking.id
    ),
    'contract', case
      when booking.current_contract_version_id is null then null
      else (
        select jsonb_build_object(
          'id', contract.id,
          'template_id', contract.template_id,
          'version_no', contract.version_no,
          'status', contract.status,
          'issued_at', contract.issued_at
        )
        from public.contract_versions as contract
        where contract.id = booking.current_contract_version_id
      )
    end,
    'rejection', case
      when booking.state <> 'REJECTED' then null
      else (
        select jsonb_build_object(
          'note', history.note,
          'occurred_at', history.occurred_at
        )
        from public.booking_state_history as history
        where history.booking_id = booking.id
          and history.to_state = 'REJECTED'
        order by history.occurred_at desc, history.id desc
        limit 1
      )
    end,
    'quote', quote_json
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION private.get_my_account_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := private.current_user_id();
  profile_json jsonb;
  bookings_json jsonb;
begin
  select jsonb_build_object(
    'legal_name', profile.legal_name,
    'phone', profile.phone,
    'account_status', profile.account_status
  ) into profile_json
  from public.profiles as profile
  where profile.user_id = caller;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking', jsonb_build_object(
      'id', booking.id,
      'camera_id', booking.camera_id,
      'state', booking.state,
      'pickup_at', booking.pickup_at,
      'return_at', booking.return_at,
      'intended_use', booking.intended_use,
      'expected_location', booking.expected_location,
      'requested_at', booking.requested_at,
      'approved_at', booking.approved_at,
      'approval_deadline_at', booking.approval_deadline_at,
      'billable_days_snapshot', booking.billable_days_snapshot,
      'daily_rate_snapshot', booking.daily_rate_snapshot,
      'rental_amount', booking.rental_amount,
      'security_deposit_amount', booking.security_deposit_amount,
      'total_due', booking.total_due,
      'currency', booking.currency,
      'current_contract_version_id', booking.current_contract_version_id,
      'meetup_snapshot_required', booking.meetup_snapshot_required
    ),
    'camera', case when camera.id is null then null else jsonb_build_object(
      'name', camera.name,
      'slug', camera.slug
    ) end,
    'meetup', case when plan.booking_id is null then null else jsonb_build_object(
      'booking_id', plan.booking_id,
      'renter_city_label', plan.renter_city_label,
      'venue_name', plan.venue_name,
      'venue_address', plan.venue_address,
      'venue_city', plan.venue_city,
      'venue_latitude', plan.venue_latitude,
      'plan_kind', plan.plan_kind,'source_place_id',plan.source_place_id,'source_place_version',plan.source_place_version,'arrival_instructions',plan.arrival_instructions,'venue_longitude', plan.venue_longitude,
      'provider', plan.provider,
      'provider_config_version', plan.provider_config_version,
      'attribution', plan.attribution,
      'created_at', plan.created_at
    ) end
  ) order by booking.requested_at desc, booking.id), '[]'::jsonb)
  into bookings_json
  from public.bookings as booking
  left join public.cameras as camera
    on camera.id = booking.camera_id
    and camera.status = 'published'
  left join public.booking_meetup_plans as plan
    on plan.booking_id = booking.id
  where booking.renter_id = caller;

  return jsonb_build_object(
    'profile', profile_json,
    'bookings', bookings_json
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION private.publish_camera(p_camera_id uuid, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.cameras%rowtype;
begin
  perform private.require_admin();
  perform pg_advisory_xact_lock(hashtextextended('camnook_meetup_places',0));
  if not exists(select 1 from public.camera_meetup_places a join public.meetup_places p on p.id=a.place_id where a.camera_id=p_camera_id and p.archived_at is null) then raise exception 'camera_meetup_required' using errcode='22023'; end if;

  if p_camera_id is null or p_operation_id is null then
    raise exception 'camera and operation references are required'
      using errcode = '22023';
  end if;

  select * into target
  from public.cameras
  where id = p_camera_id
  for update;

  if target.id is null then
    raise exception 'camera not found' using errcode = 'P0002';
  end if;
  if target.status not in ('draft', 'published') then
    raise exception 'only a draft camera can be published'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.camera_photos as photo
    join private.catalog_photo_publications as publication
      on publication.id = photo.id
     and publication.camera_id = photo.camera_id
     and publication.public_object_path = photo.object_path
     and publication.status = 'published'
    join storage.objects as object
      on object.bucket_id = 'camera-listings'
     and object.name = photo.object_path
    where photo.camera_id = target.id
      and photo.archived_at is null
  ) then
    raise exception 'camera publication requires an active verified listing photo'
      using errcode = '23514';
  end if;

  if target.status = 'published' then
    return jsonb_build_object(
      'id', target.id,
      'status', target.status,
      'published_at', target.published_at
    );
  end if;

  update public.cameras
  set status = 'published',
      published_at = statement_timestamp()
  where id = target.id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'publish_camera',
    'camera',
    target.id,
    'success',
    'catalog publication',
    jsonb_build_object('camera_id', target.id)
  );

  return jsonb_build_object(
    'id', target.id,
    'status', target.status,
    'published_at', target.published_at
  );
end;
$function$

;

alter table public.booking_meetup_plans add constraint booking_meetup_place_provenance_check check (
 (plan_kind = 'lender_place' and source_place_id is not null and source_place_version is not null and source_place_version > 0 and arrival_instructions is not null and length(arrival_instructions) <= 500)
 or (plan_kind <> 'lender_place' and source_place_id is null and source_place_version is null and arrival_instructions is null)
);
