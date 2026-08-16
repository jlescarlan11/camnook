# Camera Catalog Publication Runbook

Status: repository workflow applied and rehearsed in Development on 2026-08-14;
Production migration, inventory, and publication authorization pending
Targets: Development rehearsal first; Production only with explicit approval

## Release boundary

The public catalog reads `public_cameras`, `public_camera_photos`, active
accessories, and `public_availability`. This runbook governs publication of real,
owner-approved inventory through those existing contracts. It does not create a
catalog CMS, change pricing or approval policy, create demo Production data, or
open authentication, verification, contract, payment, handoff, refund, or
private-Storage gates.

Migration `20260814001206_hide_unpublished_availability.sql` closes a concrete
repository gap: anonymous and ordinary authenticated callers must not read
availability blocks for draft or archived cameras through either the public view
or the directly granted source columns. Migration
`20260813163420_add_catalog_photo_publication_workflow.sql` adds the exact-path,
audited photo state machine described below. Both migrations were applied and
verified in Development on 14 August 2026, leaving Development recorded at
13/14 at that checkpoint after the separate Sprint 1 evidence migration was
added locally. After the later evidence rollout and repository-only v2/Sprint 2
migrations, the current recorded counts are Development 14/21 and Production
11/21 until separately approved rollouts.

Keep any manifest containing serial numbers, acquisition/replacement values, or
other private inventory details outside Git and public release evidence. Only
business-approved listing photos may ever enter the public `camera-listings`
bucket. Never stage an ID, payment proof, contract, condition report, or other
customer evidence there.

Never run `supabase db reset --linked` or `supabase config push`. Before every
database **or Storage object** mutation, run:

```bash
cat supabase/.temp/project-ref
```

It must print exactly `ekmoiepalelqpmemvrkl`. Development operations use that
verified link. For every dashboard Storage mutation, also inspect the dashboard
URL/project header immediately before the individual upload, copy, or removal
and require that same Development ref. Production must not be linked; every
authorized Production command or dashboard operation must visibly target
`iegcixcevvkryfwfotqz`, while the local link remains Development. Any mismatch
is a hard stop.

## Required approved input

For each camera, the business owner must approve all of the following before a
rehearsal or publication window:

- public name and unique lowercase kebab-case slug;
- customer-facing description;
- non-negative daily rate and security deposit in PHP;
- private unique serial number, retained outside public evidence;
- included accessory names, quantities, and display order;
- maintenance/manual unavailability ranges in precise instants;
- at least one JPEG, PNG, or WebP listing photo no larger than 10 MiB, with
  useful alt text and deterministic display order; and
- the operator and reversible recovery decision for the release window.

Do not substitute sample, scraped, AI-generated, or otherwise unapproved values.
If any required input is absent, retain the honest public empty/draft state.

## Audited Storage workflow

The repository implements the smallest supported operator workflow in
`20260813163420_add_catalog_photo_publication_workflow.sql` and
`scripts/catalog-photo-publication.mjs`. It intentionally does not add a catalog
CMS. An operator supplies a short-lived application-admin access token to the
local process; the script validates the user with Auth and `api.is_admin`.
Storage and RPC calls use that user session and exact RLS policies. No service
key, secret key, permanent object URL, or Vercel credential is required.

The workflow:

1. accepts only an explicitly authorized admin/operator and approved image
   type, size, opaque UUID paths, and immutable version;
2. stages bytes privately in `draft-staging/camera-listings/{camera_uuid}/...`
   without exposing a permanent private URL;
3. persists sufficient non-sensitive metadata, including expected SHA-256 and
   byte size, to reconcile database and Storage state;
4. copies approved bytes through the authenticated Supabase Storage API to a
   new `camera-listings` path, verifies the destination bytes/size/hash before
   committing metadata, and audits the actor/outcome;
5. denies overwrite/upsert and, on retry, treats an existing destination as
   complete only when its exact approved hash/size match; otherwise it fails
   closed;
6. commits a coherent active `camera_photos` reference only after the verified
   destination exists;
7. removes staging only after both sides reconcile; and
8. archives/removes public bytes through a controlled, verified operation
   without deleting database or audit history.

Database authorization tests cover non-admin denial, exact-path policies,
invalid input, source/destination preconditions, idempotent retries, ambiguous
copy abort, staging cleanup, archive cleanup, and retained metadata/audit
history. The operator helper tests file signatures, size, SHA-256, target
selection, and the extra Production confirmation. The exact hosted Storage
sequence was rehearsed successfully in Development on 14 August 2026; this is
Development evidence only and does not authorize a Production rollout.

Never pass an access token as a CLI argument or write it to `.env.local`, a
shell-history line, Git, logs, screenshots, issue comments, or documentation.
Load the three required environment variables into an isolated shell from an
approved secret source, use `read -rs CAMNOOK_ADMIN_ACCESS_TOKEN` when manual
entry is required, export it only for the command, and unset it immediately
afterward. The token must be short-lived, belong to the sole application admin,
and never be printed. Do not place a service-role key in Git, `.env.local`,
browser code, Vercel, or this workflow.

Immediately before an operator command, perform the required visible target
check. The script also re-reads the ignored local ref before every mutating RPC
or Storage call and hard-stops unless it is still Development. Each command
must name the target ref explicitly:

```bash
cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm catalog:photos -- publish \
  --project-ref ekmoiepalelqpmemvrkl \
  --camera-id "$APPROVED_CAMERA_ID" \
  --file "$APPROVED_PHOTO_PATH" \
  --alt-text "$APPROVED_ALT_TEXT" \
  --sort-position 0
```

`resume --publication-id <uuid> [--file <same-approved-file>]` reconciles an
ambiguous upload/copy/finalize outcome. `abort --publication-id <uuid>` removes
both exact objects and preserves the aborted metadata/audit record before
camera publication. `archive --publication-id <uuid>` archives the active
photo metadata before verified object removal. A Production command additionally
requires both `--project-ref iegcixcevvkryfwfotqz` and
`--confirm-production-catalog-publication`; that mechanical guard is not a
substitute for immediate owner authorization.

After every required photo and the rest of the draft aggregate are verified,
use `publish-camera --project-ref <ref> --camera-id <uuid>` for the final camera
transition. Directly updating `cameras.status` is prohibited: the RPC locks the
same camera row as photo archive, requires a verified active photo/object, and
audits the transition. If a photo command fails after creating its intent, its
safe error output includes `publicationId`; record that opaque reference and
use `resume` or `abort` rather than starting a duplicate intent.

The archive precondition rejects removal of the last active photo while its
camera is still published. Archive the camera first, or publish and verify a
replacement photo before archiving the old version; a public listing must never
be left with zero active photos.

## Safe publication sequence

Use this ordering in Development and repeat it in Production only after explicit
authorization:

1. Record the exact target project, application deployment SHA, migration
   history, current public catalog count, reviewed object paths/count, and
   recovery owner without private values.
2. Create the camera as `draft`, with `published_at` and `archived_at` unset.
   Add accessories and manual/maintenance availability in one reviewed database
   transaction where possible. Record photo approval through the private
   staging-metadata contract owned by the audited workflow; do not create an
   active `camera_photos` public-path row before its destination object exists.
3. Verify anonymous and ordinary renter queries cannot discover the draft
   camera, photo/accessory metadata, or its availability through public views or
   direct granted columns. Verify duplicate slug/path, negative money, invalid
   quantity/time range, and overlapping active availability are rejected.
4. Through the audited workflow, stage each approved photo privately and verify
   its expected content type, byte size, SHA-256, and opaque path.
5. Read back the draft aggregate privately and require a non-empty description,
   rate, deposit, at least one approved staged photo, approved accessories, and
   the intended active availability set.
6. Run the audited promotion operation. After the new public object's exact
   size/hash is verified, create the matching active `camera_photos` row in the
   same controlled operation. Require both before camera status can transition.
7. Invoke the guarded `publish-camera` operation. It atomically sets
   `status = 'published'` and `published_at` to database statement time only
   while a verified active photo/object still exists.
8. Immediately read the anonymous application contract. Require exactly one
   listing for the slug, correctly ordered photos/accessories, accurate prices,
   published-only availability, and no serial number/private field.

Never publish before the verified object exists. Never rely on a broken-image
fallback, known-but-unlinked public URL, or camera archive alone as privacy or
recovery control.

## Completed Development rehearsal and validation

The following matrix passed in Development on 14 August 2026. Retain it for
future regression checks and repeat it in Production only during a separately
approved release window.

The completed rehearsal used clearly non-production, approved test assets and
proved:

- draft and archived cameras remain absent from homepage, slug, photo metadata,
  accessory, public/direct renter availability, and quote consumers;
- a complete published camera renders on homepage/detail at narrow mobile and
  desktop widths, with useful alt text, keyboard-reachable booking entry, and no
  horizontal overflow;
- the quote RPC applies the existing started-24-hour formula and deposit and
  rejects invalid/unavailable ranges without client-supplied totals;
- authentication preserves camera/pickup/return, and an active renter profile
  can create only a renter-owned `FOR_REVIEW` request with no pre-approval hold;
- another renter cannot read that request, and the new renter gains no admin
  capability;
- anonymous/renter clients cannot read serial number, costs, internal notes,
  unpublished records, private Storage metadata, or verification objects; and
- repeated preparation, staging, promotion, publication, archive, and recovery
  attempts remain idempotent and do not create duplicate or conflicting state.

The published Development fixture is the Canon EOS R50 with its RF-S 18–45mm
kit lens, PHP 450 daily rate, PHP 1,000 refundable deposit, approved accessories,
three approved public photos, and zero public busy periods. Its private serial
remains absent from public UI, logs, documentation, migrations, and handoffs.

This fixture satisfied issue #8's protected-Preview prerequisite, and the real
public-registration-to-`FOR_REVIEW` booking smoke passed. The final non-sensitive
issue #8 checkpoint was posted and the issue was closed as completed on
14 August 2026. Issues #9 and #10 subsequently completed their separately
authorized Production windows on 15 August 2026.

Run application validation and the disposable database authorization/
concurrency harness for any repository change. Inspect database lint and
security/performance advisors after any schema/policy change. A data-only
rehearsal does not justify weakening a constraint or RLS policy.

## Recovery

If failure occurs before publication, keep the camera `draft`. Reconcile the
exact staging/destination hashes and database metadata before retrying. Never
blindly overwrite an existing object. An exact destination hash/size match may
be treated as a completed copy; a mismatch requires a new reviewed path or a
hard stop.

If failure leaves a verified but unreferenced public object, use `resume` to
reconcile an exact match or the explicit `abort` operation to verify and remove
both exact paths. A mismatch is a hard stop. Do not publish merely to make an
orphan appear intentional.

If a published listing is inaccurate, broken, or incomplete, set the camera to
`archived` with `archived_at` in one transaction so public database consumers
stop returning it, then use the controlled `archive` operation to remove the
public bytes and verify absence. Preserve booking and audit history. If cleanup
cannot be confirmed, keep the operation pending and retry; never describe
database archive alone as removal of a public object.

## Production authorization and evidence

Production publication changes real data and requires explicit owner approval
immediately before execution. A merged application PR, completed Development
rehearsal, approved inventory manifest, or this runbook is not Production
mutation authorization.

Non-sensitive release evidence must record exact deployment/Git SHA, applied
migration history, approved public catalog slugs/count, completed public/private
projection checks, object reconciliation, quote/booking outcome categories,
monitoring result, and recovery action. It must not include serial numbers,
renter identity, OTP/session material, keys, private object URLs, or provider
payloads.

Catalog publication and public Auth activation retain separate approval and
rollback controls. Coordinate them only after the Development OTP-to-booking
smoke passes and for the final authorized customer-flow validation.

## Completed Production publication and validation

The separately authorized Production catalog window completed on 15 August
2026 against Supabase project `iegcixcevvkryfwfotqz`. The local CLI link was
re-read as Development `ekmoiepalelqpmemvrkl` before every mutation, and the two
reviewed forward migrations brought Production to the repository's complete
13-migration history without using `supabase config push`, a linked reset, or a
Production local link. Database lint reported no errors; security and
performance advisors reported no error-level finding.

The approved public manifest contains one Canon EOS R50 with RF-S 18–45mm kit
lens at PHP 450 per day and a refundable PHP 1,000 deposit. Its fixed inclusions
are one camera bag, one tripod, two batteries, one battery charger, and one 32 GB
SD card, with no published busy period. Three owner-approved PNG originals were
promoted through the private-staging workflow with exact media type, byte-size,
and SHA-256 verification. All three publication intents are verified and
cleanup-complete, the private staging bucket has zero retained objects for the
listing, and the public bucket contains exactly the three matching objects. The
private serial remains present only in its non-public inventory field and is not
recorded here.

Anonymous homepage and detail checks on 1440-by-900 desktop and 390-by-844 mobile
viewports rendered the accurate content, price, deposit, accessories,
availability, approved lead image, and useful alt text without a broken asset.
Direct anonymous projections returned exactly one listing, three ordered photo
records, and five accessories; the serial column and all five private Storage
buckets remained denied. A valid one-day quote returned PHP 450 rent plus the
PHP 1,000 deposit, while invalid and unavailable inputs failed closed.

An ordinary Production renter followed the preserved booking path and created
exactly one owner-scoped `FOR_REVIEW` request and one matching history entry.
The request created no pre-approval availability hold, exposed no cross-account
booking, and granted no admin capability. Both renter and admin smoke sessions
were revoked after validation.

The tested application was Git SHA
`f4d58360ec4a019957434dd87680bbfb2da33c54` in READY Vercel deployment
`dpl_DChPZu3dayB9hr9XsiJjix7uWDsE`. The final monitoring window contained no
Vercel warning/error/fatal event or 5xx, no severe Supabase Auth, Postgres, or
Storage event, and no Supabase API 5xx. Recovery remains reversible: archive the
camera first to remove it from public projections, then use the controlled photo
archive workflow to verify public-object removal while preserving booking and
audit history. No renter identity, credential, OTP, private identifier, private
object path, or secret is retained in this release record.
