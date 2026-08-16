# Sprint 7 Owner Operations and Portfolio Performance Acceptance

Status: implemented and locally validated with synthetic records on 2026-08-16.
This change does not apply a hosted migration, deploy the application, move
money, expose acquisition costs publicly, or authorize public paid rentals.

## Root cause, dependency order, and trust boundary

The prior admin page assembled several independent application reads, omitted
contract-signature and periodized portfolio work, duplicated active/return
state, exposed full payment reference/sender data in a broad queue, and showed a
non-reversal-aware lifetime accounting summary. It could not prove that counts,
drill-downs, deposit liability, and revenue used one reproducible authority.

The implementation order was: correct immutable payment reversal allocation
invariants; build deposit/current-state projections; add period revenue and
utilization; attribute every metric per camera; expose strict server DTOs; then
replace the owner UI. PostgreSQL is the authority for authorization, database
clock, queue membership/order, money, period boundaries, range union, and cost
recovery. The Next.js page only validates explicit DTOs and presents them.

All issues are **HIGH** risk because they combine private renter contact,
financial liability/revenue, acquisition costs, state-derived operational work,
and owner authorization. Every criterion is `SATISFIED`; none is `UNVERIFIED`,
`PARTIAL`, or `BLOCKED`.

## Acceptance-criteria matrix

| Criterion | Source | Required behavior | Implementation and direct evidence | Status |
| --- | --- | --- | --- | --- |
| S7-78-1 | #78 scope | One owner surface covers review, signature, payment, pickup, active rental, return, issue, held deposit, and pending refund plus trusted portfolio metrics. | One operations RPC, one period RPC, nine linked UI sections, portfolio rollup/table; SQL 012 and component test. | SATISFIED |
| S7-78-2 | #78 exit | Sole owner can operate the whole portfolio while private/reversal history remains protected. | `requirePageAdmin`, DB `require_admin`, minimized DTOs, supporting legacy workflow links; anon/renter denials and leak scans. | SATISFIED |
| S7-79-1 | #79 AC1 | All nine kinds use authoritative current state. | DB state predicates plus reuse of pickup/payment/resolution authorities; SQL fixture contains every kind. | SATISFIED |
| S7-79-2 | #79 AC2 | Counts, urgency, links, and deterministic order agree with detailed queues. | Counts use exact array lengths; statement clock and explicit tie-break IDs; strict count refinement; actionable detail links. | SATISFIED |
| S7-79-3 | #79 AC3 | Projection failure is unavailable, never empty/zero. | Single operations loader returns only success/error; page closes every section on error; malformed/count-drift unit test. | SATISFIED |
| S7-80-1 | #80 AC1 | Signature queue contains current `CONTRACT_PENDING` rows with authoritative deadlines only. | Partial index and exact state/deadline predicate. | SATISFIED |
| S7-80-2 | #80 AC2 | Open/due/expired comes from DB clock without changing deadline. | One `statement_timestamp()` and Manila date classification; no write operation. | SATISFIED |
| S7-80-3 | #80 AC3 | Show minimum renter contact and booking context. | Legal name, necessary phone, camera, pickup, deadline, booking detail link only. | SATISFIED |
| S7-81-1 | #81 AC1 | Verified deposits, deductions, refunds/reversals, and remaining liability reconcile immutable ledgers. | Signed verified security-deposit allocations, linked deduction ledger, net refund ledger; overdraw fails; SQL exact equations. | SATISFIED |
| S7-81-2 | #81 AC2 | Held and pending-refund totals link exact actionable queues. | Nonterminal/terminal partition; totals equal item liabilities; counts/items link booking detail. | SATISFIED |
| S7-81-3 | #81 AC3 | Deposits/refunds never affect rental revenue. | Revenue filters `rental_payment`; SQL uses deposits, deduction, refund, reversal while expected revenue stays exact. | SATISFIED |
| S7-82-1 | #82 AC1 | Revenue is net verified rental-fee allocation with each immutable reversal once. | Signed direction, `status='verified'`, exact reversal-allocation constraint. | SATISFIED |
| S7-82-2 | #82 AC2 | Exclude unverified, deposit, refund, liability, and deduction values. | Allocation-kind/status predicates; SQL negative fixture and strict methodology DTO. | SATISFIED |
| S7-82-3 | #82 AC3 | Manila period boundaries are explicit and total/drill-down agree. | Date-to-Manila-midnight `[)` conversion; camera-derived portfolio sum; invalid input no report. | SATISFIED |
| S7-83-1 | #83 AC1 | Utilization numerator uses a documented authoritative state/interval rule; maintenance/manual remain separate. | Scheduled booking interval for five committed states; separate block-kind aggregates and UI methodology. | SATISFIED |
| S7-83-2 | #83 AC2 | Denominator/window is explicit, half-open, clipped, and overlap-safe. | Camera creation-to-archive overlap; clipped `tstzrange`; `range_agg` union; overlapping SQL fixture. | SATISFIED |
| S7-83-3 | #83 AC3 | Archived history remains reportable; unpublished inventory stays out of public projection. | All cameras in owner report; archived fixture present; anon public-view assertion excludes draft/archived. | SATISFIED |
| S7-84-1 | #84 AC1 | Camera revenue joins immutable booking/camera and verified rental allocation. | Allocation → booking → serialized camera attribution, signed by transaction direction. | SATISFIED |
| S7-84-2 | #84 AC2 | Camera totals equal portfolio total for the same period. | Portfolio sums camera CTE; SQL assertion and Zod cross-field refinement. | SATISFIED |
| S7-84-3 | #84 AC3 | Camera metrics exclude liabilities/deposits/deductions/unverified. | Same rental-only verified CTE as portfolio, not a parallel app calculation. | SATISFIED |
| S7-85-1 | #85 AC1 | Recovery combines private cost and lifetime net verified camera revenue. | Owner-only camera CTE and cost-capped recovery object. | SATISFIED |
| S7-85-2 | #85 AC2 | Zero/missing cost is unavailable. | Explicit unavailable discriminated DTO; SQL tests both zero and null; UI never formats zero as cost. | SATISFIED |
| S7-85-3 | #85 AC3 | Acquisition/recovered/remaining/percentage are sole-admin only. | Only admin API/report schema contains fields; public views unchanged; anon/renter RPC denial. | SATISFIED |
| S7-86-1 | #86 AC1 | Every projection is DB-backed and sole-admin protected. | Security-invoker API → exact-granted private security-definer → `require_admin`; no direct table aggregation in app. | SATISFIED |
| S7-86-2 | #86 AC2 | Aggregates are immutable-record, deterministic-period, reversal-aware. | Transaction/allocation/booking ledgers, statement clock, Manila dates, exact allocation reversals, range union. | SATISFIED |
| S7-86-3 | #86 AC3 | Broad responses minimize renter/private data. | Strict JSON re-projection omits paths/URLs/digests/ID type/full refs/serials/free notes; SQL and unit leak scans. | SATISFIED |

## Validation and adversarial review

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The PostgreSQL 17 socket-only harness replays all twenty-one forward migrations,
all repository SQL suites, and the existing independent real-session races. SQL 012
directly covers all nine queues, deadline/current-state membership, exact
deposit reconciliation, generic payment and refund reversals, wrong-booking
allocation rejection, revenue exclusions, per-camera equality, overlapping
range union, camera-lifecycle clipping, an early-released future block,
maintenance/manual separation, archived/draft inventory, zero/null costs,
invalid periods, path-specific contact minimization, exact function grants,
forbidden fields, and anon/renter denial. The application suite has 410 passing
tests including strict DTO drift, invalid dates, no-zero fallback, all queue
headings, distinct signature deadline labels, and reporting methodology.

Security review covers exact grants/default execute, security-definer search
paths, admin reauthorization, strict schemas, broad-response minimization, and
unchanged public inventory projections. Data/state review covers reversal
balance, liability partition/equations, queue predicates/order, report event
time, half-open Manila boundaries, range union, archived denominators, and
portfolio/camera equality. UI review covers async Next.js search params,
parallel independent reads, explicit error states, useful loading text, detail
links, keyboard-size controls, and zero/missing-cost presentation.

The independent passes initially found six actionable gaps: return-inspection
phone overexposure, scalar rather than lifecycle range clipping, an invalid
early-release range edge, missing allocation-to-transaction booking equality,
the collapsed expired UI label, and an omitted Linux SQL-suite entry. Each was
fixed in its owning layer and guarded by SQL or component regressions before
the full validation rerun; the reviewers reported no remaining open findings.

## Change-set accounting

| Change unit | Contract and review evidence | Disposition |
| --- | --- | --- |
| Forward migration `20260816093757_add_owner_operations_portfolio_reporting.sql` | #78–#86; indexes, exact reversal invariant, deposit helper, two projections, least-privilege grants. Full replay/SQL 012. | REVIEWED_AFTER_FIX |
| SQL 012, Linux CI list, and disposable harness | Direct positive/negative/boundary/privacy evidence; all prior suites/races remain green. | REVIEWED_AFTER_FIX |
| `src/features/portfolio/types.ts`, `data.ts`, `period.ts` | Strict DTOs, matching period, count/liability/camera cross-checks, valid Manila date selection. Unit tests/typecheck. | REVIEWED_AFTER_FIX |
| Owner dashboard/report components and `/admin` page | Nine queues, supporting workflows, fail-closed operations/metrics, owner period form and camera details. Component tests/build. | REVIEWED_AFTER_FIX |
| Generated database API types | New exact RPC signatures; local typecheck and CI regeneration contract. | REVIEWED_CLEAN |
| Architecture, decision, acceptance, README, and operator docs | Reporting semantics, 21-migration boundary, release/recovery limits. Cross-file count/link scan. | REVIEWED_CLEAN |

## Release boundary

The new migration is forward-only and repository-only. Recovery means closing
the owner surface or shipping a reviewed roll-forward correction—never editing
or deleting payment/allocation, deposit, refund, booking, camera cost, state,
handoff, evidence, or audit history. Development migration/advisors, protected
Preview smoke testing, Production migration, deployment, accounting sign-off,
and public paid launch each require separate authorization and evidence.
