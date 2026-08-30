-- Online government-ID collection was retired in favor of an in-person
-- pickup check. Keep only the service-role retention cleanup surface callable;
-- historical upload, owner-deletion, and administrator-review entry points are
-- no longer application capabilities.

drop policy if exists verification_documents_owner_read on storage.objects;
drop policy if exists verification_documents_owner_insert on storage.objects;
drop policy if exists verification_documents_owner_delete on storage.objects;

revoke all on function private.get_verification_upload_policy()
from public, anon, authenticated, service_role;
revoke all on function private.get_my_verification_upload_state()
from public, anon, authenticated, service_role;
revoke all on function private.create_verification_upload_intent(
  uuid, text, text, bigint, text, text, text, boolean, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.get_verification_upload_intent(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.finalize_verification_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.prepare_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.finalize_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.request_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.finalize_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function private.can_insert_verification_document(text, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.can_select_verification_document(text)
from public, anon, authenticated, service_role;
revoke all on function private.can_delete_verification_document(text)
from public, anon, authenticated, service_role;
revoke all on function private.get_verification_review_queue()
from public, anon, authenticated, service_role;
revoke all on function private.get_verification_review_detail(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.authorize_verification_evidence_access(uuid, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.decide_verification(uuid, uuid, text, text, date, text, uuid)
from public, anon, authenticated, service_role;

revoke all on function api.get_verification_upload_policy()
from public, anon, authenticated, service_role;
revoke all on function api.get_my_verification_upload_state()
from public, anon, authenticated, service_role;
revoke all on function api.create_verification_upload_intent(
  uuid, text, text, bigint, text, text, text, boolean, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.get_verification_upload_intent(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_verification_upload(
  uuid, text, bigint, text, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.prepare_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_verification_upload_cleanup(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.request_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.finalize_verification_document_deletion(
  uuid, uuid, uuid, uuid
)
from public, anon, authenticated, service_role;
revoke all on function api.get_verification_review_queue()
from public, anon, authenticated, service_role;
revoke all on function api.get_verification_review_detail(uuid)
from public, anon, authenticated, service_role;
revoke all on function api.authorize_verification_evidence_access(uuid, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function api.decide_verification(uuid, uuid, text, text, text, text, uuid)
from public, anon, authenticated, service_role;
