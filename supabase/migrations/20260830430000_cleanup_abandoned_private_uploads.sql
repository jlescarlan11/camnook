-- Expired payment-proof and condition-photo upload intents can outlive the
-- request that created their private Storage objects. Claim them from the
-- existing retention cron so abandoned bytes are deleted even without a user
-- or administrator retry.

create index payment_proof_upload_intents_cleanup_due_idx
on private.payment_proof_upload_intents (expires_at, created_at, id)
where status in ('awaiting_upload', 'cleanup_pending');

create index condition_photo_upload_intents_cleanup_due_idx
on private.condition_photo_upload_intents (expires_at, created_at, id)
where status in ('awaiting_upload', 'cleanup_pending');

create function private.claim_abandoned_private_upload_cleanup(
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
  candidate record;
  payment_intent private.payment_proof_upload_intents%rowtype;
  condition_intent private.condition_photo_upload_intents%rowtype;
begin
  if p_operation_id is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'cleanup operation and limit from 1 through 1000 are required'
      using errcode = '22023';
  end if;

  for candidate in
    select due.kind, due.id, due.expires_at, due.created_at
    from (
      select
        'payment_proof_upload_intent'::text as kind,
        intent.id,
        intent.expires_at,
        intent.created_at
      from private.payment_proof_upload_intents as intent
      where intent.status = 'cleanup_pending'
        or (
          intent.status = 'awaiting_upload'
          and intent.expires_at <= statement_timestamp()
        )
      union all
      select
        'condition_photo_upload_intent'::text as kind,
        intent.id,
        intent.expires_at,
        intent.created_at
      from private.condition_photo_upload_intents as intent
      where intent.status = 'cleanup_pending'
        or (
          intent.status = 'awaiting_upload'
          and intent.expires_at <= statement_timestamp()
        )
    ) as due
    order by due.expires_at, due.created_at, due.id
    limit p_limit
  loop
    if candidate.kind = 'payment_proof_upload_intent' then
      select * into payment_intent
      from private.payment_proof_upload_intents
      where id = candidate.id
        and (
          status = 'cleanup_pending'
          or (status = 'awaiting_upload' and expires_at <= statement_timestamp())
        )
      for update skip locked;

      if payment_intent.id is null then
        continue;
      end if;

      if payment_intent.status = 'awaiting_upload' then
        update private.payment_proof_upload_intents
        set status = 'cleanup_pending',
            cleanup_requested_at = coalesce(cleanup_requested_at, statement_timestamp())
        where id = payment_intent.id
        returning * into payment_intent;

        perform private.write_payment_audit(
          null,
          p_operation_id,
          'claim_expired_payment_proof_upload_cleanup',
          payment_intent.transaction_id,
          'cleanup_required',
          'automatic abandoned private upload cleanup',
          jsonb_build_object('proof_intent_id', payment_intent.id)
        );
      end if;

      claimed := claimed || jsonb_build_array(jsonb_build_object(
        'kind', candidate.kind,
        'id', payment_intent.id,
        'bucket_id', 'payment-proofs',
        'object_path', payment_intent.object_path
      ));
    else
      select * into condition_intent
      from private.condition_photo_upload_intents
      where id = candidate.id
        and (
          status = 'cleanup_pending'
          or (status = 'awaiting_upload' and expires_at <= statement_timestamp())
        )
      for update skip locked;

      if condition_intent.id is null then
        continue;
      end if;

      if condition_intent.status = 'awaiting_upload' then
        update private.condition_photo_upload_intents
        set status = 'cleanup_pending',
            cleanup_requested_at = coalesce(cleanup_requested_at, statement_timestamp())
        where id = condition_intent.id
        returning * into condition_intent;

        perform private.write_audit(
          p_operation_id,
          'claim_expired_condition_photo_upload_cleanup',
          'condition_report',
          condition_intent.condition_report_id,
          'cleanup_required',
          'automatic abandoned private upload cleanup',
          jsonb_build_object('photo_intent_id', condition_intent.id)
        );
      end if;

      claimed := claimed || jsonb_build_array(jsonb_build_object(
        'kind', candidate.kind,
        'id', condition_intent.id,
        'bucket_id', 'condition-evidence',
        'object_path', condition_intent.object_path
      ));
    end if;
  end loop;

  return claimed;
end;
$$;

create function private.finalize_abandoned_private_upload_cleanup(
  p_kind text,
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
  payment_intent private.payment_proof_upload_intents%rowtype;
  condition_intent private.condition_photo_upload_intents%rowtype;
begin
  if p_intent_id is null or p_operation_id is null or p_kind not in (
    'payment_proof_upload_intent',
    'condition_photo_upload_intent'
  ) then
    raise exception 'private upload cleanup finalization is invalid'
      using errcode = '22023';
  end if;

  if p_kind = 'payment_proof_upload_intent' then
    select * into payment_intent
    from private.payment_proof_upload_intents
    where id = p_intent_id
    for update;

    if payment_intent.id is null then
      raise exception 'payment proof intent not found' using errcode = 'P0002';
    end if;
    if payment_intent.status = 'cleaned' then
      return jsonb_build_object('id', payment_intent.id, 'status', 'cleaned');
    end if;
    if payment_intent.status <> 'cleanup_pending' or exists (
      select 1 from storage.objects as object
      where object.bucket_id = 'payment-proofs'
        and object.name = payment_intent.object_path
    ) then
      raise exception 'payment proof cleanup is not complete' using errcode = '55000';
    end if;

    update private.payment_proof_upload_intents
    set status = 'cleaned', cleaned_at = clock_timestamp()
    where id = payment_intent.id;

    perform private.write_payment_audit(
      null,
      p_operation_id,
      'finalize_abandoned_payment_proof_upload_cleanup',
      payment_intent.transaction_id,
      'success',
      'automatic abandoned private upload cleanup',
      jsonb_build_object('proof_intent_id', payment_intent.id)
    );
  else
    select * into condition_intent
    from private.condition_photo_upload_intents
    where id = p_intent_id
    for update;

    if condition_intent.id is null then
      raise exception 'condition photo intent not found' using errcode = 'P0002';
    end if;
    if condition_intent.status = 'cleaned' then
      return jsonb_build_object('id', condition_intent.id, 'status', 'cleaned');
    end if;
    if condition_intent.status <> 'cleanup_pending' or exists (
      select 1 from storage.objects as object
      where object.bucket_id = 'condition-evidence'
        and object.name = condition_intent.object_path
    ) then
      raise exception 'condition photo cleanup is not complete' using errcode = '55000';
    end if;

    update private.condition_photo_upload_intents
    set status = 'cleaned', cleaned_at = clock_timestamp()
    where id = condition_intent.id;

    perform private.write_audit(
      p_operation_id,
      'finalize_abandoned_condition_photo_upload_cleanup',
      'condition_report',
      condition_intent.condition_report_id,
      'success',
      'automatic abandoned private upload cleanup',
      jsonb_build_object('photo_intent_id', condition_intent.id)
    );
  end if;

  return jsonb_build_object('id', p_intent_id, 'status', 'cleaned');
end;
$$;

create function api.claim_abandoned_private_upload_cleanup(
  p_limit integer,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_abandoned_private_upload_cleanup(p_limit, p_operation_id);
$$;

create function api.finalize_abandoned_private_upload_cleanup(
  p_kind text,
  p_intent_id uuid,
  p_operation_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_abandoned_private_upload_cleanup(
    p_kind,
    p_intent_id,
    p_operation_id
  );
$$;

revoke all on function private.claim_abandoned_private_upload_cleanup(integer, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.finalize_abandoned_private_upload_cleanup(text, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.claim_abandoned_private_upload_cleanup(integer, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_abandoned_private_upload_cleanup(text, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function private.claim_abandoned_private_upload_cleanup(integer, uuid)
to service_role;
grant execute on function private.finalize_abandoned_private_upload_cleanup(text, uuid, uuid)
to service_role;
grant execute on function api.claim_abandoned_private_upload_cleanup(integer, uuid)
to service_role;
grant execute on function api.finalize_abandoned_private_upload_cleanup(text, uuid, uuid)
to service_role;

comment on function private.claim_abandoned_private_upload_cleanup(integer, uuid) is
  'Claims a bounded oldest-first batch of expired, unfinalized payment and condition-photo Storage objects for automatic deletion.';
