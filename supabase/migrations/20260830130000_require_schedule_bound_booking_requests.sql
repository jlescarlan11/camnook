-- Handoff scheduling is mandatory. Keep legacy request functions unavailable even
-- to direct authenticated RPC callers, so every booking request proves the current
-- camera policy and approved handoff slot.
revoke execute on function api.request_booking_idempotent(uuid, timestamptz, timestamptz, text, text, uuid) from authenticated;
revoke execute on function private.request_booking(uuid, timestamptz, timestamptz, text, text) from authenticated;
