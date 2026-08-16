# Sprint 5 Pickup and Active-Rental Acceptance

Status: implemented and locally validated with synthetic records on 2026-08-16.
This change does not apply a hosted migration, configure a real pickup location
or contact, deploy the application, authorize real-ID collection, release real
equipment, or authorize public paid rentals.

## Root cause and trust boundary

The initial schema contained an unused broad `complete_pickup` scaffold. It
accepted free-form accessory JSON, recorded every checklist boolean as true,
did not prove the current contract/payment snapshots, had no retry identity,
and had no product UI. Private condition-photo metadata also retained a broad
direct admin-read path and no exact upload/finalization workflow.

The database is now the handoff and state authority. The sole admin supplies
only physical observations; under the booking lock, PostgreSQL rechecks the
current active profile, latest current verification, exact issued/signed
contract, verified payment with two balanced allocations, camera serial, full
contract accessory set, actual time, and all checklist attestations. The same
transaction inserts one immutable handoff/report, appends history/audit, and
moves `CONFIRMED` to `ACTIVE`. Owner/admin pages parse explicit strict JSON
projections. Condition photos are optional, private, opaque, no-overwrite, and
available to an admin only after a purpose-bound audited grant.

All issues are classified **HIGH** because they affect authorization, private
identity/evidence, paid-rental state, immutable history, and concurrent
transactions. Every criterion below is `SATISFIED`.

## Acceptance-criteria matrix

| Criterion | Source | Required behavior | Implementation and direct evidence | Status |
| --- | --- | --- | --- | --- |
| S5-57-1 | #57 scope | Implement named-renter, original-ID, serial, accessory, and condition checks. | Strict admin form plus `private.complete_pickup`; SQL and action/component tests cover every fact. | SATISFIED |
| S5-57-2 | #57 exit | `CONFIRMED` becomes `ACTIVE` only after every required fact passes. | One locked transaction; negative SQL cases prove no handoff/report/ACTIVE residue. | SATISFIED |
| S5-58-1 | #58 AC1 | Pickup queue contains eligible `CONFIRMED` bookings only. | `api.get_pickup_queue` applies database eligibility; `010_pickup_active_rental.sql` includes an excluded ineligible confirmed fixture. | SATISFIED |
| S5-58-2 | #58 AC2 | Checklist readiness is visible. | Queue returns six fixed required checks and current eligibility flags; dashboard explains the checklist. | SATISFIED |
| S5-58-3 | #58 AC3 | Private evidence remains purpose-limited. | Queue/detail omit paths/digests/serial; broad photo-table reads revoked; strict schema leak tests. | SATISFIED |
| S5-59-1 | #59 AC1 | Booking renter, contract renter, and verified identity match. | Locked profile/latest-verification/current-contract snapshot and renter signature checks. | SATISFIED |
| S5-59-2 | #59 AC2 | Verification is current on pickup day. | Manila-date checks cover both actual pickup date and current operation date. | SATISFIED |
| S5-59-3 | #59 AC3 | A substitute cannot complete pickup. | Named renter presence plus original-ID checked/matched must all be true in UI and SQL. | SATISFIED |
| S5-60-1 | #60 AC1 | Every serial/accessory/condition result is recorded. | Handoff booleans, observed-time record, exact contract accessory snapshot with confirmations, and written condition report. | SATISFIED |
| S5-60-2 | #60 AC2 | Condition report is immutable and private. | Existing append-only trigger and RLS remain authoritative; SQL update denial and minimized UI projections pass. | SATISFIED |
| S5-60-3 | #60 AC3 | Missing facts prevent `ACTIVE`. | Missing ID match, wrong serial, and incomplete accessories all fail before commit in SQL tests. | SATISFIED |
| S5-61-1 | #61 AC1 | Renter sees only owned timeline and a safe handoff summary. | `api.get_my_pickup_state` rechecks owner and omits name/contact/serial/report text/notes/finance/path/digest; strict tests. | SATISFIED |
| S5-61-2 | #61 AC2 | Actual pickup time is recorded. | Validated Manila input becomes the immutable handoff `actual_at`; owner/admin views render it. | SATISFIED |
| S5-61-3 | #61 AC3 | `CONFIRMED → ACTIVE` occurs exactly once. | Operation UUID idempotency, unique handoff, booking lock, sequential retry test, and real two-session competing pickup race. | SATISFIED |
| S5-62-1 | #62 AC1 | Confirmed renter sees schedule, location, contact, process, and original-ID requirement. | Owner page combines stored schedule with validated server-only `PICKUP_*` configuration. | SATISFIED |
| S5-62-2 | #62 AC2 | Instructions are limited to the owned confirmed booking. | Owner RPC and state-driven component; cross-owner SQL denial and rendering tests. | SATISFIED |
| S5-62-3 | #62 AC3 | No camera serial or other renter is exposed. | Safe DTO contains neither; Zod and rendered-markup forbidden-field tests. | SATISFIED |
| S5-63-1 | #63 AC1 | Booking must be confirmed with current verification and signed current contract. | State/profile/latest-verification/current issued snapshot/current renter signature all rechecked under lock. | SATISFIED |
| S5-63-2 | #63 AC2 | Every checklist fact is rechecked inside the operation. | Database accepts typed booleans, observed serial, exact UUID set, report, time, and operation identifier; browser readiness is advisory only. | SATISFIED |
| S5-63-3 | #63 AC3 | Failure creates no `ACTIVE` state or partial handoff. | One PostgreSQL transaction; negative SQL assertions inspect all three durable effects. | SATISFIED |
| S5-64-1 | #64 AC1 | Photos use opaque private no-overwrite paths. | Exact intent path `{booking}/{report}/{photo}.{ext}`, private 5 MiB JPEG/PNG bucket, Storage insert-only RLS, `upsert:false`, stored-byte hash verification. | SATISFIED |
| S5-64-2 | #64 AC2 | Access is renter-only or audited admin purpose. | Owner-bound authorization plus admin-only `pickup_condition_review` authorization/audit and 60-second server-signed URL. | SATISFIED |
| S5-64-3 | #64 AC3 | Written handoff is valid without photos. | Transition creates only the immutable written report; SQL proves `ACTIVE` before the optional photo workflow. | SATISFIED |
| S5-65-1 | #65 AC1 | `ACTIVE` queue shows expected return and operational urgency. | `api.get_active_rental_queue` derives `overdue`, `due_today`, or `upcoming` from trusted database time. | SATISFIED |
| S5-65-2 | #65 AC2 | Queue exposes only necessary renter contact context. | Explicit booking/camera/name/phone/pickup/return/urgency JSON with strict Zod parsing and forbidden-field scans. | SATISFIED |
| S5-65-3 | #65 AC3 | Late-return amounts are not calculated automatically. | No amount field or calculation exists; dashboard labels urgency as schedule-only; schema/SQL reject amount leakage. | SATISFIED |

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

The disposable PostgreSQL 17 harness replays all nineteen migrations and all
database suites, then uses independent sessions for the existing approval,
contract, and payment races plus competing pickup and condition-photo
create/finalize races. The Sprint 5 SQL
suite covers authorization, current eligibility, missing facts, rollback,
idempotency, immutable persistence, minimized queues, owner isolation, exact
Storage policy, digest verification, optional photos, access audit, and safe
active-rental output. All records and bytes are synthetic.

Security review covers auth rechecks in every Server Action, narrow
security-definer projections, direct-table revocation, service-role containment,
strict DTO parsing, private-path exclusion, HTTPS-only remote signed URLs,
opaque paths, no overwrite, and audit-before-admin-access. State review covers
booking-first locking, database time, stable evidence references, one operation
identifier, one transition, no partial writes, and real concurrent contention.

## Change-set accounting

Every change unit below was inspected with its direct caller, consumer,
persistence/configuration boundary, and relevant test. `REVIEWED_AFTER_FIX`
identifies units changed in response to an adversarial review finding.

| Path / change type | Issue provenance and affected contract | Risk and direct evidence | Disposition |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` — CI coverage | #57–#65; run the new SQL suite in the Supabase-backed job as well as the concurrency job. | HIGH; workflow lint plus both local SQL/harness paths inspected. | REVIEWED_CLEAN |
| `.env.example` — configuration template | #62; declare server-only location/contact/process inputs without real values. | HIGH; env-key scan, config tests, production build. | REVIEWED_CLEAN |
| `README.md` — repository/release status | #57–#65; record migration count, harness coverage, acceptance/runbook links, and closed hosted gate. | HIGH; migration/status link reconciliation. | REVIEWED_CLEAN |
| `docs/architecture/database-and-authorization.md` — architecture | #57–#65; document new evidence references, RPCs, projections, and grants. | HIGH; checked against migration definitions. | REVIEWED_CLEAN |
| `docs/architecture/state-machine.md` — state contract | #57, #59–#63; document locked pickup guards and exactly-once transition. | HIGH; SQL negative/idempotency/race assertions. | REVIEWED_CLEAN |
| `docs/architecture/storage-and-privacy.md` — privacy contract | #64; document intent, no-overwrite, verification, owner/admin access. | HIGH; Storage-policy and action tests. | REVIEWED_CLEAN |
| `docs/open-decisions.md` — release record | #57–#65; reconcile 19-migration repository boundary. | MEDIUM; repository migration count inspection. | REVIEWED_CLEAN |
| `docs/operations/catalog-publication.md` — status cross-reference | #57–#65; reconcile current repository/hosted counts. | MEDIUM; status search across current docs. | REVIEWED_CLEAN |
| `docs/operations/government-id-evidence.md` — status cross-reference | #59, #63; reconcile current repository/hosted counts without changing ID policy. | MEDIUM; status and scope inspection. | REVIEWED_CLEAN |
| `docs/operations/pickup-and-active-rentals.md` — runbook | #57–#65; configuration, physical procedure, evidence recovery, monitoring, rollout boundary. | HIGH; checked against UI, SQL, and environment behavior. | REVIEWED_CLEAN |
| `docs/product/sprint-5-pickup-and-active-rental.md` — acceptance evidence | #57–#65; root cause, criterion matrix, validation, and accounting. | HIGH; criterion-by-criterion consolidated review. | REVIEWED_CLEAN |
| `src/app/admin/page.tsx` — admin queues | #58, #65; parallel pickup/active reads and minimized schedule/contact cards. | HIGH; strict DTO, rendering, lint/type/build tests. | REVIEWED_CLEAN |
| `src/app/admin/bookings/[bookingId]/page.tsx` — admin detail | #57–#60, #63–#64; load and render checklist or persisted handoff. | HIGH; fail-closed missing-state finding fixed; route/type/component tests. | REVIEWED_AFTER_FIX |
| `src/app/account/bookings/[bookingId]/page.tsx` — renter detail | #61–#62, #64; parallel owned pickup load and server-only instructions. | HIGH; ownership SQL, component/privacy tests, protected-route browser check. | REVIEWED_CLEAN |
| `src/features/pickup/types.ts` — DTO contracts | #57–#65; strict minimized queue/detail/owner/photo/action schemas. | HIGH; positive and forbidden-field tests. | REVIEWED_CLEAN |
| `src/features/pickup/config.ts` — server configuration | #62; validate and fail closed on missing/malformed instructions. | HIGH; config unit tests and env-scope review. | REVIEWED_CLEAN |
| `src/features/pickup/data.ts` — server loaders | #58, #61–#62, #65; authenticated RPC reads with strict parsing. | HIGH; loader invalid-ID/error/leak tests. | REVIEWED_CLEAN |
| `src/features/pickup/actions.ts` — Server Actions | #57, #59–#60, #63–#64; observed-fact completion, verified photo lifecycle, authorized signing. | HIGH; action tests, SQL contracts, service/client boundary review. | REVIEWED_CLEAN |
| `src/features/pickup/pickup-controls.tsx` — admin UI | #57–#60, #63–#64; explicit checklist, disabled readiness, persisted/photo controls. | HIGH; accessibility/privacy rendering tests and React review. | REVIEWED_CLEAN |
| `src/features/pickup/renter-pickup-status.tsx` — renter UI | #61–#62, #64; confirmed instructions, safe active summary/timeline, owned photos. | HIGH; forbidden-field and state rendering tests. | REVIEWED_CLEAN |
| `src/features/pickup/types.test.ts` — DTO regression tests | #58, #61–#62, #65; accept only explicit safe response shapes. | HIGH; Vitest pass. | REVIEWED_CLEAN |
| `src/features/pickup/config.test.ts` — configuration tests | #62; trim valid values and reject missing values. | HIGH; Vitest pass. | REVIEWED_CLEAN |
| `src/features/pickup/data.test.ts` — loader tests | #58, #61, #65; invalid identifiers and private/monetary leak rejection. | HIGH; Vitest pass. | REVIEWED_CLEAN |
| `src/features/pickup/actions.test.ts` — action tests | #57, #63–#64; exact RPC facts, byte verification, no overwrite, authorization before signing. | HIGH; Vitest pass. | REVIEWED_CLEAN |
| `src/features/pickup/pickup-components.test.tsx` — UI tests | #57, #61–#62, #65; complete checklist/instructions and privacy-safe active output. | HIGH; server-rendered markup assertions pass. | REVIEWED_CLEAN |
| `src/types/database.generated.ts` — generated API contract | #57–#65; synchronize new columns and RPC overloads. | HIGH; private-schema relation finding fixed; TypeScript and CI regeneration path checked. | REVIEWED_AFTER_FIX |
| `supabase/migrations/20260816022054_add_audited_pickup_active_rental_lifecycle.sql` — forward migration | #57–#65; authoritative transaction, immutable references, safe projections, photo intents/access, grants. | HIGH; full migration replay, SQL suite, grant review, and race pass after fixes. | REVIEWED_AFTER_FIX |
| `supabase/tests/database/010_pickup_active_rental.sql` — database acceptance suite | #57–#65; positive, negative, boundary, rollback, persistence, RLS, photo, and audit cases. | HIGH; passes in disposable PostgreSQL and is wired to Supabase CI. | REVIEWED_CLEAN |
| `supabase/tests/database/003_approval_concurrency.sh` — harness/race | #61, #63–#64 and consolidated regression; include Sprint 5 suite and competing sessions. | HIGH; complete 19-migration run passes with one pickup winner and deadlock-free photo create/finalize. | REVIEWED_AFTER_FIX |
| `supabase/tests/database/009_manual_gcash_reconciliation.sql` — deterministic fixture | Consolidated regression; align historical fixture instants to one statement clock. | HIGH; prior timing flake fixed and full payment/pickup harness rerun. | REVIEWED_AFTER_FIX |

## Release boundary

Migration `20260816022054_add_audited_pickup_active_rental_lifecycle.sql` is
forward-only and repository-only. Rollback means disabling the UI or shipping a
reviewed roll-forward migration; never delete or rewrite handoff, condition,
state-history, payment, or audit records. Pickup location/contact/process must be
configured separately in each environment. A hosted migration, real operating
details, real-ID collection, equipment release, deployment, staffing/recovery
approval, and public paid launch each require separate authorization and
evidence. Production remains closed.
