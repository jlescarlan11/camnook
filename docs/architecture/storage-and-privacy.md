# Storage and Privacy Architecture

Status: approved on 2026-08-12<br>
Implementation updated: 2026-08-14<br>
Policy source: [`docs/product/mvp-rental-policy-v0.1.md`](../product/mvp-rental-policy-v0.1.md)

## Decision

Use the existing Supabase Storage project. Do not add Vercel Blob or another file provider. Published camera listing images use one public bucket, unpublished listing media uses a private staging bucket, and every identity, contract, payment, handoff, condition, and issue artifact uses purpose-specific private buckets.

Supabase Storage is deny-by-default for uploads until `storage.objects` RLS policies permit them. Public buckets make downloads public, not uploads. Private objects are read through an authenticated request or a short-lived server-issued signed URL.

Current guidance:

- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Serving public and private assets](https://supabase.com/docs/guides/storage/serving/downloads)
- [Storage helper functions](https://supabase.com/docs/guides/storage/schema/helper-functions)
- [Supabase product security](https://supabase.com/docs/guides/security/product-security)

## Launch gate

Government-ID upload is feature-disabled in production until both of these are approved and linked from the UI:

1. the privacy notice describing purpose, access, retention, deletion, and data-subject handling; and
2. the document-retention schedule with a legally reviewed retention duration and deletion exceptions.

The database and bucket policies may be prepared and tested before that approval, but the public upload operation must reject requests while the feature flag is off. A hidden button is not an adequate control.

## Buckets

| Bucket | Visibility | Contents | Writers | Readers |
| --- | --- | --- | --- | --- |
| `draft-staging` | Private | Draft/unpublished camera photos under the `camera-listings/` prefix | Exact-path authenticated admin publication operation | Exact-path authenticated admin publication operation |
| `camera-listings` | Public | Approved camera listing photos only | Exact-path authenticated admin publication operation | Anyone |
| `verification-documents` | Private | Government ID files | Renter through upload intent; admin correction operation | Owning renter and audited admin |
| `contracts` | Private | Rendered immutable contract versions | Server contract operation | Booking renter and audited admin |
| `payment-proofs` | Private | Optional GCash submission screenshots | Booking renter through upload intent | Booking renter and audited admin |
| `condition-evidence` | Private | Pickup/return photos and issue evidence | Admin handoff/issue operation | Booking renter where appropriate and audited admin |

Do not mix public camera media with private evidence. Bucket privacy is an independent safety boundary in addition to object RLS.

## Object paths

Paths use UUIDs and generated extensions only. They never contain legal names, email addresses, phone numbers, ID types/numbers, camera serial numbers, GCash references, or free-form notes.

```text
draft-staging/camera-listings/{camera_uuid}/{photo_uuid}.{ext}
camera-listings/{camera_uuid}/{photo_uuid}.{ext}
verification-documents/{owner_uuid}/{record_uuid}/{document_uuid}.{ext}
contracts/{booking_uuid}/{contract_version_uuid}/{artifact_uuid}.pdf
payment-proofs/{owner_uuid}/{transaction_uuid}/{proof_uuid}.{ext}
condition-evidence/{booking_uuid}/{condition_report_uuid}/{photo_uuid}.{ext}
```

UUIDs are identifiers, not authorization. Every policy joins the exact object path to an application metadata row and checks ownership or admin status. Prefix matching alone is insufficient for reads.

Allowed extensions and MIME types are controlled per bucket. File signatures are checked server-side where practical; a client-supplied MIME type is not trusted.

## Upload workflow

All private uploads, including draft listing media, use two controlled steps.

### 1. Create upload intent

The relevant operation:

- validates the authenticated actor, aggregate ownership, allowed booking/verification state, feature gate, purpose, and maximum file count;
- creates an application metadata row with a random object path, expected MIME/size limits, expiry time, and `pending` status; and
- returns only what is needed for an authenticated upload.

For verification documents, no intent is issued until the privacy/retention launch gate is enabled.

### 2. Upload and finalize

The Storage `INSERT` policy requires an unexpired pending metadata row whose owner matches `(select auth.uid())`, bucket, and exact object path. `UPDATE`/upsert is denied. Finalization reads the actual object metadata, records size/hash, marks the row immutable, and appends audit data.

Abandoned upload intents expire and may be cleaned without affecting domain history. A database row that claims finalization without a matching object is invalid and surfaced by a reconciliation job.

## No-overwrite and correction policy

Application roles receive no `UPDATE` permission on private `storage.objects`. Supabase upsert would require `INSERT`, `SELECT`, and `UPDATE`; CamNook deliberately withholds `UPDATE`.

- A corrected ID scan, payment proof, contract render, or condition photo receives a new UUID path and metadata row.
- Metadata uses `supersedes_id` where the relationship matters.
- The older object remains under its retention rule unless an approved deletion policy removes it.
- Contract versions and submitted evidence cannot be replaced in place.

Public listing photos may be archived/reordered through database metadata, but revised bytes still use a new versioned object path to avoid stale CDN content and destructive overwrite. Publishing copies an approved staging object to a new public path, verifies its expected size/hash, commits the `camera_photos` reference, and then removes the staging object. A retry accepts an existing destination only when its exact approved size/hash match; otherwise it allocates a new path or fails closed. Rollback/reconciliation must never leave sensitive evidence in a public bucket. The repository implements this audited state machine and its local operator in `20260813163420_add_catalog_photo_publication_workflow.sql` and `scripts/catalog-photo-publication.mjs`. The migration and exact Storage sequence were applied and rehearsed in Development on 14 August 2026. They remain unavailable in Production until a separately approved migration and catalog release.

## Read access

### Public listing images

Only approved objects are copied into the public bucket as part of the camera-publish operation. Draft images stay in private staging. Removing a database reference does not make an existing public-bucket object private, so the admin archive operation must remove the public bytes when policy permits. Never place sensitive media in this bucket, even temporarily.

### Private files

Preferred access is an authenticated Storage download where RLS is evaluated. When the UI requires a signed URL, a server operation:

1. validates the current user with the Supabase server client;
2. joins the exact metadata row to the owning verification/booking/payment/condition record;
3. checks owner or current sole-admin authorization;
4. records an audit event with purpose and object metadata ID;
5. issues a URL for the shortest practical duration, normally 60 seconds and never more than five minutes for MVP; and
6. returns no permanent URL to the database.

Supabase signed URLs remain valid until their expiry even if Auth signing keys rotate and currently cannot be individually revoked. That is why expiry is deliberately short. URLs are never logged, persisted, emailed, or embedded in durable HTML.

Admin access to government IDs, payment proofs, contracts, and issue evidence always requires a stated UI purpose and creates an audit event. Bulk export is not part of MVP.

## Storage RLS design

Policies on `storage.objects` are bucket- and operation-specific.

| Operation | Public listing | Private owner evidence | Private admin evidence |
| --- | --- | --- | --- |
| `SELECT` | Public delivery by bucket setting | Exact path must join metadata owned by `auth.uid()` and a permitted parent record | Exact path plus `private.is_admin()`; URL issuance audited by app operation |
| `INSERT` | Exact-path authenticated admin copy only; draft upload goes to private staging | Exact unexpired upload-intent path owned by `auth.uid()` | Exact server/admin-created intent |
| `UPDATE` | Denied | Denied | Denied |
| `DELETE` | Exact-path admin abort/archive cleanup only | Denied | Retention worker/service role only |

Storage policies do not depend on `user_metadata`. `TO authenticated` is combined with ownership or `private.is_admin()`. Catalog photo publication uses the admin's short-lived user token so Storage RLS remains authoritative; it does not need a service key. Where an unrelated future operation genuinely uses a service key, that key remains server-only and every bypass operation must repeat authorization and audit checks.

## File metadata and lifecycle

Every private object metadata row carries:

- immutable bucket and path;
- owner/parent identifiers;
- purpose/evidence category;
- media type, byte size, and SHA-256;
- uploaded/finalized timestamps and actor;
- `retention_policy_version` and `retention_until` once approved;
- `legal_hold_at`, `legal_hold_by`, and reason where applicable;
- `deletion_requested_at` and requester;
- `deleted_at` after Storage confirms absence;
- `deletion_verified_at`, verifier/job ID, and last-known hash; and
- optional `supersedes_id`.

Deleting file bytes never deletes the verification decision, booking state history, contract snapshot metadata/hash, payment transaction, handoff facts, or audit trail. Those records retain the minimum data needed to prove the historical decision while dropping the sensitive payload.

## Retention and verified deletion

No automatic private-file deletion is enabled until the retention schedule is approved. The architecture supplies an idempotent retention operation now so the later policy is implementable without remodeling.

`process_retention_batch()`:

1. selects finalized private objects past `retention_until` with no legal hold using `FOR UPDATE SKIP LOCKED`;
2. writes a deletion-request audit event;
3. removes the Storage object with server-only credentials;
4. confirms the object is absent rather than trusting a successful API response alone;
5. records `deleted_at`, `deletion_verified_at`, policy version, and job/correlation ID; and
6. preserves the metadata/hash and parent decision record.

Failures leave the row retryable and visible in an admin exception queue. Database metadata is never marked deleted before object absence is verified.

Possible retention categories to be assigned durations by the approved policy:

- rejected/abandoned verification documents;
- expired/superseded verification documents;
- contracts and signatures;
- rejected vs verified payment proofs;
- routine handoff photos;
- damage/loss/issue evidence; and
- public listing media after camera/photo archive.

## Privacy minimization

- Do not store a full government ID number unless legal/operational review proves it necessary. Prefer ID type, expiry, and a masked suffix if needed for pickup recheck.
- Do not OCR documents in MVP.
- Do not copy sensitive file contents into logs, analytics, error monitoring, or generated test fixtures.
- Do not include renter identity in public availability or camera URLs.
- Keep legal identity snapshots only in private contract versions; public/profile display fields are separate.
- Do not use real IDs, GCash screenshots, names, or references in development/test environments.
- Backups and database retention must be included in the final privacy schedule; deleting a live object is not a claim that every backup copy has instantly disappeared.

## Security verification

Before enabling each bucket:

1. Test `anon`, owner renter, different renter, admin, suspended user, and service role.
2. Prove a guessed UUID/path cannot be read or overwritten.
3. Prove direct upload without a valid intent fails.
4. Prove upsert and owner delete fail.
5. Prove signed URL issuance audits admin access and expires within policy.
6. Prove deleting an ID object leaves the verification decision and audit record intact.
7. Reconcile metadata rows to objects and objects to metadata rows.
8. Run Supabase security advisors after policy changes.
