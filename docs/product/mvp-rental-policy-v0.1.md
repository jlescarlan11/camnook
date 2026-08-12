# CamNook MVP Rental Policy v0.1

Status: approved for architecture<br>
Authority: product handoff supplied on 2026-08-12<br>
Applies to: the first CamNook web application milestone

This document is the authoritative product policy for the MVP. Architecture and implementation documents must cite these requirement IDs. A later policy may supersede this file, but edits must not silently change already-approved behavior.

## Product boundary

- **SCOPE-01 — Single lender.** The business owner is the only lender and the only administrator. The database must support exactly one admin for MVP.
- **SCOPE-02 — Multiple renters.** Customers are renters; there is no lender role or lender onboarding.
- **SCOPE-03 — Serialized inventory.** One camera listing represents one physical, serialized camera.
- **SCOPE-04 — Fixed inclusions.** Accessories belong to a camera as fixed inclusions and are not independently rentable.
- **SCOPE-05 — Pickup and return only.** Delivery is excluded.
- **SCOPE-06 — Public discovery.** Guests may browse published cameras, public listing images, and sanitized availability.
- **SCOPE-07 — Authenticated booking.** Authentication is required to request or manage a booking.
- **SCOPE-08 — Manual money movement.** Payments and refunds occur manually through GCash. The application records financial activity but never moves money.
- **SCOPE-09 — Not a marketplace.** The system has no multi-lender, escrow, wallet, payout, or lender-settlement model.

## Explicit exclusions

The MVP does not include multiple lenders, lender onboarding or payouts, escrow or custodial wallets, payment-gateway or GCash API integration, automated payment confirmation, automated refunds, delivery, chat or realtime messaging, ratings, reviews, promotions, coupons, independently rentable accessories, a native mobile app, or automated damage and penalty calculations.

## Account verification

- **VER-01 — Account level.** Verification belongs to the renter account, not to an individual booking.
- **VER-02 — One document.** MVP collects one valid government-issued ID. Selfies and proof of address are not required by default.
- **VER-03 — Manual decision.** An admin manually assigns `pending`, `verified`, `rejected`, or `expired`. `expired` means the reviewed ID has passed its expiration date.
- **VER-04 — Separate decision and file.** The verification decision and its audit history must survive deletion of the sensitive document.
- **VER-05 — Named renter only.** The renter named on the account and contract must personally collect the camera. The contract is non-transferable; representatives and substitute renters are prohibited.
- **VER-06 — Pickup recheck.** The original ID must be presented and rechecked at every pickup.
- **VER-07 — Public-launch gate.** Public ID collection remains disabled until the privacy notice and document-retention policy are approved.

## Booking states

The authoritative states are:

```text
FOR_REVIEW
CONTRACT_PENDING
TO_PAY
PAYMENT_REVIEW
CONFIRMED
ACTIVE
RETURN_REVIEW
ISSUE_REVIEW
COMPLETED
REJECTED
EXPIRED
CANCELLED
```

The required path is:

```text
FOR_REVIEW
  → CONTRACT_PENDING
  → TO_PAY
  → PAYMENT_REVIEW
  → CONFIRMED
  → ACTIVE
  → RETURN_REVIEW
  → COMPLETED
```

Exception paths include:

```text
FOR_REVIEW → REJECTED
CONTRACT_PENDING / TO_PAY → EXPIRED
eligible pre-pickup states → CANCELLED
RETURN_REVIEW → ISSUE_REVIEW → COMPLETED
```

- **BOOK-01 — No pre-approval hold.** Creating a `FOR_REVIEW` request never blocks a camera.
- **BOOK-02 — Atomic approval.** `FOR_REVIEW → CONTRACT_PENDING` is one transaction that rechecks availability and creates a 24-hour hold.
- **BOOK-03 — Controlled transitions.** Clients may not directly overwrite booking state. Every transition is an authorized database operation and creates append-only history.
- **BOOK-04 — Cancellation request.** A renter may request cancellation. The resulting transition must still use the controlled cancellation operation.
- **BOOK-05 — Archive, not delete.** A camera with booking history cannot be hard-deleted.

## Approval and payment deadline

- **DEADLINE-01 — One clock.** The deadline is exactly 24 hours from lender approval.
- **DEADLINE-02 — No reset.** Signing, resubmitting, editing, or admin review never silently resets or extends the deadline.
- **DEADLINE-03 — Timely submission preserves hold.** A payment submitted before the deadline preserves the reservation in `PAYMENT_REVIEW` until an admin decides it.
- **DEADLINE-04 — No review timeout.** `PAYMENT_REVIEW` does not automatically expire. Admin review has a 12-hour operational target, not an automatic state deadline.
- **DEADLINE-05 — Rejected payment.** A rejected payment returns to `TO_PAY` only while the original deadline remains open. If rejection occurs after that deadline, the reservation expires and its block is released.

## Availability

- **AVAIL-01 — Blocking states.** Booking blocks are active in `CONTRACT_PENDING`, `TO_PAY`, `PAYMENT_REVIEW`, `CONFIRMED`, `ACTIVE`, `RETURN_REVIEW`, and `ISSUE_REVIEW`.
- **AVAIL-02 — Non-blocking states.** `FOR_REVIEW`, `REJECTED`, `EXPIRED`, `CANCELLED`, and `COMPLETED` do not retain an active booking block.
- **AVAIL-03 — Maintenance.** Maintenance and manual unavailability periods block the same physical camera.
- **AVAIL-04 — Database enforcement.** Overlapping active blocks for a camera are prohibited by the database, not merely by an application query.
- **AVAIL-05 — Half-open ranges.** Architecture uses `[pickup, return)` time ranges so one rental may begin exactly when another ends. Any turnaround buffer must be represented explicitly if later approved.
- **AVAIL-06 — Privacy.** Public availability reveals only busy/unavailable ranges, never renter, booking, verification, or payment data.

## Contracts

- **CONTRACT-01 — Immutable version.** Approval creates an immutable contract version.
- **CONTRACT-02 — Required snapshots.** Each version snapshots renter legal identity; camera name and serial number; included accessories; pickup and return schedule; daily rate; rental amount; security deposit; total due; intended use and expected location; pickup, return, cancellation, late-return, damage, loss, and non-transferability terms; and the template version.
- **CONTRACT-03 — Signature.** The named renter electronically signs only the current version.
- **CONTRACT-04 — Material changes.** Changes to camera, dates, inclusions, price, deposit, or terms supersede the current version, create a new immutable version, require a new signature, and preserve all earlier versions and signatures.
- **CONTRACT-05 — Legal-launch gate.** Final production contract wording requires legal review before public paid rentals.

## Manual GCash and accounting

- **PAY-01 — Instructions.** The renter sees rental fee, security deposit, total due, GCash recipient, and the unchanged approval deadline.
- **PAY-02 — Submission.** A renter submits sender name, amount, GCash reference number, optional screenshot, and submission timestamp.
- **PAY-03 — External verification.** The admin verifies the transaction in the actual GCash account. A screenshot is evidence, never proof of payment by itself.
- **PAY-04 — Transaction plus allocations.** A combined incoming transfer is one payment transaction allocated between rental payment and security-deposit liability. It is not modeled as two unrelated transfers.
- **PAY-05 — Balanced allocations.** Allocation totals must equal the verified transaction amount.
- **PAY-06 — Deposits are liabilities.** Security deposits are excluded from rental revenue and tracked separately.
- **PAY-07 — Manual refunds.** Refunds occur outside the application. The system records an outgoing GCash reference and any manual deductions or issue-review decision.
- **PAY-08 — Immutable finance.** Verified financial records are never rewritten. Corrections use reversals, superseding records, or new explicit audit events.
- **PAY-09 — No automated deductions.** Damage, loss, penalty, deduction, and exceptional amounts are manually decided and recorded.

## Pickup and return

- **HANDOFF-01 — Pickup checklist.** Before `ACTIVE`, the admin records named-renter presence, original-ID check and match, camera serial confirmation, included-accessory confirmation, and a condition report. Condition photos are optional.
- **HANDOFF-02 — Return checklist.** Return records actual return time, camera condition, accessory checklist, missing-item and damage indicators, notes, and evidence where required.
- **HANDOFF-03 — Clear return.** A clear inspection transitions `RETURN_REVIEW → COMPLETED`.
- **HANDOFF-04 — Issue return.** A problem transitions `RETURN_REVIEW → ISSUE_REVIEW → COMPLETED`; financial decisions remain manual.

## Roles and authorization

- **AUTH-01 — Anonymous.** Anonymous users may read only published camera data, public listing images, and sanitized busy ranges.
- **AUTH-02 — Renter ownership.** Renters may access only their own profile, verification data and document metadata, bookings, timeline, current contract, signatures, payment submissions, handoffs, and deposit status.
- **AUTH-03 — No renter authority escalation.** Renters cannot choose another renter, set authoritative price, approve verification or bookings, create or release holds, verify payments, change booking states directly, or edit signed contracts.
- **AUTH-04 — Admin operations.** The sole admin may perform operational actions but cannot rewrite state history, signatures, immutable contracts, verified payments, or historical booking and financial records.
- **AUTH-05 — Correction model.** Corrections use reversals, superseding versions, new records, or explicit audit events.

## Files, privacy, and retention

- **FILE-01 — Public media.** Published camera listing images may be public.
- **FILE-02 — Private evidence.** Government IDs, contracts, payment proofs, handoff photos, condition photos, and issue evidence are private.
- **FILE-03 — No permanent public URLs.** Private files are accessed only after authorization through short-lived authenticated or signed access.
- **FILE-04 — Opaque paths.** Object paths contain no names, emails, phone numbers, ID numbers, or GCash references.
- **FILE-05 — No overwrite.** Submitted evidence is not overwritten. Corrections create a new object and metadata version.
- **FILE-06 — Audit.** Sensitive admin access is audited.
- **FILE-07 — Lifecycle metadata.** Files record retention, deletion request, deletion completion, and verified-deletion metadata.
- **FILE-08 — Owner isolation.** Renters access only objects tied to their own records.

## Dashboard accounting rules

The admin dashboard must surface work queues for review, signature, payment, pickup, active rental, return, issue review, held deposits, and pending refunds. It must calculate verified rental revenue, utilization, revenue per camera, and acquisition-cost recovery per camera. Security deposits are never included in rental revenue.

## Accepted assumptions

1. One daily rate exists per camera; the billable-day formula is not yet approved.
2. Penalties, deductions, and exceptional amounts are manual.
3. The approval deadline is one continuous 24-hour period.
4. One government ID is sufficient for MVP.
5. The named renter personally collects the camera.
6. Refunds happen outside the application.
7. Retention policy, final legal wording, and launch readiness will be completed before public paid operation.
8. Exactly one admin exists for MVP.

## Readiness boundary

Ready for design and later implementation: product architecture, normalized database design, authorization, Storage design, booking-state operations, and overlap prevention.

Not ready for public production use:

- pricing calculation until the billable-day formula is approved;
- public ID collection until the privacy notice and retention policy are approved;
- final contracts until legal wording is approved; and
- paid launch until legal, tax, business-registration, security, and operational readiness are confirmed.
