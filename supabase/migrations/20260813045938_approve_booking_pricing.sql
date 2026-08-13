-- Approve OD-01: one billable day is one started 24-hour period.
-- Pricing and approval remain database-authoritative and fail closed.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_extension as extension
    join pg_namespace as namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'pgcrypto'
      and namespace.nspname = 'extensions'
  ) then
    raise exception 'pgcrypto must be installed in the extensions schema';
  end if;
end;
$$;

create function private.calculate_booking_price(
  p_pickup_at timestamptz,
  p_return_at timestamptz,
  p_daily_rate numeric,
  p_security_deposit numeric
)
returns table (
  billable_days integer,
  daily_rate numeric(12,2),
  rental_amount numeric(12,2),
  security_deposit numeric(12,2),
  total_due numeric(12,2),
  currency text
)
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  calculated_days numeric;
  calculated_rental numeric;
  calculated_total numeric;
  maximum_money constant numeric := 9999999999.99;
begin
  if p_pickup_at is null
    or p_return_at is null
    or p_pickup_at >= p_return_at
  then
    raise exception 'quote_invalid_period' using errcode = '22023';
  end if;

  if p_daily_rate is null
    or p_security_deposit is null
    or p_daily_rate < 0
    or p_security_deposit < 0
    or p_daily_rate > maximum_money
    or p_security_deposit > maximum_money
    or p_daily_rate <> round(p_daily_rate, 2)
    or p_security_deposit <> round(p_security_deposit, 2)
  then
    raise exception 'quote_invalid_pricing_input' using errcode = '22023';
  end if;

  calculated_days := ceil(
    extract(epoch from (p_return_at - p_pickup_at)) / 86400::numeric
  );

  if calculated_days < 1 or calculated_days > 2147483647 then
    raise exception 'quote_duration_unrepresentable' using errcode = '22023';
  end if;

  calculated_rental := p_daily_rate * calculated_days;
  calculated_total := calculated_rental + p_security_deposit;

  if calculated_rental > maximum_money or calculated_total > maximum_money then
    raise exception 'quote_amount_unrepresentable' using errcode = '22023';
  end if;

  return query
  select
    calculated_days::integer,
    p_daily_rate::numeric(12,2),
    calculated_rental::numeric(12,2),
    p_security_deposit::numeric(12,2),
    calculated_total::numeric(12,2),
    'PHP'::text;
end;
$$;

alter table public.bookings
add column billable_days_snapshot integer;

do $$
declare
  historical_booking record;
  historical_price record;
begin
  for historical_booking in
    select
      id,
      pickup_at,
      return_at,
      daily_rate_snapshot,
      rental_amount,
      security_deposit_amount
    from public.bookings
    where approved_at is not null
    order by id
    for update
  loop
    begin
      select * into historical_price
      from private.calculate_booking_price(
        historical_booking.pickup_at,
        historical_booking.return_at,
        historical_booking.daily_rate_snapshot,
        historical_booking.security_deposit_amount
      );
    exception
      when sqlstate '22023' then
        raise exception 'approval_historical_price_inconsistent'
          using errcode = '23514';
    end;

    if historical_price.rental_amount is distinct from historical_booking.rental_amount then
      raise exception 'approval_historical_price_inconsistent'
        using errcode = '23514';
    end if;

    update public.bookings
    set billable_days_snapshot = historical_price.billable_days
    where id = historical_booking.id;
  end loop;
end;
$$;

alter table public.bookings
add constraint bookings_billable_days_approval_consistency
check (
  (
    approved_at is null
    and billable_days_snapshot is null
  )
  or (
    approved_at is not null
    and billable_days_snapshot > 0
    and rental_amount = daily_rate_snapshot * billable_days_snapshot
  )
);

create or replace function private.protect_approved_booking_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.approved_at is not null and (
    old.camera_id is distinct from new.camera_id
    or old.pickup_at is distinct from new.pickup_at
    or old.return_at is distinct from new.return_at
    or old.intended_use is distinct from new.intended_use
    or old.expected_location is distinct from new.expected_location
    or old.requested_at is distinct from new.requested_at
    or old.approved_at is distinct from new.approved_at
    or old.approval_deadline_at is distinct from new.approval_deadline_at
    or old.approved_by is distinct from new.approved_by
    or old.billable_days_snapshot is distinct from new.billable_days_snapshot
    or old.daily_rate_snapshot is distinct from new.daily_rate_snapshot
    or old.rental_amount is distinct from new.rental_amount
    or old.security_deposit_amount is distinct from new.security_deposit_amount
    or old.currency is distinct from new.currency
  ) then
    raise exception 'approved booking facts and deadline are immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create function api.quote_booking(
  p_camera_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz
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
stable
security invoker
set search_path = ''
as $$
declare
  current_daily_rate numeric(12,2);
  current_security_deposit numeric(12,2);
begin
  if p_pickup_at is null
    or p_return_at is null
    or p_pickup_at >= p_return_at
    or p_pickup_at <= statement_timestamp()
  then
    raise exception 'quote_invalid_period' using errcode = '22023';
  end if;

  if p_camera_id is null then
    raise exception 'quote_camera_unavailable' using errcode = '22023';
  end if;

  select camera.daily_rate, camera.security_deposit
    into current_daily_rate, current_security_deposit
  from public.cameras as camera
  where camera.id = p_camera_id
    and camera.status = 'published';

  if not found then
    raise exception 'quote_camera_unavailable' using errcode = '22023';
  end if;

  return query
  select
    p_camera_id,
    p_pickup_at,
    p_return_at,
    price.billable_days,
    price.daily_rate,
    price.rental_amount,
    price.security_deposit,
    price.total_due,
    price.currency
  from private.calculate_booking_price(
    p_pickup_at,
    p_return_at,
    current_daily_rate,
    current_security_deposit
  ) as price;
end;
$$;

create or replace function private.approve_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_booking public.bookings%rowtype;
  target_profile public.profiles%rowtype;
  target_verification public.verification_records%rowtype;
  target_camera public.cameras%rowtype;
  target_template public.contract_templates%rowtype;
  accessory record;
  accessories jsonb := '[]'::jsonb;
  price record;
  approval_time timestamptz := statement_timestamp();
  contract_snapshot jsonb;
  contract_version_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  if caller is null or not private.is_admin() then
    raise exception 'approval_unauthorized' using errcode = '42501';
  end if;

  select * into target_booking
  from public.bookings as booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception 'approval_booking_not_found' using errcode = 'P0002';
  end if;

  if target_booking.state <> 'FOR_REVIEW' then
    raise exception 'approval_stale_booking_state' using errcode = '40001';
  end if;

  select * into target_profile
  from public.profiles as profile
  where profile.user_id = target_booking.renter_id
  for share;

  if not found or target_profile.account_status <> 'active' then
    raise exception 'approval_profile_inactive' using errcode = '22023';
  end if;

  select * into target_verification
  from public.verification_records as verification
  where verification.user_id = target_booking.renter_id
  order by verification.submitted_at desc, verification.id desc
  limit 1
  for share;

  if not found
    or target_verification.status <> 'verified'
    or target_verification.document_expiration_date
      < (approval_time at time zone 'Asia/Manila')::date
  then
    raise exception 'approval_verification_invalid' using errcode = '22023';
  end if;

  select * into target_camera
  from public.cameras as camera
  where camera.id = target_booking.camera_id
  for share;

  if not found
    or target_camera.status <> 'published'
    or target_camera.archived_at is not null
    or target_camera.daily_rate is null
    or target_camera.security_deposit is null
  then
    raise exception 'approval_camera_unavailable' using errcode = '22023';
  end if;

  lock table public.camera_accessories in share mode;

  for accessory in
    select inclusion.id, inclusion.name, inclusion.quantity
    from public.camera_accessories as inclusion
    where inclusion.camera_id = target_booking.camera_id
      and inclusion.archived_at is null
    order by inclusion.sort_position, inclusion.name, inclusion.id
    for share
  loop
    accessories := accessories || jsonb_build_array(
      jsonb_build_object(
        'id', accessory.id,
        'name', accessory.name,
        'quantity', accessory.quantity
      )
    );
  end loop;

  select * into target_template
  from public.contract_templates as template
  where template.approved_at is not null
    and template.activated_at is not null
    and template.deactivated_at is null
  order by template.id
  limit 1
  for share;

  if not found then
    raise exception 'approval_template_unavailable' using errcode = '22023';
  end if;

  if jsonb_typeof(target_template.terms) <> 'object'
    or not (target_template.terms ?& array[
      'pickup',
      'return',
      'cancellation',
      'late-return',
      'damage',
      'loss',
      'non-transferability'
    ])
  then
    raise exception 'approval_template_invalid' using errcode = '22023';
  end if;

  if target_booking.pickup_at >= target_booking.return_at then
    raise exception 'approval_invalid_period' using errcode = '22023';
  end if;

  begin
    select * into price
    from private.calculate_booking_price(
      target_booking.pickup_at,
      target_booking.return_at,
      target_camera.daily_rate,
      target_camera.security_deposit
    );
  exception
    when sqlstate '22023' then
      raise exception 'approval_price_unrepresentable' using errcode = '22023';
  end;

  contract_snapshot := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', target_booking.id,
      'pickup_at', to_char(
        target_booking.pickup_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'return_at', to_char(
        target_booking.return_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'intended_use', target_booking.intended_use,
      'expected_location', target_booking.expected_location
    ),
    'renter', jsonb_build_object(
      'legal_name', target_profile.legal_name,
      'phone', target_profile.phone
    ),
    'camera', jsonb_build_object(
      'id', target_camera.id,
      'name', target_camera.name,
      'serial_number', target_camera.serial_number,
      'accessories', accessories
    ),
    'pricing', jsonb_build_object(
      'billable_days', price.billable_days,
      'daily_rate', price.daily_rate,
      'rental_amount', price.rental_amount,
      'security_deposit', price.security_deposit,
      'total_due', price.total_due,
      'currency', price.currency
    ),
    'template', jsonb_build_object(
      'id', target_template.id,
      'version', target_template.version,
      'schema_version', target_template.schema_version,
      'content_sha256', encode(target_template.content_sha256, 'hex'),
      'terms', target_template.terms
    )
  );

  begin
    update public.bookings
    set approved_at = approval_time,
        approval_deadline_at = approval_time + interval '24 hours',
        approved_by = caller,
        billable_days_snapshot = price.billable_days,
        daily_rate_snapshot = price.daily_rate,
        rental_amount = price.rental_amount,
        security_deposit_amount = price.security_deposit,
        currency = price.currency
    where id = target_booking.id;

    insert into public.contract_versions (
      booking_id,
      version_no,
      status,
      template_id,
      snapshot,
      snapshot_schema_version,
      content_sha256,
      issued_at,
      issued_by
    ) values (
      target_booking.id,
      1,
      'issued',
      target_template.id,
      contract_snapshot,
      1,
      extensions.digest(convert_to(contract_snapshot::text, 'UTF8'), 'sha256'),
      approval_time,
      caller
    ) returning id into contract_version_id;

    update public.bookings
    set current_contract_version_id = contract_version_id
    where id = target_booking.id;

    insert into public.availability_blocks (
      camera_id,
      booking_id,
      kind,
      starts_at,
      ends_at,
      created_by,
      reason
    ) values (
      target_booking.camera_id,
      target_booking.id,
      'booking',
      target_booking.pickup_at,
      target_booking.return_at,
      caller,
      'approved_booking'
    );

    perform private.transition_booking(
      target_booking.id,
      'FOR_REVIEW',
      'CONTRACT_PENDING',
      'admin',
      'booking_approved',
      null,
      operation_id
    );

    perform private.write_audit(
      operation_id,
      'approve_booking',
      'booking',
      target_booking.id,
      'success',
      'booking review',
      jsonb_build_object(
        'billable_days', price.billable_days,
        'contract_version_id', contract_version_id
      )
    );
  exception
    when exclusion_violation then
      raise exception 'approval_overlap' using errcode = '23P01';
  end;
end;
$$;

revoke all on function private.calculate_booking_price(
  timestamptz,
  timestamptz,
  numeric,
  numeric
) from public, anon, authenticated;
revoke all on function api.quote_booking(
  uuid,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant usage on schema api to anon;
grant usage on schema private to anon;

grant execute on function private.calculate_booking_price(
  timestamptz,
  timestamptz,
  numeric,
  numeric
) to anon, authenticated;
grant execute on function api.quote_booking(
  uuid,
  timestamptz,
  timestamptz
) to anon, authenticated;

comment on function private.calculate_booking_price(
  timestamptz,
  timestamptz,
  numeric,
  numeric
) is
  'Pure authoritative started-24-hour PHP pricing calculation.';

comment on function api.quote_booking(uuid, timestamptz, timestamptz) is
  'Returns a read-only sanitized estimate for one published camera and future rental period.';
