-- CamNook Storage buckets and exact-path authorization.
-- Private evidence is never overwritten. UPDATE policies are intentionally absent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'camera-listings',
    'camera-listings',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'draft-staging',
    'draft-staging',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  ),
  (
    'verification-documents',
    'verification-documents',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'application/pdf']::text[]
  ),
  (
    'contracts',
    'contracts',
    false,
    10485760,
    array['application/pdf']::text[]
  ),
  (
    'payment-proofs',
    'payment-proofs',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'application/pdf']::text[]
  ),
  (
    'condition-evidence',
    'condition-evidence',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy camera_listing_objects_public_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'camera-listings');

create policy camera_listing_objects_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'camera-listings'
  and (select private.is_admin())
  and exists (
    select 1
    from public.camera_photos as photo
    join public.cameras as camera on camera.id = photo.camera_id
    where photo.object_path = name
      and photo.archived_at is null
      and camera.status = 'published'
  )
);

create policy verification_documents_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'verification-documents'
  and exists (
    select 1
    from public.verification_documents as document
    where document.object_path = name
      and document.deleted_at is null
      and document.owner_user_id = (select auth.uid())
  )
);

-- VER-07 / LB-01: no INSERT policy exists for verification-documents.
-- The corresponding API operation is also fail-closed until privacy approval.

create policy contract_objects_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'contracts'
  and exists (
    select 1
    from public.contract_versions as version
    join public.bookings as booking on booking.id = version.booking_id
    where version.rendered_pdf_path = name
      and booking.renter_id = (select auth.uid())
  )
);

create policy contract_objects_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'contracts'
  and (select private.is_admin())
  and exists (
    select 1
    from public.contract_versions as version
    where version.rendered_pdf_path = name
  )
);

create policy payment_proof_objects_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and exists (
    select 1
    from public.payment_proofs as proof
    where proof.object_path = name
      and proof.deleted_at is null
      and proof.owner_user_id = (select auth.uid())
  )
);

create policy payment_proof_objects_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-proofs'
  and exists (
    select 1
    from public.payment_proofs as proof
    where proof.object_path = name
      and proof.owner_user_id = (select auth.uid())
      and proof.deleted_at is null
  )
);

create policy condition_evidence_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'condition-evidence'
  and exists (
    select 1
    from public.condition_photos as photo
    where photo.object_path = name
      and photo.deleted_at is null
      and (select private.owns_condition_report(photo.condition_report_id))
  )
);

create policy condition_evidence_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'condition-evidence'
  and (select private.is_admin())
  and exists (
    select 1
    from public.condition_photos as photo
    where photo.object_path = name and photo.deleted_at is null
  )
);

-- draft-staging intentionally has no client policies. It is reserved for a
-- future audited promotion workflow and is inaccessible until that exists.

-- Admin reads of private objects are also intentionally absent. A later
-- server-only signed-URL operation must authorize and append an audit event
-- before an administrator can access sensitive evidence.
