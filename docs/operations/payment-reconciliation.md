# Manual GCash Reconciliation Operations

Status: local synthetic validation complete. No hosted migration, real recipient
configuration, deployment, or public paid-rental activation is authorized by
this runbook.

## Runtime and environment boundary

GCash is a manual external money rail. CamNook presents a versioned recipient,
records renter-declared transfer facts, and lets the sole admin reconcile them;
it never initiates, captures, refunds, or otherwise moves money.

The forward migration creates `private.gcash_payment_configuration` disabled.
Until the sole admin explicitly enables a valid versioned recipient, owner
instructions and submission fail closed. Never commit a real recipient name,
account number, transaction reference, screenshot, user UUID, or service-role
credential. Local and Development validation uses synthetic values only.

The authenticated browser uploads an approved file only to the exact private
intent path with no overwrite. A server-only Supabase service role creates and
finalizes the owner-bound intent, downloads the stored object to verify its size
and SHA-256, and issues admin review links only after the database records a
purpose-bound authorization. `SUPABASE_SERVICE_ROLE_KEY` must remain a
server-only environment variable and must never use a `NEXT_PUBLIC_` prefix.

## Local validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The concurrency command creates a socket-only disposable PostgreSQL 17 cluster,
replays every forward migration, runs the SQL invariant suites, and executes
real independent-session races. It rejects a caller-supplied `DATABASE_URL` and
cannot target Development or Production.

## Separately authorized Development setup

Do not run these steps during ordinary review. For an approved Development
rollout, first follow the repository database target checks and verify the
ignored link immediately before every hosted command. Apply the migration before
regenerating database types or deploying a matching protected Preview.

After migration and synthetic smoke validation, a sole admin may call
`api.configure_gcash_recipient` through a controlled database session with:

- an operation UUID;
- `enabled = true`;
- the approved display name and account identifier; and
- no copied secrets or real values in a terminal transcript, migration, issue,
  pull request, or runbook.

Confirm the returned configuration version changed. In the protected Preview,
verify an owner sees that exact version's name/account with the immutable rental
fee, deposit, total, and original deadline. Another renter must receive no
instructions. A disabled or incomplete configuration must continue to fail
closed.

Enabling the recipient is an operational change, not proof that legal, tax,
security, staffing, support, or public-launch gates are complete.

## Reconciliation procedure

The admin dashboard orders current submitted incoming transactions by oldest
submission and exposes queue age for the 12-hour review target. For each item:

1. Open the payment detail and inspect the booking context, declared amount,
   sender, reference, submission time/deadline, and proof-presence flag.
2. If optional proof is relevant, request access for
   `payment_reconciliation`. Use the link within 60 seconds. Do not copy its URL
   or the private object path into notes, logs, messages, or tickets.
3. Independently sign in to the actual approved GCash account and locate the
   transfer. A screenshot is supporting evidence only and is never sufficient.
4. Match the actual account, exact total, sender facts, and normalized reference.
5. Verify only after explicitly confirming the actual-account check and entering
   the observed amount/reference. The database derives the rental-income and
   security-deposit-liability allocations and confirms the booking atomically.
6. If the transfer cannot be confirmed, select the narrow renter-safe reason.
   Before the original deadline the booking returns to `TO_PAY`; at or after the
   deadline it becomes `EXPIRED` and its active block is released.
7. Refresh after an interrupted or stale response. Never repeat an external
   money movement merely because the application response was indeterminate.

Do not verify from proof alone, invent a reference, override an amount, manually
edit allocations, reset a deadline, change a booking state directly, or delete a
historical record.

## Proof recovery and correction

- If transfer details were accepted but proof upload failed, the booking remains
  in `PAYMENT_REVIEW`. Retry only the optional proof; do not resubmit payment or
  resend money.
- A retry reconciles an existing exact no-overwrite object by downloading and
  hashing it before finalization. Missing, late, mismatched, or abandoned objects
  enter the controlled cleanup path.
- A corrected screenshot creates a new proof UUID and immutable
  `supersedes_id` chain. It never overwrites or deletes the earlier metadata.
- If a 60-second review URL expires, request a new purpose-bound authorization.
  Do not persist or relay the old URL.
- Repeated cleanup/finalization failures require an incident record containing
  safe aggregate identifiers only; diagnose Storage metadata and audit events,
  never expose the object path or file digest outside authorized tooling.

## Accounting and audit checks

Verified incoming transfers must have exactly one `rental_payment` allocation
and one `security_deposit` allocation whose sum equals the immutable transaction
amount. Rental revenue projections include only verified rental allocations;
deposit liability is reported separately. A duplicate normalized verified
reference must fail closed.

Audit review should identify actor, action, transaction, outcome, purpose,
operation, and trusted database time. It must not contain the full GCash
reference, proof path, digest, signed URL, access token, or unrelated renter
data. Transactions, allocations, proof versions, booking history, and audit are
append-only. A future correction to verified finance requires an explicit
reviewed reversal; direct mutation is not recovery.

## Disablement and roll-forward recovery

If new submissions must stop, the sole admin can disable the recipient through
the same controlled configuration operation. This prevents new instructions
and submissions. It does not invalidate existing submitted transactions or
erase the recipient snapshot used when they were submitted; admins must still
reconcile the existing queue.

Database rollback is forward-only. Ship a reviewed corrective migration while
preserving every transaction, allocation, proof version, state-history row, and
audit event. Never reset a hosted database, rewrite a deadline, or delete
financial history. Production migration, environment changes, deployment,
recipient enablement, or promotion require separate explicit authorization.
