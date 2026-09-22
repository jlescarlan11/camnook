-- A replay acknowledges only the normalized facts of the saved pickup.
-- Preserve immutable handoffs/reports, authorization, and existing grants.
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
  existing_report public.condition_reports%rowtype;
  submitted_accessory_ids uuid[];
  recorded_accessory_ids uuid[];
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
      select * into existing_report
      from public.condition_reports as report
      where report.handoff_id = existing_handoff.id;
      select * into version
      from public.contract_versions
      where id = existing_handoff.contract_version_id;
      submitted_accessory_ids := array(
        select accessory_id from unnest(p_accessory_ids) as accessory_id
        order by accessory_id
      );
      recorded_accessory_ids := array(
        select (item ->> 'id')::uuid
        from jsonb_array_elements(existing_report.accessory_checklist_snapshot) as recorded(item)
        order by (item ->> 'id')::uuid
      );
      if existing_report.id is null or version.id is null
        or existing_handoff.actual_at is distinct from p_actual_at
        or existing_handoff.conducted_by is distinct from caller
        or existing_report.reported_by is distinct from caller
        or existing_handoff.named_renter_present is distinct from p_named_renter_present
        or existing_handoff.original_id_checked is distinct from p_original_id_checked
        or existing_handoff.original_id_matched is distinct from p_original_id_matched
        or btrim(p_camera_serial) is distinct from (version.snapshot #>> '{camera,serial_number}')
        or existing_report.camera_condition_summary is distinct from btrim(p_condition_summary)
        or existing_report.notes is distinct from nullif(btrim(p_notes), '')
        or submitted_accessory_ids is distinct from recorded_accessory_ids
      then
        raise exception 'pickup_retry_changed' using errcode = '40001';
      end if;
      report_id := existing_report.id;
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
