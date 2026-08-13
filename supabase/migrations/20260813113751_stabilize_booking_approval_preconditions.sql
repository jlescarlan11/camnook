-- Approval must remain a future-facing transition, and its read of the
-- append-only verification decision set must be stable until commit.

alter table public.bookings
add constraint bookings_approval_precedes_pickup
check (approved_at is null or approved_at < pickup_at)
not valid;

alter table public.bookings
validate constraint bookings_approval_precedes_pickup;

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

  if target_booking.pickup_at <= approval_time
    or target_booking.pickup_at >= target_booking.return_at
  then
    raise exception 'approval_invalid_period' using errcode = '22023';
  end if;

  select * into target_profile
  from public.profiles as profile
  where profile.user_id = target_booking.renter_id
  for share;

  if not found or target_profile.account_status <> 'active' then
    raise exception 'approval_profile_inactive' using errcode = '22023';
  end if;

  -- Row locks cannot stabilize the membership of an append-only decision set.
  -- SHARE permits concurrent approvals but blocks verification INSERT/UPDATE/
  -- DELETE until this approval commits or rolls back.
  lock table public.verification_records in share mode;

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

comment on constraint bookings_approval_precedes_pickup on public.bookings is
  'An approval instant must precede the immutable rental pickup instant.';

comment on function private.approve_booking(uuid) is
  'Atomically approves one future booking while stabilizing all snapshotted preconditions.';
