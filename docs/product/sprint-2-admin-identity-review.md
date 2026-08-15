# Sprint 2 Admin Identity Review Acceptance

Status: implemented and locally validated with synthetic evidence only on
2026-08-15. The migrations are not applied to Development or Production by this
change, and real-ID collection remains unauthorized.

## Trust boundary

The sole application administrator is the only reviewer. Database authorization
is repeated inside every queue, detail, access, decision, and expiry operation;
the page or Server Action is not treated as authority. Direct administrator
reads from `verification-documents` remain denied. A review access request must
use the fixed `identity_review` purpose and target the latest retained pending
submission. The database appends a path-free audit event before the Server Action
uses the service-role Storage client to create one 60-second signed URL. The
decision carries the opaque reviewed-document ID back to the database, which
locks and requires that exact document to remain current before committing; a
concurrent renter replacement therefore cannot turn an unseen image into a
verified decision.

Signed URLs, tokens, private paths, digests, file content, phone numbers, and ID
numbers are excluded from durable audit records, queue payloads, application
logs, and documentation. Bulk access and terminal/superseded evidence access are
not supported.

## Issue acceptance matrix

| Issue | Acceptance evidence |
| --- | --- |
| #27 | A current verified renter can pass the existing atomic booking approval into `CONTRACT_PENDING`; pending, rejected, missing, or Manila-expired verification is blocked. |
| #28 | `authorize_verification_evidence_access` rechecks sole-admin authority, current pending evidence, exact purpose, and retention; audit precedes a 60-second server-issued URL whose access material is not durably stored. |
| #29 | `decide_verification` is the sole atomic decision authority and binds the decision to the exact current document reviewed. Verification requires an allowed ID type and future Manila expiration; rejection accepts only five renter-safe codes; both append immutable decision/audit history. |
| #30 | The account projection shows a safe status, reason, expiry, and next action. Rejected/expired replacements link with `supersedes_id`; earlier record and decision history remain unchanged; only the latest record is eligible. |
| #31 | Existing `approve_booking` locks and rechecks latest current verification, active profile, camera publication/current pricing, accessory membership, availability, and active contract template before atomically creating the block, immutable contract version, snapshots, and `CONTRACT_PENDING` state without resetting the deadline. |
| #32 | The admin queue includes only latest pending records with current retained evidence, orders oldest first, exposes age, and omits paths, tokens, digests, phone, user UUID, and unrelated identity data. |
| #33 | Expiry compares document date with the Asia/Manila business date, updates only the current projection status, appends history/audit, is idempotent, and is enforced again by booking approval and pickup. |
| #34 | Evidence authorization, verification, rejection, and expiry append actor/action/purpose/outcome/time audit facts; verification decision history and audit tables reject update/delete; sensitive access material is excluded. |
| #35 | Booking rejection accepts only a current `FOR_REVIEW` booking, appends state/audit history, releases any defensive pre-existing booking hold, and rejects stale repeat decisions. |

## Local verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
`pnpm db:test:concurrency`. The disposable PostgreSQL harness applies every
migration, runs domain, pricing/approval, evidence-lifecycle, and Sprint 2
identity-review invariants, then runs real two-session approval and membership
races. The Sprint 2 SQL fixture uses synthetic UUIDs and metadata only.

## Remaining release gates

This implementation does not approve policy activation. Before real IDs or a
Production rollout, complete the v2 controller/DPO, lawful-basis, processor and
location, backup/retention, rights, incident, strong reviewer authentication,
escalation/appeal, PIA/ROPA/PMP, registration, protected-Preview, advisor, and
written Philippine privacy-counsel gates. Hosted migration and deployment need
separate explicit authorization.
