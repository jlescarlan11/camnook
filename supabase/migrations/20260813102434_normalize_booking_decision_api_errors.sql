-- Keep retry-class transaction errors inside the database boundary. PostgREST
-- treats SQLSTATE 40* as transaction failures, so expose known stale business
-- outcomes as ordinary application exceptions from the public API schema.

create or replace function api.approve_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform private.approve_booking(p_booking_id);
exception
  when sqlstate '40001' then
    if sqlerrm <> 'approval_stale_booking_state' then
      raise;
    end if;

    raise exception 'approval_stale_booking_state' using errcode = 'P0001';
end;
$$;

create or replace function api.reject_booking(p_booking_id uuid, p_reason text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform private.reject_booking(p_booking_id, p_reason);
exception
  when sqlstate '40001' then
    if sqlerrm <> 'booking state changed or transition precondition failed' then
      raise;
    end if;

    raise exception 'booking state changed or transition precondition failed'
      using errcode = 'P0001';
end;
$$;

revoke all on function api.approve_booking(uuid) from public, anon;
revoke all on function api.reject_booking(uuid, text) from public, anon;

grant execute on function api.approve_booking(uuid) to authenticated;
grant execute on function api.reject_booking(uuid, text) to authenticated;
