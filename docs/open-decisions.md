# CamNook Open Decisions and Readiness

Status: architecture approved; public-paid-launch gates remain closed<br>
Last updated: 2026-08-15

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

### OD-04 — Government-ID evidence policy

Owner: product/business, with Philippine legal/privacy review before Production<br>
Status: approved for implementation on 2026-08-15<br>
Unblocks: Sprint 1 issues #13–#21 in Local and Development

Policy `government-id-evidence-v1` accepts one Philippine passport, PhilSys
ID/ePhilID, driver’s license, or UMID as JPEG, PNG, or PDF up to 5 MiB. Upload
intents last 15 minutes. Each finalized object has 30-day live retention;
renter deletion requests are scheduled until due, and a documented legal hold
blocks removal. Sprint 1 grants only the owning renter raw-byte access. It stores
no full ID number or OCR output and creates no permanent/signed URL.

Notice `government-id-privacy-v1` is approved for implementation and must be
shown before upload. Production collection remains closed until CamNook has a
monitored privacy/DPO contact, final Philippine legal review, Development RLS
and advisor evidence, and protected-Preview browser evidence. That release gate
does not prevent synthetic Local/Development validation.

### OD-02 — Post-payment material amendments

Owner: product/business, with legal/accounting review<br>
Blocks: changing camera, dates, inclusions, price, deposit, or terms after `PAYMENT_REVIEW`

Policy requires a new immutable contract and signature but does not define payment reconciliation or backward state transitions after money is submitted/verified.

Recommended MVP decision: prohibit such amendments; cancel with recorded refund liability and create a new booking. This preserves the simple state machine and financial audit trail. An explicit adjustment/reconciliation workflow can be designed later if the business rejects that rule.

### OD-03 — Cancellation and refund terms

Owner: product/business with legal review<br>
Blocks: renter-facing cancellation copy, fee/refund decisions, production contract clause

The architecture already records cancellation requests, admin decisions, blocks, transactions, and refunds. Still define notice periods, whether any rental fee may be retained, and who can accept a renter request in each pre-pickup state. No automatic fee logic is assumed.

## Configuration inputs still required before public paid launch

These are not architecture questions, but implementation cannot finish without them:

- approved GCash recipient display name/number and safe configuration location;
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
2026, the two catalog migrations were applied and exercised only in Development.
On 15 August 2026, the Sprint 1 evidence migration was applied to Development
with its policy disabled and verified with hosted fail-closed and cross-owner
Storage RLS checks. Development is recorded at 14/14 while Production remains
at 11/14. Current remote history must still be checked at rollout time.
Production is not a rollout target without separate explicit authorization.

Vercel Preview has two app-owned, Preview-scoped Supabase records for the
Development project: browser-visible `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Vercel platform-provided variables are
separate, and Production retains separate Production application records.
Sprint 1 evidence rollout additionally requires server-only
`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` records in the target environment;
separate values are configured in Vercel for Development/Preview and Production.
They are not GitHub Actions secrets and never use a `NEXT_PUBLIC_` prefix.
Missing values fail evidence mutations and cleanup closed.
Preview Deployment Protection remains enabled. Hosted Development now supports
public email-OTP account creation with Cloudflare Turnstile, a six-digit code,
a 15-minute expiry, and proven custom SMTP after the completed protected-Preview
activation. The Development email-send ceiling remains four per hour for manual
QA. The local `supabase/config.toml` intentionally differs and must not be pushed
to hosted Auth. Production signup and CAPTCHA remain disabled and its email
template still uses a confirmation link; changing those settings requires a
separate explicit release approval. Public registration creates only ordinary
renter identities; `private.admin_accounts` remains the sole admin authority.
The public-launch gates below remain fail-closed.

The durable activation, validation, cleanup, and rollback sequence is recorded
in [`docs/operations/public-renter-registration.md`](operations/public-renter-registration.md).

## Public-launch blockers

### LB-01 — Privacy and retention

Policy `government-id-evidence-v1` and notice `government-id-privacy-v1` approve
the 30-day live-object schedule, metadata/decision preservation, legal holds, and
verified deletion for implementation. Production collection stays disabled
until the monitored privacy/DPO contact, final Philippine legal review (including
lawful basis and backup treatment), Development evidence, and protected-Preview
smoke gates in OD-04 are complete.

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
- private Storage uses upload intents, exact-path RLS, and no overwrite; government-ID v1 is owner-only, while any future admin/signed-URL access requires a separate audited design; and
- architecture approval is recorded before the application scaffold or migrations are applied.

## Implementation status after approval

1. The Next.js/Supabase workspace and current booking-request/admin-review UI
   are implemented; later paid-rental stages remain gated.
2. Ignored local CLI metadata links routine hosted work only to the separate
   Development project. Production remains live, isolated, and unlinked.
3. Fourteen forward migration files translate the approved architecture.
   Production received the four booking-milestone migrations on 13 August 2026
   through a separately authorized database-first rollout. Both projects were
   at 11/11 immediately afterward. The catalog-photo publication and
   unpublished-availability migrations were then applied and exercised only in
   Development on 14 August 2026. The Sprint 1 evidence migration followed in
   Development on 15 August 2026 with its policy disabled, leaving Development
   recorded at 14/14 and Production at 11/14. Current remote history remains
   operational state to verify, not a durable documentation assumption.
4. The approved OD-01 pricing transaction is implemented by
   [GitHub issue #1](https://github.com/jlescarlan11/camnook/issues/1).
5. RLS, concurrency, immutability, Storage, advisor, and application
   verification remain release checks.
6. Generated TypeScript database types and Supabase clients preserve the
   repository's explicit `public`/`api` contracts.
7. The sole application admin remains a separately confirmed CamNook Auth user;
   Supabase dashboard access remains a separate management identity. No user or
   environment-specific admin UUID belongs in this document.
