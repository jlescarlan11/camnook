-- Government-ID privacy hardening after Philippine privacy-law review.
--
-- This migration is deliberately fail-closed. It advances the policy and
-- notice versions, removes PDF from the accepted formats, and resets the
-- database activation gate. It also makes the 30-day period a deletion
-- deadline rather than a minimum: an authenticated owner may withdraw consent
-- and delete an unheld object immediately, while replacement makes the
-- superseded object due for the protected cleanup worker.

update private.verification_evidence_policies
set policy_version = 'government-id-evidence-v2',
    privacy_notice_version = 'government-id-privacy-v2',
    enabled = false,
    allowed_media_types = array['image/jpeg', 'image/png']::text[],
    activated_at = null
where singleton;

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png']::text[]
where id = 'verification-documents';

create function private.shorten_superseded_verification_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.superseded_at is null
    and new.superseded_at is not null
    and new.verified_deleted_at is null
  then
    new.retention_until := least(
      new.retention_until,
      statement_timestamp()
    );
  end if;

  return new;
end;
$$;

create trigger verification_documents_shorten_superseded_retention
before update of superseded_at on public.verification_documents
for each row execute function private.shorten_superseded_verification_retention();

create or replace function private.request_verification_document_deletion(
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

  eligible := target.verified_deleted_at is null;

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
      'eligible',
      'consent withdrawal or renter privacy request',
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
      else 'eligible'
    end,
    'eligible', eligible,
    'retention_until', target.retention_until,
    'object_path', case
      when eligible and target.deletion_claimed_at is not null then target.object_path
    end
  ));
end;
$$;

create or replace function private.finalize_verification_document_deletion(
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
      else 'consent withdrawal or renter privacy request'
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

create or replace function private.can_delete_verification_document(p_name text)
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
          and document.legal_hold_at is null
          and document.verified_deleted_at is null
      )
    );
$$;

revoke all on function private.shorten_superseded_verification_retention()
from public, anon, authenticated, service_role;
