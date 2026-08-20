# Calendar, handoff, and meetup release acceptance

Status: issue #105 is **PARTIALLY SATISFIED / NO_GO** on 2026-08-21. Local and
repository-controlled release work is complete. Hosted Development/Preview and
Production activation are blocked by an authorized Geoapify account/key, hosted
migrations/configuration, owner-approved policy data, a protected Preview, and a
separately authorized Production window.

## Acceptance matrix

| Criterion | Evidence | Status |
| --- | --- | --- |
| Exact candidate gates | Lint, typecheck, 495/496 Vitest, full SQL/concurrency, and feature-enabled build pass for `3b44ad569d01060b0b0c2a03d74cab6cdb64e3c4`. | PASS |
| Exact hosted target preflight | Workflows pin Development/Production refs and exact SHAs; no hosted command ran successfully in this task. | PARTIAL |
| Full protected Preview story | Local failure/responsive state reviewed; hosted schema/provider absent. | BLOCKED |
| Non-PHT browser behavior | Calendar/date unit coverage passes; hosted multi-timezone Preview is not run. | BLOCKED |
| Failure/recovery matrix | Unit/component/SQL/concurrency tests cover permission, stale, expiry, malformed/empty/quota classes, races, atomic rollback, and legacy behavior. Live provider/lost-network Preview remains. | PARTIAL |
| Authorization boundaries | Direct role/RPC, RLS owner/admin, strict projection, and action-binding tests pass. | PASS |
| Privacy evidence | Source/action/log/row/audit schemas exclude renter coordinates, provider IDs, secrets, tokens, private anchors, and raw payloads. Hosted network/log review remains. | PARTIAL |
| Legacy compatibility | Database, contract, booking, pickup, and return regressions pass with snapshot-less legacy rows. | PASS |
| Production preflight | Last verified Production evidence is 22/25 migrations; provider, policy, monitoring, and rollback evidence are unavailable. | BLOCKED |
| Missing prerequisite is no-go | Schema-v3 machine evidence computes ten explicit blockers and `launch:require-go` exits 2. | PASS |
| Controlled Production smoke | Forbidden by the current task and missing prerequisites. | BLOCKED |
| History-preserving rollback | Exact disable order and retention contract are documented/tested at the flag/unit boundary; hosted rehearsal remains. | PARTIAL |
| Observation window | No authorized hosted window exists. | BLOCKED |
| Safe evidence | Strict schema/privacy scan rejects unknown/sensitive fields and records only safe identifiers/categories. | PASS |

## High-assurance reviews

Lane A reviewed privacy, authorization, provider/client boundaries, RLS, atomic
state, immutable contract data, and audit/log minimization. It removed unused
provider identifiers from both durable rows and the encrypted client reference.
Lane B reviewed UX, expiry/staleness, confirmation binding, accessibility,
responsive behavior, legacy fallback, rollout order, and lost-response recovery.
It bound checkbox confirmation to the exact current recommendation and made the
release evidence fail closed on every unverified hosted prerequisite.

## Change-set accounting

| Unit | Responsibility | Disposition |
| --- | --- | --- |
| CI and Development workflow | Exercise migrations 13–15 and feature-enabled build; run hosted policy/RLS/atomic checks after Development migration. | REVIEWED |
| Evidence schema v3 | Make provider, Preview, policy, Production config, privacy, and rollback facts mandatory GO inputs. | REVIEWED_AFTER_FIX |
| Fresh NO_GO evidence | Freeze the 25-migration candidate against last verified 22-migration Production state without claiming a hosted mutation. | REVIEWED |
| Provider/runbook docs | Define manual city boundary, target checks, disabled-first rollout, smoke, privacy evidence, and nondestructive rollback. | REVIEWED |
| Validator tests | Preserve prior NO_GO/GO, drift, privacy, contradiction, and threshold coverage with all new meetup gates. | REVIEWED |

## Release boundary

No source issue was closed or edited. No merge, deployment, hosted migration,
credential/configuration change, listing policy mutation, Production smoke,
session mutation, or rollback action occurred. A future authorized operator must
replace every `UNAVAILABLE`/false/zero meetup evidence fact with verified safe
evidence from one exact candidate window before `GO` can be declared.
