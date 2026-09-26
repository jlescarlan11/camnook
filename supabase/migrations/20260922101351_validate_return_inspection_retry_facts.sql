-- A replay acknowledges only the normalized facts already saved by that operation.
-- Preserve immutable inspections and existing authorization/grants.
create or replace function private.record_return(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_camera_serial text,
  p_condition_summary text,
  p_accessory_results jsonb,
  p_camera_has_damage boolean,
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
  version public.contract_versions%rowtype;
  pickup public.handoffs%rowtype;
  existing_handoff public.handoffs%rowtype;
  existing_report public.condition_reports%rowtype;
  expected_accessories jsonb;
  recorded_accessories jsonb;
  expected_count integer;
  has_missing_items boolean;
  has_damage boolean;
  handoff_id uuid;
  report_id uuid;
begin
  if p_booking_id is null
    or p_actual_at is null
    or p_operation_id is null
    or p_camera_serial is null
    or nullif(btrim(p_camera_serial), '') is null
    or length(btrim(p_camera_serial)) > 160
    or private.resolution_text_has_forbidden_characters(p_camera_serial)
    or p_condition_summary is null
    or length(btrim(p_condition_summary)) not between 2 and 2000
    or private.resolution_text_has_forbidden_characters(p_condition_summary)
    or p_accessory_results is null
    or jsonb_typeof(p_accessory_results) <> 'array'
    or p_camera_has_damage is null
    or (
      p_notes is not null
      and nullif(btrim(p_notes), '') is not null
      and (
        length(btrim(p_notes)) > 2000
        or private.resolution_text_has_forbidden_characters(p_notes)
      )
    )
  then
    raise exception 'return_checklist_invalid' using errcode = '22023';
  end if;

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;
  if booking.id is null then
    raise exception 'return_booking_not_found' using errcode = 'P0002';
  end if;

  select * into existing_handoff
  from public.handoffs
  where booking_id = booking.id
    and type = 'return'
    and operation_id = p_operation_id;
  if existing_handoff.id is not null then
    select * into existing_report
    from public.condition_reports as report
    where report.handoff_id = existing_handoff.id;
    select * into version
    from public.contract_versions
    where id = existing_handoff.contract_version_id;

    if exists (
      select 1 from jsonb_array_elements(p_accessory_results) as observed(item)
      where jsonb_typeof(observed.item) <> 'object'
        or not (observed.item ? 'id' and observed.item ? 'status')
        or observed.item - array['id', 'status']::text[] <> '{}'::jsonb
        or observed.item ->> 'status' is null
        or observed.item ->> 'status' not in ('returned', 'missing', 'damaged')
    ) then
      raise exception 'return_retry_changed' using errcode = '40001';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', (item ->> 'id')::uuid, 'status', item ->> 'status'
    ) order by (item ->> 'id')::uuid), '[]'::jsonb)
    into expected_accessories
    from jsonb_array_elements(p_accessory_results) as observed(item);
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', (item ->> 'id')::uuid, 'status', item ->> 'return_status'
    ) order by (item ->> 'id')::uuid), '[]'::jsonb)
    into recorded_accessories
    from jsonb_array_elements(existing_report.accessory_checklist_snapshot) as recorded(item);

    -- Historical reports store combined camera/accessory damage, not a separate
    -- camera-only flag. Compare the persisted aggregate and accessory facts.
    has_damage := p_camera_has_damage or exists (
      select 1 from jsonb_array_elements(p_accessory_results) as observed(item)
      where item ->> 'status' = 'damaged'
    );
    if existing_report.id is null or version.id is null
      or existing_handoff.actual_at is distinct from p_actual_at
      or existing_handoff.conducted_by is distinct from caller
      or existing_report.reported_by is distinct from caller
      or btrim(p_camera_serial) is distinct from (version.snapshot #>> '{camera,serial_number}')
      or existing_report.camera_condition_summary is distinct from btrim(p_condition_summary)
      or existing_report.notes is distinct from nullif(btrim(p_notes), '')
      or existing_report.has_damage is distinct from has_damage
      or expected_accessories is distinct from recorded_accessories
    then
      raise exception 'return_retry_changed' using errcode = '40001';
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

  if booking.state <> 'ACTIVE' then
    raise exception 'return_stale_booking_state' using errcode = '40001';
  end if;

  select * into pickup
  from public.handoffs
  where booking_id = booking.id and type = 'pickup'
  for share;
  select * into version
  from public.contract_versions
  where id = booking.current_contract_version_id
    and booking_id = booking.id
    and status = 'issued'
  for share;

  if pickup.id is null
    or version.id is null
    or p_actual_at < pickup.actual_at
    or p_actual_at > clock_timestamp()
  then
    raise exception 'return_actual_time_or_contract_invalid' using errcode = '23514';
  end if;
  if btrim(p_camera_serial) <> version.snapshot #>> '{camera,serial_number}' then
    raise exception 'return_camera_serial_mismatch' using errcode = '23514';
  end if;

  expected_accessories := coalesce(
    version.snapshot #> '{camera,accessories}',
    '[]'::jsonb
  );
  if jsonb_typeof(expected_accessories) <> 'array' then
    raise exception 'return_contract_accessories_invalid' using errcode = '23514';
  end if;
  expected_count := jsonb_array_length(expected_accessories);

  if jsonb_array_length(p_accessory_results) <> expected_count
    or exists (
      select 1
      from jsonb_array_elements(p_accessory_results) as observed(item)
      where jsonb_typeof(observed.item) <> 'object'
        or not (observed.item ? 'id' and observed.item ? 'status')
        or observed.item - array['id', 'status']::text[] <> '{}'::jsonb
        or observed.item ->> 'status' is null
        or observed.item ->> 'status' not in ('returned', 'missing', 'damaged')
    )
    or (
      select count(distinct (observed.item ->> 'id')::uuid)
      from jsonb_array_elements(p_accessory_results) as observed(item)
    ) <> expected_count
    or exists (
      select 1
      from jsonb_array_elements(expected_accessories) as expected(item)
      where not exists (
        select 1
        from jsonb_array_elements(p_accessory_results) as observed(item)
        where (observed.item ->> 'id')::uuid = (expected.item ->> 'id')::uuid
      )
    )
  then
    raise exception 'return_accessory_checklist_invalid' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(
    expected.item || jsonb_build_object(
      'return_status', observed.item ->> 'status'
    ) order by expected.ordinal
  ), '[]'::jsonb)
  into recorded_accessories
  from jsonb_array_elements(expected_accessories) with ordinality
    as expected(item, ordinal)
  join jsonb_array_elements(p_accessory_results) as observed(item)
    on (observed.item ->> 'id')::uuid = (expected.item ->> 'id')::uuid;

  select
    coalesce(bool_or(observed.item ->> 'status' = 'missing'), false),
    p_camera_has_damage
      or coalesce(bool_or(observed.item ->> 'status' = 'damaged'), false)
  into has_missing_items, has_damage
  from jsonb_array_elements(p_accessory_results) as observed(item);

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
    'return',
    caller,
    null,
    null,
    null,
    true,
    true,
    p_actual_at,
    nullif(btrim(p_notes), ''),
    p_operation_id,
    version.id,
    pickup.payment_transaction_id
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
    has_damage,
    has_missing_items,
    nullif(btrim(p_notes), ''),
    caller
  ) returning id into report_id;

  perform private.transition_booking(
    booking.id,
    'ACTIVE',
    'RETURN_REVIEW',
    'admin',
    'return_recorded',
    null,
    p_operation_id
  );

  perform private.write_audit(
    p_operation_id,
    'record_return',
    'booking',
    booking.id,
    'success',
    'physical return inspection',
    jsonb_build_object(
      'handoff_id', handoff_id,
      'condition_report_id', report_id,
      'has_damage', has_damage,
      'has_missing_items', has_missing_items,
      'late_return', p_actual_at > booking.return_at,
      'accessory_count', expected_count
    )
  );

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', 'RETURN_REVIEW',
    'handoff_id', handoff_id,
    'condition_report_id', report_id,
    'created', true
  );
end;
$$;
