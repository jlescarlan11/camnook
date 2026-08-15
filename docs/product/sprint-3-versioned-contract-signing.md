# Sprint 3 Versioned Contract Signing Acceptance

Status: implemented and locally validated with synthetic records on 2026-08-15.
This change does not apply a hosted migration, deploy the application, approve
legal wording, or enable Production launch.

## Root cause and trust boundary

The approval scaffold already created a useful immutable version-1 snapshot,
but the lifecycle stopped there: renters had no safe contract projection or
signing UI; signing accepted caller-authored intent/attestation/hash and was not
idempotent; material pre-payment changes had no controlled supersession path;
expiry had no protected scheduled delivery or contract audit; and the admin
flow could not inspect agreement history.

The database remains authoritative. Renter and admin pages parse narrow safe
projections, while every mutation re-authenticates the actor and locks the
booking aggregate in a security-definer transaction. The browser never supplies
legal text, renter identity, prices, inclusions, template content, a content
hash, actor identity, or trusted timestamps. `anon` receives no agreement read
or mutation privilege. RLS limits renters to versions/signatures belonging to
their own bookings, and admin status is rechecked inside privileged operations.

## Acceptance-criteria matrix

All issues are classified **HIGH** because they affect authorization, durable
legal/financial facts, transactions, retries, races, and scheduled state
changes. Every row below is `SATISFIED` against the latest integrated change.

| Criterion | Source | Required and boundary behavior | Implementation mapping | Direct evidence | Status |
| --- | --- | --- | --- | --- | --- |
| C37-1 | #37 | Present the immutable named-renter approval contract and preserve superseded versions. | Immutable `contract_versions`; owner/admin read model and history UI. | Exact v1/v2/history assertions in `008_contract_lifecycle.sql`; read-model/component tests. | SATISFIED |
| C37-2 | #37 | Only the booking owner can sign the exact current version; stale or altered versions fail closed. | Locked owner/current/status/hash checks in `private.sign_contract`. | Cross-owner, stale-version, changed-terms, and malformed-input SQL/action tests. | SATISFIED |
| C37-3 | #37 | A valid signature advances to `TO_PAY` without resetting the original deadline. | Signature insert and `transition_booking` share one transaction; no deadline write. | SQL signature/state/history/deadline assertions. | SATISFIED |
| C37-4 | #37 | An unsigned due booking expires and does not retain an inventory block. | Idempotent expiry plus minute Supabase Cron and protected recovery route. | SQL expiry/release/idempotency assertions; expiry/route tests. | SATISFIED |
| C38-1 | #38 | Only the booking owner can read the current contract. | Contract RLS and booking owner filter. | SQL cross-owner version/signature denial; empty-RLS read-model test. | SATISFIED |
| C38-2 | #38 | Presented terms match the immutable approval snapshot and template version. | Parsed snapshot-only `ContractDetails`; no live catalog/template merge. | Field-by-field SQL snapshot assertions and component render test. | SATISFIED |
| C38-3 | #38 | Show the stored original deadline without deriving it from page-load time. | Account projection passes immutable `approval_deadline_at`. | Component deadline assertion; SQL deadline-preservation checks. | SATISFIED |
| C39-1 | #39 | Each version snapshots renter identity, serialized camera, inclusions, schedule, price, deposit, intended use, expected location, required policies, and template version. | Atomic approval snapshot plus locked `build_contract_snapshot` for replacements. | Field-by-field v1/v2 SQL assertions and component test. | SATISFIED |
| C39-2 | #39 | Historical versions cannot be edited or deleted. | Existing content/status/delete triggers and foreign-key restrictions. | SQL rewrite/delete attempts fail with `55000`. | SATISFIED |
| C39-3 | #39 | Contract creation never extends or resets the booking deadline. | Replacement updates only allowed material facts and current pointer. | Stored deadline compared before/after replacement and races. | SATISFIED |
| C40-1 | #40 | Recheck authentication and booking ownership at signing time. | Server Action authentication plus database `auth.uid()` owner check under lock. | Unauthenticated/cross-owner action and SQL cases. | SATISFIED |
| C40-2 | #40 | Bind signature to renter, exact version, consent, and trusted server time. | Fixed database intent/attestation/hash with `clock_timestamp()`. | SQL row/hash/audit checks; action sends only version ID and fixed consent. | SATISFIED |
| C40-3 | #40 | A successful retry is unambiguous and creates no duplicate. | Existing exact signature returns `created=false`; unique constraint. | Action retry test and real two-session duplicate-sign race. | SATISFIED |
| C41-1 | #41 | Another renter cannot read or sign the contract. | RLS and owner check inside signing RPC. | Cross-owner select/sign SQL cases. | SATISFIED |
| C41-2 | #41 | Superseded, expired, invalidated, or non-current versions cannot be signed. | Current pointer, issued status, state, and deadline checks precede writes. | Old-version, expired-version, stale-state SQL cases. | SATISFIED |
| C41-3 | #41 | Rejected attempts leave booking state and deadline unchanged. | All validation occurs before signature/transition writes; transaction rollback. | SQL post-failure state/deadline/count assertions. | SATISFIED |
| C42-1 | #42 | Camera, dates, inclusions, price, deposit, or terms changes supersede instead of overwrite. | Admin-only canonical rebuild and linked replacement version. | v2 SQL fixture changes every material category. | SATISFIED |
| C42-2 | #42 | Earlier versions/signatures remain immutable and non-actionable. | Old version becomes `superseded`; append-only rows remain; current-pointer sign check. | Mutation and stale-v1 sign failures; real sign/supersede race. | SATISFIED |
| C42-3 | #42 | Renter reviews/signs the replacement while original deadline stays unchanged. | New version is unsigned/current and `TO_PAY` returns to `CONTRACT_PENDING`; shared UI shows current history. | SQL v2 unsigned/deadline assertions and renter component projection. | SATISFIED |
| C43-1 | #43 | Only a valid current signature moves `CONTRACT_PENDING` to `TO_PAY`. | Exact-version sign RPC is the sole transition entry point. | Valid and negative SQL signing cases. | SATISFIED |
| C43-2 | #43 | Transition and state history are atomic and append-only. | Signature plus `transition_booking` in one transaction; existing history guard. | SQL history assertion and mutation failure. | SATISFIED |
| C43-3 | #43 | Deadline and active inventory block remain unchanged. | Signing never updates either projection. | SQL before/after deadline and active-block assertions. | SATISFIED |
| C44-1 | #44 | Expiration uses authoritative approval deadline and is idempotent. | Database-clock predicate and `FOR UPDATE SKIP LOCKED` loop. | Due result `1`, immediate retry `0`; service operation-ID test. | SATISFIED |
| C44-2 | #44 | `CONTRACT_PENDING` moves to `EXPIRED` without deleting contract or state history. | Atomic system transition and version voiding; append-only history retained. | SQL state/version/history/audit assertions. | SATISFIED |
| C44-3 | #44 | Release the active availability block. | Same expiry transaction calls `release_booking_block`. | SQL proves `released_at` and sanitized availability absence. | SATISFIED |
| C45-1 | #45 | Audit identifies actor, action, version, outcome, and trusted time. | Version/signature triggers, explicit expiry audit, admin RPC/UI. | SQL audit projection and UI data fields. | SATISFIED |
| C45-2 | #45 | Earlier contract, signature, state, and audit records cannot be rewritten. | Existing/new append-only guards. | SQL update/delete attempts fail. | SATISFIED |
| C45-3 | #45 | Renter/admin projections expose only authorized agreement data. | Narrow selects/DTOs, RLS, and admin-only audit RPC. | Exact-column/DTO tests, cross-owner denial, renter audit denial. | SATISFIED |

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

The disposable PostgreSQL harness replays every forward migration, runs all
domain/authorization/pricing/evidence/admin/contract invariants, and then uses
real independent sessions for overlapping approval, mutable-set stability,
sign-versus-supersede serialization, and duplicate signing. The contract suite
uses only synthetic UUIDs, names, serials, prices, and terms.

Security/privacy review verifies least privilege, owner/admin isolation,
server-owned identity/content/hash/time, constrained errors, and absence of
secrets or private paths. Data/state/operations review verifies forward-only
compatibility, append-only history, lock order, idempotency, deadline semantics,
generated pricing consistency, atomic release, cron capability detection, and
recovery behavior.

## Tradeoffs and release gates

Supabase Cron is the minute-level primary scheduler because the linked Vercel
team is on Hobby, whose Cron cadence cannot support a short interval. The
protected Vercel route runs daily as a separate recovery path and can be invoked
manually after an alert. Plain local PostgreSQL may not package `pg_cron`; the
migration detects availability, while hosted Supabase installs and schedules it.

The migration is forward-only. Rollback is a roll-forward operation: disable or
unschedule the job, keep the immutable rows, and deploy a reviewed replacement
migration. Existing version/signature/audit history must never be deleted.
Legal wording and electronic-signature enforceability remain business/legal
approval gates; technical implementation is not legal approval.
