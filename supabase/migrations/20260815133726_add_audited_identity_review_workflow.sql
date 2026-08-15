-- Sprint 2 audited administrator identity review.
--
-- Verification records remain the current projection for one submission.
-- Every administrator decision and automatic expiry is also appended to a
-- private immutable history table. Raw evidence paths are returned only by a
-- narrow, database-authorized access operation and are never persisted in its
-- audit metadata.

create table private.verification_decision_history (
  id bigint generated always as identity primary key,
  verification_record_id uuid not null
    references public.verification_records (id) on delete restrict,
  user_id uuid not null references public.profiles (user_id) on delete restrict,
  from_status public.verification_status not null,
  to_status public.verification_status not null,
  actor_user_id uuid references auth.users (id) on delete restrict,
  actor_type public.booking_actor_type not null,
  reason_code text not null,
  renter_facing_reason_code text,
  approved_id_type text not null,
  document_expiration_date date,
  operation_id uuid not null,
  occurred_at timestamptz not null default statement_timestamp(),
  check (
    (from_status = 'pending' and to_status in ('verified', 'rejected'))
    or (from_status = 'verified' and to_status = 'expired')
  ),
  check (
    (actor_type = 'admin' and actor_user_id is not null)
    or (actor_type = 'system' and actor_user_id is null)
  ),
  check (to_status = 'expired' or actor_type = 'admin'),
  check (
    (to_status = 'rejected' and renter_facing_reason_code in (
      'details_do_not_match',
      'document_expired',
      'document_not_readable',
      'masking_incomplete',
      'unsupported_document'
    ))
    or (to_status <> 'rejected' and renter_facing_reason_code is null)
  ),
  check (
    (to_status in ('verified', 'expired') and document_expiration_date is not null)
    or (to_status = 'rejected' and document_expiration_date is null)
  )
);

create index verification_decision_history_record_idx
on private.verification_decision_history (verification_record_id, id);

create index verification_decision_history_user_idx
on private.verification_decision_history (user_id, id desc);

create index verification_decision_history_operation_idx
on private.verification_decision_history (operation_id);

alter table private.verification_decision_history enable row level security;

create trigger verification_decision_history_append_only
before update or delete on private.verification_decision_history
for each row execute function private.reject_update_or_delete();

create function private.guard_verification_record_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.supersedes_id is distinct from old.supersedes_id
  then
    raise exception 'verification record identity and lineage are immutable'
      using errcode = '55000';
  end if;

  if old.status = 'pending' and new.status = 'pending' then
    if new.document_expiration_date is not null
      or new.decided_at is not null
      or new.decided_by is not null
      or new.rejection_reason is not null
    then
      raise exception 'pending verification decision metadata is invalid'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status = 'verified' then
    if new.document_expiration_date is null
      or new.decided_at is null
      or new.decided_by is null
      or new.rejection_reason is not null
      or new.submitted_at is distinct from old.submitted_at
    then
      raise exception 'verified decision metadata is invalid'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status = 'rejected' then
    if new.document_expiration_date is not null
      or new.decided_at is null
      or new.decided_by is null
      or new.rejection_reason not in (
        'details_do_not_match',
        'document_expired',
        'document_not_readable',
        'masking_incomplete',
        'unsupported_document'
      )
      or new.id_type is distinct from old.id_type
      or new.submitted_at is distinct from old.submitted_at
    then
      raise exception 'rejected decision metadata is invalid'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if old.status = 'verified' and new.status = 'expired' then
    if new.id_type is distinct from old.id_type
      or new.document_expiration_date is distinct from old.document_expiration_date
      or new.submitted_at is distinct from old.submitted_at
      or new.decided_at is distinct from old.decided_at
      or new.decided_by is distinct from old.decided_by
      or new.rejection_reason is distinct from old.rejection_reason
    then
      raise exception 'verification expiry may only change the current projection status'
        using errcode = '55000';
    end if;
    return new;
  end if;

  raise exception 'verification decision history is immutable'
    using errcode = '55000';
end;
$$;

create trigger verification_records_history_guard
before update on public.verification_records
for each row execute function private.guard_verification_record_history();

create function private.link_replacement_verification_record()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_record public.verification_records%rowtype;
begin
  if new.status <> 'pending' or new.supersedes_id is not null then
    return new;
  end if;

  select * into previous_record
  from public.verification_records as record
  where record.user_id = new.user_id
    and record.id <> new.id
  order by record.submitted_at desc, record.id desc
  limit 1
  for update;

  if previous_record.id is not null then
    if previous_record.status not in ('rejected', 'expired') then
      raise exception 'new verification submission cannot supersede an active decision'
        using errcode = '55000';
    end if;
    new.supersedes_id := previous_record.id;
  end if;

  return new;
end;
$$;

create trigger verification_records_link_replacement
before insert on public.verification_records
for each row execute function private.link_replacement_verification_record();

create unique index verification_documents_one_replacement_child_idx
on public.verification_documents (supersedes_id)
where supersedes_id is not null;

create function private.link_replacement_verification_document()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_record public.verification_records%rowtype;
  prior_document public.verification_documents%rowtype;
begin
  select * into current_record
  from public.verification_records
  where id = new.verification_record_id;

  if current_record.id is null then
    raise exception 'verification record is required before document finalization'
      using errcode = '23503';
  end if;

  if new.supersedes_id is null and current_record.supersedes_id is not null then
    select * into prior_document
    from public.verification_documents as document
    where document.verification_record_id = current_record.supersedes_id
      and document.owner_user_id = new.owner_user_id
      and document.superseded_at is null
      and document.verified_deleted_at is null
    order by document.created_at desc, document.id desc
    limit 1
    for update;

    new.supersedes_id := prior_document.id;
  elsif new.supersedes_id is not null then
    select * into prior_document
    from public.verification_documents
    where id = new.supersedes_id
    for update;
  end if;

  if new.supersedes_id is not null then
    if prior_document.id is null
      or prior_document.owner_user_id <> new.owner_user_id
      or prior_document.verified_deleted_at is not null
      or (
        prior_document.verification_record_id <> new.verification_record_id
        and prior_document.verification_record_id is distinct from current_record.supersedes_id
      )
    then
      raise exception 'verification replacement document lineage is invalid'
        using errcode = '55000';
    end if;

    update public.verification_documents
    set superseded_at = statement_timestamp()
    where id = prior_document.id
      and superseded_at is null;
  end if;

  return new;
end;
$$;

create trigger verification_documents_link_replacement
before insert on public.verification_documents
for each row execute function private.link_replacement_verification_document();

create function private.get_verification_review_queue()
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'record_id', record.id,
        'renter_legal_name', profile.legal_name,
        'id_type', record.id_type,
        'submitted_at', record.submitted_at,
        'age_seconds', greatest(
          0,
          extract(epoch from (statement_timestamp() - record.submitted_at))::bigint
        )
      )
      order by record.submitted_at, record.id
    ),
    '[]'::jsonb
  ) into result
  from public.verification_records as record
  join public.profiles as profile on profile.user_id = record.user_id
  where record.status = 'pending'
    and not exists (
      select 1
      from public.verification_records as newer
      where newer.user_id = record.user_id
        and (newer.submitted_at, newer.id) > (record.submitted_at, record.id)
    )
    and exists (
      select 1
      from public.verification_documents as document
      where document.verification_record_id = record.id
        and document.superseded_at is null
        and document.deletion_requested_at is null
        and document.verified_deleted_at is null
        and document.retention_until > statement_timestamp()
    );

  return result;
end;
$$;

create function private.get_verification_review_detail(p_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'record_id', record.id,
    'status', record.status,
    'renter_legal_name', profile.legal_name,
    'id_type', record.id_type,
    'submitted_at', record.submitted_at,
    'media_type', document.media_type,
    'byte_size', document.byte_size,
    'retention_until', document.retention_until
  ) into target
  from public.verification_records as record
  join public.profiles as profile on profile.user_id = record.user_id
  join public.verification_documents as document
    on document.verification_record_id = record.id
   and document.superseded_at is null
   and document.deletion_requested_at is null
   and document.verified_deleted_at is null
   and document.retention_until > statement_timestamp()
  where record.id = p_record_id
    and record.status = 'pending'
    and not exists (
      select 1
      from public.verification_records as newer
      where newer.user_id = record.user_id
        and (newer.submitted_at, newer.id) > (record.submitted_at, record.id)
    );

  if target is null then
    raise exception 'verification_review_not_found' using errcode = 'P0002';
  end if;

  return target;
end;
$$;

create function private.authorize_verification_evidence_access(
  p_record_id uuid,
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
  caller uuid := auth.uid();
  target_record public.verification_records%rowtype;
  target_document public.verification_documents%rowtype;
begin
  if caller is null or not private.is_admin() then
    raise exception 'verification_access_unauthorized' using errcode = '42501';
  end if;
  if p_operation_id is null or p_purpose <> 'identity_review' then
    raise exception 'verification_access_invalid_purpose' using errcode = '22023';
  end if;

  select * into target_record
  from public.verification_records as record
  where record.id = p_record_id
  for share;

  if target_record.id is null
    or target_record.status <> 'pending'
    or exists (
      select 1
      from public.verification_records as newer
      where newer.user_id = target_record.user_id
        and (newer.submitted_at, newer.id)
          > (target_record.submitted_at, target_record.id)
    )
  then
    raise exception 'verification_access_stale' using errcode = 'P0001';
  end if;

  select * into target_document
  from public.verification_documents as document
  where document.verification_record_id = target_record.id
    and document.superseded_at is null
    and document.deletion_requested_at is null
    and document.verified_deleted_at is null
    and document.retention_until > statement_timestamp()
  order by document.created_at desc, document.id desc
  limit 1
  for share;

  if target_document.id is null then
    raise exception 'verification_access_evidence_unavailable' using errcode = 'P0002';
  end if;

  perform private.write_verification_audit(
    caller,
    p_operation_id,
    'authorize_verification_evidence_access',
    'verification_record',
    target_record.id,
    'authorized',
    'identity verification review',
    jsonb_build_object(
      'document_id', target_document.id,
      'expires_in_seconds', 60
    )
  );

  return jsonb_build_object(
    'record_id', target_record.id,
    'document_id', target_document.id,
    'object_path', target_document.object_path,
    'expires_in_seconds', 60
  );
end;
$$;

create function private.decide_verification(
  p_record_id uuid,
  p_reviewed_document_id uuid,
  p_decision text,
  p_approved_id_type text,
  p_document_expiration_date date,
  p_rejection_reason_code text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target_record public.verification_records%rowtype;
  target_document public.verification_documents%rowtype;
  target_profile public.profiles%rowtype;
  policy private.verification_evidence_policies%rowtype;
  decision_time timestamptz := statement_timestamp();
  manila_date date := (statement_timestamp() at time zone 'Asia/Manila')::date;
  next_status public.verification_status;
  reason_code text;
begin
  if caller is null or not private.is_admin() then
    raise exception 'verification_decision_unauthorized' using errcode = '42501';
  end if;
  if p_operation_id is null
    or p_reviewed_document_id is null
    or p_decision not in ('verified', 'rejected')
  then
    raise exception 'verification_decision_invalid' using errcode = '22023';
  end if;

  select * into target_record
  from public.verification_records as record
  where record.id = p_record_id;

  if target_record.id is null then
    raise exception 'verification_decision_not_found' using errcode = 'P0002';
  end if;

  -- Match the existing upload/finalization lock order so a renter replacement
  -- cannot deadlock an administrator decision.
  select * into policy
  from private.verification_evidence_policies
  where singleton
  for share;

  select * into target_profile
  from public.profiles
  where user_id = target_record.user_id
  for share;

  select * into target_record
  from public.verification_records as record
  where record.id = p_record_id
  for update;

  if target_record.id is null then
    raise exception 'verification_decision_not_found' using errcode = 'P0002';
  end if;
  if target_record.status <> 'pending'
    or exists (
      select 1
      from public.verification_records as newer
      where newer.user_id = target_record.user_id
        and (newer.submitted_at, newer.id)
          > (target_record.submitted_at, target_record.id)
    )
  then
    raise exception 'verification_decision_stale' using errcode = 'P0001';
  end if;

  if target_profile.user_id is distinct from target_record.user_id
    or target_profile.account_status <> 'active'
  then
    raise exception 'verification_decision_profile_inactive' using errcode = '22023';
  end if;

  select * into target_document
  from public.verification_documents as document
    where document.verification_record_id = target_record.id
      and document.superseded_at is null
      and document.deletion_requested_at is null
      and document.verified_deleted_at is null
      and document.retention_until > decision_time
  order by document.created_at desc, document.id desc
  limit 1
  for share;

  if target_document.id is null
    or target_document.id <> p_reviewed_document_id
  then
    raise exception 'verification_decision_evidence_unavailable' using errcode = '22023';
  end if;

  if p_decision = 'verified' then
    if p_approved_id_type is null
      or not (p_approved_id_type = any(policy.allowed_id_types))
      or p_document_expiration_date is null
      or p_document_expiration_date <= manila_date
      or p_rejection_reason_code is not null
    then
      raise exception 'verification_decision_metadata_invalid' using errcode = '22023';
    end if;

    next_status := 'verified';
    reason_code := 'identity_verified';

    update public.verification_records
    set status = next_status,
        id_type = p_approved_id_type,
        document_expiration_date = p_document_expiration_date,
        decided_at = decision_time,
        decided_by = caller,
        rejection_reason = null
    where id = target_record.id;
  else
    if p_approved_id_type is not null
      or p_document_expiration_date is not null
      or p_rejection_reason_code not in (
        'details_do_not_match',
        'document_expired',
        'document_not_readable',
        'masking_incomplete',
        'unsupported_document'
      )
    then
      raise exception 'verification_decision_metadata_invalid' using errcode = '22023';
    end if;

    next_status := 'rejected';
    reason_code := 'identity_rejected';

    update public.verification_records
    set status = next_status,
        document_expiration_date = null,
        decided_at = decision_time,
        decided_by = caller,
        rejection_reason = p_rejection_reason_code
    where id = target_record.id;
  end if;

  insert into private.verification_decision_history (
    verification_record_id,
    user_id,
    from_status,
    to_status,
    actor_user_id,
    actor_type,
    reason_code,
    renter_facing_reason_code,
    approved_id_type,
    document_expiration_date,
    operation_id,
    occurred_at
  ) values (
    target_record.id,
    target_record.user_id,
    'pending',
    next_status,
    caller,
    'admin',
    reason_code,
    case when next_status = 'rejected' then p_rejection_reason_code end,
    case when next_status = 'verified' then p_approved_id_type else target_record.id_type end,
    case when next_status = 'verified' then p_document_expiration_date end,
    p_operation_id,
    decision_time
  );

  perform private.write_verification_audit(
    caller,
    p_operation_id,
    case when next_status = 'verified'
      then 'verify_renter_identity'
      else 'reject_renter_identity'
    end,
    'verification_record',
    target_record.id,
    'success',
    'identity verification decision',
    jsonb_strip_nulls(jsonb_build_object(
      'status', next_status,
      'reviewed_document_id', target_document.id,
      'approved_id_type', case when next_status = 'verified'
        then p_approved_id_type else target_record.id_type end,
      'document_expiration_date', case when next_status = 'verified'
        then p_document_expiration_date end,
      'renter_facing_reason_code', case when next_status = 'rejected'
        then p_rejection_reason_code end
    ))
  );

  return jsonb_build_object(
    'record_id', target_record.id,
    'status', next_status,
    'decided_at', decision_time
  );
end;
$$;

create function private.expire_due_verifications(p_operation_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  actor_type public.booking_actor_type;
  manila_date date := (statement_timestamp() at time zone 'Asia/Manila')::date;
  target public.verification_records%rowtype;
  expired_count integer := 0;
begin
  if p_operation_id is null then
    raise exception 'verification expiry operation is required' using errcode = '22023';
  end if;
  if caller is not null and not private.is_admin() then
    raise exception 'verification_expiry_unauthorized' using errcode = '42501';
  end if;

  actor_type := case when caller is null then 'system' else 'admin' end;

  for target in
    select record.*
    from public.verification_records as record
    where record.status = 'verified'
      and record.document_expiration_date < manila_date
      and not exists (
        select 1
        from public.verification_records as newer
        where newer.user_id = record.user_id
          and (newer.submitted_at, newer.id) > (record.submitted_at, record.id)
      )
    order by record.document_expiration_date, record.submitted_at, record.id
    for update skip locked
  loop
    update public.verification_records
    set status = 'expired'
    where id = target.id
      and status = 'verified';

    if found then
      insert into private.verification_decision_history (
        verification_record_id,
        user_id,
        from_status,
        to_status,
        actor_user_id,
        actor_type,
        reason_code,
        approved_id_type,
        document_expiration_date,
        operation_id
      ) values (
        target.id,
        target.user_id,
        'verified',
        'expired',
        caller,
        actor_type,
        'document_expired_manila_date',
        target.id_type,
        target.document_expiration_date,
        p_operation_id
      );

      perform private.write_verification_audit(
        caller,
        p_operation_id,
        'expire_renter_identity',
        'verification_record',
        target.id,
        'success',
        'identity verification expiry',
        jsonb_build_object(
          'approved_id_type', target.id_type,
          'document_expiration_date', target.document_expiration_date,
          'business_time_zone', 'Asia/Manila'
        )
      );

      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$$;

create or replace function private.get_my_verification_upload_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_user_id();
  target_record public.verification_records%rowtype;
  target_document public.verification_documents%rowtype;
  target_intent private.verification_upload_intents%rowtype;
  owned_documents jsonb;
  effective_status public.verification_status;
  safe_rejection_reason text;
begin
  select * into target_record
  from public.verification_records as record
  where record.user_id = caller
  order by record.submitted_at desc, record.id desc
  limit 1;

  if target_record.id is not null then
    effective_status := case
      when target_record.status = 'verified'
        and target_record.document_expiration_date
          < (statement_timestamp() at time zone 'Asia/Manila')::date
      then 'expired'::public.verification_status
      else target_record.status
    end;

    safe_rejection_reason := case
      when target_record.status = 'rejected'
        and target_record.rejection_reason in (
          'details_do_not_match',
          'document_expired',
          'document_not_readable',
          'masking_incomplete',
          'unsupported_document'
        )
      then target_record.rejection_reason
      when target_record.status = 'rejected' then 'other'
      else null
    end;

    select * into target_document
    from public.verification_documents as document
    where document.verification_record_id = target_record.id
      and document.superseded_at is null
      and document.verified_deleted_at is null
    order by document.created_at desc, document.id desc
    limit 1;
  end if;

  select * into target_intent
  from private.verification_upload_intents as intent
  where intent.owner_user_id = caller
    and intent.status in ('awaiting_upload', 'cleanup_pending')
  order by intent.created_at desc, intent.id desc
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', document.id,
        'media_type', document.media_type,
        'byte_size', document.byte_size,
        'finalized_at', document.finalized_at,
        'retention_until', document.retention_until,
        'superseded_at', document.superseded_at,
        'deletion_requested_at', document.deletion_requested_at,
        'deleted_at', document.deleted_at,
        'verified_deleted_at', document.verified_deleted_at,
        'legal_hold', document.legal_hold_at is not null,
        'deletion_eligible', document.retention_until <= statement_timestamp()
          and document.legal_hold_at is null
          and document.verified_deleted_at is null
      )
      order by document.created_at desc, document.id desc
    ),
    '[]'::jsonb
  ) into owned_documents
  from public.verification_documents as document
  where document.owner_user_id = caller;

  return jsonb_build_object(
    'policy', private.verification_policy_json(),
    'record', case when target_record.id is null then null else jsonb_build_object(
      'id', target_record.id,
      'status', effective_status,
      'id_type', target_record.id_type,
      'submitted_at', target_record.submitted_at,
      'decided_at', target_record.decided_at,
      'document_expiration_date', target_record.document_expiration_date,
      'rejection_reason_code', safe_rejection_reason,
      'supersedes_id', target_record.supersedes_id
    ) end,
    'document', case when target_document.id is null then null else jsonb_build_object(
      'id', target_document.id,
      'media_type', target_document.media_type,
      'byte_size', target_document.byte_size,
      'finalized_at', target_document.finalized_at,
      'retention_until', target_document.retention_until,
      'superseded_at', target_document.superseded_at,
      'deletion_requested_at', target_document.deletion_requested_at,
      'deleted_at', target_document.deleted_at,
      'verified_deleted_at', target_document.verified_deleted_at,
      'legal_hold', target_document.legal_hold_at is not null,
      'deletion_eligible', target_document.retention_until <= statement_timestamp()
        and target_document.legal_hold_at is null
        and target_document.verified_deleted_at is null
    ) end,
    'documents', owned_documents,
    'intent', case when target_intent.id is null then null
      else private.verification_intent_json(target_intent, false)
    end
  );
end;
$$;

create or replace function private.reject_booking(p_booking_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := private.require_admin();
  operation_id uuid := gen_random_uuid();
  normalized_reason text := btrim(p_reason);
begin
  if normalized_reason is null or length(normalized_reason) not between 2 and 1000 then
    raise exception 'booking rejection reason is invalid' using errcode = '22023';
  end if;

  perform 1 from public.bookings where id = p_booking_id for update;
  perform private.transition_booking(
    p_booking_id,
    'FOR_REVIEW',
    'REJECTED',
    'admin',
    'booking_rejected',
    normalized_reason,
    operation_id
  );
  perform private.release_booking_block(p_booking_id, caller);
  perform private.write_audit(
    operation_id,
    'reject_booking',
    'booking',
    p_booking_id,
    'success',
    'booking review',
    '{}'::jsonb
  );
end;
$$;

create or replace function private.complete_pickup(
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
     and not exists (
       select 1
       from public.verification_records as newer
       where newer.user_id = verification.user_id
         and (newer.submitted_at, newer.id)
           > (verification.submitted_at, verification.id)
     )
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

create function api.get_verification_review_queue()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_verification_review_queue(); $$;

create function api.get_verification_review_detail(p_record_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_verification_review_detail(p_record_id); $$;

create function api.authorize_verification_evidence_access(
  p_record_id uuid,
  p_purpose text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.authorize_verification_evidence_access(
    p_record_id,
    p_purpose,
    p_operation_id
  );
$$;

create function api.decide_verification(
  p_record_id uuid,
  p_reviewed_document_id uuid,
  p_decision text,
  p_approved_id_type text,
  p_document_expiration_date date,
  p_rejection_reason_code text,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.decide_verification(
    p_record_id,
    p_reviewed_document_id,
    p_decision,
    p_approved_id_type,
    p_document_expiration_date,
    p_rejection_reason_code,
    p_operation_id
  );
$$;

create function api.expire_due_verifications(p_operation_id uuid)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$ select private.expire_due_verifications(p_operation_id); $$;

revoke all on table private.verification_decision_history
from public, anon, authenticated, service_role;

revoke all on function private.guard_verification_record_history()
from public, anon, authenticated, service_role;
revoke all on function private.link_replacement_verification_record()
from public, anon, authenticated, service_role;
revoke all on function private.link_replacement_verification_document()
from public, anon, authenticated, service_role;
revoke all on function private.get_verification_review_queue()
from public, anon, authenticated, service_role;
revoke all on function private.get_verification_review_detail(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.authorize_verification_evidence_access(uuid, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.decide_verification(uuid, uuid, text, text, date, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.expire_due_verifications(uuid)
from public, anon, authenticated, service_role;

grant execute on function private.get_verification_review_queue()
to authenticated;
grant execute on function private.get_verification_review_detail(uuid)
to authenticated;
grant execute on function private.authorize_verification_evidence_access(uuid, text, uuid)
to authenticated;
grant execute on function private.decide_verification(uuid, uuid, text, text, date, text, uuid)
to authenticated;
grant execute on function private.expire_due_verifications(uuid)
to authenticated, service_role;

revoke all on function api.get_verification_review_queue()
from public, anon, authenticated, service_role;
revoke all on function api.get_verification_review_detail(uuid)
from public, anon, authenticated, service_role;
revoke all on function api.authorize_verification_evidence_access(uuid, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.decide_verification(uuid, uuid, text, text, date, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.expire_due_verifications(uuid)
from public, anon, authenticated, service_role;

grant execute on function api.get_verification_review_queue()
to authenticated;
grant execute on function api.get_verification_review_detail(uuid)
to authenticated;
grant execute on function api.authorize_verification_evidence_access(uuid, text, uuid)
to authenticated;
grant execute on function api.decide_verification(uuid, uuid, text, text, date, text, uuid)
to authenticated;
grant execute on function api.expire_due_verifications(uuid)
to authenticated, service_role;

comment on table private.verification_decision_history is
  'Append-only history for administrator verification decisions and Manila-date expiry.';

comment on function private.authorize_verification_evidence_access(uuid, text, uuid) is
  'Authorizes and audits one 60-second identity-review access without persisting paths or URL tokens.';

comment on function private.decide_verification(uuid, uuid, text, text, date, text, uuid) is
  'Atomically records one current pending verification decision and its immutable audit history.';

comment on function private.expire_due_verifications(uuid) is
  'Idempotently expires only latest verified decisions after their Manila expiration date.';
