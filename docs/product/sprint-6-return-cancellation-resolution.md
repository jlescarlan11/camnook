# Sprint 6 Return, Cancellation, and Resolution Acceptance

Status: implemented and locally validated with synthetic records on 2026-08-16.
This change does not apply a hosted migration, move money, accept a paid
cancellation, deploy the application, release real equipment, or authorize
public paid rentals.

## Root cause and trust boundary

The initial domain schema had broad dormant return, cancellation, settlement,
and refund scaffolds but no complete product workflow. It did not give return
records retry identities, validate the exact signed-contract accessory set,
require finalized issue evidence, link a deduction to its explicit issue
decision, expose minimized owner/admin projections, or provide immutable refund
corrections. A renter cancellation request could also be confused with the
state transition it requested.

PostgreSQL is now the state and accounting authority. Renters may create only
an owned request; a request never changes booking state. The sole administrator
records physical facts and explicit decisions. Each operation locks and
rechecks the booking, uses an idempotency UUID, appends history/audit, and
commits all effects together. Return evidence remains private and versioned.
Verified deposit allocations remain liabilities, manual deductions reference
one issue decision, outgoing refund records are created only after the external
movement, and corrections append an exact opposite reversal instead of editing
history.

Paid/submitted cancellation acceptance remains deliberately disabled under
OD-03. Requests and explicit declines are supported; acceptance is limited to
`FOR_REVIEW`, `CONTRACT_PENDING`, and `TO_PAY` with zero fees and zero refund
liability until a reviewed policy authorizes more.

All issues are classified **HIGH** because they affect authorization, physical
custody, private evidence, state transitions, deposit liability, immutable
financial history, and inventory release. Every required criterion is
`SATISFIED`; no criterion is `UNVERIFIED`, `PARTIAL`, or `BLOCKED`.

## Acceptance-criteria matrix

| Criterion | Source | Required and failure/persistence behavior | Implementation mapping | Direct evidence | Status |
| --- | --- | --- | --- | --- | --- |
| S6-67-1 | #67 scope | Complete return inspection, issue review, deductions, deposit liability, cancellation, refund recording, and correction as one coherent lifecycle. | Forward migration, strict RPC DTOs, admin/renter pages, four dashboard queues, runbook. | SQL `011`, 17 new resolution unit/component cases, expanded wall-clock coverage, full build. | SATISFIED |
| S6-67-2 | #67 exit | Clear and disputed rentals preserve evidence, finish safely, and never treat a refund as automatic money movement. | `decide_return_review`, `resolve_return_issue`, `record_external_refund`, `reverse_external_refund`. | Clear and damage fixtures both reach `COMPLETED`; refund is a later explicit movement. | SATISFIED |
| S6-68-1 | #68 AC1 | Record actual return time, observed camera serial, condition, and exactly one returned/missing/damaged result per signed-contract accessory. Wrong serial, missing, duplicate, or extra facts fail. | Strict admin form and `private.record_return` compare against the current issued snapshot under lock. | SQL wrong-serial/incomplete-list failures and valid exact-list persistence; action argument test. | SATISFIED |
| S6-68-2 | #68 AC2 | Return evidence is private, exact-path, no-overwrite, digest-verified, and correctable only by versioned replacement. | Generalized condition intent/finalize/access operations plus `supersedes_photo_id`; `return_condition_review` purpose. | SQL Storage insert/finalize/evidence gate; component replacement/access controls; legacy photo race remains green. | SATISFIED |
| S6-68-3 | #68 AC3 | `ACTIVE → RETURN_REVIEW` occurs once with handoff/report/history/audit or not at all. Retries are unambiguous. | Booking lock, unique return handoff and operation ID, one transaction, idempotent response. | SQL valid retry returns `created=false`; failed attempts leave no transition. | SATISFIED |
| S6-69-1 | #69 AC1 | Recorded damage, missing item, or late fact must enter `ISSUE_REVIEW`; clear facts cannot be mislabeled and issue facts cannot be cleared. | `decide_return_review` derives issue presence from immutable return facts. | SQL damage fixture rejects evidence-less issue, then enters `ISSUE_REVIEW` after finalization; clear fixture completes. | SATISFIED |
| S6-69-2 | #69 AC2 | Issue notes and evidence are private and append-only. A damage/missing issue requires finalized evidence. | RLS-only `return_issue_notes`, immutable triggers, private photo lifecycle, safe owner projection. | SQL direct access/update denial, evidence requirement, and path/digest leak scans. | SATISFIED |
| S6-69-3 | #69 AC3 | No issue automatically creates a deduction; completion requires an explicit manual decision. | `resolve_return_issue` requires kind, amount, private basis, renter explanation, actor, and operation UUID. | SQL pauses in `ISSUE_REVIEW`, rejects over-deposit amount, then records chosen PHP 1,000. | SATISFIED |
| S6-70-1 | #70 AC1 | Every nonzero deduction references the approved issue decision and cannot exceed the verified deposit. | `deposit_deductions.issue_decision_id` FK/unique plus held-deposit calculation. | SQL join proves the PHP 1,000 decision/deduction link; PHP 4,500 attempt fails. | SATISFIED |
| S6-70-2 | #70 AC2 | External refunds are recorded after issue decision/completion and cannot exceed remaining liability. | Terminal-state/time checks, `net_refund_total`, versioned settlement replacement. | SQL issue decision precedes PHP 3,000 refund; remaining liability becomes zero. | SATISFIED |
| S6-70-3 | #70 AC3 | Security deposits and refunds never become rental revenue. | Refund movements allocate only to `deposit_refund`; revenue remains verified `rental_payment` allocation. | Deferred allocation constraints and SQL assertion prove exactly one deposit-refund allocation per movement. | SATISFIED |
| S6-71-1 | #71 AC1 | Renter sees final return/issue/cancellation outcomes for their booking. | `api.get_my_resolution_state` and owner component. | Owner SQL fixture and rendered component show final explanation and state. | SATISFIED |
| S6-71-2 | #71 AC2 | Renter sees only safe owned amounts and evidence summaries—never internal reason, counterparty, full reference, serial authority, path, or digest. | Explicit owner JSON, strict Zod schema, server-only signed URL. | SQL and loader/component forbidden-field scans. | SATISFIED |
| S6-71-3 | #71 AC3 | Historical outcomes cannot be edited or deleted. | Append-only decisions, notes, deductions, refund ledger, verified transactions, settlements, history, and audit. | SQL update attempts on notes and outgoing transaction fail. | SATISFIED |
| S6-72-1 | #72 AC1 | A clear return transitions `RETURN_REVIEW → COMPLETED` and releases its block. | Clear branch in `decide_return_review`. | SQL clear fixture reaches `COMPLETED` and creates no issue decision. | SATISFIED |
| S6-72-2 | #72 AC2 | Clear return creates no deduction automatically. | Settlement snapshot derives zero decision-linked deductions. | SQL clear deposit outcome shows zero deduction. | SATISFIED |
| S6-72-3 | #72 AC3 | Refund liability remains visible after completion until an external refund is recorded. | `deposit_outcome_json` and deposit queue separate state completion from movement. | SQL shows PHP 4,000 liability before refund and again after reversal. | SATISFIED |
| S6-73-1 | #73 AC1 | Only the authenticated renter may request cancellation for an owned eligible pre-pickup booking. | Owner/state checks in `request_cancellation`. | SQL cross-owner denial and eligible unpaid/confirmed requests. | SATISFIED |
| S6-73-2 | #73 AC2 | Requesting cancellation does not rewrite booking state and is idempotent. | Separate append-only request with operation UUID; no transition in request function. | SQL booking remains `FOR_REVIEW`; retry returns same request with `created=false`; action test sends no target state. | SATISFIED |
| S6-73-3 | #73 AC3 | Eligibility, fees, refunds, and outcome belong to a controlled admin operation. | `decide_cancellation` rechecks request/booking and accepts explicit zero amounts only in approved unpaid states. | SQL and action policy tests. | SATISFIED |
| S6-74-1 | #74 AC1 | Admin decision rechecks sole-admin authority, pending request, and current eligible state; stale/racing decisions fail. | Request and booking row locks, unique decision/request relation, operation UUID. | SQL successful decision plus stale/policy failure cases; full role/grant suite. | SATISFIED |
| S6-74-2 | #74 AC2 | Accepted eligible cancellation releases the active availability block and appends `CANCELLED` history atomically. | `transition_booking` plus `release_booking_block` in one function. | SQL unpaid acceptance reaches `CANCELLED`; projection/history constraint passes. | SATISFIED |
| S6-74-3 | #74 AC3 | Outcome, reason, state-at-decision, fee, and refund liability are explicit and immutable; paid acceptance fails closed. | Append-only `cancellation_decisions`; zero-amount policy guard and `0A000` paid guard. | SQL paid accept rejection/explicit decline; component disables accept; action maps policy error. | SATISFIED |
| S6-75-1 | #75 AC1 | Late-return handling uses the immutable actual return time and supporting return facts/evidence. | Late derives only from `handoff.actual_at > booking.return_at`; issue decision must match recorded facts. | SQL/queue schemas expose a boolean late fact and actual time, never a computed charge. | SATISFIED |
| S6-75-2 | #75 AC2 | No grace period, hourly rate, or automatic late formula exists. | No amount in return operation/queue; UI states schedule-only/manual decision. | SQL/action/component forbidden-field assertions and source inspection. | SATISFIED |
| S6-75-3 | #75 AC3 | Any late deduction amount is explicitly chosen, explained, bounded by held deposit, and audited. | Manual `late_return`/`mixed` issue decision path shared with other deductions. | Decision operation requires amount/reasons; audit records `amount_is_manual=true`; SQL verifies. | SATISFIED |
| S6-76-1 | #76 AC1 | Record outgoing reference, recipient, amount, and actual time only after the external GCash movement. | `record_external_refund` validates terminal state/time/reference and inserts verified outgoing transaction. | SQL records full-ref private transaction and returns only last four in admin detail/audit. | SATISFIED |
| S6-76-2 | #76 AC2 | Refund amount reconciles verified held deposit minus decision-linked deductions and prior net refunds. | Held/deduction/net-refund helpers plus deferred payment allocation balance. | Clear PHP 4,000 and disputed PHP 3,000 flows reconcile exactly. | SATISFIED |
| S6-76-3 | #76 AC3 | Corrections never edit a refund; they append one exact opposite reversal and restore liability. | `reverse_external_refund`, `reversal_of` uniqueness, append-only transaction/ledger triggers. | SQL reversal creates incoming offset, rejects mutation, and restores PHP 4,000 liability. | SATISFIED |

## Validation and adversarial review

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The PostgreSQL 17 harness replays all twenty forward migrations and every SQL
suite in a disposable socket-only cluster, then runs the existing independent
approval, catalog, verification, contract, payment, pickup, and condition-photo
races plus a competing-return race. It separately proves unmappable legacy
resolution history stops before the old API changes.
`011_return_cancellation_resolution.sql` covers positive, negative,
boundary, retry, persistence, RLS, evidence, audit, accounting, reversal, and
owner-isolation cases. All data and bytes are synthetic.

Adversarial database review found and fixed the legacy pickup-purpose audit
compatibility regression and an ambiguous return-idempotency column. The
application review aligned strict deposit and cancellation-retry DTOs with the
authoritative projections, preserved second-level movement timestamps,
distinguished authentication denial from an indeterminate outage, removed the
expected private serial from serialized admin props, and parallelized
independent server reads. Existing-data review added a fail-closed migration
guard where legacy outcomes lack enough evidence for truthful decision links.
Security review covers grants,
default function execution, security-definer search paths, direct-table denial,
owner/admin reauthorization, private target exclusion, strict DTOs, immutable
money history, and fail-closed OD-03 policy. State/accounting review covers lock
order, exact state, operation identity, verified deposit basis, deduction links,
terminal/time ordering, balanced allocations, and reversal uniqueness.

## Change-set accounting

| Change unit | Provenance and contract | Review evidence | Disposition |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | #67–#76; run SQL 011 in Supabase-backed CI. | Workflow and command inspected; local disposable path passes. | REVIEWED_CLEAN |
| `README.md` and current release-status references | #67–#76; record twenty-migration repository boundary and new docs. | Count/link/status scan. | REVIEWED_CLEAN |
| Architecture and open-decision docs | #67–#76; state, table, Storage, operation, and OD-03 contracts. | Checked against migration/RPC definitions. | REVIEWED_CLEAN |
| `docs/operations/return-cancellation-resolution.md` | #68–#76; operator procedure and recovery. | Checked against UI, SQL errors, and release gates. | REVIEWED_CLEAN |
| This acceptance record | #67–#76 criterion evidence and integrated review. | Criterion-by-criterion reconciliation. | REVIEWED_CLEAN |
| Admin/account booking pages and admin dashboard | #67–#76; parallel safe reads, four queues, owner/admin surfaces. | Strict loaders, component tests, React review, build. | REVIEWED_AFTER_FIX |
| `src/features/resolution/types.ts` / `data.ts` | #68–#76; minimized strict DTOs. | Positive and forbidden-field loader/SQL tests; projection-status mismatch fixed and rereviewed. | REVIEWED_AFTER_FIX |
| `src/features/resolution/actions.ts` | #68–#76; authenticated observed-fact/decision/movement mutations. | Exact RPC argument, validation, policy, retry, and error-mapping tests after fixes. | REVIEWED_AFTER_FIX |
| Resolution admin/renter/queue components | #67–#76; explicit controls and safe owner outcomes. | Static markup, accessibility, privacy, and React review. | REVIEWED_AFTER_FIX |
| Pickup photo action extension | #68–#69; return purpose and versioned replacement. | Existing pickup tests plus SQL return-evidence flow and type/lint/build. | REVIEWED_CLEAN |
| Generated database API types | #67–#76; synchronize new RPC signatures. | Type-check and CI regeneration path. | REVIEWED_CLEAN |
| Forward migration `20260816071918_add_audited_return_cancellation_resolution.sql` | #67–#76; authoritative lifecycle, ledgers, RLS, projections, grants. | Full replay, SQL 011, prior suites, grant/audit/accounting review. | REVIEWED_AFTER_FIX |
| SQL suite `011_return_cancellation_resolution.sql` | #67–#76; direct acceptance evidence. | Passes locally and wired to both database paths. | REVIEWED_AFTER_FIX |
| Disposable concurrency harness | Consolidated regression; include SQL 011, migration precondition, and return race. | Guard stops before old API change; all twenty migrations/suites and every real-session race pass. | REVIEWED_AFTER_FIX |

## Release boundary

Migration `20260816071918_add_audited_return_cancellation_resolution.sql` is
forward-only and repository-only. Rollback means disabling affected UI or
shipping a reviewed roll-forward migration—never deleting or rewriting return,
issue, cancellation, deposit, refund, payment, state-history, evidence, or audit
records. Hosted migration, real return processing, real GCash movement,
paid-cancellation acceptance, deployment, staffing/recovery approval, and
public paid launch each require separate authorization and evidence. Production
remains closed.
