# Storage and Privacy Architecture

Status: architecture approved on 2026-08-12; government-ID v2 collection not legally approved<br>
Implementation updated: 2026-08-15<br>
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

Government-ID evidence policy `government-id-evidence-v2` and draft notice
`government-id-privacy-v2` are implemented only as a fail-closed technical
control. They are not approval to collect real IDs. The versioned notice is
linked from the account UI and makes the missing legal and operational facts
explicit.

Production collection remains feature-disabled until all of these release gates
are satisfied:

1. CamNook publishes and tests a monitored privacy/DPO contact;
2. the legal controller/address, DPO, Section 13 basis, decline consequences and alternative, processor locations, cross-border safeguards, retention schedules, PIA/ROPA/PMP, registration assessment, and breach plan are documented;
3. the implemented sole-admin, purpose-bound, 60-second read and decision flow is supplemented by approved strong reviewer authentication, escalation, and appeal procedures;
4. the legal-hold procedure and provider backup treatment are operationally proven or removed as claims;
5. Philippine privacy counsel approves the final notice and workflow;
6. the migration and RLS/advisor suite pass in Development; and
7. the complete flow passes with synthetic evidence in protected Preview.

The database policy row is the authority. No intent is issued when it is off or
when the exact rendered policy/notice versions are stale. A hidden button is not
an adequate control. The v2 hardening migration resets the policy to disabled
and clears its activation time; a later reviewed migration is required to turn
collection on.

## Buckets

| Bucket | Visibility | Contents | Writers | Readers |
| --- | --- | --- | --- | --- |
| `draft-staging` | Private | Draft/unpublished camera photos under the `camera-listings/` prefix | Exact-path authenticated admin publication operation | Exact-path authenticated admin publication operation |
| `camera-listings` | Public | Approved camera listing photos only | Exact-path authenticated admin publication operation | Anyone |
| `verification-documents` | Private | Government ID files | Authenticated owner workflow through an exact upload intent; protected retention worker for deletion only | Owning renter; sole admin only through an audited server-issued 60-second review URL |
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

For verification documents, no intent is issued until the privacy/retention
launch gate and exact notice-specific consent are current. Authenticated clients
have no execute grant on mutation/path RPCs. The Server Action authenticates the
owner, validates the bytes and affirmative consent, and calls a narrow server-only
service-role RPC with matching owner/actor IDs.

### 2. Upload and finalize

The Storage `INSERT` policy requires an unexpired pending metadata row whose owner matches `(select auth.uid())`, bucket, exact object path, MIME, and byte size, and rechecks that the profile is active and the current policy/notice still match. `UPDATE`/upsert is denied. For government IDs, the Server Action also checks the file signature, downloads the stored object, and verifies byte size and SHA-256 before database finalization. Finalization rechecks Storage metadata, active-account status, and the current policy/notice, freezes the evidence row, and appends minimal audit data.

Abandoned upload intents expire and may be cleaned without affecting domain history. A database row that claims finalization without a matching object is invalid and surfaced by a reconciliation job.

## No-overwrite and correction policy

Application roles receive no `UPDATE` permission on private `storage.objects`. Supabase upsert would require `INSERT`, `SELECT`, and `UPDATE`; CamNook deliberately withholds `UPDATE`.

- A corrected ID scan, payment proof, contract render, or condition photo receives a new UUID path and metadata row.
- Metadata uses `supersedes_id` where the relationship matters.
- A superseded government-ID object becomes immediately due for the protected cleanup worker; it is never overwritten.
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

Sprint 2 adds one narrow government-ID exception to the Sprint 1 direct-read
denial. The database re-authorizes the current sole application admin, requires
the exact `identity_review` purpose, checks that the submission and retained
document are still current, and writes a path-free audit event before returning
the object path to the Server Action. The Server Action uses the server-only
Storage client to issue a 60-second signed URL. The URL, token, path, digest, and
content are never written to database audit metadata or application logs. Direct
admin Storage `SELECT`, bulk export, and access to terminal/superseded evidence
remain denied. Strong reviewer authentication and the operating escalation and
appeal procedures remain Production activation gates.

## Storage RLS design

Policies on `storage.objects` are bucket- and operation-specific.

| Operation | Public listing | Private owner evidence | Private admin evidence |
| --- | --- | --- | --- |
| `SELECT` | Public delivery by bucket setting | Exact path must join finalized owner metadata or an active owner upload/cleanup intent | Direct read denied; current sole admin receives only a database-authorized, server-issued 60-second signed URL for `identity_review` |
| `INSERT` | Exact-path authenticated admin copy only; draft upload goes to private staging | Exact unexpired upload-intent path owned by `auth.uid()` with matching MIME/size | Denied for government IDs in Sprint 1 |
| `UPDATE` | Denied | Denied | Denied |
| `DELETE` | Exact-path admin abort/archive cleanup only | Exact owner path only while intent cleanup is pending or deletion has been durably claimed after an owner request and is not held | Retention worker deletes only database-claimed due paths; application admin is denied |

Storage policies do not depend on `user_metadata`. `TO authenticated` is combined with ownership or `private.is_admin()`. Catalog photo publication uses the admin's short-lived user token so Storage RLS remains authoritative; it does not need a service key. The government-ID Server Action uses the renter token for owner Storage RLS and a server-only service key only for narrow mutation RPCs. The protected retention worker uses that service key to delete only paths atomically claimed by the database; its finalizer independently verifies absence and preserves system audit history.

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
- `verified_deleted_at`, deletion operation ID, and last-known hash retained only in private metadata; and
- optional `supersedes_id`.

Deleting file bytes never deletes the verification decision, booking state history, contract snapshot metadata/hash, payment transaction, handoff facts, or audit trail. Those records retain the minimum data needed to prove the historical decision while dropping the sensitive payload.

## Retention and verified deletion

Government-ID v2 assigns every finalized object a 30-day outside
`retention_until`. The date is a maximum, not a minimum. A renter may withdraw
consent and request deletion before that date; an unheld object is claimed and
removed immediately. Replacement makes the superseded object due for the
protected daily worker. For an owner request or a due automatic cleanup, the
flow:

1. locks and rechecks the exact document and owner;
2. records an attributed renter consent-withdrawal/privacy request or a system retention action and atomically acquires a durable deletion claim;
3. returns the private path only to that in-flight authenticated action;
4. removes the exact object through owner-scoped Storage RLS;
5. asks the database to verify the object is absent; and
6. records `deleted_at` and `verified_deleted_at` while preserving the decision,
   lifecycle metadata, and path-free audit history.

Failures remain retryable. Database metadata is never marked deleted while the
object is present or ambiguous. A documented legal hold blocks claim
acquisition, Storage delete authorization, and lifecycle finalization. Once a
due deletion is durably claimed, a new hold cannot race byte removal; transient
worker failures return the same claim on later runs until absence is verified.

The CRON-secret-protected cleanup route first records Manila-date expiry for
latest verified decisions, then claims up
to 1,000 due documents and 1,000 abandoned intents, removes exact paths in bounded
batches, returns counts only, and records system-actor audit events. The account
flow remains available for renter-initiated deletion.
Retention for contracts, payment proofs, condition evidence, and archived
listing media remains a later policy decision.

## Privacy minimization

- Require a single masked JPEG/PNG side or page. Cover document numbers (including PSN/PCN/CRN), address, full birth date, signature, QR/barcode, and machine-readable zone; leave only the name, portrait, ID type, and expiry needed for the proposed review.
- Do not accept PDF until an approved sanitizer removes extra pages, embedded content, and metadata.
- Do not store a full government ID number unless legal/operational review proves it necessary.
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
4. Prove upsert fails; owner delete fails unless exact intent cleanup or a durably claimed, non-held owner request authorizes it.
5. Prove signed URL issuance audits admin access and expires within policy.
6. Prove deleting an ID object leaves the verification decision and audit record intact.
7. Reconcile metadata rows to objects and objects to metadata rows.
8. Run Supabase security advisors after policy changes.
