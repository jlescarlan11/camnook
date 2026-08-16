# Return, Cancellation, and Deposit Resolution Operations

Status: local synthetic validation complete. No hosted migration, real return,
real refund, paid-cancellation acceptance, deployment, equipment operation, or
public paid-rental activation is authorized by this runbook.

## Authority and stop conditions

The database is authoritative for booking state, signed-contract accessories,
verified deposit held, decision-linked deductions, refund liability, and
immutable history. The browser supplies physical observations or explicit
human decisions only. Stop and refresh on any stale, blocked, policy-disabled,
or indeterminate result. Never reproduce a decision in notes, a spreadsheet, or
an off-system state change.

Do not expose the expected private camera serial. Enter only the serial observed
on the returned camera; PostgreSQL compares it with the current issued contract.
Do not copy full GCash references, private evidence paths/digests, internal issue
reasons, or signed URLs into tickets, chat, or logs.

## Local validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The database command provisions a disposable PostgreSQL 17 cluster, rejects a
caller-supplied `DATABASE_URL`, replays all twenty-one migrations, runs every SQL
suite including Sprint 6, proves the legacy-history migration guard before any
old API change, runs existing real-session races plus competing returns, and
removes the cluster. It cannot target Development or Production.

## Physical return

1. Use the **Physical returns** queue and open the exact `ACTIVE` booking.
2. Record the actual return time in Asia/Manila.
3. Enter the serial physically observed on the camera. Never use a serial from
   a message or client payload as the observation.
4. Mark each signed-contract inclusion exactly once as returned, missing, or
   damaged. Do not omit, duplicate, add, or rename an inclusion.
5. Record camera damage separately and write the complete condition report.
   Private notes must not include ID numbers or unnecessary personal data.
6. Submit once. The database locks/rechecks the booking and snapshot, inserts
   the immutable handoff/report/history/audit, and moves `ACTIVE` to
   `RETURN_REVIEW` together. A same-operation retry is safe.

Wrong serial, impossible time, stale state, or an incomplete accessory set must
fail without a partial handoff or transition.

## Private return evidence

- JPEG/PNG only, 1 byte to 5 MiB, no more than six current photos per report.
- Uploads use an opaque 15-minute exact target with overwrite disabled. The
  stored bytes are downloaded server-side and checked for signature, size, and
  SHA-256 before metadata finalization.
- Damage or missing-item review cannot advance without at least one finalized
  photo. A late-only issue may rely on the immutable actual time.
- Admin access requires the fixed `return_condition_review` purpose; audit is
  written before a 60-second URL is server-signed. The booking renter may access
  only their own finalized photo.
- A correction creates a new photo with `supersedes_photo_id`. Never overwrite,
  edit, or delete the earlier evidence to make the record appear different.
- On interrupted upload, use the persisted page so exact cleanup can run. Never
  delete an arbitrary Storage prefix.

## Return review

- Clear facts—no damage, no missing item, and no late actual time—must use the
  clear action. It changes `RETURN_REVIEW → COMPLETED`, releases the block,
  records a zero-deduction deposit snapshot, and leaves any refund liability
  visible until money is externally moved and recorded.
- Any damage, missing item, or late fact must use the issue action. Append a
  private opening note and change `RETURN_REVIEW → ISSUE_REVIEW`.
- The database refuses an outcome that contradicts recorded facts. Do not alter
  facts to obtain a preferred path.

## Issue review and manual deductions

1. Review the immutable report and purpose-authorized evidence.
2. Append additional private notes; never edit an earlier note.
3. Choose a decision kind that matches the recorded facts: damage,
   missing-item, late-return, mixed, or documented other.
4. Enter the deduction manually. No hourly formula, grace period, automatic
   damage amount, or late penalty exists. Zero is valid; the amount cannot
   exceed the verified deposit.
5. Record a complete private evidence/reason basis and a separate concise
   renter-visible explanation.
6. Submit once. The decision, optional decision-linked deduction, settlement
   version, `ISSUE_REVIEW → COMPLETED` history, block release, and audit commit
   together. Refund recording must occur later.

## Cancellation requests and decisions

A renter request is only a request. It is allowed for an owned booking in
`FOR_REVIEW`, `CONTRACT_PENDING`, `TO_PAY`, `PAYMENT_REVIEW`, or `CONFIRMED`; it
does not change state or release inventory.

For a pending request, recheck the current booking and enter an explicit reason:

- acceptance is enabled only in `FOR_REVIEW`, `CONTRACT_PENDING`, and `TO_PAY`;
- the current approved path records zero fee and zero refund liability, changes
  the booking to `CANCELLED`, releases its block, and preserves all history;
- `PAYMENT_REVIEW` and `CONFIRMED` acceptance is disabled under OD-03 until
  notice, fee, retention, and refund terms are approved; and
- an explicit decline remains available and does not change booking state.

Never bypass the disabled paid-cancellation button, invent a fee, or use the
legacy broad operation. A future policy change requires a new reviewed forward
migration, tests, contract wording, and renter copy.

## Recording an external refund

The application does not move money. After the booking is `COMPLETED` or
`CANCELLED` and the outgoing GCash transfer has actually completed:

1. Confirm the displayed remaining liability: verified deposit minus the
   explicit decision-linked deduction minus prior net refunds.
2. Enter the exact amount moved, recipient name, full outgoing reference, and
   actual movement time. The amount must be positive and no greater than the
   remaining liability; the time cannot predate completion/cancellation.
3. Submit once. The operation inserts a verified outgoing payment, one
   `deposit_refund` allocation, an immutable refund ledger row, a versioned
   settlement snapshot, and a redacted-reference audit.
4. Verify the remaining liability and renter-visible amount. Never count the
   deposit/refund allocation as rental revenue.

## Corrections and recovery

Never edit a verified outgoing refund. If the transfer was returned or the
record requires a factual correction, record an offsetting reversal only after
the opposite external movement actually occurred. Enter the new incoming
reference, counterparty, actual time, and correction reason. The exact amount
comes from the original refund. The operation creates one linked verified
incoming reversal and restores the liability.

If a response is indeterminate, refresh the persisted ledger before retrying.
Reuse the original operation identity when the same browser submission is
retried. Never create a second movement to make the UI look successful. A
database or UI defect is repaired by a reviewed roll-forward change; immutable
evidence and finance records are not deleted.

## Monitoring and rollout boundary

Monitor the four dashboard queues: physical returns, issue review,
cancellations, and deposit liabilities. A `COMPLETED` booking with remaining
liability is expected operational work, not a state inconsistency. Investigate
stale/blocked errors, repeated policy-disabled attempts, old liabilities,
reversal frequency, and private-evidence access audits without logging the
sensitive values themselves.

Before any hosted migration, verify the exact Development link immediately
before both dry-run and push. The migration intentionally stops with
`legacy_resolution_history_requires_reviewed_mapping` if it finds a previously
decided cancellation or a legacy nonzero refund/deduction settlement; preserve
those records and ship a separately reviewed evidence-based mapping migration.
Do not bypass the guard or invent decision links. Do not deploy or migrate
Production under this runbook. Rollback is UI disablement or a reviewed forward migration. Real
returns/refunds, paid-cancellation acceptance, operating staff, incident
response, and public paid launch need separate written authorization.
