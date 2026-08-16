# CamNook Open Decisions and Readiness

Status: owner launch policy approved; machine evidence controls Production GO<br>
Last updated: 2026-08-16

## Outcome

No contradiction prevents the proposed database, authorization, Storage, availability, or base booking-state architecture.

The supplied rules are internally compatible after one implied transition is made explicit: when an admin rejects a payment after the original deadline, `PAYMENT_REVIEW → EXPIRED` is required because returning to `TO_PAY` is forbidden and deadlines cannot reset. This interpretation is documented for approval; it does not require reopening the deadline policy.

## Confirmed requirements

These are approved and are not open discovery questions:

- one lender/admin, many renters, no marketplace roles;
- one serialized camera per listing and fixed included accessories;
- public discovery, authenticated booking, pickup/return only;
- manual GCash movement with application-side records only;
- no online KYC; the named renter presents one original current government ID at pickup;
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
3. One original current government ID shown in person is sufficient for MVP;
   CamNook retains no copy, number, type, address, birth date, or expiry.
4. Refunds happen outside the application.
5. Exactly one admin is bootstrapped and protected by database authorization.
6. The renter named on the account and contract personally collects the camera.
7. PostgreSQL time ranges are half-open `[pickup, return)`; any future turnaround buffer is an explicit separate block/rule.
8. A renter may submit and receive approval without online identity evidence.
   Equipment release requires the named renter and physical ID match at pickup.

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

### OD-05 — Owner portfolio reporting basis

Owner: product/business with accounting review<br>
Status: approved for the MVP owner report on 2026-08-16<br>
Unblocks: Sprint 7 issues #78–#86

- Reporting dates are Manila calendar dates and form a half-open interval:
  start midnight included, end midnight excluded.
- Period revenue is the signed sum of verified `rental_payment` allocations by
  immutable payment decision time. Incoming is positive and outgoing is
  negative. Deposits, deductions, refunds, liabilities, and unverified
  transactions are excluded.
- Per-camera revenue is attributed through the immutable booking camera and
  must sum to the portfolio total for the same period.
- Rental utilization unions scheduled `[pickup_at, return_at)` intervals for
  `CONFIRMED`, `ACTIVE`, `RETURN_REVIEW`, `ISSUE_REVIEW`, and `COMPLETED`
  bookings after intersecting them with the report and camera inventory windows.
  Each camera denominator is its inventory overlap from `created_at` to
  `archived_at`; maintenance and manual blocks are reported separately.
- Acquisition recovery uses lifetime net verified rental revenue. Null or zero
  acquisition cost is unavailable. Recovered amount and percentage are capped
  at cost/100%; remaining cost cannot be negative.
- These are owner-only operational projections, not public catalog fields and
  not general-ledger or tax statements. Changing recognition or utilization
  policy requires a reviewed forward migration and matching historical tests.

## Decisions required before implementation of affected behavior

### OD-04 — Minimized in-person identity policy

Owner: product/business<br>
Status: approved for Production on 2026-08-16<br>
Unblocks: booking approval and physical equipment release without online KYC

Online government-ID upload and review are retired. Policy
`government-id-evidence-v2` remains disabled, the renter and owner surfaces no
longer expose it, and booking approval does not require a verification record.
At pickup, the named contract renter presents one original current government
ID. The administrator visually checks name and photo and records only three
facts: the named renter was present, the original ID was checked, and it
matched. No copy or ID fields are retained.

The owner selected this less-intrusive control under the Data Privacy Act of
2012 (Republic Act No. 10173) principles of transparency, legitimate purpose,
and proportionality. The purpose is contract performance, preventing release
to the wrong person, and protecting the renter and equipment. The owner accepts
the operating policy without representing that outside Philippine counsel
reviewed it.

### OD-02 — Post-payment material amendments

Owner: product/business, with legal/accounting review<br>
Blocks: changing camera, dates, inclusions, price, deposit, or terms after `PAYMENT_REVIEW`

Policy requires a new immutable contract and signature but does not define payment reconciliation or backward state transitions after money is submitted/verified.

Recommended MVP decision: prohibit such amendments; cancel with recorded refund liability and create a new booking. This preserves the simple state machine and financial audit trail. An explicit adjustment/reconciliation workflow can be designed later if the business rejects that rule.

### OD-03 — Cancellation and refund terms

Owner: product/business with legal review<br>
Blocks: renter-facing cancellation copy, fee/refund decisions, production contract clause

Sprint 6 implements owner-only requests, explicit admin decisions, unpaid-state
acceptance with zero fee/refund liability, safe declines, and manual external
refund/reversal recording. Paid/submitted-state acceptance remains disabled.
Still define notice periods, whether any rental fee may be retained, refund
liability outside the verified security deposit, and who may accept each paid
pre-pickup state. No automatic fee logic is assumed; enabling those paths needs
reviewed contract/renter copy and a forward migration.

## Configuration inputs still required before public paid launch

These are not architecture questions, but implementation cannot finish without them:

- approved GCash recipient display name/number (the safe location is the
  disabled-by-default private versioned database configuration);
- application origins and Supabase Auth redirect URLs for local, preview, and production;
- allowed file types and maximum sizes for buckets other than the approved government-ID v1 policy; and
- whether Supabase Cron is enabled for the idempotent expiration/retention functions.

The live Production project remains Supabase `CamNook`
(`iegcixcevvkryfwfotqz`) at [camnook.shop](https://camnook.shop). The separate
Supabase `CamNook Development` project (`ekmoiepalelqpmemvrkl`, Tokyo /
`ap-northeast-1`) is the current target for migration and Preview verification;
ignored local CLI metadata points to Development, not Production. Production
received the four booking-milestone migrations on 13 August 2026 through a
separately authorized, database-first rollout after Development/Preview
verification, leaving both projects at 11/11 at that checkpoint. On 14 August
2026, the two catalog migrations were applied and exercised in Development. On
15 August 2026, those catalog migrations were separately applied and exercised
in Production, while the Sprint 1 evidence migration was applied to Development
with its policy disabled and verified with hosted fail-closed and cross-owner
Storage RLS checks. Development was recorded at 14/21 and Production at 13/21
at that checkpoint. Successful `main` CI and the automatic Development rollout
brought Development to 21/21 on 16 August 2026. An authorized Production run
then applied and verified the same 21 migrations. The repository now contains
22 migrations; the in-person identity replacement is the pending release
candidate migration. Current
remote history must still be checked by the rollout workflow. A reviewed merge
to `main` authorizes the same revision's forward schema migrations after CI and
Development hosted verification succeed; runtime policy activation, hosted
configuration, data mutation, and application deployment remain separate
controls.

Vercel Preview has two app-owned, Preview-scoped Supabase records for the
Development project: browser-visible `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Vercel platform-provided variables are
separate, and Production retains separate Production application records.
Sprint 1 evidence rollout additionally requires server-only
`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` records in the target environment;
separate values are configured in Vercel for Development/Preview and Production.
They are not GitHub Actions secrets and never use a `NEXT_PUBLIC_` prefix.
Missing values fail evidence mutations and cleanup closed.
Preview Deployment Protection remains enabled. Hosted Development supports
public email-OTP account creation with Cloudflare Turnstile, a six-digit code,
a 15-minute expiry, and proven custom SMTP after the completed protected-Preview
activation. The Development email-send ceiling remains four per hour for manual
QA. Production signup, Managed Turnstile, email confirmation, and the code
template were separately activated and validated on 15 August 2026. A
2026-08-16 read-only audit found custom SMTP disabled, the Production email-send
ceiling at four per hour, and leaked-password protection disabled. The release
workflow configures free Resend SMTP without exposing its credential. CamNook
uses passwordless email OTP, so paid leaked-password screening is not applicable;
the hosted minimum password length is set to 15 as defense in depth. The local
`supabase/config.toml` intentionally differs and must not be pushed to hosted
Auth. Public registration creates only ordinary renter identities;
`private.admin_accounts` remains the sole admin authority. The remaining
public-paid-launch gates below remain fail-closed.

The durable activation, validation, cleanup, and rollback sequence is recorded
in [`docs/operations/public-renter-registration.md`](operations/public-renter-registration.md).

## Public-launch blockers

### LB-01 — Privacy and retention

Resolved by OD-04 on 2026-08-16: no online ID collection is activated. The
physical check retains only minimal yes/no handoff attestations.

### LB-02 — Contract legal review

Owner-approved for the MVP launch on 2026-08-16. Paid-state cancellation still
fails closed until its separate fee/refund terms are approved and implemented.

### LB-03 — Legal, tax, and business readiness

Owner confirmed the MVP business, privacy, recordkeeping, and operational posture
on 2026-08-16 and accepts responsibility for applicable registration, tax,
receipt, and consumer obligations. This is not outside accounting/legal advice.

### LB-04 — Security verification

Required CI, RLS, cross-account, Storage, concurrency, immutable-history, advisor,
secret-handling, and forward-recovery checks remain machine release gates.

### LB-05 — Operations

The sole owner/admin accepts coverage for payment review, pickup/return,
reconciliation, refund tracking, and incident response for the MVP launch.

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
- private Storage uses upload intents, exact-path RLS, and no overwrite; online
  government-ID collection stays disabled and physical pickup stores no ID copy; and
- architecture approval is recorded before the application scaffold or migrations are applied.

## Implementation status after approval

1. The Next.js/Supabase workspace and current booking-request/admin-review UI
   are implemented; later paid-rental stages remain gated.
2. Ignored local CLI metadata links routine hosted work only to the separate
   Development project. Production remains live, isolated, and unlinked.
3. Twenty-two forward migration files translate the approved architecture.
   Production received the four booking-milestone migrations on 13 August 2026
   through a separately authorized database-first rollout. Both projects were
   at 11/11 immediately afterward. The catalog-photo publication and
   unpublished-availability migrations were applied and exercised in
   Development on 14 August 2026 and separately applied to Production with the
   approved catalog on 15 August 2026. The Sprint 1 evidence migration followed
   in Development with its policy disabled, leaving Development recorded at
   14/21 and Production at 13/21. Later successful automatic Development
   rollouts brought Development to 21/21 on 16 August 2026. An authorized
   Production run then applied and verified the same 21 migrations. Migration
   22 replaces online KYC with the in-person pickup control and is applied by
   the automatic release chain after merge. Current remote history remains
   operational state for each workflow to verify.
4. The approved OD-01 pricing transaction is implemented by
   [GitHub issue #1](https://github.com/jlescarlan11/camnook/issues/1).
5. RLS, concurrency, immutability, Storage, advisor, and application
   verification remain release checks.
6. Generated TypeScript database types and Supabase clients preserve the
   repository's explicit `public`/`api` contracts.
7. The sole application admin remains a separately confirmed CamNook Auth user;
   Supabase dashboard access remains a separate management identity. No user or
   environment-specific admin UUID belongs in this document.
8. The launch evidence bundle and current computed decision are recorded in
   [`docs/operations/production-launch.md`](operations/production-launch.md).
   A reviewed merge authorizes its forward migration; other Production changes
   use the recorded release authorization.
