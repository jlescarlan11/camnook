# Production Launch Control and First-Day Audit

Status: Sprint 8 evidence frozen on 2026-08-16; public paid-rental lifecycle
decision is **NO_GO**. Existing Production registration and the approved public
catalog remain live. No deployment, migration, hosted Auth change, catalog
mutation, session mutation, or policy activation was performed by this audit.

## Scope and authority boundary

This is the coordinating runbook for issues #88–#96. It composes the already
completed public-registration and catalog controls with the repository-only
contract, payment, pickup, return, resolution, and owner-reporting work. Closing
the Sprint 8 coordination issues records evidence and a release decision; it is
not authorization to deploy, migrate, change hosted settings, publish/archive
data, revoke sessions, or enable government-ID collection.

The current boundary is deliberately split:

- Production public email registration, OTP confirmation, Managed Turnstile,
  the Canon EOS R50 catalog, public quote, and `FOR_REVIEW` booking request were
  separately authorized and validated on 15 August 2026.
- Production currently has 13 applied migrations. The repository has 21. The
  verification, contract, payment, pickup, return/resolution, and owner-report
  migrations remain undeployed.
- Government-ID collection remains disabled. Public paid-rental activation is
  blocked by open legal/privacy issue #26 and missing contract, tax/business,
  operations, and security/recovery approvals.

Never run `supabase db reset --linked` or `supabase config push`. Production
must remain unlinked for routine local work. A future Production operation must
have a new, immediate, explicit authorization and must name the exact target.

## Machine-checked evidence bundle

The non-sensitive frozen evidence is
[`production-launch-evidence-2026-08-16.json`](production-launch-evidence-2026-08-16.json).
It records the audited repository and deployed commits, READY deployment,
ordered Production migration history, approved public catalog projection,
hosted Auth categories, aggregate identity/admin counts, prior booking-smoke
result, monitoring thresholds/signals, rollback order, every sign-off state,
and the exact blocker set.

Run:

```bash
pnpm launch:verify
pnpm launch:require-go
```

`launch:verify` succeeds only when the evidence structure, ordered migration
prefix, privacy scan, declared decision, and computed blockers agree. The
frozen Sprint 8 bundle correctly verifies as `NO_GO`. `launch:require-go`
returns a non-zero exit until all blockers are removed in a fresh evidence
bundle. Never suppress that exit code in a release workflow.

The evidence format rejects fields or values that look like renter email/phone,
OTP/session material, provider credentials, service-role keys, CAPTCHA
responses, private object paths, JWTs, or common secret prefixes. Keep message
content, identities, UUIDs, network addresses, private inventory values,
provider payloads, and query text out of issues and release notes.

## Frozen input checklist

A future candidate is eligible for `GO` only when one evidence bundle freezes
all of these facts from the same approved window:

1. exact candidate Git commit, READY Production deployment ID and its Git
   commit, application hostname, and explicit Supabase Production ref;
2. exact ordered remote migration history equal to all reviewed repository
   migrations, after Development and protected Preview validation;
3. approved public catalog slugs/count, photo/accessory counts, rates, deposits,
   sanitized availability, successful public projection, and denied private
   projection;
4. application site-key presence and compatible hosted CAPTCHA provider,
   six-digit/15-minute OTP, email confirmation, custom SMTP, native limits,
   signup-last sequence, and existing-account continuity;
5. one canonical admin record, no duplicate identity/admin record, and correct
   renter ownership/admin-route denials;
6. one approved-inventory booking smoke with exactly one request/history row,
   zero pre-approval hold, cross-account denial, and test-session cleanup;
7. the monitoring thresholds and measured signal counts below;
8. admission and catalog rollback inputs, with each recovery mutation requiring
   its own authority; and
9. approved release-owner, legal/privacy, contract-legal, tax/business,
   operations, and security/recovery sign-offs, plus the authorized active
   government-ID policy needed by the MVP verification/approval path.

Missing, stale, contradictory, or indeterminate evidence is a `NO_GO`; it is
never rounded up to acceptance.

## Release-blocking thresholds

These thresholds preserve the zero-unexplained-error contract used by the
authorized registration/catalog windows. Expected negative tests must be
identified before the window; an unexplained event is never reclassified after
the fact just to pass the gate.

| Signal | Threshold | Stop/containment rule |
| --- | ---: | --- |
| Unexplained Auth errors | 0 | Disable signup first; preserve existing login and investigate. |
| Unexplained SMTP delivery failures | 0 | Stop new OTP admission; do not increase limits to hide delivery failure. |
| Relevant Vercel warning/error/fatal events | 0 | Stop the window and retain the last compatible deployment. |
| Vercel 5xx | 0 | Stop the window; admission rollback first when authentication is implicated. |
| Supabase security-advisor errors | 0 | No migration or public-lifecycle GO. |
| Supabase API 5xx | 0 | Stop the window and reconcile every indeterminate operation by its durable reference. |
| Booking smoke failures or extra rows/holds | 0 | Do not retry blindly; reconcile the exact request/history/hold state. |

Native Auth limits remain explicit evidence rather than adjustable recovery
levers. At the 2026-08-16 audit they were four email sends per hour, thirty
verification attempts per five minutes per IP, and thirty signup/sign-in
attempts per five minutes per IP. A future plan must fit inside both Supabase
and SMTP-provider capacity without weakening abuse controls.

## Ordered activation and smoke

No step below is currently authorized. During a future approved window:

1. Freeze the before-state evidence while Production remains unchanged. Require
   `launch:verify` to pass and record its decision/blockers. Production mutations
   still require the separate approved window; do not relabel a before-state
   `NO_GO` as authorization.
2. Prove the existing renter and sole admin can authenticate. Require one
   canonical admin record and correct protected-route ownership/role checks.
3. Apply only the reviewed forward migration set through the protected manual
   workflow. Re-read the exact target and remote history before and after.
4. Deploy/promote the exact reviewed commit with the Production public
   Turnstile site key while preserving the hosted app/CAPTCHA pairing.
5. Re-prove existing-account access before any admission change. Configure and
   verify SMTP, OTP, limits, and hosted CAPTCHA. Enable signup last.
6. Check the approved catalog projection and denied private projection without
   changing catalog data.
7. Use one owner-controlled ordinary renter and the approved Canon listing for
   the controlled booking smoke. Require one `FOR_REVIEW` request/history row,
   no availability hold, no admin authority, and no foreign read.
8. Revoke only the test sessions created by the window. Do not delete the
   durable booking or history used as release evidence. Reconcile alerts and
   provider events without copying content or identities.
9. Observe the full threshold set. Freeze fresh final evidence with the exact
   post-change deployment/migration/configuration state and recovery inputs.
   Require both `launch:verify` and `launch:require-go` before declaring public
   paid launch or leaving the window active.

## Independent rollback paths

Admission rollback and catalog rollback solve different problems. Never bundle
them into a broad destructive action.

### Admission

Disable new signup first. This prevents additional identities while preserving
login for existing renters and the sole admin. If reverting to an application
that cannot submit the hosted CAPTCHA response, disable hosted CAPTCHA before
the incompatible app rollback, then restore the last known-compatible
app/Auth pairing and re-prove existing admin and renter access. Cohort bans,
session revocation, account disablement, or any containment beyond ordinary
admission closure requires separate explicit authorization. Do not delete Auth
users to revoke sessions.

### Catalog

Archive an inaccurate camera first so public projections stop returning it.
Preserve camera, booking, publication-intent, and audit history. Then use the
audited catalog-photo archive workflow to verify exact public-object removal;
never overwrite or blindly delete. An indeterminate object/database outcome
remains pending and is reconciled by its opaque publication reference. Do not
change signup just because the catalog is wrong.

Database rollback is forward-only. Do not edit/delete immutable booking,
contract, payment, handoff, condition, resolution, portfolio, or audit history.

## 2026-08-16 first-day audit and decision

Read-only checks confirmed:

- the apex and public Canon listing are available with one approved camera,
  three approved photos, five accessory records, PHP 450 daily rate, PHP 1,000
  deposit, zero busy periods, and no public private-inventory field;
- the existing sole admin reaches the owner route; Production contains two Auth
  identities and exactly one canonical admin record;
- signup, email confirmation, Managed Turnstile, application site-key pairing,
  and the previously proven signup-last/booking smoke remain recorded;
- Production migration history is the exact first 13 repository migrations;
- the current Vercel Production deployment is READY, with zero 5xx and zero
  relevant error events in the reviewed 24-hour window; and
- the Supabase security advisor has zero errors. The sampled service-log window
  had zero 5xx, and no new test session or Production mutation was created.

The same audit found release blockers:

- the READY deployment commit differs from the audited repository commit;
- eight repository migrations are not applied to Production;
- custom SMTP is currently disabled;
- a current custom-SMTP delivery signal is therefore unavailable;
- leaked-password protection is disabled and appears as one security warning;
- legal/privacy issue #26 is open and the remaining required sign-offs are not
  recorded; and
- there is no current Production mutation authorization or approved window.

The evidence-backed decision is therefore **NO_GO** for the public paid-rental
lifecycle. The audit left Production unchanged: existing registration and the
approved catalog remain available, repository-only paid lifecycle code remains
undeployed, and government-ID collection remains disabled.
