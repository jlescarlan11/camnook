-- Keep each minute-level expiry transaction bounded. A backlog is drained by
-- later invocations, while SKIP LOCKED still lets overlapping workers make
-- progress without contending for the same bookings.
create or replace function private.expire_due_bookings(p_operation_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  actor_type public.booking_actor_type;
  target record;
  affected integer := 0;
  target_operation_id uuid;
begin
  if p_operation_id is null then
    raise exception 'booking_expiry_operation_required' using errcode = '22023';
  end if;
  if caller is not null and not private.is_admin() then
    raise exception 'booking_expiry_unauthorized' using errcode = '42501';
  end if;

  actor_type := case when caller is null then 'system' else 'admin' end;

  for target in
    select
      booking.id,
      booking.state,
      booking.current_contract_version_id
    from public.bookings as booking
    where booking.state in ('CONTRACT_PENDING', 'TO_PAY')
      and booking.approval_deadline_at <= clock_timestamp()
    order by booking.approval_deadline_at, booking.id
    limit 100
    for update skip locked
  loop
    target_operation_id := case
      when affected = 0 then p_operation_id
      else gen_random_uuid()
    end;
    perform set_config(
      'camnook.contract_operation_id',
      target_operation_id::text,
      true
    );

    perform private.transition_booking(
      target.id,
      target.state,
      'EXPIRED',
      actor_type,
      'approval_deadline_elapsed',
      null,
      target_operation_id
    );
    perform private.release_booking_block(target.id, caller);

    update public.contract_versions
    set status = 'voided'
    where id = target.current_contract_version_id
      and status = 'issued';

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
      caller,
      target_operation_id,
      case
        when target.state = 'CONTRACT_PENDING' then 'contract_expired_unsigned'
        else 'signed_booking_payment_window_expired'
      end,
      'contract_version',
      target.current_contract_version_id,
      'success',
      'approval deadline expiry',
      jsonb_build_object(
        'actor_type', actor_type,
        'booking_id', target.id,
        'contract_version_id', target.current_contract_version_id,
        'from_state', target.state,
        'to_state', 'EXPIRED'
      )
    );

    affected := affected + 1;
  end loop;

  perform set_config('camnook.contract_operation_id', '', true);
  return affected;
end;
$$;

comment on function private.expire_due_bookings(uuid) is
  'Idempotently expires at most 100 due contract/payment windows per invocation, preserves history, and releases active inventory blocks.';
