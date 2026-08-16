# Pickup and Active-Rental Operations

Status: local synthetic validation complete. No hosted migration, real pickup
configuration, deployment, real-ID collection, equipment handoff, or public
paid-rental activation is authorized by this runbook.

## Runtime and configuration boundary

The database is authoritative for pickup eligibility and `ACTIVE` state. The
browser cannot choose identity, contract, payment, serial authority, accessory
membership, actor, operation time, or state. The admin enters only what was
physically observed. A red or stale UI result means stop and refresh; it never
authorizes release outside the application.

Configure these values as server-only environment records in an approved target:

- `PICKUP_LOCATION`: reviewed arrival location;
- `PICKUP_CONTACT`: monitored operational contact; and
- `PICKUP_PROCESS`: concise arrival/check-in sequence.

Do not use a `NEXT_PUBLIC_` prefix, commit real values, or substitute a personal
detail in `.env.example`. Missing or malformed values fail closed for the
renter. The stored booking supplies the schedule; environment configuration
must not duplicate or override it.

Optional condition-photo signing and stored-byte verification use
`SUPABASE_SERVICE_ROLE_KEY` only inside Server Actions. The authenticated admin
token remains authoritative for intent creation and Storage insertion. The
service role never appears in a browser bundle.

## Local validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The database command provisions a disposable socket-only PostgreSQL 17 cluster,
rejects caller-supplied `DATABASE_URL`, replays all forward migrations, runs the
pickup acceptance suite, proves competing pickups yield one atomic winner, and
proves condition-photo create/finalize retries share a deadlock-free lock order.
It cannot target Development or Production.

## Pickup procedure

1. Use only the **Ready for pickup** queue. A booking absent from that queue is
   not eligible, even if another page or message suggests otherwise.
2. Open the booking and confirm the expected named renter is physically present.
   Representatives and substitutes are not accepted.
3. Inspect the original current government ID. Confirm it matches the person,
   the current verified identity, and the signed contract renter. Do not copy an
   ID number, scan, or image into handoff notes.
4. Enter the serial physically observed on the camera. Do not reveal or send the
   authoritative serial to the renter as a prompt.
5. Check every inclusion from the current signed contract and select every item
   exactly once.
6. Write the starting condition plainly and completely. Optional notes are
   private. A photo is not required for a valid written handoff.
7. Record the actual pickup time and submit once. PostgreSQL locks the booking,
   rechecks identity/contract/payment/checklist facts, writes the immutable
   handoff/report/history/audit, and changes the booking to `ACTIVE` together.
8. If the response is stale, blocked, or indeterminate, do not release equipment
   and do not invent another result. Refresh the persisted booking. A retry with
   the same operation identifier is safe; a competing operation loses.

Never change a booking state directly, edit an immutable report, accept a copy
of an ID as the original, accept a substitute, omit an inclusion, or treat a UI
readiness badge as authority.

## Optional private photos

- Accept JPEG or PNG only, maximum 5 MiB, and no more than six current pickup
  condition photos per report.
- The app creates an exact 15-minute opaque target and uploads with overwrite
  disabled. It downloads the stored bytes server-side and verifies type, size,
  and SHA-256 before finalizing metadata.
- A failed upload does not invalidate the written handoff. Retry the photo from
  the persisted `ACTIVE` page; do not repeat pickup or create another handoff.
- An interrupted object is claimed for exact cleanup before a new intent. The
  service role removes only that database-authorized unfinished target, then the
  database verifies absence and records cleanup.
- A renter may request a 60-second URL only through their owned booking. An
  admin must request the fixed `pickup_condition_review` purpose; the database
  writes the access audit before the server signs a 60-second URL.
- Never copy a path, digest, signed URL, or image into logs, chat, issue text,
  notes, or documentation. If a URL expires, request another authorization.

Photo lifecycle columns preserve retention/deletion-request/deletion-completion
metadata, but no condition-photo retention schedule or deletion worker is
authorized by Sprint 5. A future policy must be a reviewed forward change; do
not manually delete finalized evidence.

## Active-rental monitoring

The admin queue contains only `ACTIVE` bookings and orders expected returns
earliest first. `overdue`, `due_today`, and `upcoming` are scheduling signals.
The displayed phone is necessary contact context for the active rental; do not
export or reuse it for another purpose.

No late amount is calculated. Penalties, deductions, damage, loss, return,
refund, and deposit settlement remain separate manual/reviewed workflows. Do
not infer or communicate a charge from queue urgency.

## Roll-forward recovery and release boundary

For a repeated failure, record only safe booking/operation identifiers and the
error class. Inspect transaction/audit state using authorized tooling; never
include private evidence paths, signed URLs, ID content, serials, phone numbers,
or report text in an incident ticket. Preserve the committed winner and ship a
reviewed forward migration or application fix. Never reset a hosted database or
delete immutable history.

The current migration is repository-only. Follow the README target check before
any separately approved Development database command. Production migration,
environment changes, deployment, real operating details, real-ID collection,
equipment release, or promotion require separate explicit authorization.
