# Sprint 8 Production Launch Readiness Acceptance

Status: issues #88–#96 completed as an evidence-backed **NO_GO** on 2026-08-16.
The prior authorized registration/catalog windows remain valid; this Sprint 8
work made no Production change and does not authorize a future one.

## Decision and risk

Every issue is **HIGH** risk because it touches live admission, authentication,
private identity boundaries, serialized real inventory, migration state,
rollback, or operational evidence. The correct integrated outcome is not a new
deployment: Production has 13/21 migrations, the deployed commit differs from
the audited repository, custom SMTP and leaked-password protection are off,
legal/privacy issue #26 is open, other launch sign-offs are absent, and no
Production mutation window is authorized.

The implementation adds an executable, privacy-scanned release-evidence
contract and one coordinating runbook. A coherent `NO_GO` verifies; a release
command fails until the exact blocker set is empty.

## Acceptance-criteria matrix

| Criterion | Source | Direct evidence and behavior | Status |
| --- | --- | --- | --- |
| S8-88-1 | #88 scope | One runbook coordinates catalog, migrations, OTP/Turnstile, smoke, monitoring, sign-offs, and rollback without performing a Production mutation. | SATISFIED |
| S8-88-2 | #88 exit | `productionMutationAuthorized=false`; `launch:require-go` exits non-zero; future recovery/activation remains separately authorized. | SATISFIED |
| S8-89-1 | #89 AC1 | Fresh anonymous UI shows exactly the published Canon listing; prior Production evidence verifies three approved photo records and private-staging cleanup. | SATISFIED |
| S8-89-2 | #89 AC2 | Fresh UI and frozen evidence agree on PHP 450/day, PHP 1,000 deposit, five accessory records, and zero busy periods. | SATISFIED |
| S8-89-3 | #89 AC3 | Prior anonymous column/bucket denials plus the current public projection expose no serial, cost, note, renter, or private object detail. | SATISFIED |
| S8-90-1 | #90 AC1 | The authorized activation proved app CAPTCHA, six-digit/15-minute OTP, custom SMTP, and limits together. Fresh audit records SMTP/security drift as blockers rather than claiming continued GO compatibility. | SATISFIED |
| S8-90-2 | #90 AC2 | Prior activation proved admin sign-in before signup; fresh authenticated route check proves the canonical sole admin still reaches the owner queue. | SATISFIED |
| S8-90-3 | #90 AC3 | Historical evidence records signup-last ordering. Runbook and validator require admission rollback to disable signup first while preserving existing login. | SATISFIED |
| S8-91-1 | #91 AC1 | Frozen booking smoke identifies exact authorized deployment/Git commit and the 13-migration Production history. Current READY deployment and Git commit are separately frozen. | SATISFIED |
| S8-91-2 | #91 AC2 | Smoke used the owner-approved Canon EOS R50, not a demo or invented Production fixture. | SATISFIED |
| S8-91-3 | #91 AC3 | Smoke sessions were revoked. The one request/history record is durable audit evidence, not a disposable row to delete; the current audit created no test session. | SATISFIED |
| S8-92-1 | #92 AC1 | Runbook freezes zero-unexplained-error thresholds for Auth, SMTP, Vercel runtime/5xx, advisor/API 5xx, and booking anomalies; evidence records counts and blocks GO because the current custom-SMTP signal is unavailable. | SATISFIED |
| S8-92-2 | #92 AC2 | Admission recovery's mandatory first action is `DISABLE_SIGNUP`; existing login is preserved. | SATISFIED |
| S8-92-3 | #92 AC3 | Evidence and validator require separate recovery authorization; no rollback mutation was inferred or executed. | SATISFIED |
| S8-93-1 | #93 AC1 | JSON freezes audited/deployed commits, deployment ID/state, exact ordered migrations, catalog/Auth categories, monitoring, and rollback inputs. | SATISFIED |
| S8-93-2 | #93 AC2 | All six required sign-off categories have an explicit state/source. The validator permits `GO` only when every state is `APPROVED`; current missing/open states produce blockers. | SATISFIED |
| S8-93-3 | #93 AC3 | Computed decision is `NO_GO`; no audit mutation occurred, repository-only lifecycle stays undeployed, and government-ID policy stays disabled. | SATISFIED |
| S8-94-1 | #94 AC1 | Prior before/after activation evidence covers existing renter/admin; fresh admin route and identity-count checks provide current continuity evidence. | SATISFIED |
| S8-94-2 | #94 AC2 | Production has two aggregate Auth identities and one canonical singleton admin record; signup smoke created no admin record. | SATISFIED |
| S8-94-3 | #94 AC3 | Prior cross-account/admin denial plus fresh owner-route authorization preserve ownership/role boundaries; current code regressions remain covered by RLS/application suites. | SATISFIED |
| S8-95-1 | #95 AC1 | Admission rollback order is machine-checked as signup-first and existing-login preserving. | SATISFIED |
| S8-95-2 | #95 AC2 | Catalog rollback is machine-checked as archive-first, history-preserving, and non-deleting. | SATISFIED |
| S8-95-3 | #95 AC3 | Rollback requires hosted CAPTCHA to be disabled before an incompatible app rollback and requires re-proving the compatible app/Auth pair. | SATISFIED |
| S8-96-1 | #96 AC1 | Fresh read-only audit reviewed Auth settings/limits, SMTP state, Vercel runtime, Supabase migrations/advisor/log sample, public catalog, admin access, and prior booking smoke. | SATISFIED |
| S8-96-2 | #96 AC2 | Prior smoke sessions are revoked, durable smoke history is intentionally retained, no new disposable state was made, and current warning/blocker categories are reconciled. | SATISFIED |
| S8-96-3 | #96 AC3 | Evidence contains aggregates and public release identifiers only; validator rejects renter contact, OTP/session/provider secrets, private object paths, JWTs, and common secret values. | SATISFIED |

## Validation and adversarial review contract

Run:

```bash
pnpm launch:verify
pnpm launch:require-go
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

`launch:verify` must report the exact frozen `NO_GO`. `launch:require-go` must
exit 2 until all blockers are removed in fresh evidence. Tests cover coherent
NO_GO/GO records, decision mismatch, migration-order drift, monitoring breaches,
privacy leaks, and false claims that a no-go changed Production.

The security/privacy review checks exact target binding, secret/PII exclusion,
sole-admin/ownership evidence, no authority expansion, and independent
admission/catalog recovery. The data/state/operations review checks ordered
migration prefix, commit/deployment drift, durable booking evidence versus
disposable sessions, zero-error thresholds, sign-off completeness, and the
forward-only/history-preserving boundary.

Lane A initially found that an evidence object could carry an unknown field and
that the privacy regression covered contact data but not a provider-secret
value hidden in an allowed free-text field. The schema now rejects every unknown
key at every object boundary, scans allowed strings for contact/JWT/provider
secret patterns, and has direct negative tests. Lane B initially found that a
disabled custom-SMTP surface could be represented as zero failures without
stating that current delivery monitoring was unavailable, that contradictory
Auth/advisor facts were not rejected, and that the activation checklist invoked
the final GO command too early. The evidence now records per-signal
availability, fixes release-blocking thresholds at zero, computes an
unavailable-signal blocker, cross-checks Auth/advisor and monitoring/database
facts, and separates before-state verification from the post-change final GO
gate. A final `GO` additionally requires the authorized paid lifecycle and
government-ID policy to be active. Fresh complete Lane A and Lane B passes found
no remaining actionable issue.

## Change-set accounting

| Change unit | Contract and evidence | Disposition |
| --- | --- | --- |
| Launch evidence library and CLI | Strict schema, exact blocker computation, ordered migration-prefix check, privacy scan, `--require-go` fail-closed exit. | REVIEWED_AFTER_FIX |
| Launch verifier tests | NO_GO, GO, mismatch, migration drift, privacy, unchanged-state, contradiction, and threshold negative cases. | REVIEWED_AFTER_FIX |
| CI, package scripts, and pre-push gate | Every PR/push verifies the frozen decision; the explicit GO command remains a release-only blocking check. | REVIEWED |
| Frozen 2026-08-16 evidence | Exact public identifiers, aggregate hosted facts, monitoring availability, rollback, sign-off states, blockers, and sources. | REVIEWED_AFTER_FIX |
| Production launch runbook | Scope, thresholds, freeze inputs, ordered activation, smoke, independent rollback, first-day audit, current NO_GO. | REVIEWED_AFTER_FIX |
| Registration/catalog/current-status docs | Reconciles completed 2026-08-15 releases and current 13/21 migration/Auth drift. | REVIEWED |
| This acceptance record | Criterion-by-criterion #88–#96 accounting and integrated release boundary. | REVIEWED |

## Release boundary

This change is repository-only. It does not deploy, migrate, enable/disable
signup, change CAPTCHA/SMTP/limits, publish/archive a camera, revoke a session,
delete a smoke record, activate government-ID policy, move money, or merge.
A future Production action needs a fresh evidence bundle, all approvals, and a
separate explicit mutation window.
