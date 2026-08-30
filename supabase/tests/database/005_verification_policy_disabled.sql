select '1..5' as result
union all
select case
  when exists (
    select 1
    from private.verification_evidence_policies
    where singleton
      and not enabled
      and activated_at is null
  ) then 'ok 1 - government-ID evidence policy is installed but disabled'
  else 'not ok 1 - government-ID evidence policy must remain disabled'
end
union all
select case
  when not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    cross join unnest(array['anon', 'authenticated', 'service_role']) as role_name
    where namespace.nspname in ('api', 'private')
      and procedure.proname in (
        'authorize_verification_evidence_access',
        'create_verification_upload_intent',
        'decide_verification',
        'finalize_verification_document_deletion',
        'finalize_verification_upload',
        'finalize_verification_upload_cleanup',
        'get_my_verification_upload_state',
        'get_verification_review_detail',
        'get_verification_review_queue',
        'get_verification_upload_intent',
        'get_verification_upload_policy',
        'prepare_verification_upload_cleanup',
        'request_verification_document_deletion'
      )
      and has_function_privilege(role_name, procedure.oid, 'EXECUTE')
  ) then 'ok 2 - retired verification RPCs cannot be executed by API roles'
  else 'not ok 2 - a retired verification RPC remains executable by an API role'
end
union all
select case
  when not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'verification_documents_owner_read',
        'verification_documents_owner_insert',
        'verification_documents_owner_delete'
      )
  ) then 'ok 3 - retired authenticated verification Storage policies are absent'
  else 'not ok 3 - a retired authenticated verification Storage policy remains'
end
union all
select case
  when not has_function_privilege(
    'authenticated',
    'private.expire_due_verifications(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'api.expire_due_verifications(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'api.expire_due_verifications(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'api.claim_verification_evidence_cleanup(integer,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'api.finalize_due_verification_upload_cleanup(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'api.finalize_due_verification_document_deletion(uuid,uuid,uuid)',
    'EXECUTE'
  ) then 'ok 4 - verification retention cleanup is service-role-only'
  else 'not ok 4 - verification retention cleanup privileges are unsafe'
end
union all
select case
  when exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'verification_records'
      and indexname = 'verification_records_expiry_due_idx'
      and indexdef like '%(document_expiration_date, submitted_at, id)%'
      and indexdef like '%WHERE (status = %verified%'
  ) then 'ok 5 - verification expiry has a bounded oldest-first queue index'
  else 'not ok 5 - verification expiry queue index is missing'
end;
