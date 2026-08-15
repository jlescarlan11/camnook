# Booking State Machine

Status: approved on 2026-08-12<br>
Policy source: [`docs/product/mvp-rental-policy-v0.1.md`](../product/mvp-rental-policy-v0.1.md)

## Core rule

`bookings.state` is a projection of the latest accepted transition. It is never a renter-editable field and never changes without a matching append-only `booking_state_history` row in the same transaction.

The database operation, not the UI, owns authorization, guard evaluation, concurrency checks, side effects, and history.

## Main flow

```text
FOR_REVIEW
  │ admin approves; verification + availability rechecked
  │ create block, immutable contract v1, and one 24-hour deadline
  ▼
CONTRACT_PENDING
  │ renter signs current contract before the original deadline
  ▼
TO_PAY
  │ renter submits GCash details before the original deadline
  ▼
PAYMENT_REVIEW
  │ admin verifies the actual GCash account and balanced allocations
  ▼
CONFIRMED
  │ admin completes pickup identity, serial, accessory, and condition checks
  ▼
ACTIVE
  │ admin records physical return and return condition
  ▼
RETURN_REVIEW
  ├── clear inspection ────────────────────────────► COMPLETED
  └── issue found ─► ISSUE_REVIEW ─► manual decision ─► COMPLETED
```

## State definitions

| State | Meaning | Availability block |
| --- | --- | --- |
| `FOR_REVIEW` | Authenticated renter requested dates; admin has made no commitment | None |
| `CONTRACT_PENDING` | Admin approved, availability was atomically reserved, current contract awaits signature | Active |
| `TO_PAY` | Current contract is signed; renter may submit payment until the unchanged deadline | Active |
| `PAYMENT_REVIEW` | Timely payment details were submitted; admin review is pending | Active, no automatic expiry |
| `CONFIRMED` | GCash transfer was verified and correctly allocated; pickup is pending | Active |
| `ACTIVE` | Pickup checks passed and the camera is with the named renter | Active |
| `RETURN_REVIEW` | Camera was physically returned; inspection/deposit disposition is pending | Active until completion decision |
| `ISSUE_REVIEW` | A return issue requires a manual operational/financial decision | Active until completion decision |
| `COMPLETED` | Rental lifecycle is complete; deposit refund recording may still remain operationally pending | Released |
| `REJECTED` | Admin rejected the unapproved request | None |
| `EXPIRED` | The original approval deadline elapsed without a preserved valid submission | Released |
| `CANCELLED` | An eligible pre-pickup booking was cancelled and recorded | Released |

## Permitted transitions

| From | To | Actor | Required guards | Atomic effects |
| --- | --- | --- | --- | --- |
| `FOR_REVIEW` | `CONTRACT_PENDING` | Admin | Camera published/operable; renter account active; current verification is `verified`; pricing inputs available; no overlapping active block | Lock aggregate; calculate authoritative snapshots; insert exclusion-protected block; set `approved_at` and deadline once; issue contract v1; append history/audit |
| `FOR_REVIEW` | `REJECTED` | Admin | Request still pending | Record reason; append history/audit; no block operation |
| `FOR_REVIEW` | `CANCELLED` | Renter or admin | Booking belongs to renter; not already being decided | Record/resolve cancellation request; append history; no block operation |
| `CONTRACT_PENDING` | `TO_PAY` | Renter | Current version; correct renter; valid signature; `now() < approval_deadline_at` | Append immutable signature and transition history; deadline unchanged |
| `CONTRACT_PENDING` | `EXPIRED` | System/admin | `now() >= approval_deadline_at`; no timely submitted payment | Release block; append system history/audit |
| `CONTRACT_PENDING` | `CANCELLED` | Renter or admin | Eligible pre-pickup cancellation | Release block; resolve request; append history |
| `TO_PAY` | `PAYMENT_REVIEW` | Renter | Current renter; `now() < approval_deadline_at`; current signed contract, configured recipient, and required GCash fields valid | Insert one immutable submitted transaction; append history; deadline/block unchanged; optional proof may finalize separately |
| `TO_PAY` | `EXPIRED` | System/admin | `now() >= approval_deadline_at`; no timely submitted payment | Release block; append history |
| `TO_PAY` | `CONTRACT_PENDING` | Admin | A permitted material pre-payment amendment creates a new contract version; deadline still open | Recheck date overlap if needed; supersede/issue; require new signature; deadline unchanged |
| `TO_PAY` | `CANCELLED` | Renter or admin | Eligible pre-pickup cancellation | Release block; append history |
| `PAYMENT_REVIEW` | `CONFIRMED` | Admin | Transaction found in actual GCash account; exact amount matched; normalized reference unique; authoritative allocations balanced | Under the booking lock mark transaction verified, derive/freeze two allocations, and append history/audit; deadline/block unchanged |
| `PAYMENT_REVIEW` | `TO_PAY` | Admin | Submission rejected and `now() < approval_deadline_at` | Mark submitted transaction rejected; append reason/history; deadline unchanged |
| `PAYMENT_REVIEW` | `EXPIRED` | Admin | Submission rejected and `now() >= approval_deadline_at` | Mark rejected; release block; append history/audit |
| `PAYMENT_REVIEW` | `CANCELLED` | Admin | Exceptional cancellation is authorized and financial follow-up is recorded | Release block; append history; preserve submitted transaction |
| `CONFIRMED` | `ACTIVE` | Admin | Named renter present; original ID checked and matches verified account/contract; camera serial and inclusions checked; pickup condition report complete | Insert pickup handoff/report; append history/audit |
| `CONFIRMED` | `CANCELLED` | Admin | Pre-pickup cancellation; any verified incoming funds and refund liability remain recorded | Release block; create refund work item/settlement as applicable; append history |
| `ACTIVE` | `RETURN_REVIEW` | Admin | Physical return recorded with actual time, checklist, condition, damage/missing indicators, and required evidence | Insert return handoff/report; append history |
| `RETURN_REVIEW` | `COMPLETED` | Admin | Clear inspection; deposit settlement is at least recorded as pending/final | Release block; append history; financial refund may remain pending outside booking state |
| `RETURN_REVIEW` | `ISSUE_REVIEW` | Admin | Issue flag/reason and evidence requirements recorded | Retain block; append history/audit |
| `ISSUE_REVIEW` | `COMPLETED` | Admin | Manual issue decision and deposit disposition recorded | Release block; append history/audit |

No other transition is permitted.

## Deadline behavior

`approval_deadline_at` is written only by `approve_booking()` as `approved_at + 24 hours`. An immutability trigger rejects later changes.

- Signing at hour 20 leaves four hours to submit payment.
- Contract supersession does not reset or extend the deadline.
- A payment submission transaction evaluates the database clock and changes the booking to `PAYMENT_REVIEW` in the same commit.
- Once in `PAYMENT_REVIEW`, the expiration worker skips the booking even if the deadline passes.
- Payment rejection before the deadline returns to `TO_PAY` with the remaining original time.
- Payment rejection after the deadline transitions directly from `PAYMENT_REVIEW` to `EXPIRED` and releases the block.

The last item is the deterministic interpretation of `DEADLINE-05`. Although the shorthand exception list names expiry from `CONTRACT_PENDING` and `TO_PAY`, no other state can satisfy the rule that a late-rejected payment must not return to `TO_PAY`; direct `PAYMENT_REVIEW → EXPIRED` closes that implied path without resetting the clock.

## Availability and races

Approval never relies on a prior calendar read. The transaction:

1. locks the booking row and confirms `FOR_REVIEW`;
2. validates camera and renter/verification state;
3. reads current authoritative camera/pricing inputs;
4. creates contract and deadline data;
5. inserts the active `[pickup_at, return_at)` block; and
6. transitions and appends history.

The GiST exclusion constraint is decisive. If another transaction committed an overlapping block, the insert fails and every approval effect rolls back. The admin receives an availability-conflict result and the booking remains `FOR_REVIEW`.

Maintenance/manual blocks use the same constraint and cannot be created over an active booking. A deliberate operational override requires cancelling or rescheduling the conflicting booking through its audited operation; constraints are not disabled.

## Cancellation model

Renters request cancellation; they do not issue arbitrary state updates. A controlled operation may immediately accept an eligible renter-owned request or leave it pending for admin decision, depending on the later approved cancellation terms.

MVP cancellation eligibility is pre-pickup only:

- `FOR_REVIEW`, `CONTRACT_PENDING`, and `TO_PAY`: renter or admin operation;
- `PAYMENT_REVIEW`: admin operation because submitted money must be reviewed/preserved;
- `CONFIRMED`: admin operation because verified funds create a refund liability;
- `ACTIVE`, `RETURN_REVIEW`, and `ISSUE_REVIEW`: never cancelled; finish the return/issue path instead.

Cancellation never deletes payment, signature, contract, or history rows. It releases only the active availability block and creates any required refund/deposit work record.

## Contract amendments

Before payment submission, a material change may supersede the current contract and return `TO_PAY → CONTRACT_PENDING`, provided the original deadline remains open. Date/camera changes atomically recheck and replace the availability block; price and deposit snapshots come from authoritative inputs. Earlier versions and signatures remain.

Once a booking reaches `PAYMENT_REVIEW` or `CONFIRMED`, a material amendment may change the amount already submitted or verified. The current policy requires supersession and a new signature but does not define financial reconciliation or backward transitions for that case. Until approved, the safe MVP rule is:

- do not amend after payment submission;
- reject/cancel and create a new booking where operationally possible; and
- preserve the original financial/contract history.

This is an implementation blocker for post-submission amendments, not for the base lifecycle.

## Pickup and return guards

`complete_pickup()` refuses the transition unless every `HANDOFF-01` boolean is true and the condition report exists. The verified account identity, current contract renter, and authenticated booking renter must be the same UUID. A stale/expired verification blocks release until the admin completes an allowed verification operation.

`record_return()` captures the physical event before inspection outcome. `RETURN_REVIEW` and `ISSUE_REVIEW` remain blocking states per policy. Completing the booking and recording the external deposit refund are separate facts: a clear rental may become `COMPLETED` while a recorded deposit settlement remains `pending_refund`, keeping the admin dashboard queue accurate.

## History requirements

Every accepted transition records:

- booking ID and from/to states;
- actor UUID and actor type;
- operation/correlation UUID;
- database timestamp;
- stable reason code plus optional human note;
- references to the new block, contract version, payment, handoff, or settlement where relevant; and
- enough non-sensitive metadata to explain the decision without copying ID images, full GCash references, or signed URLs.

Rejected transition attempts that matter for security or operations are written to `private.audit_logs`, not to booking history because state did not change.

## Expiration execution

`expire_due_bookings(operation_id)` is idempotent and processes rows with `FOR UPDATE SKIP LOCKED`. It may transition only `CONTRACT_PENDING` and `TO_PAY` where the deadline has passed. It never expires `PAYMENT_REVIEW`.

Supabase Cron runs it every minute when `pg_cron` is available. The protected daily Vercel route is a recovery invocation for the linked Hobby project. Signing and payment still compare the database clock directly with the original deadline, so a delayed scheduled run cannot accept a late action.

## Pure domain tests

Vitest covers the transition table and deadline decisions with a fixed clock. PostgreSQL integration tests cover transaction locks, exclusion races, RLS, triggers, and effects. Required cases include:

- signing at 20 hours does not extend the deadline;
- payment at `deadline - 1 ms` enters review and survives expiration;
- payment at or after the deadline is rejected;
- payment rejection on each side of the deadline chooses `TO_PAY` vs `EXPIRED`;
- two overlapping approvals yield one winner;
- terminal transitions release blocks;
- amendments preserve the original deadline and prior signatures;
- pickup fails for any missing identity/serial/accessory/condition check; and
- deposit refund status never changes verified rental revenue.
