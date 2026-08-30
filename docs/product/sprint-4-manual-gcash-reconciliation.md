# Sprint 4 Manual GCash Reconciliation Acceptance

Status: implemented and locally validated with synthetic records on 2026-08-16.
This change does not apply a hosted migration, configure a real GCash recipient,
deploy the application, or authorize public paid rentals.

## Root cause and trust boundary

The repository had placeholder payment tables and broad RPCs, but it did not
have a safe reconciliation lifecycle. The browser could supply allocation
amounts, payment records exposed private facts too broadly, proof metadata was
trusted before stored bytes were verified, recipient configuration and current
signed-contract checks were absent, rejection accepted free-form text, and
submission/decision races did not have one database-owned outcome.

The database is now the financial and state authority. Owner and admin pages
parse narrow projections, while every mutation re-authenticates the actor and
locks the booking aggregate. The browser supplies only declared transfer facts
or an approved rejection code; it never chooses authoritative prices,
allocations, actors, decision times, deadlines, recipient snapshots, or booking
states. GCash remains an external manual rail: CamNook records and reconciles
money but never moves it.

All issues are classified **HIGH** because they affect authorization, financial
facts, private evidence, durable state, append-only history, and concurrent
transactions. Every row is `SATISFIED` against the integrated implementation.

## Acceptance-criteria matrix

| Criterion | Authoritative source | Required observable, negative, boundary, and persistence behavior | Implementation mapping | Direct validation evidence | Status |
| --- | --- | --- | --- | --- | --- |
| S4-47-1 | #47 body | Show authoritative amounts and approved recipient; accept a timely renter reference with required private proof. | `api.get_my_payment_state`, simplified `api.submit_payment`, proof-intent lifecycle, and renter `PaymentPanel`. | `009_manual_gcash_reconciliation.sql`; payment action/data/component tests. | SATISFIED |
| S4-47-2 | #47 body | Sole admin must reconcile against the actual account and create balanced rental-fee/deposit allocations. | `api.verify_payment`, admin detail/control page, and deferred allocation-balance trigger. | SQL exact-match, allocation, accounting, and actual-account-confirmation assertions. | SATISFIED |
| S4-47-3 | #47 exit gate | A database-accepted timely submission survives in `PAYMENT_REVIEW`; only verification confirms; rejection deterministically selects `TO_PAY` or `EXPIRED` without rewriting history. | Booking-first locked submit/verify/reject transactions and unchanged expiry exclusion. | SQL both deadline sides plus real verify/reject session race. | SATISFIED |
| S4-48-1 | #48 AC1 | Only the booking owner can read instructions for a `TO_PAY` booking; anonymous, another renter, and direct-table reads fail closed. | Security-definer owner projection plus revoked payment-table reads. | SQL owner/cross-owner/direct-read cases; data-layer schema tests. | SATISFIED |
| S4-48-2 | #48 AC2 | Rental fee, deposit, and total are taken from immutable booking/current-contract snapshots, never calculated by the browser. | `private.payment_contract_ready` and `get_my_payment_state`; presentation-only client component. | Field-by-field SQL projection and component assertions. | SATISFIED |
| S4-48-3 | #48 AC3 | Show versioned recipient and original deadline; missing/disabled recipient configuration prevents submission without exposing configuration internals. | Disabled-by-default singleton configuration, version snapshots, safe `recipient_unavailable` projection/action error. | SQL disabled/enabled cases and safe-error action test. | SATISFIED |
| S4-49-1 | #49 AC1 | Submission rechecks auth, ownership, `TO_PAY`, current signed contract, required reference/proof, and database time; amount and sender name come from the booking/profile. | `private.submit_payment_from_booking`, `private.submit_payment`, and strict Server Action input schemas. | SQL invalid actor/state/contract/config/deadline checks and action validation tests. | SATISFIED |
| S4-49-2 | #49 AC2 | Strictly before—not at or after—the original deadline, create one immutable incoming transaction and atomically enter `PAYMENT_REVIEW` without deadline/block changes. | Database-clock predicate, transaction snapshot constraints, append-only guard, `transition_booking`. | SQL transaction/state/deadline/block assertions. | SATISFIED |
| S4-49-3 | #49 AC3 | Retries and concurrent identical submissions return an unambiguous result and never create duplicate pending payments. | Client-generated `submission_attempt_id`, unique indexes, booking lock, idempotent result envelope. | SQL retry/second-pending checks and real two-session identical-submission race. | SATISFIED |
| S4-50-1 | #50 AC1 | Show and enforce JPEG/PNG, maximum 5 MiB, in browser, server, and Storage. | Database proof policy, `PaymentPanel` accept/help/size checks, signature validation, exact Storage policy. | SQL media/size/metadata failures; action and component tests. | SATISFIED |
| S4-50-2 | #50 AC2 | Exact owner alone creates/finalizes an opaque no-overwrite upload tied to the submitted transaction; finalization verifies metadata and SHA-256. | Private intent table; `{intent_uuid}/{proof_uuid}.{ext}` path; owner-bound service RPCs; `upsert:false`; server download/hash reconciliation. | SQL owner/path/metadata/digest/finalization assertions. | SATISFIED |
| S4-50-3 | #50 AC3 | Interrupted uploads recover safely; corrections supersede; admin access is purpose-bound, 60 seconds, and audited without leaking paths/tokens. | Idempotent intent/finalize retry, cleanup state machine, immutable supersession, `authorize_payment_proof_access`. | SQL supersession/access audit assertions; interrupted-existing-object action regression test. | SATISFIED |
| S4-51-1 | #51 AC1 | Renter sees only their own safe status, unchanged deadline, proof presence, and approved rejection reason. | Strict `get_my_payment_state` DTO and rejection code labels. | SQL owner isolation/projection and payment state/component tests. | SATISFIED |
| S4-51-2 | #51 AC2 | A timely submitted payment remains `PAYMENT_REVIEW` after the deadline and scheduled expiry never consumes it. | Expiry operation remains limited to `CONTRACT_PENDING`/`TO_PAY`. | SQL moves clock boundary with a historical fixture and proves review/block survival. | SATISFIED |
| S4-51-3 | #51 AC3 | Rejected transaction stays immutable; retry UI appears only for pre-deadline `TO_PAY`, never after expiry. | Transaction decision guard, latest safe projection, state-driven `PaymentPanel`. | SQL mutation failure and both rejection-boundary assertions; component state tests. | SATISFIED |
| S4-52-1 | #52 AC1 | Sole database-backed admin alone sees only current submitted incoming transactions. | `api.get_payment_review_queue` and admin loader authorization. | SQL renter denial/current-only queue assertion; data/action tests. | SATISFIED |
| S4-52-2 | #52 AC2 | Queue contains exact booking context, declared transfer facts, age, deadline, proof flag, and stable oldest-first order for the 12-hour target. | Minimal queue JSON ordered by `submitted_at, id`; admin dashboard queue-age view. | Exact projection/order SQL assertions and data/component tests. | SATISFIED |
| S4-52-3 | #52 AC3 | Queue excludes object paths, signed URLs, digests, and unrelated renter/finance fields. | Explicit JSON construction and strict Zod schema. | SQL forbidden-key scan and strict-schema tests. | SATISFIED |
| S4-53-1 | #53 AC1 | Under booking lock, sole admin rechecks submitted/timely state, actual-account confirmation, exact amount, and normalized reference uniqueness; screenshot alone cannot authorize verification. | `api.verify_payment` and explicit admin checkbox/amount/reference controls. | SQL mismatch/duplicate checks; admin action tests; real verify/reject race. | SATISFIED |
| S4-53-2 | #53 AC2 | Derive exactly two balanced allocations from authoritative rental/deposit snapshots; caller cannot choose allocations. | Database-generated rental and deposit rows plus deferred exact-balance constraint. | SQL two-row/kind/sum/accounting assertions and unbalanced-invariant suite. | SATISFIED |
| S4-53-3 | #53 AC3 | Transaction, allocations, audit, history, and `CONFIRMED` commit atomically; deadline/block unchanged; retry idempotent. | Single locked database function with stable decided result. | SQL full aggregate/idempotency checks and competing-decision race. | SATISFIED |
| S4-54-1 | #54 AC1 | Sole admin rejects only the current submission using one approved renter-safe reason. | Rejection enum/schema and `api.reject_payment` admin/current checks. | SQL authority/reason/current checks and admin action tests. | SATISFIED |
| S4-54-2 | #54 AC2 | Before deadline, reject atomically to `TO_PAY` without resetting the original deadline. | Database-clock rejection branch and append-only decision update. | SQL pre-deadline state/deadline assertion. | SATISFIED |
| S4-54-3 | #54 AC3 | At/after deadline, reject to `EXPIRED` and release the active block; verify/reject/expire/retry races yield one durable outcome. | Booking-first lock order, post-deadline branch, atomic block release, serialization failure for stale competitor. | Historical deadline SQL fixture and real verify-versus-reject two-session race. | SATISFIED |
| S4-55-1 | #55 AC1 | Audit actor, action, transaction, outcome, purpose, operation, and trusted time without full references, paths, signed URLs, or tokens. | `private.write_payment_audit` and minimal admin history projection. | SQL required-field and forbidden-content audit scan; admin data tests. | SATISFIED |
| S4-55-2 | #55 AC2 | Submitted/verified transactions, allocations, proof versions, booking history, and audit are append-only; corrections use reversal/supersession. | Decision-aware transaction guard, allocation/proof guards, existing history/audit guards, successor constraints. | SQL update/delete failures and proof supersession chain; existing domain invariant suite. | SATISFIED |
| S4-55-3 | #55 AC3 | Owner/admin projections remain isolated, normalized duplicate verified references fail closed, and rental revenue excludes deposits. | Revoked broad reads, narrow RPC DTOs, canonical unique index, split accounting RPC. | SQL isolation/duplicate/accounting assertions and strict data tests. | SATISFIED |

No required criterion is `UNVERIFIED`, `PARTIAL`, or `BLOCKED`.

## Validation and review

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The disposable PostgreSQL 17 harness replays every migration and all database
suites, then uses independent sessions for overlapping approvals, contract
races, concurrent payment submission, and competing payment decisions. All
payment fixtures and proof bytes are synthetic.

Security/privacy review covers owner/admin isolation, revoked broad reads,
purpose-bound evidence access, opaque paths, safe errors, secret/path leakage,
and service-role containment. Finance/state review covers immutable facts,
recipient snapshots, strict deadline boundaries, booking-first lock order,
idempotency, normalized reference uniqueness, allocation balance, revenue/deposit
separation, and atomic state/block/history/audit effects.

## Change-set accounting ledger

Every change unit below was inspected with its direct caller/consumer,
persistence/configuration boundary, and regression protection. `HIGH` is used
for the complete issue set even where a documentation file is not independently
dangerous, because it describes or gates the same authorization/finance flow.

| Change unit | Issue provenance and purpose/boundaries inspected | Risk | Review evidence and disposition |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | #47–#55: add the complete payment SQL suite before generated-type/application checks. | HIGH | CI ordering and pinned local target inspected; `REVIEWED_CLEAN`. |
| `README.md` | #47, #55: record 18-migration boundary, races, acceptance/runbook links, and closed rollout gate. | HIGH | Counts/links/environment language scanned repository-wide; `REVIEWED_CLEAN`. |
| `docs/architecture/database-and-authorization.md` | #48–#55: replace placeholder payment operations/permissions with narrow current contracts. | HIGH | Compared with RPC signatures, grants, and projections; `REVIEWED_CLEAN`. |
| `docs/architecture/state-machine.md` | #49, #53: document atomic submit/verify effects and unchanged deadline/block. | HIGH | Compared with transition calls and SQL assertions; `REVIEWED_CLEAN`. |
| `docs/architecture/storage-and-privacy.md` | #50: exact path, owner intent, verified retry, and 60-second admin access. | HIGH | Compared with Storage RLS, service RPCs, and action sequence; `REVIEWED_CLEAN`. |
| `docs/open-decisions.md` | #47, #48: record private recipient configuration and repository-only migration status. | HIGH | Public-launch gates and counts reconciled; `REVIEWED_CLEAN`. |
| `docs/operations/catalog-publication.md` | #47: retain accurate environment migration counts. | HIGH | Historical rollout statement preserved; `REVIEWED_CLEAN`. |
| `docs/operations/government-id-evidence.md` | #47: retain accurate repository/hosted boundary. | HIGH | No evidence-policy scope change; `REVIEWED_CLEAN`. |
| `docs/operations/payment-reconciliation.md` | #47–#55: synthetic validation, setup, review, recovery, audit, and roll-forward runbook. | HIGH | Checked against actions/RPCs and authority boundaries; `REVIEWED_CLEAN`. |
| `docs/product/sprint-4-manual-gcash-reconciliation.md` | #47–#55: criterion matrix, root cause, risk, evidence, and ledger. | HIGH | Reconciled with all issue bodies and final implementation; `REVIEWED_CLEAN`. |
| `src/app/account/bookings/[bookingId]/page.tsx` | #48, #51: parallel owner booking/payment load and fail-closed panel. | HIGH | Owner context, missing/error states, and component consumer inspected; `REVIEWED_CLEAN`. |
| `src/app/admin/page.tsx` | #52, #55: oldest-first queue, 12-hour target, split accounting, launch gate. | HIGH | Strict loader outputs and unrelated queues inspected; `REVIEWED_CLEAN`. |
| `src/app/admin/payments/[paymentId]/page.tsx` | #52–#55: minimal reconciliation detail, controls, complete safe audit identifiers. | HIGH | Sole-admin loader, stale state, DTO fields, and UI leakage reviewed; `REVIEWED_AFTER_FIX`. |
| `src/app/admin/payments/[paymentId]/loading.tsx` | #52: non-sensitive pending route state. | HIGH | Contains no record fields; `REVIEWED_CLEAN`. |
| `src/app/admin/payments/[paymentId]/not-found.tsx` | #52: existence-safe missing/stale navigation. | HIGH | Copy does not disclose owner/payment facts; `REVIEWED_CLEAN`. |
| `src/features/payments/types.ts` | #48–#55: strict owner/admin/proof/decision/accounting DTOs and safe enums/copy. | HIGH | Exact database projections and forbidden extra keys compared; `REVIEWED_CLEAN`. |
| `src/features/payments/data.ts` | #48, #51, #52, #55: UUID validation and fail-closed projection parsing. | HIGH | RPC errors, stale/missing branches, and audit chaining inspected; `REVIEWED_CLEAN`. |
| `src/features/payments/actions.ts` | #49, #50: owner submit, signature/size validation, immutable upload/finalize/recovery. | HIGH | Auth, service containment, no-overwrite, digest, retry, cleanup, and cache boundaries inspected; interrupted-object deletion finding fixed; `REVIEWED_AFTER_FIX`. |
| `src/features/payments/admin-actions.ts` | #50, #53, #54: current admin proof authorization and constrained decisions. | HIGH | Reauth, service-only path, signed URL, exact observed facts, safe errors reviewed; authenticated path-exposure finding fixed; `REVIEWED_AFTER_FIX`. |
| `src/features/payments/payment-panel.tsx` | #48, #50, #51: exact instructions, policy, safe state/rejection, conditional retry. | HIGH | Server-owned values, accessibility states, and deadline behavior inspected; `REVIEWED_CLEAN`. |
| `src/features/payments/payment-review-controls.tsx` | #50, #53, #54: 60-second link, actual-account attestation, safe rejection list. | HIGH | URL expiry, pending/committed disablement, and effect dependencies reviewed; `REVIEWED_AFTER_FIX`. |
| `src/features/payments/types.test.ts` | #48, #52, #55: strict projection/leakage and split-accounting regressions. | HIGH | Positive and forbidden-extra cases inspected; `REVIEWED_CLEAN`. |
| `src/features/payments/data.test.ts` | #48, #52, #55: loader validation and safe detail/audit sequence. | HIGH | Error/malformed/leak cases inspected; `REVIEWED_CLEAN`. |
| `src/features/payments/actions.test.ts` | #49, #50: input, safe-error, correction, and interrupted-retry regressions. | HIGH | RPC payload and stored-byte reconciliation assertions inspected; `REVIEWED_AFTER_FIX`. |
| `src/features/payments/admin-actions.test.ts` | #50, #53, #54: reauth, exact observed facts, no allocations, service grant before URL. | HIGH | Caller/service mocks and signed-URL ordering inspected; `REVIEWED_AFTER_FIX`. |
| `src/features/payments/payment-components.test.tsx` | #48, #50, #53, #54: exact UI copy/controls and forbidden private fields. | HIGH | Static rendered output assertions inspected; `REVIEWED_CLEAN`. |
| `src/types/database.generated.ts` | #48–#55: generated public/api RPC contract consumed by Supabase clients. | HIGH | Signatures matched to migration; CI regenerates from migrated Local before typecheck; `REVIEWED_CLEAN`. |
| `supabase/migrations/20260815165103_add_manual_gcash_reconciliation_lifecycle.sql` — configuration/snapshots | #48, #49: disabled recipient, signed contract/immutable amount checks, transaction snapshots. | HIGH | Constraints, config audit, database clock, and owner isolation inspected/tested; `REVIEWED_CLEAN`. |
| Same migration — proof lifecycle/Storage | #50: private intents, exact RLS, metadata/digest finalization, cleanup, supersession. | HIGH | Owner/service grants, paths, expiry, existing-object recovery, mutation guards tested; `REVIEWED_AFTER_FIX`. |
| Same migration — admin queue/access | #52, #50: minimal stable queue/detail and purpose-bound 60-second access. | HIGH | Forbidden-key scans, service-only raw target, and booking-first locks inspected; reverse-lock/path-exposure findings fixed; `REVIEWED_AFTER_FIX`. |
| Same migration — verify/reject | #53, #54: actual account, normalized reference, derived allocations, deterministic rejection. | HIGH | Atomic writes, idempotency, unique/deferred constraints, lock order, and both deadline sides tested; pre-lock clock finding fixed; `REVIEWED_AFTER_FIX`. |
| Same migration — audit/accounting/grants | #55: safe audit projection, append-only records, split totals, least privilege. | HIGH | Metadata/privilege/immutability scans and SQL negative cases passed; `REVIEWED_CLEAN`. |
| `supabase/tests/database/001_domain_invariants.sql` | #55: adapt legacy verified fixture and exact Storage-delete policy count. | HIGH | Existing invariant intent preserved under new columns/guard; `REVIEWED_CLEAN`. |
| `supabase/tests/database/003_approval_concurrency.sh` | #49, #53, #54: replay 009 and add real submission/decision races. | HIGH | Disposable-target refusal, PID cleanup, independent sessions, final aggregate checks inspected; `REVIEWED_CLEAN`. |
| `supabase/tests/database/009_manual_gcash_reconciliation.sql` | #47–#55: direct positive/negative/boundary/persistence acceptance proof. | HIGH | Roles, strict deadline sides, proof integrity, projections, finance, immutability, and audit assertions inspected; `REVIEWED_AFTER_FIX`. |

No change unit remains `UNREVIEWED`, `FINDING_RECORDED`, or
`FIXED_REQUIRES_REREVIEW`.

## Release boundary

The migration is forward-only and its recipient configuration is disabled by
default. Rollback means disabling future submissions or shipping a reviewed
roll-forward migration; never delete or rewrite financial, proof, state, or
audit history. A real recipient, hosted migration, Preview/Production deploy,
legal/tax approval, reviewer staffing, reconciliation monitoring, and public
paid launch each require separate authorization and operational evidence.
