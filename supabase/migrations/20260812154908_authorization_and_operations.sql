-- CamNook RLS and transactional operation boundary.
-- All privileged mutations live in the non-exposed private schema. The api
-- schema contains SECURITY INVOKER wrappers only.

alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema api revoke execute on functions from public;

create function private.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return caller;
end;
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from private.admin_accounts as admin
      where admin.user_id = auth.uid()
    );
$$;

create function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not private.is_admin() then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  return caller;
end;
$$;

create function private.owns_booking(target_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.bookings as booking
      where booking.id = target_booking_id
        and booking.renter_id = auth.uid()
    );
$$;

create function private.owns_condition_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.condition_reports as report
      join public.handoffs as handoff on handoff.id = report.handoff_id
      join public.bookings as booking on booking.id = handoff.booking_id
      where report.id = target_report_id
        and booking.renter_id = auth.uid()
    );
$$;

create function private.write_audit(
  p_operation_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_outcome text,
  p_purpose text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.audit_logs (
    actor_user_id,
    operation_id,
    action,
    entity_type,
    entity_id,
    outcome,
    purpose,
    metadata
  ) values (
    auth.uid(),
    p_operation_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_outcome,
    p_purpose,
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

alter table public.profiles enable row level security;
alter table public.verification_records enable row level security;
alter table public.verification_documents enable row level security;
alter table public.cameras enable row level security;
alter table public.camera_photos enable row level security;
alter table public.camera_accessories enable row level security;
alter table public.bookings enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.booking_state_history enable row level security;
alter table public.booking_cancellation_requests enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_versions enable row level security;
alter table public.contract_signatures enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.deposit_settlements enable row level security;
alter table public.handoffs enable row level security;
alter table public.condition_reports enable row level security;
alter table public.condition_photos enable row level security;
alter table private.admin_accounts enable row level security;
alter table private.audit_logs enable row level security;

create policy profiles_select_own_or_admin
on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy verification_records_select_own_or_admin
on public.verification_records for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy verification_documents_select_own_or_admin
on public.verification_documents for select to authenticated
using (owner_user_id = (select auth.uid()) or (select private.is_admin()));

create policy cameras_select_published_anon
on public.cameras for select to anon
using (status = 'published');

create policy cameras_select_published_authenticated
on public.cameras for select to authenticated
using (status = 'published');

create policy cameras_select_admin
on public.cameras for select to authenticated
using ((select private.is_admin()));

create policy camera_photos_select_published_anon
on public.camera_photos for select to anon
using (
  archived_at is null
  and exists (
    select 1 from public.cameras as camera
    where camera.id = camera_id and camera.status = 'published'
  )
);

create policy camera_photos_select_published_authenticated
on public.camera_photos for select to authenticated
using (
  archived_at is null
  and exists (
    select 1 from public.cameras as camera
    where camera.id = camera_id and camera.status = 'published'
  )
);

create policy camera_photos_select_admin
on public.camera_photos for select to authenticated
using ((select private.is_admin()));

create policy camera_accessories_select_published_anon
on public.camera_accessories for select to anon
using (
  archived_at is null
  and exists (
    select 1 from public.cameras as camera
    where camera.id = camera_id and camera.status = 'published'
  )
);

create policy camera_accessories_select_published_authenticated
on public.camera_accessories for select to authenticated
using (
  archived_at is null
  and exists (
    select 1 from public.cameras as camera
    where camera.id = camera_id and camera.status = 'published'
  )
);

create policy camera_accessories_select_admin
on public.camera_accessories for select to authenticated
using ((select private.is_admin()));

create policy bookings_select_own_or_admin
on public.bookings for select to authenticated
using (renter_id = (select auth.uid()) or (select private.is_admin()));

create policy availability_blocks_select_public
on public.availability_blocks for select to anon, authenticated
using (released_at is null or (select private.is_admin()));

create policy booking_history_select_own_or_admin
on public.booking_state_history for select to authenticated
using ((select private.owns_booking(booking_id)) or (select private.is_admin()));

create policy cancellation_requests_select_own_or_admin
on public.booking_cancellation_requests for select to authenticated
using (requester_id = (select auth.uid()) or (select private.is_admin()));

create policy contract_templates_select_activated_or_admin
on public.contract_templates for select to authenticated
using (
  (activated_at is not null and deactivated_at is null)
  or (select private.is_admin())
);

create policy contract_versions_select_own_or_admin
on public.contract_versions for select to authenticated
using ((select private.owns_booking(booking_id)) or (select private.is_admin()));

create policy contract_signatures_select_own_or_admin
on public.contract_signatures for select to authenticated
using (renter_id = (select auth.uid()) or (select private.is_admin()));

create policy payment_transactions_select_own_or_admin
on public.payment_transactions for select to authenticated
using ((select private.owns_booking(booking_id)) or (select private.is_admin()));

create policy payment_allocations_select_own_or_admin
on public.payment_allocations for select to authenticated
using ((select private.owns_booking(booking_id)) or (select private.is_admin()));

create policy payment_proofs_select_own_or_admin
on public.payment_proofs for select to authenticated
using (owner_user_id = (select auth.uid()) or (select private.is_admin()));

create policy deposit_settlements_select_own_or_admin
on public.deposit_settlements for select to authenticated
using ((select private.owns_booking(booking_id)) or (select private.is_admin()));

create policy handoffs_select_own_or_admin
on public.handoffs for select to authenticated
using ((select private.owns_booking(booking_id)) or (select private.is_admin()));

create policy condition_reports_select_own_or_admin
on public.condition_reports for select to authenticated
using ((select private.owns_condition_report(id)) or (select private.is_admin()));

create policy condition_photos_select_own_or_admin
on public.condition_photos for select to authenticated
using ((select private.owns_condition_report(condition_report_id)) or (select private.is_admin()));

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all functions in schema api from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema api to authenticated;
grant usage on schema private to authenticated;

grant select (id, slug, name, description, daily_rate, security_deposit, published_at, status)
on public.cameras to anon, authenticated;
grant select (id, camera_id, object_path, alt_text, sort_position, archived_at)
on public.camera_photos to anon, authenticated;
grant select (id, camera_id, name, quantity, sort_position, archived_at)
on public.camera_accessories to anon, authenticated;
grant select (camera_id, starts_at, ends_at, kind, released_at)
on public.availability_blocks to anon, authenticated;
grant select on public.public_cameras to anon, authenticated;
grant select on public.public_camera_photos to anon, authenticated;
grant select on public.public_availability to anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.verification_records to authenticated;
grant select on public.verification_documents to authenticated;
grant select on public.bookings to authenticated;
grant select on public.booking_state_history to authenticated;
grant select on public.booking_cancellation_requests to authenticated;
grant select on public.contract_templates to authenticated;
grant select on public.contract_versions to authenticated;
grant select on public.contract_signatures to authenticated;
grant select on public.payment_transactions to authenticated;
grant select on public.payment_allocations to authenticated;
grant select on public.payment_proofs to authenticated;
grant select on public.deposit_settlements to authenticated;
grant select on public.handoffs to authenticated;
grant select on public.condition_reports to authenticated;
grant select on public.condition_photos to authenticated;

create function private.ensure_profile(p_legal_name text, p_phone text)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  result public.profiles;
begin
  if nullif(btrim(p_legal_name), '') is null or nullif(btrim(p_phone), '') is null then
    raise exception 'legal name and phone are required' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, legal_name, phone)
  values (caller, btrim(p_legal_name), btrim(p_phone))
  on conflict (user_id) do update
    set legal_name = excluded.legal_name,
        phone = excluded.phone
  returning * into result;

  return result;
end;
$$;

create function private.request_booking(
  p_camera_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz,
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
  caller uuid := private.current_user_id();
  booking_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  if p_pickup_at >= p_return_at or p_pickup_at <= statement_timestamp() then
    raise exception 'booking period must be future-facing and non-empty' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles as profile
    where profile.user_id = caller and profile.account_status = 'active'
  ) then
    raise exception 'an active profile is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.cameras as camera
    where camera.id = p_camera_id and camera.status = 'published'
  ) then
    raise exception 'camera is not available for requests' using errcode = '22023';
  end if;

  insert into public.bookings (
    renter_id,
    camera_id,
    pickup_at,
    return_at,
    intended_use,
    expected_location
  ) values (
    caller,
    p_camera_id,
    p_pickup_at,
    p_return_at,
    btrim(p_intended_use),
    btrim(p_expected_location)
  ) returning id into booking_id;

  insert into public.booking_state_history (
    booking_id, from_state, to_state, actor_user_id, actor_type, reason_code, operation_id
  ) values (
    booking_id, null, 'FOR_REVIEW', caller, 'renter', 'booking_requested', operation_id
  );

  perform private.write_audit(
    operation_id, 'request_booking', 'booking', booking_id, 'success', 'rental request'
  );

  return booking_id;
end;
$$;

create function private.transition_booking(
  p_booking_id uuid,
  p_expected_state public.booking_state,
  p_to_state public.booking_state,
  p_actor_type public.booking_actor_type,
  p_reason_code text,
  p_note text,
  p_operation_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.bookings
  set state = p_to_state
  where id = p_booking_id and state = p_expected_state;

  if not found then
    raise exception 'booking state changed or transition precondition failed'
      using errcode = '40001';
  end if;

  insert into public.booking_state_history (
    booking_id,
    from_state,
    to_state,
    actor_user_id,
    actor_type,
    reason_code,
    note,
    operation_id
  ) values (
    p_booking_id,
    p_expected_state,
    p_to_state,
    auth.uid(),
    p_actor_type,
    p_reason_code,
    p_note,
    p_operation_id
  );
end;
$$;

create function private.release_booking_block(p_booking_id uuid, p_released_by uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.availability_blocks
  set released_at = statement_timestamp(), released_by = p_released_by
  where booking_id = p_booking_id and released_at is null;
$$;

create function private.approve_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (
    select 1 from public.bookings
    where id = p_booking_id and state = 'FOR_REVIEW'
  ) then
    raise exception 'booking is not awaiting review' using errcode = '22023';
  end if;
  raise exception 'approval is disabled until OD-01 billable-day pricing is approved'
    using errcode = '0A000';
end;
$$;

create function private.reject_booking(p_booking_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  operation_id uuid := gen_random_uuid();
begin
  perform 1 from public.bookings where id = p_booking_id for update;
  perform private.transition_booking(
    p_booking_id, 'FOR_REVIEW', 'REJECTED', 'admin', 'booking_rejected', p_reason, operation_id
  );
  perform private.write_audit(
    operation_id, 'reject_booking', 'booking', p_booking_id, 'success', 'booking review',
    jsonb_build_object('actor_id', caller)
  );
end;
$$;

create function private.request_cancellation(p_booking_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  request_id uuid;
  current_state public.booking_state;
begin
  select state into current_state
  from public.bookings
  where id = p_booking_id and renter_id = caller
  for update;

  if current_state is null then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if current_state not in ('FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY', 'PAYMENT_REVIEW', 'CONFIRMED') then
    raise exception 'booking is not eligible for a cancellation request' using errcode = '22023';
  end if;

  insert into public.booking_cancellation_requests (booking_id, requester_id, reason)
  values (p_booking_id, caller, btrim(p_reason))
  returning id into request_id;

  return request_id;
end;
$$;

create function private.decide_cancellation(
  p_request_id uuid,
  p_accept boolean,
  p_note text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  target public.booking_cancellation_requests%rowtype;
  current_state public.booking_state;
  operation_id uuid := gen_random_uuid();
begin
  select * into target
  from public.booking_cancellation_requests
  where id = p_request_id
  for update;

  if target.id is null or target.disposition <> 'pending' then
    raise exception 'pending cancellation request not found' using errcode = 'P0002';
  end if;

  update public.booking_cancellation_requests
  set disposition = case when p_accept then 'accepted' else 'declined' end,
      decided_by = caller,
      decided_at = statement_timestamp(),
      decision_note = p_note
  where id = p_request_id;

  if p_accept then
    select state into current_state
    from public.bookings
    where id = target.booking_id
    for update;

    if current_state not in ('FOR_REVIEW', 'CONTRACT_PENDING', 'TO_PAY', 'PAYMENT_REVIEW', 'CONFIRMED') then
      raise exception 'booking can no longer be cancelled' using errcode = '22023';
    end if;

    if current_state in ('PAYMENT_REVIEW', 'CONFIRMED') then
      raise exception 'paid or submitted-payment cancellation is disabled until OD-03 is approved'
        using errcode = '0A000';
    end if;

    perform private.transition_booking(
      target.booking_id,
      current_state,
      'CANCELLED',
      'admin',
      'cancellation_accepted',
      p_note,
      operation_id
    );
    perform private.release_booking_block(target.booking_id, caller);
  end if;

  perform private.write_audit(
    operation_id,
    'decide_cancellation',
    'booking_cancellation_request',
    p_request_id,
    'success',
    'cancellation review',
    jsonb_build_object('accepted', p_accept)
  );
end;
$$;

create function private.sign_contract(
  p_booking_id uuid,
  p_signature_intent text,
  p_attestation_text text,
  p_acknowledged_content_sha256 bytea
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  signature_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  select * into booking
  from public.bookings
  where id = p_booking_id and renter_id = caller
  for update;

  if booking.id is null or booking.state <> 'CONTRACT_PENDING' then
    raise exception 'booking is not awaiting a contract signature' using errcode = '22023';
  end if;
  if statement_timestamp() >= booking.approval_deadline_at then
    raise exception 'approval deadline has elapsed' using errcode = '22023';
  end if;
  if booking.current_contract_version_id is null then
    raise exception 'booking has no current contract version' using errcode = '23514';
  end if;

  insert into public.contract_signatures (
    contract_version_id,
    renter_id,
    signature_intent,
    attestation_text,
    acknowledged_content_sha256
  ) values (
    booking.current_contract_version_id,
    caller,
    btrim(p_signature_intent),
    btrim(p_attestation_text),
    p_acknowledged_content_sha256
  ) returning id into signature_id;

  perform private.transition_booking(
    p_booking_id, 'CONTRACT_PENDING', 'TO_PAY', 'renter', 'contract_signed', null, operation_id
  );

  return signature_id;
end;
$$;

create function private.submit_payment(
  p_booking_id uuid,
  p_amount numeric,
  p_reference text,
  p_sender_name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  booking public.bookings%rowtype;
  payment_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  select * into booking
  from public.bookings
  where id = p_booking_id and renter_id = caller
  for update;

  if booking.id is null or booking.state <> 'TO_PAY' then
    raise exception 'booking is not awaiting payment' using errcode = '22023';
  end if;
  if statement_timestamp() >= booking.approval_deadline_at then
    raise exception 'approval deadline has elapsed' using errcode = '22023';
  end if;

  insert into public.payment_transactions (
    booking_id,
    direction,
    amount,
    reference,
    counterparty_display_name,
    submitted_by
  ) values (
    p_booking_id,
    'incoming',
    p_amount,
    btrim(p_reference),
    btrim(p_sender_name),
    caller
  ) returning id into payment_id;

  perform private.transition_booking(
    p_booking_id, 'TO_PAY', 'PAYMENT_REVIEW', 'renter', 'payment_submitted', null, operation_id
  );

  return payment_id;
end;
$$;

create function private.verify_payment(
  p_payment_id uuid,
  p_rental_allocation numeric,
  p_deposit_allocation numeric
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  payment public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  operation_id uuid := gen_random_uuid();
begin
  select * into payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if payment.id is null or payment.status <> 'submitted' or payment.direction <> 'incoming' then
    raise exception 'submitted incoming payment not found' using errcode = 'P0002';
  end if;

  select * into booking
  from public.bookings
  where id = payment.booking_id
  for update;

  if booking.state <> 'PAYMENT_REVIEW' then
    raise exception 'booking is not in payment review' using errcode = '22023';
  end if;
  if payment.submitted_at >= booking.approval_deadline_at then
    raise exception 'payment was submitted after the approval deadline' using errcode = '22023';
  end if;
  if p_rental_allocation <> booking.rental_amount
    or p_deposit_allocation <> booking.security_deposit_amount
    or p_rental_allocation + p_deposit_allocation <> payment.amount
  then
    raise exception 'payment allocations do not match authoritative booking amounts'
      using errcode = '23514';
  end if;

  insert into public.payment_allocations (transaction_id, booking_id, kind, amount)
  values
    (p_payment_id, booking.id, 'rental_payment', p_rental_allocation),
    (p_payment_id, booking.id, 'security_deposit', p_deposit_allocation);

  update public.payment_transactions
  set status = 'verified', decided_at = statement_timestamp(), decided_by = caller
  where id = p_payment_id;

  perform private.transition_booking(
    booking.id, 'PAYMENT_REVIEW', 'CONFIRMED', 'admin', 'payment_verified', null, operation_id
  );
  perform private.write_audit(
    operation_id, 'verify_payment', 'payment_transaction', payment.id, 'success',
    'manual GCash reconciliation'
  );
end;
$$;

create function private.reject_payment(p_payment_id uuid, p_reason text)
returns public.booking_state
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  payment public.payment_transactions%rowtype;
  booking public.bookings%rowtype;
  target_state public.booking_state;
  operation_id uuid := gen_random_uuid();
begin
  select * into payment
  from public.payment_transactions
  where id = p_payment_id
  for update;

  if payment.id is null or payment.status <> 'submitted' then
    raise exception 'submitted payment not found' using errcode = 'P0002';
  end if;

  select * into booking
  from public.bookings
  where id = payment.booking_id
  for update;

  if booking.state <> 'PAYMENT_REVIEW' then
    raise exception 'booking is not in payment review' using errcode = '22023';
  end if;

  target_state := case
    when statement_timestamp() < booking.approval_deadline_at then 'TO_PAY'::public.booking_state
    else 'EXPIRED'::public.booking_state
  end;

  update public.payment_transactions
  set status = 'rejected',
      decided_at = statement_timestamp(),
      decided_by = caller,
      rejection_reason = btrim(p_reason)
  where id = p_payment_id;

  perform private.transition_booking(
    booking.id, 'PAYMENT_REVIEW', target_state, 'admin', 'payment_rejected', p_reason, operation_id
  );
  if target_state = 'EXPIRED' then
    perform private.release_booking_block(booking.id, caller);
  end if;

  perform private.write_audit(
    operation_id, 'reject_payment', 'payment_transaction', payment.id, 'success',
    'manual GCash reconciliation', jsonb_build_object('booking_state', target_state)
  );

  return target_state;
end;
$$;

create function private.expire_due_bookings()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  target record;
  affected integer := 0;
  operation_id uuid;
begin
  for target in
    select id, state
    from public.bookings
    where state in ('CONTRACT_PENDING', 'TO_PAY')
      and approval_deadline_at <= statement_timestamp()
    for update skip locked
  loop
    operation_id := gen_random_uuid();
    perform private.transition_booking(
      target.id, target.state, 'EXPIRED', 'admin', 'approval_deadline_elapsed', null, operation_id
    );
    perform private.release_booking_block(target.id, caller);
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

create function private.create_manual_block(
  p_camera_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_kind public.availability_block_kind,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  block_id uuid;
begin
  if p_kind not in ('maintenance', 'manual') then
    raise exception 'admin blocks must be maintenance or manual' using errcode = '22023';
  end if;
  insert into public.availability_blocks (
    camera_id, kind, starts_at, ends_at, created_by, reason
  ) values (
    p_camera_id, p_kind, p_starts_at, p_ends_at, caller, p_reason
  ) returning id into block_id;
  return block_id;
end;
$$;

create function private.release_manual_block(p_block_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
begin
  update public.availability_blocks
  set released_at = statement_timestamp(), released_by = caller
  where id = p_block_id
    and booking_id is null
    and released_at is null;
  if not found then
    raise exception 'active manual or maintenance block not found' using errcode = 'P0002';
  end if;
end;
$$;

create function private.complete_pickup(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_condition_summary text,
  p_accessories jsonb,
  p_notes text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  handoff_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  perform 1 from public.bookings
  where id = p_booking_id and state = 'CONFIRMED'
  for update;
  if not found then
    raise exception 'confirmed booking not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.bookings as booking
    join public.verification_records as verification
      on verification.user_id = booking.renter_id
     and verification.status = 'verified'
     and verification.document_expiration_date
       >= (statement_timestamp() at time zone 'Asia/Manila')::date
    join public.contract_versions as version
      on version.id = booking.current_contract_version_id
     and version.status = 'issued'
    join public.contract_signatures as signature
      on signature.contract_version_id = version.id
     and signature.renter_id = booking.renter_id
    where booking.id = p_booking_id
  ) then
    raise exception 'current verification and signed contract are required for pickup'
      using errcode = '23514';
  end if;

  insert into public.handoffs (
    booking_id, type, conducted_by, named_renter_present, original_id_checked,
    original_id_matched, camera_serial_checked, accessory_checklist_completed,
    actual_at, notes
  ) values (
    p_booking_id, 'pickup', caller, true, true, true, true, true, p_actual_at, p_notes
  ) returning id into handoff_id;

  insert into public.condition_reports (
    handoff_id, camera_condition_summary, accessory_checklist_snapshot,
    has_damage, has_missing_items, notes, reported_by
  ) values (
    handoff_id, p_condition_summary, p_accessories, false, false, p_notes, caller
  );

  perform private.transition_booking(
    p_booking_id, 'CONFIRMED', 'ACTIVE', 'admin', 'pickup_completed', null, operation_id
  );
  perform private.write_audit(
    operation_id, 'complete_pickup', 'booking', p_booking_id, 'success', 'physical handoff'
  );
  return handoff_id;
end;
$$;

create function private.record_return(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_condition_summary text,
  p_accessories jsonb,
  p_has_damage boolean,
  p_has_missing_items boolean,
  p_notes text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  handoff_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  perform 1 from public.bookings
  where id = p_booking_id and state = 'ACTIVE'
  for update;
  if not found then
    raise exception 'active booking not found' using errcode = 'P0002';
  end if;

  insert into public.handoffs (
    booking_id, type, conducted_by, named_renter_present, original_id_checked,
    original_id_matched, camera_serial_checked, accessory_checklist_completed,
    actual_at, notes
  ) values (
    p_booking_id, 'return', caller, null, null, null, true, true, p_actual_at, p_notes
  ) returning id into handoff_id;

  insert into public.condition_reports (
    handoff_id, camera_condition_summary, accessory_checklist_snapshot,
    has_damage, has_missing_items, notes, reported_by
  ) values (
    handoff_id, p_condition_summary, p_accessories,
    p_has_damage, p_has_missing_items, p_notes, caller
  );

  perform private.transition_booking(
    p_booking_id, 'ACTIVE', 'RETURN_REVIEW', 'admin', 'return_recorded', null, operation_id
  );
  return handoff_id;
end;
$$;

create function private.decide_return_review(
  p_booking_id uuid,
  p_has_issue boolean,
  p_note text
)
returns public.booking_state
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  target_state public.booking_state := case
    when p_has_issue then 'ISSUE_REVIEW'::public.booking_state
    else 'COMPLETED'::public.booking_state
  end;
  operation_id uuid := gen_random_uuid();
  report_has_issue boolean;
  held_deposit numeric(12,2);
begin
  select
    report.has_damage or report.has_missing_items,
    booking.security_deposit_amount
  into report_has_issue, held_deposit
  from public.bookings as booking
  join public.handoffs as handoff
    on handoff.booking_id = booking.id and handoff.type = 'return'
  join public.condition_reports as report on report.handoff_id = handoff.id
  where booking.id = p_booking_id and booking.state = 'RETURN_REVIEW'
  for update of booking;

  if report_has_issue is null then
    raise exception 'return report not found' using errcode = 'P0002';
  end if;
  if report_has_issue <> p_has_issue then
    raise exception 'return decision must match the recorded condition flags' using errcode = '23514';
  end if;

  insert into public.deposit_settlements (booking_id, held_amount)
  select p_booking_id, held_deposit
  where not exists (
    select 1 from public.deposit_settlements
    where booking_id = p_booking_id and status in ('pending', 'final')
  );

  perform private.transition_booking(
    p_booking_id, 'RETURN_REVIEW', target_state, 'admin',
    case when p_has_issue then 'return_issue_found' else 'return_cleared' end,
    p_note, operation_id
  );
  if target_state = 'COMPLETED' then
    perform private.release_booking_block(p_booking_id, caller);
  end if;
  perform private.write_audit(
    operation_id,
    'decide_return_review',
    'booking',
    p_booking_id,
    'success',
    'return inspection',
    jsonb_build_object('resulting_state', target_state)
  );
  return target_state;
end;
$$;

create function private.complete_issue_review(p_booking_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  operation_id uuid := gen_random_uuid();
begin
  perform 1 from public.bookings
  where id = p_booking_id and state = 'ISSUE_REVIEW'
  for update;
  if not found then
    raise exception 'booking is not in issue review' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.deposit_settlements
    where booking_id = p_booking_id and status = 'final'
  ) then
    raise exception 'a final deposit settlement is required to complete issue review'
      using errcode = '23514';
  end if;
  perform private.transition_booking(
    p_booking_id, 'ISSUE_REVIEW', 'COMPLETED', 'admin', 'issue_review_completed', p_note, operation_id
  );
  perform private.release_booking_block(p_booking_id, caller);
  perform private.write_audit(
    operation_id,
    'complete_issue_review',
    'booking',
    p_booking_id,
    'success',
    'manual issue resolution'
  );
end;
$$;

create function private.record_refund(
  p_booking_id uuid,
  p_amount numeric,
  p_reference text,
  p_recipient_name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  transaction_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  perform 1
  from public.bookings
  where id = p_booking_id
    and state in ('CANCELLED', 'RETURN_REVIEW', 'ISSUE_REVIEW', 'COMPLETED')
  for update;
  if not found then
    raise exception 'booking is not eligible for refund recording' using errcode = '22023';
  end if;

  insert into public.payment_transactions (
    booking_id,
    direction,
    amount,
    reference,
    counterparty_display_name,
    submitted_by
  ) values (
    p_booking_id,
    'outgoing',
    p_amount,
    btrim(p_reference),
    btrim(p_recipient_name),
    caller
  ) returning id into transaction_id;

  insert into public.payment_allocations (transaction_id, booking_id, kind, amount)
  values (transaction_id, p_booking_id, 'deposit_refund', p_amount);

  update public.payment_transactions
  set status = 'verified', decided_at = statement_timestamp(), decided_by = caller
  where id = transaction_id;

  perform private.write_audit(
    operation_id,
    'record_refund',
    'payment_transaction',
    transaction_id,
    'success',
    'manual GCash refund recording'
  );
  return transaction_id;
end;
$$;

create function private.finalize_deposit_settlement(
  p_booking_id uuid,
  p_refund_amount numeric,
  p_deduction_amount numeric,
  p_deduction_reason text,
  p_refund_transaction_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  current_settlement public.deposit_settlements%rowtype;
  held numeric(12,2);
  settlement_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  perform 1
  from public.bookings
  where id = p_booking_id
    and state in ('CANCELLED', 'RETURN_REVIEW', 'ISSUE_REVIEW', 'COMPLETED')
  for update;
  if not found then
    raise exception 'booking is not eligible for deposit settlement' using errcode = '22023';
  end if;

  select * into current_settlement
  from public.deposit_settlements
  where booking_id = p_booking_id and status in ('pending', 'final')
  for update;

  held := current_settlement.held_amount;
  if held is null then
    select coalesce(sum(allocation.amount), 0)
      into held
    from public.payment_allocations as allocation
    join public.payment_transactions as payment on payment.id = allocation.transaction_id
    where allocation.booking_id = p_booking_id
      and allocation.kind = 'security_deposit'
      and payment.status = 'verified'
      and payment.direction = 'incoming';
  end if;

  if held <= 0 or p_refund_amount < 0 or p_deduction_amount < 0
    or p_refund_amount + p_deduction_amount <> held
  then
    raise exception 'refund and deduction must balance the verified held deposit'
      using errcode = '23514';
  end if;

  if p_deduction_amount > 0 and nullif(btrim(coalesce(p_deduction_reason, '')), '') is null then
    raise exception 'a deduction reason is required' using errcode = '22023';
  end if;

  if p_refund_amount > 0 and not exists (
    select 1
    from public.payment_transactions as payment
    join public.payment_allocations as allocation on allocation.transaction_id = payment.id
    where payment.id = p_refund_transaction_id
      and payment.booking_id = p_booking_id
      and payment.direction = 'outgoing'
      and payment.status = 'verified'
      and allocation.kind = 'deposit_refund'
      and allocation.amount = p_refund_amount
  ) then
    raise exception 'verified outgoing refund transaction is required'
      using errcode = '23514';
  end if;

  if current_settlement.id is not null then
    update public.deposit_settlements
    set status = 'reversed'
    where id = current_settlement.id;
  end if;

  insert into public.deposit_settlements (
    booking_id,
    held_amount,
    refund_amount,
    deduction_amount,
    deduction_reason,
    status,
    decided_at,
    decided_by,
    refund_transaction_id,
    supersedes_id
  ) values (
    p_booking_id,
    held,
    p_refund_amount,
    p_deduction_amount,
    nullif(btrim(coalesce(p_deduction_reason, '')), ''),
    'final',
    statement_timestamp(),
    caller,
    p_refund_transaction_id,
    current_settlement.id
  ) returning id into settlement_id;

  perform private.write_audit(
    operation_id,
    'finalize_deposit_settlement',
    'deposit_settlement',
    settlement_id,
    'success',
    'manual deposit disposition'
  );
  return settlement_id;
end;
$$;

create function private.create_payment_proof_upload(
  p_transaction_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256 bytea
)
returns table (proof_id uuid, object_path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  generated_id uuid := gen_random_uuid();
  generated_path text;
begin
  if not exists (
    select 1
    from public.payment_transactions as payment
    join public.bookings as booking on booking.id = payment.booking_id
    where payment.id = p_transaction_id
      and booking.renter_id = caller
      and payment.status = 'submitted'
  ) then
    raise exception 'submitted own payment not found' using errcode = 'P0002';
  end if;

  if p_media_type not in ('image/jpeg', 'image/png', 'application/pdf')
    or p_byte_size <= 0 or p_byte_size > 10485760
  then
    raise exception 'unsupported payment proof file' using errcode = '22023';
  end if;

  generated_path := caller::text || '/' || generated_id::text;
  insert into public.payment_proofs (
    id, transaction_id, owner_user_id, object_path, media_type, byte_size, sha256
  ) values (
    generated_id, p_transaction_id, caller, generated_path, p_media_type, p_byte_size, p_sha256
  );

  return query select generated_id, generated_path;
end;
$$;

create function private.create_verification_document_upload(
  p_verification_record_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256 bytea
)
returns table (document_id uuid, object_path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.current_user_id();
  raise exception 'government-ID upload is disabled until LB-01 privacy and retention approval'
    using errcode = '0A000';
end;
$$;

create function api.ensure_profile(p_legal_name text, p_phone text)
returns public.profiles
language sql
volatile
security invoker
set search_path = ''
as $$ select private.ensure_profile(p_legal_name, p_phone); $$;

create function api.request_booking(
  p_camera_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz,
  p_intended_use text,
  p_expected_location text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_booking(
    p_camera_id, p_pickup_at, p_return_at, p_intended_use, p_expected_location
  );
$$;

create function api.approve_booking(p_booking_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.approve_booking(p_booking_id); $$;

create function api.reject_booking(p_booking_id uuid, p_reason text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.reject_booking(p_booking_id, p_reason); $$;

create function api.request_cancellation(p_booking_id uuid, p_reason text)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$ select private.request_cancellation(p_booking_id, p_reason); $$;

create function api.decide_cancellation(p_request_id uuid, p_accept boolean, p_note text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.decide_cancellation(p_request_id, p_accept, p_note); $$;

create function api.sign_contract(
  p_booking_id uuid,
  p_signature_intent text,
  p_attestation_text text,
  p_acknowledged_content_sha256 bytea
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.sign_contract(
    p_booking_id, p_signature_intent, p_attestation_text, p_acknowledged_content_sha256
  );
$$;

create function api.submit_payment(
  p_booking_id uuid,
  p_amount numeric,
  p_reference text,
  p_sender_name text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$ select private.submit_payment(p_booking_id, p_amount, p_reference, p_sender_name); $$;

create function api.verify_payment(
  p_payment_id uuid,
  p_rental_allocation numeric,
  p_deposit_allocation numeric
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.verify_payment(p_payment_id, p_rental_allocation, p_deposit_allocation); $$;

create function api.reject_payment(p_payment_id uuid, p_reason text)
returns public.booking_state
language sql
volatile
security invoker
set search_path = ''
as $$ select private.reject_payment(p_payment_id, p_reason); $$;

create function api.expire_due_bookings()
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$ select private.expire_due_bookings(); $$;

create function api.create_manual_block(
  p_camera_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_kind public.availability_block_kind,
  p_reason text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$ select private.create_manual_block(p_camera_id, p_starts_at, p_ends_at, p_kind, p_reason); $$;

create function api.release_manual_block(p_block_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.release_manual_block(p_block_id); $$;

create function api.complete_pickup(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_condition_summary text,
  p_accessories jsonb,
  p_notes text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.complete_pickup(
    p_booking_id, p_actual_at, p_condition_summary, p_accessories, p_notes
  );
$$;

create function api.record_return(
  p_booking_id uuid,
  p_actual_at timestamptz,
  p_condition_summary text,
  p_accessories jsonb,
  p_has_damage boolean,
  p_has_missing_items boolean,
  p_notes text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_return(
    p_booking_id, p_actual_at, p_condition_summary, p_accessories,
    p_has_damage, p_has_missing_items, p_notes
  );
$$;

create function api.decide_return_review(p_booking_id uuid, p_has_issue boolean, p_note text)
returns public.booking_state
language sql
volatile
security invoker
set search_path = ''
as $$ select private.decide_return_review(p_booking_id, p_has_issue, p_note); $$;

create function api.complete_issue_review(p_booking_id uuid, p_note text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.complete_issue_review(p_booking_id, p_note); $$;

create function api.record_refund(
  p_booking_id uuid,
  p_amount numeric,
  p_reference text,
  p_recipient_name text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_refund(p_booking_id, p_amount, p_reference, p_recipient_name);
$$;

create function api.finalize_deposit_settlement(
  p_booking_id uuid,
  p_refund_amount numeric,
  p_deduction_amount numeric,
  p_deduction_reason text,
  p_refund_transaction_id uuid
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_deposit_settlement(
    p_booking_id,
    p_refund_amount,
    p_deduction_amount,
    p_deduction_reason,
    p_refund_transaction_id
  );
$$;

create function api.create_payment_proof_upload(
  p_transaction_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256 bytea
)
returns table (proof_id uuid, object_path text)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.create_payment_proof_upload(
    p_transaction_id, p_media_type, p_byte_size, p_sha256
  );
$$;

create function api.create_verification_document_upload(
  p_verification_record_id uuid,
  p_media_type text,
  p_byte_size bigint,
  p_sha256 bytea
)
returns table (document_id uuid, object_path text)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.create_verification_document_upload(
    p_verification_record_id, p_media_type, p_byte_size, p_sha256
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema api from public, anon, authenticated;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.owns_booking(uuid) to authenticated;
grant execute on function private.owns_condition_report(uuid) to authenticated;
grant execute on function private.ensure_profile(text, text) to authenticated;
grant execute on function private.request_booking(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function private.approve_booking(uuid) to authenticated;
grant execute on function private.reject_booking(uuid, text) to authenticated;
grant execute on function private.request_cancellation(uuid, text) to authenticated;
grant execute on function private.decide_cancellation(uuid, boolean, text) to authenticated;
grant execute on function private.sign_contract(uuid, text, text, bytea) to authenticated;
grant execute on function private.submit_payment(uuid, numeric, text, text) to authenticated;
grant execute on function private.verify_payment(uuid, numeric, numeric) to authenticated;
grant execute on function private.reject_payment(uuid, text) to authenticated;
grant execute on function private.expire_due_bookings() to authenticated;
grant execute on function private.create_manual_block(uuid, timestamptz, timestamptz, public.availability_block_kind, text) to authenticated;
grant execute on function private.release_manual_block(uuid) to authenticated;
grant execute on function private.complete_pickup(uuid, timestamptz, text, jsonb, text) to authenticated;
grant execute on function private.record_return(uuid, timestamptz, text, jsonb, boolean, boolean, text) to authenticated;
grant execute on function private.decide_return_review(uuid, boolean, text) to authenticated;
grant execute on function private.complete_issue_review(uuid, text) to authenticated;
grant execute on function private.record_refund(uuid, numeric, text, text) to authenticated;
grant execute on function private.finalize_deposit_settlement(uuid, numeric, numeric, text, uuid) to authenticated;
grant execute on function private.create_payment_proof_upload(uuid, text, bigint, bytea) to authenticated;
grant execute on function private.create_verification_document_upload(uuid, text, bigint, bytea) to authenticated;

grant execute on function api.ensure_profile(text, text) to authenticated;
grant execute on function api.request_booking(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function api.approve_booking(uuid) to authenticated;
grant execute on function api.reject_booking(uuid, text) to authenticated;
grant execute on function api.request_cancellation(uuid, text) to authenticated;
grant execute on function api.decide_cancellation(uuid, boolean, text) to authenticated;
grant execute on function api.sign_contract(uuid, text, text, bytea) to authenticated;
grant execute on function api.submit_payment(uuid, numeric, text, text) to authenticated;
grant execute on function api.verify_payment(uuid, numeric, numeric) to authenticated;
grant execute on function api.reject_payment(uuid, text) to authenticated;
grant execute on function api.expire_due_bookings() to authenticated;
grant execute on function api.create_manual_block(uuid, timestamptz, timestamptz, public.availability_block_kind, text) to authenticated;
grant execute on function api.release_manual_block(uuid) to authenticated;
grant execute on function api.complete_pickup(uuid, timestamptz, text, jsonb, text) to authenticated;
grant execute on function api.record_return(uuid, timestamptz, text, jsonb, boolean, boolean, text) to authenticated;
grant execute on function api.decide_return_review(uuid, boolean, text) to authenticated;
grant execute on function api.complete_issue_review(uuid, text) to authenticated;
grant execute on function api.record_refund(uuid, numeric, text, text) to authenticated;
grant execute on function api.finalize_deposit_settlement(uuid, numeric, numeric, text, uuid) to authenticated;
grant execute on function api.create_payment_proof_upload(uuid, text, bigint, bytea) to authenticated;
grant execute on function api.create_verification_document_upload(uuid, text, bigint, bytea) to authenticated;
