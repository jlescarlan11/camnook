-- Online identity verification is retired. Expiry remains only as a
-- service-role retention operation; authenticated administrators no longer
-- need a direct callable path into the historical workflow.

revoke execute on function private.expire_due_verifications(uuid)
from authenticated;

revoke execute on function api.expire_due_verifications(uuid)
from authenticated;

comment on function private.expire_due_verifications(uuid) is
  'Expires historical verification decisions for service-role retention cleanup only.';
