-- Deferred constraint triggers run after the API security-definer function has
-- returned, so they otherwise inherit the caller's service_role privileges.
-- Keep the history table private while allowing the projection guard to read it.
alter function private.validate_booking_history_projection()
security definer;

revoke all on function private.validate_booking_history_projection()
from public, anon, authenticated, service_role;

comment on function private.validate_booking_history_projection() is
  'Privileged deferred constraint trigger that verifies each booking state matches its append-only history projection.';
