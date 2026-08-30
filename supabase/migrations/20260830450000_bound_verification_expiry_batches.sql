-- Keep the retired verification-history expiry step bounded so a historical
-- backlog cannot monopolize the retention cron transaction.

create or replace function private.expire_due_verifications(p_operation_id uuid)
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
    limit 100
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

comment on function private.expire_due_verifications(uuid) is
  'Expires at most 100 historical verification decisions per service-role retention run.';
