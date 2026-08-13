# CamNook Open Decisions and Readiness

Status: architecture approved; launch gates remain open<br>
Last updated: 2026-08-13

## Outcome

No contradiction prevents the proposed database, authorization, Storage, availability, or base booking-state architecture.

The supplied rules are internally compatible after one implied transition is made explicit: when an admin rejects a payment after the original deadline, `PAYMENT_REVIEW → EXPIRED` is required because returning to `TO_PAY` is forbidden and deadlines cannot reset. This interpretation is documented for approval; it does not require reopening the deadline policy.

## Confirmed requirements

These are approved and are not open discovery questions:

- one lender/admin, many renters, no marketplace roles;
- one serialized camera per listing and fixed included accessories;
- public discovery, authenticated booking, pickup/return only;
- manual GCash movement with application-side records only;
- one government ID, account-level manual verification, named-renter pickup;
- no block in `FOR_REVIEW`; atomic approval creates a database-enforced hold;
- one continuous 24-hour deadline from approval;
- timely submission preserves `PAYMENT_REVIEW` without automatic expiry;
- immutable versioned contracts and signatures;
- one incoming transaction may allocate between rental income and deposit liability;
- deposits are excluded from revenue and refunded manually;
- append-only state, contract, payment, handoff, and audit history;
- private evidence, opaque paths, short-lived access, and no overwrite; and
- archive rather than destructive deletion of cameras with history.

## Accepted assumptions

These remain accepted unless implementation reveals a concrete conflict:

1. Each camera has one daily rate.
2. Penalties, deductions, and exceptional amounts are manually decided.
3. One ID is sufficient for MVP.
4. Refunds happen outside the application.
5. Exactly one admin is bootstrapped and protected by database authorization.
6. The renter named on the account and contract personally collects the camera.
7. PostgreSQL time ranges are half-open `[pickup, return)`; any future turnaround buffer is an explicit separate block/rule.
8. A renter may submit `FOR_REVIEW` while verification is pending, but admin approval requires a current `verified` decision. This prevents an unverified account from receiving a hold without making random requests block inventory.

## Approved decisions

### OD-01 — Billable-day formula

Owner: product/business<br>
Status: approved on 2026-08-13<br>
Unblocks: pricing calculator, approval transaction, sanitized public quote, pricing tests

One billable day is one started 24-hour duration measured between the authoritative
`timestamptz` instants. Every positive rental costs at least one day, exact
24-hour multiples use their exact quotient, and any positive remainder rounds up.
The calculation is elapsed-duration based: `Asia/Manila` is used for business-date
checks and presentation, not to count calendar dates. There is no cutoff, grace
period, hourly price, or automated late-return amount in the MVP.

Authoritative examples:

- one microsecond, one hour, or `23:59:59.999` costs one day;
- exactly 24 hours costs one day and exactly 48 hours costs two days;
- 24 hours plus one microsecond costs two days;
- `23:30 → 00:30` in Manila costs one day because only one hour elapsed; and
- equivalent instants expressed with different UTC offsets produce identical days and amounts.

Zero-length, reversed, or missing periods are invalid. The database reads the
current camera rate and deposit for both quote and approval; callers never supply
authoritative days or money. Late-return penalties remain manual and separate
from the original rental quote.

## Decisions required before implementation of affected behavior

### OD-02 — Post-payment material amendments

Owner: product/business, with legal/accounting review<br>
Blocks: changing camera, dates, inclusions, price, deposit, or terms after `PAYMENT_REVIEW`

Policy requires a new immutable contract and signature but does not define payment reconciliation or backward state transitions after money is submitted/verified.

Recommended MVP decision: prohibit such amendments; cancel with recorded refund liability and create a new booking. This preserves the simple state machine and financial audit trail. An explicit adjustment/reconciliation workflow can be designed later if the business rejects that rule.

### OD-03 — Cancellation and refund terms

Owner: product/business with legal review<br>
Blocks: renter-facing cancellation copy, fee/refund decisions, production contract clause

The architecture already records cancellation requests, admin decisions, blocks, transactions, and refunds. Still define notice periods, whether any rental fee may be retained, and who can accept a renter request in each pre-pickup state. No automatic fee logic is assumed.

## Configuration inputs still required before public application deployment

These are not architecture questions, but implementation cannot finish without them:

- approved GCash recipient display name/number and safe configuration location;
- application origins and Supabase Auth redirect URLs for local, preview, and production;
- allowed upload file types and maximum sizes per bucket; and
- whether Supabase Cron is enabled for the idempotent expiration/retention functions.

The CamNook Supabase project is confirmed healthy at project ref `iegcixcevvkryfwfotqz`. CLI access was reauthenticated under the requested account on 2026-08-12, and local CLI metadata points to that existing project. On 2026-08-13, the owner approved temporarily using `main` as both development and production while the product remains private. The three foundation migrations, two forward advisor/lint fixes, and the sole-admin bootstrap migration were then applied to `main`; linked types were regenerated, and the custom `api` schema was added to the hosted Data API's exposed schemas. The public-launch gates below remain fail-closed.

## Public-launch blockers

### LB-01 — Privacy and retention

Public government-ID collection stays disabled until the privacy notice and retention/deletion schedule are approved. The schedule must cover live Storage objects, metadata, database rows, audit records, and backups; it must define legal holds and verified deletion.

### LB-02 — Contract legal review

Final rental, cancellation, late-return, damage/loss, electronic-signature, and non-transferability wording must be reviewed before paid public rentals.

### LB-03 — Legal, tax, and business readiness

The owner must confirm registration, tax/receipt obligations, consumer terms, privacy obligations, recordkeeping, and operational processes before real paid launch.

### LB-04 — Security verification

Before production data is accepted, migrations must pass RLS cross-account tests, Storage policy tests, concurrency races, immutable-history tests, Supabase security/performance advisors, secret scanning, and a recovery/backup review.

### LB-05 — Operations

Define admin coverage for the 12-hour payment-review target, pickup/return checklists, late returns, evidence collection, GCash reconciliation, refund tracking, and incident response.

## Deliberately deferred, not MVP decisions

Do not add architecture for multiple lenders, payouts, escrow/wallets, gateways, GCash API, automated refunds, delivery, chat, ratings, promotions, independently rentable accessories, native mobile apps, or automated damage/penalty calculations.

## Architecture approval checklist

Approval of this milestone means agreement that:

- the normalized tables and deliberately omitted redundant `contracts` parent are acceptable;
- privileged mutations use narrow database transactions behind Server Actions;
- a partial GiST exclusion constraint is the overlap authority;
- the transition table, including late payment rejection to `EXPIRED`, is correct;
- pre-payment material changes can return to `CONTRACT_PENDING` without resetting the deadline;
- post-payment material changes remain prohibited until OD-02 is decided;
- private Storage uses upload intents, exact-path RLS, no overwrite, short signed URLs, and audited admin access; and
- architecture approval is recorded before the application scaffold or migrations are applied.

## Implementation status after approval

1. The Next.js/Supabase workspace is initialized without UI feature work.
2. The existing Supabase project is linked under the approved account.
3. The migration files translate the approved architecture and are applied to the temporarily shared `main` database.
4. RLS, concurrency, immutability, Storage, advisor, and application verification are maintained as release checks.
5. Linked TypeScript database types are generated and Supabase clients use them.
6. The sole application admin is a separately confirmed CamNook Auth user. Its authenticated session and admin-only RPC authorization were verified on 2026-08-13; Supabase dashboard access remains a separate management identity.
