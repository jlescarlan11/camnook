-- Like the history projection guard, this deferred constraint trigger runs
-- after the API security-definer function returns. Execute its invariant check
-- as its owner without granting service_role direct reads of booking contracts.
alter function private.validate_current_contract_pointer()
security definer;

revoke all on function private.validate_current_contract_pointer()
from public, anon, authenticated, service_role;

comment on function private.validate_current_contract_pointer() is
  'Privileged deferred constraint trigger that validates each booking current-contract pointer.';
