create function private.assert_handoff_schedule(
  p_camera_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz,
  p_expected_policy_version bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  policy public.camera_handoff_policies%rowtype;
  pickup_local timestamp without time zone;
  return_local timestamp without time zone;
  pickup_time time without time zone;
  return_time time without time zone;
begin
  if p_camera_id is null
    or p_pickup_at is null
    or p_return_at is null
    or p_pickup_at >= p_return_at
    or p_pickup_at <= statement_timestamp()
  then
    raise exception 'handoff_invalid_period' using errcode = '22023';
  end if;

  select configured.* into policy
  from public.camera_handoff_policies as configured
  where configured.camera_id = p_camera_id
  for share;

  if not found or not policy.enabled then
    raise exception 'handoff_policy_unavailable' using errcode = '22023';
  end if;

  if policy.timezone <> 'Asia/Manila' then
    raise exception 'handoff_policy_unavailable' using errcode = '22023';
  end if;

  if p_expected_policy_version is not null
    and policy.version <> p_expected_policy_version
  then
    raise exception 'handoff_policy_stale' using errcode = '40001';
  end if;

  if p_expected_policy_version is null then
    raise exception 'handoff_policy_stale' using errcode = '40001';
  end if;

  pickup_local := p_pickup_at at time zone policy.timezone;
  return_local := p_return_at at time zone policy.timezone;
  pickup_time := pickup_local::time(0);
  return_time := return_local::time(0);

  if pickup_time <> return_time
    or extract(dow from pickup_local)::smallint <> all(policy.allowed_weekdays)
    or extract(dow from return_local)::smallint <> all(policy.allowed_weekdays)
    or not exists (
      select 1
      from public.camera_handoff_slots as slot
      where slot.camera_id = p_camera_id
        and slot.local_time = pickup_time
    )
  then
    raise exception 'handoff_slot_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.availability_blocks as block
    where block.camera_id = p_camera_id
      and block.released_at is null
      and block.period && tstzrange(p_pickup_at, p_return_at, '[)')
  ) then
    raise exception 'handoff_period_unavailable' using errcode = '23P01';
  end if;
end;
$$;

comment on function private.assert_handoff_schedule(uuid, timestamptz, timestamptz, bigint) is
  'Validates current Manila handoff policy, approved endpoint slot, and active half-open availability without exposing block identity.';

create function api.quote_booking_schedule(
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint
)
returns table (
  camera_id uuid,
  pickup_at timestamptz,
  return_at timestamptz,
  billable_days integer,
  daily_rate numeric(12,2),
  rental_amount numeric(12,2),
  security_deposit numeric(12,2),
  total_due numeric(12,2),
  currency text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pickup_at timestamptz;
  return_at timestamptz;
begin
  if p_pickup_date is null or p_return_date is null or p_handoff_time is null then
    raise exception 'handoff_invalid_period' using errcode = '22023';
  end if;

  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';

  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );

  return query
  select quoted.*
  from api.quote_booking(p_camera_id, pickup_at, return_at) as quoted;
end;
$$;

create function api.request_booking_schedule(
  p_camera_id uuid,
  p_pickup_date date,
  p_return_date date,
  p_handoff_time time without time zone,
  p_policy_version bigint,
  p_intended_use text,
  p_expected_location text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pickup_at timestamptz;
  return_at timestamptz;
begin
  if p_pickup_date is null or p_return_date is null or p_handoff_time is null then
    raise exception 'handoff_invalid_period' using errcode = '22023';
  end if;

  pickup_at := (p_pickup_date + p_handoff_time) at time zone 'Asia/Manila';
  return_at := (p_return_date + p_handoff_time) at time zone 'Asia/Manila';

  perform private.assert_handoff_schedule(
    p_camera_id, pickup_at, return_at, p_policy_version
  );

  return private.request_booking(
    p_camera_id,
    pickup_at,
    return_at,
    p_intended_use,
    p_expected_location
  );
end;
$$;

revoke all on function private.assert_handoff_schedule(uuid, timestamptz, timestamptz, bigint) from public, anon, authenticated;
revoke all on function api.quote_booking_schedule(uuid, date, date, time without time zone, bigint) from public;
revoke all on function api.request_booking_schedule(uuid, date, date, time without time zone, bigint, text, text) from public;

grant execute on function api.quote_booking_schedule(uuid, date, date, time without time zone, bigint) to anon, authenticated;
grant execute on function api.request_booking_schedule(uuid, date, date, time without time zone, bigint, text, text) to authenticated;

comment on function api.quote_booking_schedule(uuid, date, date, time without time zone, bigint) is
  'Returns authoritative pricing only after current policy, approved Manila endpoints, version, and active availability validation.';
comment on function api.request_booking_schedule(uuid, date, date, time without time zone, bigint, text, text) is
  'Creates a non-reserving FOR_REVIEW request only after revalidating the untrusted handoff schedule.';
