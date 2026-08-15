-- Sprint 1 government-ID evidence lifecycle.
--
-- This migration resolves the deliberate VER-07 / LB-01 fail-closed stub with
-- an owner-scoped, retry-safe workflow. Private bytes are uploaded only to an
-- exact, short-lived intent path. A verification record is created only after
-- the matching Storage object is present and verified. Replacement and
-- deletion preserve decision and audit history; Storage overwrite remains
-- impossible because no UPDATE policy is created. The policy is installed
-- disabled so applying this schema cannot activate ID collection. Production
-- activation requires a later, separately reviewed migration after legal
-- approval and the operational launch gates are complete.

drop function api.create_verification_document_upload(uuid, text, bigint, bytea);
drop function private.create_verification_document_upload(uuid, text, bigint, bytea);

create type private.verification_upload_intent_status as enum (
  'awaiting_upload',
  'finalized',
  'cleanup_pending',
  'cleaned',
  'expired'
);

create table private.verification_evidence_policies (
  singleton boolean primary key default true check (singleton),
  policy_version text not null unique,
  privacy_notice_version text not null,
  enabled boolean not null default false,
  allowed_id_types text[] not null,
  allowed_media_types text[] not null,
  max_byte_size bigint not null check (max_byte_size between 1 and 5242880),
  upload_intent_ttl interval not null check (upload_intent_ttl > interval '0 seconds'),
  document_retention interval not null check (document_retention > interval '0 seconds'),
  activated_at timestamptz,
  check (cardinality(allowed_id_types) > 0),
  check (cardinality(allowed_media_types) > 0),
  check (not enabled or activated_at is not null)
);

insert into private.verification_evidence_policies (
  policy_version,
  privacy_notice_version,
  enabled,
  allowed_id_types,
  allowed_media_types,
  max_byte_size,
  upload_intent_ttl,
  document_retention,
  activated_at
) values (
  'government-id-evidence-v1',
  'government-id-privacy-v1',
  false,
  array[
    'philippine_passport',
    'philsys_id',
    'drivers_license',
    'umid'
  ]::text[],
  array['image/jpeg', 'image/png', 'application/pdf']::text[],
  5242880,
  interval '15 minutes',
  interval '30 days',
  null
);

alter table private.verification_evidence_policies enable row level security;

create table private.verification_upload_intents (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles (user_id) on delete restrict,
  verification_record_id uuid not null,
  document_id uuid not null unique,
  id_type text not null,
  object_path text not null unique check (object_path !~ '[[:space:]]'),
  expected_media_type text not null,
  expected_byte_size bigint not null check (expected_byte_size > 0),
  expected_sha256 bytea not null check (octet_length(expected_sha256) = 32),
  supersedes_document_id uuid references public.verification_documents (id) on delete restrict,
  policy_version text not null,
  privacy_notice_version text not null,
  privacy_acknowledged_at timestamptz not null,
  status private.verification_upload_intent_status not null default 'awaiting_upload',
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

create unique index verification_upload_intents_one_open_per_owner_idx
on private.verification_upload_intents (owner_user_id)
where status in ('awaiting_upload', 'cleanup_pending');

create index verification_upload_intents_owner_created_idx
on private.verification_upload_intents (owner_user_id, created_at desc);

create index verification_upload_intents_cleanup_due_idx
on private.verification_upload_intents (expires_at, created_at)
where status in ('awaiting_upload', 'cleanup_pending');

alter table private.verification_upload_intents enable row level security;

alter table public.verification_documents
  add column upload_intent_id uuid unique
    references private.verification_upload_intents (id) on delete restrict,
  add column finalized_at timestamptz,
  add column retention_policy_version text,
  add column privacy_notice_version text,
  add column privacy_acknowledged_at timestamptz,
  add column superseded_at timestamptz,
  add column legal_hold_at timestamptz,
  add column legal_hold_by uuid references auth.users (id) on delete restrict,
  add column legal_hold_reason text,
  add column deletion_requested_by uuid references auth.users (id) on delete restrict,
  add column deletion_request_source text,
  add column deletion_operation_id uuid,
  add column deletion_claimed_at timestamptz,
  add column deletion_claim_operation_id uuid,
  add check (
    (legal_hold_at is null and legal_hold_by is null and legal_hold_reason is null)
    or (
      legal_hold_at is not null
      and legal_hold_by is not null
      and nullif(btrim(legal_hold_reason), '') is not null
    )
  ),
  add constraint verification_documents_deletion_request_attribution_check check (
    (
      deletion_requested_at is null
      and deletion_requested_by is null
      and deletion_request_source is null
    )
    or (
      deletion_requested_at is not null
      and deletion_request_source = 'renter'
      and deletion_requested_by is not null
    )
    or (
      deletion_requested_at is not null
      and deletion_request_source = 'retention'
      and deletion_requested_by is null
    )
  ) not valid,
  add constraint verification_documents_deletion_claim_check check (
    (deletion_claimed_at is null and deletion_claim_operation_id is null)
    or (
      deletion_claimed_at is not null
      and deletion_claim_operation_id is not null
      and deletion_requested_at is not null
    )
  ),
  add check (upload_intent_id is null or finalized_at is not null),
  add check (
    upload_intent_id is null
    or (
      retention_policy_version is not null
      and privacy_notice_version is not null
      and privacy_acknowledged_at is not null
    )
  );

update public.verification_documents
set deletion_request_source = 'retention'
where deletion_requested_at is not null;

alter table public.verification_documents
validate constraint verification_documents_deletion_request_attribution_check;

drop policy verification_documents_select_own_or_admin
on public.verification_documents;

create policy verification_documents_select_owner
on public.verification_documents for select to authenticated
using (owner_user_id = (select auth.uid()));

create unique index verification_documents_one_current_per_record_idx
on public.verification_documents (verification_record_id)
where superseded_at is null and verified_deleted_at is null;

create index verification_documents_retention_cleanup_idx
on public.verification_documents (retention_until, created_at)
where verified_deleted_at is null;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'application/pdf'
    ]::text[]
where id = 'verification-documents';

create function private.verification_document_extension(p_media_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_media_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'application/pdf' then 'pdf'
    else null
  end;
$$;

create function private.write_verification_audit(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_outcome text,
  p_purpose text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is not null and not exists (
    select 1 from auth.users where id = p_actor_user_id
  ) then
    raise exception 'verification audit actor does not exist' using errcode = '23503';
  end if;

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
    p_actor_user_id,
    p_operation_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_outcome,
    p_purpose,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create function private.guard_verification_document_cleanup_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deletion_claimed_at is not null and (
    new.deletion_claimed_at is distinct from old.deletion_claimed_at
    or new.deletion_claim_operation_id is distinct from old.deletion_claim_operation_id
  ) then
    raise exception 'verification deletion claim is immutable'
      using errcode = '55000';
  end if;

  if old.deletion_claimed_at is not null
    and old.legal_hold_at is null
    and new.legal_hold_at is not null
  then
    raise exception 'legal hold cannot begin after verified deletion cleanup is claimed'
      using errcode = '55000';
  end if;

  if new.deletion_claimed_at is not null and new.legal_hold_at is not null then
    raise exception 'held verification evidence cannot be claimed for deletion'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger verification_documents_cleanup_claim_guard
before update of
  deletion_claimed_at,
  deletion_claim_operation_id,
  legal_hold_at,
  legal_hold_by,
  legal_hold_reason
on public.verification_documents
for each row execute function private.guard_verification_document_cleanup_claim();

create function private.verification_policy_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', policy.enabled,
    'policy_version', policy.policy_version,
    'privacy_notice_version', policy.privacy_notice_version,
    'allowed_id_types', policy.allowed_id_types,
    'allowed_media_types', policy.allowed_media_types,
    'max_byte_size', policy.max_byte_size,
    'upload_intent_seconds', extract(epoch from policy.upload_intent_ttl)::bigint,
    'document_retention_days', extract(epoch from policy.document_retention)::bigint / 86400
  )
  from private.verification_evidence_policies as policy
  where policy.singleton;
$$;

create function private.verification_intent_json(
  p_intent private.verification_upload_intents,
  p_include_private_target boolean default false
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_intent.id,
    'status', case
      when p_intent.status = 'awaiting_upload'
        and p_intent.expires_at <= statement_timestamp()
      then 'expired'
      else p_intent.status::text
    end,
    'expires_at', p_intent.expires_at,
    'record_id', p_intent.verification_record_id,
    'document_id', p_intent.document_id,
    'id_type', p_intent.id_type,
    'media_type', p_intent.expected_media_type,
    'byte_size', p_intent.expected_byte_size,
    'object_path', case when p_include_private_target then p_intent.object_path end,
    'sha256', case
      when p_include_private_target then encode(p_intent.expected_sha256, 'hex')
    end
  ));
$$;

create function private.get_verification_upload_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.current_user_id();
  return private.verification_policy_json();
end;
$$;

create function private.get_my_verification_upload_state()
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
begin
  select * into target_record
  from public.verification_records as record
  where record.user_id = caller
  order by record.submitted_at desc, record.id desc
  limit 1;

  if target_record.id is not null then
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
      'status', target_record.status,
      'id_type', target_record.id_type,
      'submitted_at', target_record.submitted_at
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

create function private.create_verification_upload_intent(
  p_intent_id uuid,
  p_id_type text,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_policy_version text,
  p_privacy_notice_version text,
  p_privacy_acknowledged boolean,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  policy private.verification_evidence_policies%rowtype;
  profile public.profiles%rowtype;
  active_intent private.verification_upload_intents%rowtype;
  current_record public.verification_records%rowtype;
  current_document public.verification_documents%rowtype;
  created_intent private.verification_upload_intents%rowtype;
  expected_hash bytea;
  extension text;
  record_id uuid;
  document_id uuid;
  target_path text;
begin
  if p_intent_id is null or p_operation_id is null or caller is null then
    raise exception 'verification intent, owner, and operation references are required'
      using errcode = '22023';
  end if;
  if p_actor_user_id is distinct from caller then
    raise exception 'user-triggered verification actor must match its owner'
      using errcode = '42501';
  end if;
  if p_privacy_acknowledged is not true then
    raise exception 'current verification privacy notice acknowledgement is required'
      using errcode = '55000';
  end if;

  select * into policy
  from private.verification_evidence_policies
  where singleton
  for share;

  if not policy.enabled
    or p_policy_version is distinct from policy.policy_version
    or p_privacy_notice_version is distinct from policy.privacy_notice_version
  then
    raise exception 'verification privacy gate is not enabled for this policy'
      using errcode = '55000';
  end if;
  if not (p_id_type = any(policy.allowed_id_types)) then
    raise exception 'unsupported government ID type' using errcode = '22023';
  end if;

  extension := private.verification_document_extension(p_media_type);
  if extension is null or not (p_media_type = any(policy.allowed_media_types)) then
    raise exception 'unsupported government ID media type' using errcode = '22023';
  end if;
  if p_byte_size is null or p_byte_size not between 1 and policy.max_byte_size then
    raise exception 'government ID byte size is invalid' using errcode = '22023';
  end if;
  if p_sha256_hex is null or p_sha256_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'government ID digest is invalid' using errcode = '22023';
  end if;
  expected_hash := decode(p_sha256_hex, 'hex');

  select * into profile
  from public.profiles
  where user_id = caller
  for update;

  if profile.user_id is null then
    raise exception 'active profile required before verification upload'
      using errcode = 'P0002';
  end if;
  if profile.account_status <> 'active' then
    raise exception 'suspended account cannot upload verification evidence'
      using errcode = '42501';
  end if;

  select * into active_intent
  from private.verification_upload_intents
  where owner_user_id = caller
    and status in ('awaiting_upload', 'cleanup_pending')
  order by created_at desc, id desc
  limit 1
  for update;

  if active_intent.id is not null then
    if active_intent.status = 'cleanup_pending' then
      return private.verification_intent_json(active_intent, true);
    end if;

    if active_intent.expires_at <= statement_timestamp() then
      if exists (
        select 1 from storage.objects as object
        where object.bucket_id = 'verification-documents'
          and object.name = active_intent.object_path
      ) then
        update private.verification_upload_intents
        set status = 'cleanup_pending',
            cleanup_requested_at = coalesce(cleanup_requested_at, statement_timestamp())
        where id = active_intent.id
        returning * into active_intent;

        perform private.write_verification_audit(
          p_actor_user_id,
          p_operation_id,
          'expire_verification_upload_intent',
          'verification_upload_intent',
          active_intent.id,
          'cleanup_required',
          'government ID upload recovery',
          jsonb_build_object('object_present', true)
        );

        return private.verification_intent_json(active_intent, true);
      end if;

      update private.verification_upload_intents
      set status = 'expired'
      where id = active_intent.id;

      perform private.write_verification_audit(
        p_actor_user_id,
        p_operation_id,
        'expire_verification_upload_intent',
        'verification_upload_intent',
        active_intent.id,
        'success',
        'government ID upload recovery',
        jsonb_build_object('object_present', false)
      );

      active_intent := null;
    elsif active_intent.id_type = p_id_type
      and active_intent.expected_media_type = p_media_type
      and active_intent.expected_byte_size = p_byte_size
      and active_intent.expected_sha256 = expected_hash
      and active_intent.policy_version = p_policy_version
      and active_intent.privacy_notice_version = p_privacy_notice_version
    then
      return private.verification_intent_json(active_intent, true);
    else
      raise exception 'another verification upload is already in progress'
        using errcode = '55000';
    end if;
  end if;

  select * into current_record
  from public.verification_records as record
  where record.user_id = caller
  order by record.submitted_at desc, record.id desc
  limit 1
  for update;

  if current_record.id is not null and current_record.status in ('pending', 'verified') then
    record_id := current_record.id;

    select * into current_document
    from public.verification_documents as document
    where document.verification_record_id = current_record.id
      and document.superseded_at is null
      and document.verified_deleted_at is null
    order by document.created_at desc, document.id desc
    limit 1
    for update;

    if current_document.id is not null
      and current_record.id_type = p_id_type
      and current_document.media_type = p_media_type
      and current_document.byte_size = p_byte_size
      and current_document.sha256 = expected_hash
    then
      return jsonb_build_object(
        'status', 'finalized',
        'record_id', current_record.id,
        'document_id', current_document.id,
        'id_type', current_record.id_type,
        'media_type', current_document.media_type,
        'byte_size', current_document.byte_size
      );
    end if;

    if current_record.status = 'verified' then
      raise exception 'verified evidence cannot be replaced without a new review decision'
        using errcode = '55000';
    end if;
  else
    record_id := gen_random_uuid();
  end if;

  document_id := gen_random_uuid();
  target_path := format(
    '%s/%s/%s.%s',
    caller,
    record_id,
    document_id,
    extension
  );

  insert into private.verification_upload_intents (
    id,
    owner_user_id,
    verification_record_id,
    document_id,
    id_type,
    object_path,
    expected_media_type,
    expected_byte_size,
    expected_sha256,
    supersedes_document_id,
    policy_version,
    privacy_notice_version,
    privacy_acknowledged_at,
    expires_at
  ) values (
    p_intent_id,
    caller,
    record_id,
    document_id,
    p_id_type,
    target_path,
    p_media_type,
    p_byte_size,
    expected_hash,
    current_document.id,
    p_policy_version,
    p_privacy_notice_version,
    statement_timestamp(),
    statement_timestamp() + policy.upload_intent_ttl
  )
  returning * into created_intent;

  perform private.write_verification_audit(
    p_actor_user_id,
    p_operation_id,
    'create_verification_upload_intent',
    'verification_upload_intent',
    created_intent.id,
    'success',
    'government ID upload',
    jsonb_build_object(
      'id_type', p_id_type,
      'media_type', p_media_type,
      'byte_size', p_byte_size,
      'policy_version', p_policy_version,
      'privacy_notice_version', p_privacy_notice_version,
      'privacy_acknowledged', true,
      'replacement', current_document.id is not null
    )
  );

  return private.verification_intent_json(created_intent, true);
end;
$$;

create function private.get_verification_upload_intent(
  p_intent_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  target private.verification_upload_intents%rowtype;
begin
  if caller is null then
    raise exception 'verification intent owner is required' using errcode = '22023';
  end if;

  select * into target
  from private.verification_upload_intents
  where id = p_intent_id
    and owner_user_id = caller;

  if target.id is null then
    raise exception 'verification upload intent not found' using errcode = 'P0002';
  end if;

  return private.verification_intent_json(target, true);
end;
$$;

create function private.finalize_verification_upload(
  p_intent_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  target private.verification_upload_intents%rowtype;
  existing_record public.verification_records%rowtype;
  existing_document public.verification_documents%rowtype;
  prior_document public.verification_documents%rowtype;
  policy private.verification_evidence_policies%rowtype;
  profile public.profiles%rowtype;
  stored_object storage.objects%rowtype;
  finalized_document public.verification_documents%rowtype;
begin
  if p_intent_id is null or p_operation_id is null or caller is null then
    raise exception 'verification intent, owner, and operation references are required'
      using errcode = '22023';
  end if;
  if p_actor_user_id is distinct from caller then
    raise exception 'user-triggered verification actor must match its owner'
      using errcode = '42501';
  end if;
  if p_verified_sha256_hex is null or p_verified_sha256_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'verified government ID digest is invalid' using errcode = '22023';
  end if;

  -- Keep the same policy -> profile -> intent lock order used when an upload
  -- intent is created. A same-owner retry can otherwise deadlock with
  -- finalization after each transaction acquires one of the latter two rows.
  select * into policy
  from private.verification_evidence_policies
  where singleton
  for share;

  select * into profile
  from public.profiles
  where user_id = caller
  for update;

  select * into target
  from private.verification_upload_intents
  where id = p_intent_id
  for update;

  if target.id is null or target.owner_user_id <> caller then
    raise exception 'verification upload intent not found' using errcode = 'P0002';
  end if;

  if target.status = 'finalized' then
    select * into existing_document
    from public.verification_documents
    where upload_intent_id = target.id;

    if existing_document.id is null
      or existing_document.id <> target.document_id
      or existing_document.verification_record_id <> target.verification_record_id
    then
      raise exception 'finalized verification upload metadata is inconsistent'
        using errcode = '23514';
    end if;

    return jsonb_build_object(
      'status', 'pending',
      'record_id', target.verification_record_id,
      'document_id', target.document_id,
      'retention_until', existing_document.retention_until
    );
  end if;

  if target.status <> 'awaiting_upload'
    or target.expires_at <= statement_timestamp()
  then
    raise exception 'verification upload intent has expired or is not finalizable'
      using errcode = '55000';
  end if;

  if profile.user_id is null or profile.account_status <> 'active' then
    raise exception 'suspended account cannot finalize verification evidence'
      using errcode = '42501';
  end if;

  if not policy.enabled
    or policy.policy_version is distinct from target.policy_version
    or policy.privacy_notice_version is distinct from target.privacy_notice_version
  then
    raise exception 'verification privacy gate changed before finalization'
      using errcode = '55000';
  end if;

  if p_verified_media_type is distinct from target.expected_media_type
    or p_verified_byte_size is distinct from target.expected_byte_size
    or decode(p_verified_sha256_hex, 'hex') is distinct from target.expected_sha256
  then
    raise exception 'verification upload bytes do not match the approved intent'
      using errcode = '23514';
  end if;

  select * into stored_object
  from storage.objects as object
  where object.bucket_id = 'verification-documents'
    and object.name = target.object_path;

  if stored_object.id is null or stored_object.created_at > target.expires_at then
    raise exception 'verification document object is missing or late'
      using errcode = 'P0002';
  end if;
  if coalesce(stored_object.metadata ->> 'mimetype', '') <> target.expected_media_type
    or coalesce(stored_object.metadata ->> 'size', '') !~ '^[0-9]+$'
    or (stored_object.metadata ->> 'size')::bigint <> target.expected_byte_size
  then
    raise exception 'verification document Storage metadata is invalid'
      using errcode = '23514';
  end if;

  select * into existing_record
  from public.verification_records
  where id = target.verification_record_id
  for update;

  if existing_record.id is null then
    insert into public.verification_records (
      id,
      user_id,
      status,
      id_type
    ) values (
      target.verification_record_id,
      caller,
      'pending',
      target.id_type
    )
    returning * into existing_record;
  elsif existing_record.user_id <> caller or existing_record.status <> 'pending' then
    raise exception 'verification record is not eligible for upload finalization'
      using errcode = '55000';
  else
    update public.verification_records
    set id_type = target.id_type,
        submitted_at = statement_timestamp()
    where id = existing_record.id
    returning * into existing_record;
  end if;

  if target.supersedes_document_id is not null then
    select * into prior_document
    from public.verification_documents
    where id = target.supersedes_document_id
    for update;

    if prior_document.id is null
      or prior_document.owner_user_id <> caller
      or prior_document.verification_record_id <> target.verification_record_id
      or prior_document.superseded_at is not null
      or prior_document.verified_deleted_at is not null
    then
      raise exception 'replacement target is no longer current'
        using errcode = '55000';
    end if;

    update public.verification_documents
    set superseded_at = statement_timestamp()
    where id = prior_document.id;
  end if;

  insert into public.verification_documents (
    id,
    verification_record_id,
    owner_user_id,
    object_path,
    media_type,
    byte_size,
    sha256,
    retention_until,
    supersedes_id,
    upload_intent_id,
    finalized_at,
    retention_policy_version,
    privacy_notice_version,
    privacy_acknowledged_at
  ) values (
    target.document_id,
    target.verification_record_id,
    caller,
    target.object_path,
    target.expected_media_type,
    target.expected_byte_size,
    target.expected_sha256,
    statement_timestamp() + policy.document_retention,
    target.supersedes_document_id,
    target.id,
    statement_timestamp(),
    target.policy_version,
    target.privacy_notice_version,
    target.privacy_acknowledged_at
  )
  returning * into finalized_document;

  update private.verification_upload_intents
  set status = 'finalized',
      finalized_at = statement_timestamp()
  where id = target.id;

  perform private.write_verification_audit(
    p_actor_user_id,
    p_operation_id,
    'finalize_verification_upload',
    'verification_record',
    target.verification_record_id,
    'success',
    'government ID upload',
    jsonb_build_object(
      'document_id', target.document_id,
      'id_type', target.id_type,
      'media_type', target.expected_media_type,
      'byte_size', target.expected_byte_size,
      'replacement', target.supersedes_document_id is not null,
      'retention_policy_version', target.policy_version
    )
  );

  return jsonb_build_object(
    'status', 'pending',
    'record_id', target.verification_record_id,
    'document_id', target.document_id,
    'retention_until', finalized_document.retention_until
  );
end;
$$;

create function private.prepare_verification_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  target private.verification_upload_intents%rowtype;
  object_present boolean;
begin
  if p_intent_id is null or p_operation_id is null or caller is null then
    raise exception 'verification intent, owner, and operation references are required'
      using errcode = '22023';
  end if;
  if p_actor_user_id is not null and p_actor_user_id <> caller then
    raise exception 'verification cleanup actor must match its owner'
      using errcode = '42501';
  end if;

  select * into target
  from private.verification_upload_intents
  where id = p_intent_id
  for update;

  if target.id is null or target.owner_user_id <> caller then
    raise exception 'verification upload intent not found' using errcode = 'P0002';
  end if;
  if target.status = 'finalized' then
    raise exception 'finalized verification evidence cannot use upload cleanup'
      using errcode = '55000';
  end if;
  if target.status = 'cleaned' then
    return private.verification_intent_json(target, true)
      || jsonb_build_object('object_present', false);
  end if;

  select exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'verification-documents'
      and object.name = target.object_path
  ) into object_present;

  if object_present then
    update private.verification_upload_intents
    set status = 'cleanup_pending',
        cleanup_requested_at = coalesce(cleanup_requested_at, statement_timestamp())
    where id = target.id
    returning * into target;
  else
    update private.verification_upload_intents
    set status = 'cleaned',
        cleanup_requested_at = coalesce(cleanup_requested_at, statement_timestamp()),
        cleaned_at = coalesce(cleaned_at, statement_timestamp())
    where id = target.id
    returning * into target;
  end if;

  perform private.write_verification_audit(
    p_actor_user_id,
    p_operation_id,
    'prepare_verification_upload_cleanup',
    'verification_upload_intent',
    target.id,
    case when object_present then 'cleanup_required' else 'success' end,
    'government ID upload recovery',
    jsonb_build_object('object_present', object_present)
  );

  return private.verification_intent_json(target, true)
    || jsonb_build_object('object_present', object_present);
end;
$$;

create function private.finalize_verification_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  target private.verification_upload_intents%rowtype;
begin
  if p_intent_id is null or p_operation_id is null or caller is null then
    raise exception 'verification intent, owner, and operation references are required'
      using errcode = '22023';
  end if;
  if p_actor_user_id is not null and p_actor_user_id <> caller then
    raise exception 'verification cleanup actor must match its owner'
      using errcode = '42501';
  end if;

  select * into target
  from private.verification_upload_intents
  where id = p_intent_id
  for update;

  if target.id is null or target.owner_user_id <> caller then
    raise exception 'verification upload intent not found' using errcode = 'P0002';
  end if;
  if target.status = 'cleaned' then
    return private.verification_intent_json(target, false);
  end if;
  if target.status <> 'cleanup_pending' then
    raise exception 'verification upload intent is not awaiting cleanup'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'verification-documents'
      and object.name = target.object_path
  ) then
    raise exception 'verification upload object is still present'
      using errcode = '55000';
  end if;

  update private.verification_upload_intents
  set status = 'cleaned',
      cleaned_at = statement_timestamp()
  where id = target.id
  returning * into target;

  perform private.write_verification_audit(
    p_actor_user_id,
    p_operation_id,
    'finalize_verification_upload_cleanup',
    'verification_upload_intent',
    target.id,
    'success',
    'government ID upload recovery',
    '{}'::jsonb
  );

  return private.verification_intent_json(target, false);
end;
$$;

create function private.request_verification_document_deletion(
  p_document_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  target public.verification_documents%rowtype;
  eligible boolean;
  newly_requested boolean := false;
begin
  if p_document_id is null or p_operation_id is null or caller is null then
    raise exception 'verification document, owner, and operation references are required'
      using errcode = '22023';
  end if;
  if p_actor_user_id is distinct from caller then
    raise exception 'deletion-request actor must match its owner'
      using errcode = '42501';
  end if;

  select * into target
  from public.verification_documents
  where id = p_document_id
  for update;

  if target.id is null or target.owner_user_id <> caller then
    raise exception 'verification document not found' using errcode = 'P0002';
  end if;
  if target.legal_hold_at is not null then
    raise exception 'verification document is under legal hold'
      using errcode = '55000';
  end if;

  if target.deletion_requested_at is null then
    update public.verification_documents
    set deletion_requested_at = statement_timestamp(),
        deletion_requested_by = caller,
        deletion_request_source = 'renter',
        deletion_operation_id = p_operation_id
    where id = target.id
    returning * into target;
    newly_requested := true;
  end if;

  eligible := target.retention_until <= statement_timestamp()
    and target.verified_deleted_at is null;

  if eligible and target.deletion_claimed_at is null then
    update public.verification_documents
    set deletion_claimed_at = statement_timestamp(),
        deletion_claim_operation_id = p_operation_id
    where id = target.id
    returning * into target;
  end if;

  if newly_requested then
    perform private.write_verification_audit(
      p_actor_user_id,
      p_operation_id,
      'request_verification_document_deletion',
      'verification_document',
      target.id,
      case when eligible then 'eligible' else 'scheduled' end,
      'renter privacy request',
      jsonb_build_object(
        'retention_policy_version', target.retention_policy_version,
        'eligible', eligible
      )
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'document_id', target.id,
    'status', case
      when target.verified_deleted_at is not null then 'deleted'
      when eligible then 'eligible'
      else 'scheduled'
    end,
    'eligible', eligible,
    'retention_until', target.retention_until,
    'object_path', case
      when eligible and target.deletion_claimed_at is not null then target.object_path
    end
  ));
end;
$$;

create function private.finalize_verification_document_deletion(
  p_document_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := p_owner_user_id;
  target public.verification_documents%rowtype;
begin
  if p_document_id is null or p_operation_id is null or caller is null then
    raise exception 'verification document, owner, and operation references are required'
      using errcode = '22023';
  end if;
  if p_actor_user_id is not null and p_actor_user_id <> caller then
    raise exception 'verification deletion actor must match its owner'
      using errcode = '42501';
  end if;

  select * into target
  from public.verification_documents
  where id = p_document_id
  for update;

  if target.id is null or target.owner_user_id <> caller then
    raise exception 'verification document not found' using errcode = 'P0002';
  end if;
  if target.verified_deleted_at is not null then
    return jsonb_build_object(
      'document_id', target.id,
      'status', 'deleted',
      'verified_deleted_at', target.verified_deleted_at
    );
  end if;
  if target.deletion_requested_at is null
    or target.deletion_claimed_at is null
    or target.retention_until > statement_timestamp()
    or target.legal_hold_at is not null
  then
    raise exception 'verification document is not eligible for deletion'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'verification-documents'
      and object.name = target.object_path
  ) then
    raise exception 'verification document object is still present'
      using errcode = '55000';
  end if;

  update public.verification_documents
  set deleted_at = coalesce(deleted_at, statement_timestamp()),
      verified_deleted_at = statement_timestamp()
  where id = target.id
  returning * into target;

  perform private.write_verification_audit(
    p_actor_user_id,
    p_operation_id,
    'finalize_verification_document_deletion',
    'verification_document',
    target.id,
    'success',
    case
      when p_actor_user_id is null then 'automatic government ID retention enforcement'
      else 'renter privacy request'
    end,
    jsonb_build_object(
      'verification_record_id', target.verification_record_id,
      'retention_policy_version', target.retention_policy_version,
      'request_source', target.deletion_request_source
    )
  );

  return jsonb_build_object(
    'document_id', target.id,
    'status', 'deleted',
    'verified_deleted_at', target.verified_deleted_at
  );
end;
$$;

create function private.claim_verification_evidence_cleanup(
  p_limit integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claimed jsonb := '[]'::jsonb;
  target_intent private.verification_upload_intents%rowtype;
  target_document public.verification_documents%rowtype;
begin
  if p_operation_id is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'cleanup operation and limit from 1 through 1000 are required'
      using errcode = '22023';
  end if;

  for target_intent in
    select intent.*
    from private.verification_upload_intents as intent
    where intent.status = 'cleanup_pending'
      or (
        intent.status = 'awaiting_upload'
        and intent.expires_at <= statement_timestamp()
      )
    order by intent.expires_at, intent.created_at, intent.id
    limit p_limit
    for update skip locked
  loop
    if target_intent.status = 'awaiting_upload' then
      update private.verification_upload_intents
      set status = 'cleanup_pending',
          cleanup_requested_at = coalesce(cleanup_requested_at, statement_timestamp())
      where id = target_intent.id
      returning * into target_intent;

      perform private.write_verification_audit(
        null,
        p_operation_id,
        'claim_expired_verification_upload_cleanup',
        'verification_upload_intent',
        target_intent.id,
        'cleanup_required',
        'automatic government ID retention enforcement',
        '{}'::jsonb
      );
    end if;

    claimed := claimed || jsonb_build_array(jsonb_build_object(
      'kind', 'upload_intent',
      'id', target_intent.id,
      'owner_user_id', target_intent.owner_user_id,
      'object_path', target_intent.object_path
    ));
  end loop;

  for target_document in
    select document.*
    from public.verification_documents as document
    where document.retention_until <= statement_timestamp()
      and document.legal_hold_at is null
      and document.verified_deleted_at is null
    order by document.retention_until, document.created_at, document.id
    limit p_limit
    for update skip locked
  loop
    if target_document.deletion_claimed_at is null then
      update public.verification_documents
      set deletion_requested_at = coalesce(
            deletion_requested_at,
            statement_timestamp()
          ),
          deletion_request_source = coalesce(deletion_request_source, 'retention'),
          deletion_operation_id = coalesce(deletion_operation_id, p_operation_id),
          deletion_claimed_at = statement_timestamp(),
          deletion_claim_operation_id = p_operation_id
      where id = target_document.id
      returning * into target_document;

      perform private.write_verification_audit(
        null,
        p_operation_id,
        'claim_due_verification_document_deletion',
        'verification_document',
        target_document.id,
        'cleanup_required',
        'automatic government ID retention enforcement',
        jsonb_build_object(
          'retention_policy_version', target_document.retention_policy_version,
          'request_source', target_document.deletion_request_source
        )
      );
    end if;

    claimed := claimed || jsonb_build_array(jsonb_build_object(
      'kind', 'verification_document',
      'id', target_document.id,
      'owner_user_id', target_document.owner_user_id,
      'object_path', target_document.object_path
    ));
  end loop;

  return claimed;
end;
$$;

create function private.can_insert_verification_document(
  p_name text,
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from private.verification_upload_intents as intent
      join private.verification_evidence_policies as policy on policy.singleton
      join public.profiles as profile on profile.user_id = intent.owner_user_id
      where intent.owner_user_id = auth.uid()
        and intent.object_path = p_name
        and intent.status = 'awaiting_upload'
        and intent.expires_at > statement_timestamp()
        and policy.enabled
        and policy.policy_version = intent.policy_version
        and policy.privacy_notice_version = intent.privacy_notice_version
        and profile.account_status = 'active'
        and coalesce(p_metadata ->> 'mimetype', '') = intent.expected_media_type
        and coalesce(p_metadata ->> 'size', '') ~ '^[0-9]+$'
        and (p_metadata ->> 'size')::bigint = intent.expected_byte_size
    );
$$;

create function private.can_select_verification_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from public.verification_documents as document
        where document.owner_user_id = auth.uid()
          and document.object_path = p_name
          and document.verified_deleted_at is null
      )
      or exists (
        select 1
        from private.verification_upload_intents as intent
        where intent.owner_user_id = auth.uid()
          and intent.object_path = p_name
          and intent.status in ('awaiting_upload', 'cleanup_pending')
      )
    );
$$;

create function private.can_delete_verification_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from private.verification_upload_intents as intent
        where intent.owner_user_id = auth.uid()
          and intent.object_path = p_name
          and intent.status = 'cleanup_pending'
      )
      or exists (
        select 1
        from public.verification_documents as document
        where document.owner_user_id = auth.uid()
          and document.object_path = p_name
          and document.deletion_requested_at is not null
          and document.deletion_claimed_at is not null
          and document.retention_until <= statement_timestamp()
          and document.legal_hold_at is null
          and document.verified_deleted_at is null
      )
    );
$$;

drop policy if exists verification_documents_owner_read on storage.objects;

create policy verification_documents_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'verification-documents'
  and (select private.can_select_verification_document(name))
);

create policy verification_documents_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-documents'
  and (select private.can_insert_verification_document(name, metadata))
);

create policy verification_documents_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'verification-documents'
  and (select private.can_delete_verification_document(name))
);

create function api.get_verification_upload_policy()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_verification_upload_policy(); $$;

create function api.get_my_verification_upload_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_my_verification_upload_state(); $$;

create function api.create_verification_upload_intent(
  p_intent_id uuid,
  p_id_type text,
  p_media_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_policy_version text,
  p_privacy_notice_version text,
  p_privacy_acknowledged boolean,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_verification_upload_intent(
    p_intent_id,
    p_id_type,
    p_media_type,
    p_byte_size,
    p_sha256_hex,
    p_policy_version,
    p_privacy_notice_version,
    p_privacy_acknowledged,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.get_verification_upload_intent(
  p_intent_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_verification_upload_intent(p_intent_id, p_owner_user_id); $$;

create function api.finalize_verification_upload(
  p_intent_id uuid,
  p_verified_media_type text,
  p_verified_byte_size bigint,
  p_verified_sha256_hex text,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_verification_upload(
    p_intent_id,
    p_verified_media_type,
    p_verified_byte_size,
    p_verified_sha256_hex,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.prepare_verification_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.prepare_verification_upload_cleanup(
    p_intent_id,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.finalize_verification_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_verification_upload_cleanup(
    p_intent_id,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.request_verification_document_deletion(
  p_document_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_verification_document_deletion(
    p_document_id,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.finalize_verification_document_deletion(
  p_document_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_verification_document_deletion(
    p_document_id,
    p_operation_id,
    p_owner_user_id,
    p_actor_user_id
  );
$$;

create function api.claim_verification_evidence_cleanup(
  p_limit integer,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_verification_evidence_cleanup(p_limit, p_operation_id);
$$;

create function api.finalize_due_verification_upload_cleanup(
  p_intent_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_verification_upload_cleanup(
    p_intent_id,
    p_operation_id,
    p_owner_user_id,
    null
  );
$$;

create function api.finalize_due_verification_document_deletion(
  p_document_id uuid,
  p_operation_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_verification_document_deletion(
    p_document_id,
    p_operation_id,
    p_owner_user_id,
    null
  );
$$;

revoke all on table private.verification_evidence_policies
from public, anon, authenticated, service_role;
revoke all on table private.verification_upload_intents
from public, anon, authenticated, service_role;

grant usage on schema api, private to service_role;
grant select on public.profiles, public.verification_records, public.verification_documents
to service_role;

revoke all on function private.verification_document_extension(text)
from public, anon, authenticated, service_role;
revoke all on function private.write_verification_audit(
  uuid, uuid, text, text, uuid, text, text, jsonb
)
from public, anon, authenticated, service_role;
revoke all on function private.guard_verification_document_cleanup_claim()
from public, anon, authenticated, service_role;
revoke all on function private.verification_policy_json()
from public, anon, authenticated, service_role;
revoke all on function private.verification_intent_json(
  private.verification_upload_intents, boolean
)
from public, anon, authenticated, service_role;
revoke all on function private.get_verification_upload_policy()
from public, anon, authenticated, service_role;
revoke all on function private.get_my_verification_upload_state()
from public, anon, authenticated, service_role;
revoke all on function private.create_verification_upload_intent(
  uuid, text, text, bigint, text, text, text, boolean, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.get_verification_upload_intent(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.finalize_verification_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.prepare_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.finalize_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.request_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.finalize_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.claim_verification_evidence_cleanup(integer, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.can_insert_verification_document(text, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.can_select_verification_document(text)
from public, anon, authenticated, service_role;
revoke all on function private.can_delete_verification_document(text)
from public, anon, authenticated, service_role;

grant execute on function private.get_verification_upload_policy()
to authenticated, service_role;
grant execute on function private.get_my_verification_upload_state()
to authenticated, service_role;
grant execute on function private.create_verification_upload_intent(
  uuid, text, text, bigint, text, text, text, boolean, uuid, uuid, uuid
)
to service_role;
grant execute on function private.get_verification_upload_intent(uuid, uuid)
to service_role;
grant execute on function private.finalize_verification_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
)
to service_role;
grant execute on function private.prepare_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function private.finalize_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function private.request_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function private.finalize_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function private.claim_verification_evidence_cleanup(integer, uuid)
to service_role;
grant execute on function private.can_insert_verification_document(text, jsonb)
to authenticated;
grant execute on function private.can_select_verification_document(text)
to authenticated;
grant execute on function private.can_delete_verification_document(text)
to authenticated;

revoke all on function api.get_verification_upload_policy()
from public, anon, authenticated, service_role;
revoke all on function api.get_my_verification_upload_state()
from public, anon, authenticated, service_role;
revoke all on function api.create_verification_upload_intent(
  uuid, text, text, bigint, text, text, text, boolean, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.get_verification_upload_intent(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_verification_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.prepare_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.request_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.claim_verification_evidence_cleanup(integer, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_due_verification_upload_cleanup(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_due_verification_document_deletion(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function api.get_verification_upload_policy()
to authenticated, service_role;
grant execute on function api.get_my_verification_upload_state()
to authenticated, service_role;
grant execute on function api.create_verification_upload_intent(
  uuid, text, text, bigint, text, text, text, boolean, uuid, uuid, uuid
)
to service_role;
grant execute on function api.get_verification_upload_intent(uuid, uuid)
to service_role;
grant execute on function api.finalize_verification_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
)
to service_role;
grant execute on function api.prepare_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function api.finalize_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function api.request_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function api.finalize_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
to service_role;
grant execute on function api.claim_verification_evidence_cleanup(integer, uuid)
to service_role;
grant execute on function api.finalize_due_verification_upload_cleanup(uuid, uuid, uuid)
to service_role;
grant execute on function api.finalize_due_verification_document_deletion(uuid, uuid, uuid)
to service_role;
