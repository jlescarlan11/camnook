-- Meetup planning is mandatory for new booking requests. A later idempotency
-- migration temporarily restored this older schedule-only RPC to authenticated
-- callers, allowing direct PostgREST requests to omit the immutable meetup
-- snapshot required by the application flow.
revoke execute on function api.request_booking_schedule_idempotent(
  uuid, date, date, time without time zone, bigint, text, text, uuid
) from authenticated;
