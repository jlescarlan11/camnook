-- CamNook no longer collects government-ID evidence online. Booking approval
-- uses the active account, inventory, pricing, and contract preconditions. The
-- named renter must still present an original government ID at pickup, where an
-- administrator records only the fact that it was checked and matched. No ID
-- number, copy, type, or expiry is retained by this replacement control.

update private.verification_evidence_policies
set enabled = false,
    activated_at = null
where singleton;

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
        'contract_version_id', contract_version_id,
        'identity_check', 'required_in_person_at_pickup'
      )
    );
  exception
    when exclusion_violation then
      raise exception 'approval_overlap' using errcode = '23P01';
  end;
end;
$$;

comment on function private.approve_booking(uuid) is
  'Atomically approves a future booking without online KYC; original ID is checked in person at pickup.';

create or replace function private.pickup_eligibility(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  profile public.profiles%rowtype;
  version public.contract_versions%rowtype;
  camera public.cameras%rowtype;
  booking_confirmed boolean := false;
  profile_active boolean := false;
  contract_current_signed boolean := false;
  payment_verified boolean := false;
begin
  select * into booking
  from public.bookings
  where id = p_booking_id;

  if booking.id is null then
    return jsonb_build_object(
      'eligible', false,
      'booking_confirmed', false,
      'profile_active', false,
      'contract_current_signed', false,
      'payment_verified', false,
      'in_person_identity_check_required', true
    );
  end if;

  booking_confirmed := booking.state = 'CONFIRMED';

  select * into profile
  from public.profiles
  where user_id = booking.renter_id;
  profile_active := profile.user_id is not null
    and profile.account_status = 'active';

  select * into version
  from public.contract_versions
  where id = booking.current_contract_version_id
    and booking_id = booking.id;

  select * into camera
  from public.cameras
  where id = booking.camera_id;

  contract_current_signed := version.id is not null
    and version.status = 'issued'
    and version.snapshot #>> '{booking,id}' = booking.id::text
    and version.snapshot #>> '{renter,legal_name}' = profile.legal_name
    and version.snapshot #>> '{camera,id}' = booking.camera_id::text
    and version.snapshot #>> '{camera,serial_number}' = camera.serial_number
    and exists (
      select 1
      from public.contract_signatures as signature
      where signature.contract_version_id = version.id
        and signature.renter_id = booking.renter_id
    );

  payment_verified := exists (
    select 1
    from public.payment_transactions as payment
    join public.payment_allocations as allocation
      on allocation.transaction_id = payment.id
    where payment.booking_id = booking.id
      and payment.contract_version_id = version.id
      and payment.direction = 'incoming'
      and payment.status = 'verified'
      and payment.amount = booking.total_due
    group by payment.id, payment.amount
    having count(*) = 2
      and count(*) filter (where allocation.kind = 'rental_payment') = 1
      and count(*) filter (where allocation.kind = 'security_deposit') = 1
      and sum(allocation.amount) = payment.amount
  );

  return jsonb_build_object(
    'eligible', booking_confirmed
      and profile_active
      and contract_current_signed
      and payment_verified,
    'booking_confirmed', booking_confirmed,
    'profile_active', profile_active,
    'contract_current_signed', contract_current_signed,
    'payment_verified', payment_verified,
    'in_person_identity_check_required', true
  );
end;
$$;

create or replace function private.get_pickup_queue()
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_id', booking.id,
    'camera_name', camera.name,
    'renter_legal_name', profile.legal_name,
    'pickup_at', booking.pickup_at,
    'return_at', booking.return_at,
    'identity_check_mode', 'original_id_in_person_no_copy',
    'accessory_count', jsonb_array_length(version.snapshot #> '{camera,accessories}'),
    'readiness', private.pickup_eligibility(booking.id),
    'required_checks', jsonb_build_array(
      'named_renter_present',
      'original_id_checked',
      'original_id_matched',
      'camera_serial_confirmed',
      'included_accessories_confirmed',
      'condition_report_complete'
    )
  ) order by booking.pickup_at, booking.id), '[]'::jsonb)
  into result
  from public.bookings as booking
  join public.profiles as profile on profile.user_id = booking.renter_id
  join public.cameras as camera on camera.id = booking.camera_id
  join public.contract_versions as version
    on version.id = booking.current_contract_version_id
   and version.booking_id = booking.id
  where booking.state = 'CONFIRMED'
    and (private.pickup_eligibility(booking.id) ->> 'eligible')::boolean;

  return result;
end;
$$;

create or replace function private.get_pickup_detail(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  profile public.profiles%rowtype;
  version public.contract_versions%rowtype;
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  eligibility jsonb;
  photos jsonb;
begin
  perform private.require_admin();

  select * into booking from public.bookings where id = p_booking_id;
  if booking.id is null or booking.state not in ('CONFIRMED', 'ACTIVE') then
    raise exception 'pickup_booking_not_found' using errcode = 'P0002';
  end if;

  select * into profile from public.profiles where user_id = booking.renter_id;
  select * into version
  from public.contract_versions
  where id = booking.current_contract_version_id
    and booking_id = booking.id;
  select * into handoff
  from public.handoffs
  where booking_id = booking.id and type = 'pickup';
  if handoff.id is not null then
    select * into report
    from public.condition_reports
    where handoff_id = handoff.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'photo_id', photo.id,
    'media_type', photo.media_type,
    'byte_size', photo.byte_size,
    'created_at', photo.created_at
  ) order by photo.created_at, photo.id), '[]'::jsonb)
  into photos
  from public.condition_photos as photo
  where photo.condition_report_id = report.id
    and photo.finalized_at is not null
    and photo.deleted_at is null;

  eligibility := private.pickup_eligibility(booking.id);

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', booking.state,
    'renter_legal_name', profile.legal_name,
    'identity_check', jsonb_build_object(
      'mode', 'original_id_in_person_no_copy',
      'retains_id_copy', false,
      'retains_id_number', false
    ),
    'accessories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', accessory.item ->> 'id',
        'name', accessory.item ->> 'name',
        'quantity', (accessory.item ->> 'quantity')::integer
      ) order by accessory.ordinal)
      from jsonb_array_elements(
        coalesce(version.snapshot #> '{camera,accessories}', '[]'::jsonb)
      ) with ordinality as accessory(item, ordinal)
    ), '[]'::jsonb),
    'eligibility', eligibility,
    'handoff', case when handoff.id is null then null else jsonb_build_object(
      'handoff_id', handoff.id,
      'condition_report_id', report.id,
      'actual_at', handoff.actual_at,
      'named_renter_present', handoff.named_renter_present,
      'original_id_checked', handoff.original_id_checked,
      'original_id_matched', handoff.original_id_matched,
      'camera_serial_checked', handoff.camera_serial_checked,
      'accessory_checklist_completed', handoff.accessory_checklist_completed,
      'condition_summary', report.camera_condition_summary,
      'photos', photos
    ) end
  );
end;
$$;

create or replace function private.complete_pickup(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_named_renter_present boolean,
  p_original_id_checked boolean,
  p_original_id_matched boolean,
  p_camera_serial text,
  p_accessory_ids uuid[],
  p_condition_summary text,
  p_notes text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  booking public.bookings%rowtype;
  profile public.profiles%rowtype;
  version public.contract_versions%rowtype;
  camera public.cameras%rowtype;
  payment public.payment_transactions%rowtype;
  existing_handoff public.handoffs%rowtype;
  handoff_id uuid;
  report_id uuid;
  confirmed_at timestamptz;
  expected_accessories jsonb;
  recorded_accessories jsonb;
  expected_count integer;
begin
  if p_booking_id is null
    or p_actual_at is null
    or p_operation_id is null
    or p_named_renter_present is not true
    or p_original_id_checked is not true
    or p_original_id_matched is not true
    or p_camera_serial is null
    or nullif(btrim(p_camera_serial), '') is null
    or p_accessory_ids is null
    or p_condition_summary is null
    or length(btrim(p_condition_summary)) not between 2 and 2000
    or private.pickup_text_has_forbidden_characters(p_condition_summary)
    or (p_notes is not null and nullif(btrim(p_notes), '') is not null and (
      length(btrim(p_notes)) not between 1 and 2000
      or private.pickup_text_has_forbidden_characters(p_notes)
    ))
  then
    raise exception 'pickup_checklist_invalid' using errcode = '22023';
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;

  if booking.id is null then
    raise exception 'pickup_booking_not_found' using errcode = 'P0002';
  end if;

  if booking.state = 'ACTIVE' then
    select * into existing_handoff
    from public.handoffs
    where booking_id = booking.id
      and type = 'pickup'
      and operation_id = p_operation_id;
    if existing_handoff.id is not null then
      select report.id into report_id
      from public.condition_reports as report
      where report.handoff_id = existing_handoff.id;
      return jsonb_build_object(
        'booking_id', booking.id,
        'booking_state', booking.state,
        'handoff_id', existing_handoff.id,
        'condition_report_id', report_id,
        'created', false
      );
    end if;
  end if;

  if booking.state <> 'CONFIRMED' then
    raise exception 'pickup_stale_booking_state' using errcode = '40001';
  end if;

  select occurred_at into confirmed_at
  from public.booking_state_history
  where booking_id = booking.id and to_state = 'CONFIRMED'
  order by id desc
  limit 1;

  if confirmed_at is null
    or p_actual_at < confirmed_at
    or p_actual_at > clock_timestamp()
  then
    raise exception 'pickup_actual_time_invalid' using errcode = '22023';
  end if;

  select * into profile
  from public.profiles
  where user_id = booking.renter_id
  for share;

  select * into version
  from public.contract_versions
  where id = booking.current_contract_version_id
    and booking_id = booking.id
  for share;

  select * into camera
  from public.cameras
  where id = booking.camera_id
  for share;

  select candidate.* into payment
  from public.payment_transactions as candidate
  where candidate.booking_id = booking.id
    and candidate.contract_version_id = version.id
    and candidate.direction = 'incoming'
    and candidate.status = 'verified'
  order by candidate.decided_at desc, candidate.id desc
  limit 1
  for share;

  if profile.user_id is null
    or profile.account_status <> 'active'
    or version.id is null
    or version.status <> 'issued'
    or version.snapshot #>> '{booking,id}' <> booking.id::text
    or version.snapshot #>> '{renter,legal_name}' <> profile.legal_name
    or version.snapshot #>> '{camera,id}' <> camera.id::text
    or version.snapshot #>> '{camera,serial_number}' <> camera.serial_number
    or not exists (
      select 1
      from public.contract_signatures as signature
      where signature.contract_version_id = version.id
        and signature.renter_id = booking.renter_id
    )
  then
    raise exception 'pickup_renter_or_contract_invalid' using errcode = '23514';
  end if;

  if payment.id is null
    or payment.amount <> booking.total_due
    or not exists (
      select 1
      from public.payment_allocations as allocation
      where allocation.transaction_id = payment.id
      group by allocation.transaction_id
      having count(*) = 2
        and count(*) filter (where allocation.kind = 'rental_payment') = 1
        and count(*) filter (where allocation.kind = 'security_deposit') = 1
        and sum(allocation.amount) = payment.amount
    )
  then
    raise exception 'pickup_payment_invalid' using errcode = '23514';
  end if;

  if btrim(p_camera_serial) <> camera.serial_number
    or btrim(p_camera_serial) <> version.snapshot #>> '{camera,serial_number}'
  then
    raise exception 'pickup_camera_serial_mismatch' using errcode = '23514';
  end if;

  expected_accessories := coalesce(
    version.snapshot #> '{camera,accessories}',
    '[]'::jsonb
  );
  if jsonb_typeof(expected_accessories) <> 'array' then
    raise exception 'pickup_contract_accessories_invalid' using errcode = '23514';
  end if;
  expected_count := jsonb_array_length(expected_accessories);

  if cardinality(p_accessory_ids) <> expected_count
    or (select count(distinct accessory_id) from unnest(p_accessory_ids) accessory_id)
      <> cardinality(p_accessory_ids)
    or exists (select 1 from unnest(p_accessory_ids) accessory_id where accessory_id is null)
    or exists (
      select 1
      from jsonb_array_elements(expected_accessories) as expected(item)
      where not ((expected.item ->> 'id')::uuid = any(p_accessory_ids))
    )
  then
    raise exception 'pickup_accessory_checklist_incomplete' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object('confirmed', true)
    order by ordinal
  ), '[]'::jsonb)
  into recorded_accessories
  from jsonb_array_elements(expected_accessories) with ordinality
    as expected(item, ordinal);

  insert into public.handoffs (
    booking_id,
    type,
    conducted_by,
    named_renter_present,
    original_id_checked,
    original_id_matched,
    camera_serial_checked,
    accessory_checklist_completed,
    actual_at,
    notes,
    operation_id,
    contract_version_id,
    payment_transaction_id
  ) values (
    booking.id,
    'pickup',
    caller,
    p_named_renter_present,
    p_original_id_checked,
    p_original_id_matched,
    true,
    true,
    p_actual_at,
    nullif(btrim(p_notes), ''),
    p_operation_id,
    version.id,
    payment.id
  ) returning id into handoff_id;

  insert into public.condition_reports (
    handoff_id,
    camera_condition_summary,
    accessory_checklist_snapshot,
    has_damage,
    has_missing_items,
    notes,
    reported_by
  ) values (
    handoff_id,
    btrim(p_condition_summary),
    recorded_accessories,
    false,
    false,
    nullif(btrim(p_notes), ''),
    caller
  ) returning id into report_id;

  perform private.transition_booking(
    booking.id,
    'CONFIRMED',
    'ACTIVE',
    'admin',
    'pickup_completed',
    null,
    p_operation_id
  );

  perform private.write_audit(
    p_operation_id,
    'complete_pickup',
    'booking',
    booking.id,
    'success',
    'physical handoff',
    jsonb_build_object(
      'handoff_id', handoff_id,
      'condition_report_id', report_id,
      'identity_check', 'original_id_checked_and_matched_in_person',
      'identity_copy_retained', false,
      'identity_number_retained', false,
      'contract_version_id', version.id,
      'payment_transaction_id', payment.id,
      'accessory_count', expected_count,
      'condition_photos_required', false
    )
  );

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', 'ACTIVE',
    'handoff_id', handoff_id,
    'condition_report_id', report_id,
    'created', true
  );
end;
$$;

create or replace function api.complete_pickup(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_camera_condition text,
  p_accessories jsonb,
  p_notes text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  raise exception 'use the audited in-person pickup checklist endpoint'
    using errcode = '23514';
end;
$$;

comment on column public.handoffs.verification_record_id is
  'Legacy online-verification reference. New handoffs leave this null and record only in-person check attestations.';

comment on column public.handoffs.original_id_checked is
  'Administrator attests that the original physical ID was visually inspected at pickup; no copy, number, type, or expiry is retained.';

comment on column public.handoffs.original_id_matched is
  'Administrator attests that the physically present named renter matched the original ID shown at pickup.';
