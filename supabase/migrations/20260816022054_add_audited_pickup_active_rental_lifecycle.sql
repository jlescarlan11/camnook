-- Sprint 5 turns the dormant pickup schema into an audited handoff lifecycle.
-- The database rechecks every eligibility and checklist fact under the booking
-- lock. Private condition photos use exact, expiring upload intents and are
-- never required for a valid written pickup report.

create type private.condition_photo_upload_intent_status as enum (
  'awaiting_upload',
  'finalized',
  'cleanup_pending',
  'cleaned',
  'expired'
);

alter table public.handoffs
  add column operation_id uuid,
  add column verification_record_id uuid
    references public.verification_records (id) on delete restrict,
  add column contract_version_id uuid
    references public.contract_versions (id) on delete restrict,
  add column payment_transaction_id uuid
    references public.payment_transactions (id) on delete restrict;

create unique index handoffs_operation_id_idx
on public.handoffs (operation_id)
where operation_id is not null;

create index handoffs_verification_record_id_idx
on public.handoffs (verification_record_id);

create index handoffs_contract_version_id_idx
on public.handoffs (contract_version_id);

create index handoffs_payment_transaction_id_idx
on public.handoffs (payment_transaction_id);

alter table public.condition_photos
  add column upload_intent_id uuid,
  add column finalized_at timestamptz;

-- No application workflow existed before this migration. Preserve any
-- operator-created legacy metadata as finalized instead of silently hiding it.
update public.condition_photos
set finalized_at = created_at
where finalized_at is null;

create table private.condition_photo_upload_intents (
  id uuid primary key,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  condition_report_id uuid not null
    references public.condition_reports (id) on delete restrict,
  photo_id uuid not null unique,
  object_path text not null unique check (object_path !~ '[[:space:]]'),
  expected_media_type text not null,
  expected_byte_size bigint not null check (expected_byte_size > 0),
  expected_sha256 bytea not null check (octet_length(expected_sha256) = 32),
  status private.condition_photo_upload_intent_status not null
    default 'awaiting_upload',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  finalized_at timestamptz,
  cleanup_requested_at timestamptz,
  cleaned_at timestamptz,
  check (expires_at > created_at),
  check (status <> 'finalized' or finalized_at is not null),
  check (status <> 'cleanup_pending' or cleanup_requested_at is not null),
  check (status <> 'cleaned' or cleaned_at is not null)
);

alter table public.condition_photos
  add constraint condition_photos_upload_intent_id_fkey
  foreign key (upload_intent_id)
  references private.condition_photo_upload_intents (id)
  on delete restrict;

create unique index condition_photos_upload_intent_id_idx
on public.condition_photos (upload_intent_id)
where upload_intent_id is not null;

-- Safe RPCs return only non-sensitive photo summaries. Remove the legacy
-- direct metadata read so an administrator must supply an audited purpose
-- before the server receives a private object path.
drop policy if exists condition_photos_select_own_or_admin
on public.condition_photos;

revoke select on public.condition_photos from authenticated;

create unique index condition_photo_upload_intents_one_open_report_idx
on private.condition_photo_upload_intents (condition_report_id)
where status in ('awaiting_upload', 'cleanup_pending');

create index condition_photo_upload_intents_booking_created_idx
on private.condition_photo_upload_intents (booking_id, created_at desc);

alter table private.condition_photo_upload_intents enable row level security;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png']::text[]
where id = 'condition-evidence';

create function private.pickup_text_has_forbidden_characters(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
    or p_value ~ '[[:cntrl:]]'
    or strpos(p_value, chr(8203)) > 0
    or strpos(p_value, chr(8204)) > 0
    or strpos(p_value, chr(8205)) > 0
    or strpos(p_value, chr(8288)) > 0
    or strpos(p_value, chr(65279)) > 0;
$$;

create function private.condition_photo_extension(p_media_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_media_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    else null
  end;
$$;

create function private.pickup_eligibility(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  profile public.profiles%rowtype;
  verification public.verification_records%rowtype;
  version public.contract_versions%rowtype;
  camera public.cameras%rowtype;
  booking_confirmed boolean := false;
  profile_active boolean := false;
  verification_current boolean := false;
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
      'verification_current', false,
      'contract_current_signed', false,
      'payment_verified', false
    );
  end if;

  booking_confirmed := booking.state = 'CONFIRMED';

  select * into profile
  from public.profiles
  where user_id = booking.renter_id;
  profile_active := profile.user_id is not null
    and profile.account_status = 'active';

  select * into verification
  from public.verification_records as candidate
  where candidate.user_id = booking.renter_id
  order by candidate.submitted_at desc, candidate.id desc
  limit 1;

  verification_current := verification.id is not null
    and verification.status = 'verified'
    and verification.document_expiration_date
      >= (statement_timestamp() at time zone 'Asia/Manila')::date;

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
      and verification_current
      and contract_current_signed
      and payment_verified,
    'booking_confirmed', booking_confirmed,
    'profile_active', profile_active,
    'verification_current', verification_current,
    'contract_current_signed', contract_current_signed,
    'payment_verified', payment_verified
  );
end;
$$;

create function private.get_pickup_queue()
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
    'verification_expiration_date', verification.document_expiration_date,
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
  join lateral (
    select candidate.*
    from public.verification_records as candidate
    where candidate.user_id = booking.renter_id
    order by candidate.submitted_at desc, candidate.id desc
    limit 1
  ) as verification on true
  where booking.state = 'CONFIRMED'
    and (private.pickup_eligibility(booking.id) ->> 'eligible')::boolean;

  return result;
end;
$$;

create function private.get_pickup_detail(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  profile public.profiles%rowtype;
  verification public.verification_records%rowtype;
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
  select * into verification
  from public.verification_records as candidate
  where candidate.user_id = booking.renter_id
  order by candidate.submitted_at desc, candidate.id desc
  limit 1;
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
    'verification', jsonb_build_object(
      'record_id', verification.id,
      'status', verification.status,
      'id_type', verification.id_type,
      'document_expiration_date', verification.document_expiration_date
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

drop function if exists api.complete_pickup(uuid, timestamptz, text, jsonb, text);
drop function if exists private.complete_pickup(uuid, timestamptz, text, jsonb, text);

create function private.complete_pickup(
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
  verification public.verification_records%rowtype;
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

  select * into verification
  from public.verification_records as candidate
  where candidate.user_id = booking.renter_id
  order by candidate.submitted_at desc, candidate.id desc
  limit 1
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
    or verification.id is null
    or verification.status <> 'verified'
    or verification.document_expiration_date
      < (p_actual_at at time zone 'Asia/Manila')::date
    or verification.document_expiration_date
      < (statement_timestamp() at time zone 'Asia/Manila')::date
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
    raise exception 'pickup_identity_or_contract_invalid' using errcode = '23514';
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
    verification_record_id,
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
    verification.id,
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
      'verification_record_id', verification.id,
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

create function private.condition_photo_intent_json(
  p_intent private.condition_photo_upload_intents,
  p_include_private_target boolean default false
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_intent.id,
    'booking_id', p_intent.booking_id,
    'condition_report_id', p_intent.condition_report_id,
    'photo_id', p_intent.photo_id,
    'status', case
      when p_intent.status = 'awaiting_upload'
        and p_intent.expires_at <= statement_timestamp()
      then 'expired'
      else p_intent.status::text
    end,
    'expires_at', p_intent.expires_at,
    'media_type', p_intent.expected_media_type,
    'byte_size', p_intent.expected_byte_size,
    'object_path', case when p_include_private_target then p_intent.object_path end
  ));
$$;

create function private.create_condition_photo_upload_intent(
  p_intent_id uuid,
  p_condition_report_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
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
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  active_intent private.condition_photo_upload_intents%rowtype;
  created_intent private.condition_photo_upload_intents%rowtype;
  expected_hash bytea;
  extension text;
  photo_id uuid;
  target_path text;
begin
  if p_intent_id is null
    or p_condition_report_id is null
    or p_operation_id is null
    or p_sha256_hex is null
    or p_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'condition_photo_intent_invalid' using errcode = '22023';
  end if;

  extension := private.condition_photo_extension(p_media_type);
  if extension is null or p_byte_size is null or p_byte_size not between 1 and 5242880 then
    raise exception 'condition_photo_file_invalid' using errcode = '22023';
  end if;
  expected_hash := decode(p_sha256_hex, 'hex');

  select * into report
  from public.condition_reports
  where id = p_condition_report_id
  for share;
  select * into handoff
  from public.handoffs
  where id = report.handoff_id
    and type = 'pickup'
  for share;
  select * into booking
  from public.bookings
  where id = handoff.booking_id
  for update;

  if report.id is null
    or handoff.id is null
    or booking.id is null
    or booking.state <> 'ACTIVE'
  then
    raise exception 'condition_photo_report_not_found' using errcode = 'P0002';
  end if;

  if (
    select count(*)
    from public.condition_photos as photo
    where photo.condition_report_id = report.id
      and photo.finalized_at is not null
      and photo.deleted_at is null
  ) >= 6 then
    raise exception 'condition_photo_limit_reached' using errcode = '22023';
  end if;

  select * into active_intent
  from private.condition_photo_upload_intents
  where condition_report_id = report.id
    and status in ('awaiting_upload', 'cleanup_pending')
  order by created_at desc, id desc
  limit 1
  for update;

  if active_intent.id is not null then
    if active_intent.status = 'cleanup_pending' then
      return private.condition_photo_intent_json(active_intent, true);
    end if;
    if active_intent.expires_at <= clock_timestamp() then
      if exists (
        select 1 from storage.objects as object
        where object.bucket_id = 'condition-evidence'
          and object.name = active_intent.object_path
      ) then
        update private.condition_photo_upload_intents
        set status = 'cleanup_pending',
            cleanup_requested_at = coalesce(cleanup_requested_at, clock_timestamp())
        where id = active_intent.id
        returning * into active_intent;
        return private.condition_photo_intent_json(active_intent, true);
      end if;
      update private.condition_photo_upload_intents
      set status = 'expired'
      where id = active_intent.id;
      active_intent := null;
    elsif active_intent.id = p_intent_id
      and active_intent.expected_media_type = p_media_type
      and active_intent.expected_byte_size = p_byte_size
      and active_intent.expected_sha256 = expected_hash
    then
      return private.condition_photo_intent_json(active_intent, true);
    else
      raise exception 'condition_photo_upload_in_progress' using errcode = '55000';
    end if;
  end if;

  photo_id := gen_random_uuid();
  target_path := format(
    '%s/%s/%s.%s',
    booking.id,
    report.id,
    photo_id,
    extension
  );

  insert into private.condition_photo_upload_intents (
    id,
    booking_id,
    condition_report_id,
    photo_id,
    object_path,
    expected_media_type,
    expected_byte_size,
    expected_sha256,
    created_by,
    expires_at
  ) values (
    p_intent_id,
    booking.id,
    report.id,
    photo_id,
    target_path,
    p_media_type,
    p_byte_size,
    expected_hash,
    caller,
    clock_timestamp() + interval '15 minutes'
  ) returning * into created_intent;

  perform private.write_audit(
    p_operation_id,
    'create_condition_photo_upload_intent',
    'condition_report',
    report.id,
    'success',
    'pickup condition evidence upload',
    jsonb_build_object(
      'photo_intent_id', created_intent.id,
      'media_type', p_media_type,
      'byte_size', p_byte_size
    )
  );

  return private.condition_photo_intent_json(created_intent, true);
end;
$$;

create function private.get_condition_photo_upload_intent(p_intent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target private.condition_photo_upload_intents%rowtype;
begin
  perform private.require_admin();
  select * into target
  from private.condition_photo_upload_intents
  where id = p_intent_id;
  if target.id is null then
    raise exception 'condition_photo_intent_not_found' using errcode = 'P0002';
  end if;
  return private.condition_photo_intent_json(target, true);
end;
$$;

create function private.finalize_condition_photo_upload(
  p_intent_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
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
  target_booking_id uuid;
  target private.condition_photo_upload_intents%rowtype;
  booking public.bookings%rowtype;
  stored_object storage.objects%rowtype;
  existing_photo public.condition_photos%rowtype;
  created_photo public.condition_photos%rowtype;
begin
  if p_intent_id is null
    or p_operation_id is null
    or p_verified_sha256_hex is null
    or p_verified_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception 'condition_photo_finalization_invalid' using errcode = '22023';
  end if;

  select booking_id into target_booking_id
  from private.condition_photo_upload_intents
  where id = p_intent_id;

  if target_booking_id is null then
    raise exception 'condition_photo_intent_not_found' using errcode = 'P0002';
  end if;

  select * into booking
  from public.bookings
  where id = target_booking_id
  for update;
  select * into target
  from private.condition_photo_upload_intents
  where id = p_intent_id
  for update;

  if target.id is null
    or booking.id is null
    or booking.state <> 'ACTIVE'
    or target.created_by <> caller
  then
    raise exception 'condition_photo_intent_not_found' using errcode = 'P0002';
  end if;

  if target.status = 'finalized' then
    select * into existing_photo
    from public.condition_photos
    where upload_intent_id = target.id;
    if existing_photo.id is null or existing_photo.id <> target.photo_id then
      raise exception 'condition_photo_finalization_inconsistent'
        using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', 'finalized',
      'booking_id', booking.id,
      'condition_report_id', target.condition_report_id,
      'photo_id', target.photo_id,
      'created', false
    );
  end if;

  if target.status <> 'awaiting_upload'
    or target.expires_at <= clock_timestamp()
    or p_verified_media_type is distinct from target.expected_media_type
    or p_verified_byte_size is distinct from target.expected_byte_size
    or decode(p_verified_sha256_hex, 'hex') is distinct from target.expected_sha256
  then
    raise exception 'condition_photo_bytes_do_not_match_intent'
      using errcode = '23514';
  end if;

  select * into stored_object
  from storage.objects as object
  where object.bucket_id = 'condition-evidence'
    and object.name = target.object_path;

  if stored_object.id is null or stored_object.created_at > target.expires_at then
    raise exception 'condition_photo_object_missing_or_late' using errcode = 'P0002';
  end if;
  if coalesce(stored_object.metadata ->> 'mimetype', '') <> target.expected_media_type
    or coalesce(stored_object.metadata ->> 'size', '') !~ '^[0-9]+$'
    or (stored_object.metadata ->> 'size')::bigint <> target.expected_byte_size
  then
    raise exception 'condition_photo_storage_metadata_invalid'
      using errcode = '23514';
  end if;

  insert into public.condition_photos (
    id,
    condition_report_id,
    object_path,
    media_type,
    byte_size,
    sha256,
    evidence_category,
    upload_intent_id,
    finalized_at
  ) values (
    target.photo_id,
    target.condition_report_id,
    target.object_path,
    target.expected_media_type,
    target.expected_byte_size,
    target.expected_sha256,
    'pickup_condition',
    target.id,
    clock_timestamp()
  ) returning * into created_photo;

  update private.condition_photo_upload_intents
  set status = 'finalized',
      finalized_at = clock_timestamp()
  where id = target.id;

  perform private.write_audit(
    p_operation_id,
    'finalize_condition_photo_upload',
    'condition_report',
    target.condition_report_id,
    'success',
    'pickup condition evidence upload',
    jsonb_build_object(
      'photo_id', created_photo.id,
      'media_type', created_photo.media_type,
      'byte_size', created_photo.byte_size
    )
  );

  return jsonb_build_object(
    'status', 'finalized',
    'booking_id', booking.id,
    'condition_report_id', target.condition_report_id,
    'photo_id', created_photo.id,
    'created', true
  );
end;
$$;

create function private.prepare_condition_photo_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.condition_photo_upload_intents%rowtype;
begin
  perform private.require_admin();
  if p_intent_id is null or p_operation_id is null then
    raise exception 'condition_photo_cleanup_invalid' using errcode = '22023';
  end if;

  select * into target
  from private.condition_photo_upload_intents
  where id = p_intent_id
  for update;
  if target.id is null then
    raise exception 'condition_photo_intent_not_found' using errcode = 'P0002';
  end if;
  if target.status = 'finalized' then
    raise exception 'finalized_condition_photo_cannot_be_cleaned'
      using errcode = '55000';
  end if;
  if target.status in ('cleaned', 'expired') then
    return private.condition_photo_intent_json(target, true);
  end if;

  update private.condition_photo_upload_intents
  set status = case
        when exists (
          select 1 from storage.objects as object
          where object.bucket_id = 'condition-evidence'
            and object.name = target.object_path
        ) then 'cleanup_pending'::private.condition_photo_upload_intent_status
        else 'cleaned'::private.condition_photo_upload_intent_status
      end,
      cleanup_requested_at = coalesce(cleanup_requested_at, clock_timestamp()),
      cleaned_at = case
        when not exists (
          select 1 from storage.objects as object
          where object.bucket_id = 'condition-evidence'
            and object.name = target.object_path
        ) then clock_timestamp()
        else cleaned_at
      end
  where id = target.id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'prepare_condition_photo_upload_cleanup',
    'condition_report',
    target.condition_report_id,
    target.status::text,
    'pickup condition evidence upload recovery',
    jsonb_build_object('photo_intent_id', target.id)
  );

  return private.condition_photo_intent_json(target, true);
end;
$$;

create function private.finalize_condition_photo_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target private.condition_photo_upload_intents%rowtype;
begin
  perform private.require_admin();
  if p_intent_id is null or p_operation_id is null then
    raise exception 'condition_photo_cleanup_invalid' using errcode = '22023';
  end if;

  select * into target
  from private.condition_photo_upload_intents
  where id = p_intent_id
  for update;
  if target.id is null then
    raise exception 'condition_photo_intent_not_found' using errcode = 'P0002';
  end if;
  if target.status = 'cleaned' then
    return private.condition_photo_intent_json(target, true);
  end if;
  if target.status <> 'cleanup_pending' or exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'condition-evidence'
      and object.name = target.object_path
  ) then
    raise exception 'condition_photo_cleanup_not_complete' using errcode = '55000';
  end if;

  update private.condition_photo_upload_intents
  set status = 'cleaned', cleaned_at = clock_timestamp()
  where id = target.id
  returning * into target;

  perform private.write_audit(
    p_operation_id,
    'finalize_condition_photo_upload_cleanup',
    'condition_report',
    target.condition_report_id,
    'success',
    'pickup condition evidence upload recovery',
    jsonb_build_object('photo_intent_id', target.id)
  );

  return private.condition_photo_intent_json(target, true);
end;
$$;

create function private.can_insert_condition_photo(
  p_object_path text,
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from private.condition_photo_upload_intents as intent
      join public.bookings as booking on booking.id = intent.booking_id
      where intent.object_path = p_object_path
        and booking.state = 'ACTIVE'
        and intent.status = 'awaiting_upload'
        and intent.expires_at > statement_timestamp()
        and coalesce(p_metadata ->> 'mimetype', '') = intent.expected_media_type
        and coalesce(p_metadata ->> 'size', '') ~ '^[0-9]+$'
        and (p_metadata ->> 'size')::bigint = intent.expected_byte_size
    );
$$;

create function private.can_select_condition_photo(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.condition_photos as photo
      join public.condition_reports as report on report.id = photo.condition_report_id
      join public.handoffs as handoff on handoff.id = report.handoff_id
      join public.bookings as booking on booking.id = handoff.booking_id
      where photo.object_path = p_object_path
        and photo.finalized_at is not null
        and photo.deleted_at is null
        and booking.renter_id = auth.uid()
    );
$$;

drop policy if exists condition_evidence_owner_read on storage.objects;
drop policy if exists condition_evidence_admin_insert on storage.objects;

create policy condition_evidence_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'condition-evidence'
  and (select private.can_select_condition_photo(name))
);

create policy condition_evidence_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'condition-evidence'
  and (select private.can_insert_condition_photo(name, metadata))
);

create function private.authorize_condition_photo_access(
  p_photo_id uuid,
  p_purpose text,
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
  photo public.condition_photos%rowtype;
  report public.condition_reports%rowtype;
  handoff public.handoffs%rowtype;
begin
  if p_photo_id is null
    or p_operation_id is null
    or p_purpose <> 'pickup_condition_review'
  then
    raise exception 'condition_photo_access_invalid' using errcode = '22023';
  end if;

  select * into photo
  from public.condition_photos
  where id = p_photo_id
    and finalized_at is not null
    and deleted_at is null
  for share;
  select * into report
  from public.condition_reports
  where id = photo.condition_report_id
  for share;
  select * into handoff
  from public.handoffs
  where id = report.handoff_id and type = 'pickup'
  for share;

  if photo.id is null or report.id is null or handoff.id is null then
    raise exception 'condition_photo_unavailable' using errcode = 'P0002';
  end if;

  perform private.write_audit(
    p_operation_id,
    'authorize_condition_photo_access',
    'condition_report',
    report.id,
    'authorized',
    'pickup condition review',
    jsonb_build_object(
      'photo_id', photo.id,
      'expires_in_seconds', 60
    )
  );

  return jsonb_build_object(
    'booking_id', handoff.booking_id,
    'condition_report_id', report.id,
    'photo_id', photo.id,
    'object_path', photo.object_path,
    'expires_in_seconds', 60
  );
end;
$$;

create function private.authorize_my_condition_photo_access(
  p_booking_id uuid,
  p_photo_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  photo public.condition_photos%rowtype;
  report public.condition_reports%rowtype;
  handoff public.handoffs%rowtype;
  booking public.bookings%rowtype;
begin
  select * into photo
  from public.condition_photos
  where id = p_photo_id
    and finalized_at is not null
    and deleted_at is null;
  select * into report
  from public.condition_reports
  where id = photo.condition_report_id;
  select * into handoff
  from public.handoffs
  where id = report.handoff_id and type = 'pickup';
  select * into booking
  from public.bookings
  where id = handoff.booking_id
    and id = p_booking_id
    and renter_id = caller;

  if photo.id is null
    or report.id is null
    or handoff.id is null
    or booking.id is null
  then
    raise exception 'condition_photo_unavailable' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'booking_id', booking.id,
    'condition_report_id', report.id,
    'photo_id', photo.id,
    'object_path', photo.object_path,
    'expires_in_seconds', 60
  );
end;
$$;

create function private.get_my_pickup_state(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  handoff public.handoffs%rowtype;
  report public.condition_reports%rowtype;
  timeline jsonb;
  photos jsonb;
begin
  select * into booking
  from public.bookings
  where id = p_booking_id and renter_id = caller;
  if booking.id is null then
    raise exception 'pickup_booking_not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'from_state', history.from_state,
    'to_state', history.to_state,
    'reason_code', history.reason_code,
    'occurred_at', history.occurred_at
  ) order by history.id), '[]'::jsonb)
  into timeline
  from public.booking_state_history as history
  where history.booking_id = booking.id;

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

  return jsonb_build_object(
    'booking_id', booking.id,
    'booking_state', booking.state,
    'pickup_at', booking.pickup_at,
    'return_at', booking.return_at,
    'timeline', timeline,
    'handoff', case when handoff.id is null then null else jsonb_build_object(
      'actual_at', handoff.actual_at,
      'named_renter_present', handoff.named_renter_present,
      'original_id_checked', handoff.original_id_checked,
      'original_id_matched', handoff.original_id_matched,
      'camera_serial_checked', handoff.camera_serial_checked,
      'accessory_checklist_completed', handoff.accessory_checklist_completed,
      'condition_report_complete', report.id is not null,
      'condition_photo_count', jsonb_array_length(photos),
      'photos', photos
    ) end
  );
end;
$$;

create function private.get_active_rental_queue()
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
    'renter_phone', profile.phone,
    'actual_pickup_at', handoff.actual_at,
    'expected_return_at', booking.return_at,
    'urgency', case
      when booking.return_at < statement_timestamp() then 'overdue'
      when (booking.return_at at time zone 'Asia/Manila')::date
        = (statement_timestamp() at time zone 'Asia/Manila')::date
      then 'due_today'
      else 'upcoming'
    end
  ) order by booking.return_at, booking.id), '[]'::jsonb)
  into result
  from public.bookings as booking
  join public.profiles as profile on profile.user_id = booking.renter_id
  join public.cameras as camera on camera.id = booking.camera_id
  join public.handoffs as handoff
    on handoff.booking_id = booking.id and handoff.type = 'pickup'
  where booking.state = 'ACTIVE';

  return result;
end;
$$;

create function api.get_pickup_queue()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_pickup_queue(); $$;

create function api.get_pickup_detail(p_booking_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_pickup_detail(p_booking_id); $$;

create function api.complete_pickup(
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.complete_pickup(
    p_booking_id,
    p_actual_at,
    p_named_renter_present,
    p_original_id_checked,
    p_original_id_matched,
    p_camera_serial,
    p_accessory_ids,
    p_condition_summary,
    p_notes,
    p_operation_id
  );
$$;

-- Preserve the legacy PostgREST signature as an explicit fail-closed endpoint.
-- Its free-form JSON accessory input cannot prove the Sprint 5 checklist, so
-- callers must migrate to the strongly typed operation above.
create function api.complete_pickup(
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
  raise exception 'current verification and signed contract are required for pickup'
    using errcode = '23514';
end;
$$;

create function api.create_condition_photo_upload_intent(
  p_intent_id uuid,
  p_condition_report_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_condition_photo_upload_intent(
    p_intent_id,
    p_condition_report_id,
    p_media_type,
    p_byte_size,
    p_sha256_hex,
    p_operation_id
  );
$$;

create function api.get_condition_photo_upload_intent(p_intent_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_condition_photo_upload_intent(p_intent_id); $$;

create function api.finalize_condition_photo_upload(
  p_intent_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_condition_photo_upload(
    p_intent_id,
    p_verified_media_type,
    p_verified_byte_size,
    p_verified_sha256_hex,
    p_operation_id
  );
$$;

create function api.prepare_condition_photo_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select private.prepare_condition_photo_upload_cleanup(p_intent_id, p_operation_id); $$;

create function api.finalize_condition_photo_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select private.finalize_condition_photo_upload_cleanup(p_intent_id, p_operation_id); $$;

create function api.authorize_condition_photo_access(
  p_photo_id uuid,
  p_purpose text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.authorize_condition_photo_access(
    p_photo_id,
    p_purpose,
    p_operation_id
  );
$$;

create function api.authorize_my_condition_photo_access(
  p_booking_id uuid,
  p_photo_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.authorize_my_condition_photo_access(p_booking_id, p_photo_id);
$$;

create function api.get_my_pickup_state(p_booking_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_my_pickup_state(p_booking_id); $$;

create function api.get_active_rental_queue()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_active_rental_queue(); $$;

revoke all on table private.condition_photo_upload_intents
from public, anon, authenticated, service_role;

revoke execute on function
  private.pickup_text_has_forbidden_characters(text),
  private.condition_photo_extension(text),
  private.pickup_eligibility(uuid),
  private.get_pickup_queue(),
  private.get_pickup_detail(uuid),
  private.complete_pickup(uuid, timestamptz, boolean, boolean, boolean, text, uuid[], text, text, uuid),
  private.condition_photo_intent_json(private.condition_photo_upload_intents, boolean),
  private.create_condition_photo_upload_intent(uuid, uuid, text, bigint, text, uuid),
  private.get_condition_photo_upload_intent(uuid),
  private.finalize_condition_photo_upload(uuid, text, bigint, text, uuid),
  private.prepare_condition_photo_upload_cleanup(uuid, uuid),
  private.finalize_condition_photo_upload_cleanup(uuid, uuid),
  private.can_insert_condition_photo(text, jsonb),
  private.can_select_condition_photo(text),
  private.authorize_condition_photo_access(uuid, text, uuid),
  private.authorize_my_condition_photo_access(uuid, uuid),
  private.get_my_pickup_state(uuid),
  private.get_active_rental_queue()
from public, anon, authenticated, service_role;

grant execute on function private.get_pickup_queue() to authenticated;
grant execute on function private.get_pickup_detail(uuid) to authenticated;
grant execute on function private.complete_pickup(
  uuid, timestamptz, boolean, boolean, boolean, text, uuid[], text, text, uuid
) to authenticated;
grant execute on function private.create_condition_photo_upload_intent(
  uuid, uuid, text, bigint, text, uuid
) to authenticated;
grant execute on function private.get_condition_photo_upload_intent(uuid)
to authenticated;
grant execute on function private.finalize_condition_photo_upload(
  uuid, text, bigint, text, uuid
) to authenticated;
grant execute on function private.prepare_condition_photo_upload_cleanup(uuid, uuid)
to authenticated;
grant execute on function private.finalize_condition_photo_upload_cleanup(uuid, uuid)
to authenticated;
grant execute on function private.can_insert_condition_photo(text, jsonb)
to authenticated;
grant execute on function private.can_select_condition_photo(text)
to authenticated;
grant execute on function private.authorize_condition_photo_access(uuid, text, uuid)
to authenticated;
grant execute on function private.authorize_my_condition_photo_access(uuid, uuid)
to authenticated;
grant execute on function private.get_my_pickup_state(uuid) to authenticated;
grant execute on function private.get_active_rental_queue() to authenticated;

revoke execute on function
  api.get_pickup_queue(),
  api.get_pickup_detail(uuid),
  api.complete_pickup(uuid, timestamptz, boolean, boolean, boolean, text, uuid[], text, text, uuid),
  api.complete_pickup(uuid, timestamptz, text, jsonb, text),
  api.create_condition_photo_upload_intent(uuid, uuid, text, bigint, text, uuid),
  api.get_condition_photo_upload_intent(uuid),
  api.finalize_condition_photo_upload(uuid, text, bigint, text, uuid),
  api.prepare_condition_photo_upload_cleanup(uuid, uuid),
  api.finalize_condition_photo_upload_cleanup(uuid, uuid),
  api.authorize_condition_photo_access(uuid, text, uuid),
  api.authorize_my_condition_photo_access(uuid, uuid),
  api.get_my_pickup_state(uuid),
  api.get_active_rental_queue()
from public, anon, authenticated, service_role;

grant execute on function api.get_pickup_queue() to authenticated;
grant execute on function api.get_pickup_detail(uuid) to authenticated;
grant execute on function api.complete_pickup(
  uuid, timestamptz, boolean, boolean, boolean, text, uuid[], text, text, uuid
) to authenticated;
grant execute on function api.complete_pickup(
  uuid, timestamptz, text, jsonb, text
) to authenticated;
grant execute on function api.create_condition_photo_upload_intent(
  uuid, uuid, text, bigint, text, uuid
) to authenticated;
grant execute on function api.get_condition_photo_upload_intent(uuid)
to authenticated;
grant execute on function api.finalize_condition_photo_upload(
  uuid, text, bigint, text, uuid
) to authenticated;
grant execute on function api.prepare_condition_photo_upload_cleanup(uuid, uuid)
to authenticated;
grant execute on function api.finalize_condition_photo_upload_cleanup(uuid, uuid)
to authenticated;
grant execute on function api.authorize_condition_photo_access(uuid, text, uuid)
to authenticated;
grant execute on function api.authorize_my_condition_photo_access(uuid, uuid)
to authenticated;
grant execute on function api.get_my_pickup_state(uuid) to authenticated;
grant execute on function api.get_active_rental_queue() to authenticated;

comment on function private.complete_pickup(
  uuid, timestamptz, boolean, boolean, boolean, text, uuid[], text, text, uuid
) is
  'Atomically rechecks paid pickup eligibility and every physical checklist fact before one idempotent CONFIRMED-to-ACTIVE handoff.';

comment on table private.condition_photo_upload_intents is
  'Short-lived exact-target intents for optional, private, no-overwrite pickup condition photos.';

comment on function private.get_active_rental_queue() is
  'Returns only necessary ACTIVE-rental contact and return urgency; it intentionally contains no automatic late-return amount.';
