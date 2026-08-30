# Production Launch Control and First-Day Audit

Status: calendar/handoff/meetup release is **NO_GO** as of 21 August 2026. The
candidate contains 26 migrations while the last verified Production evidence
contains 22. The Development provider check, protected Preview story, current
hosted monitoring, owner-approved camera policy, Production provider controls,
and rollback rehearsal are not verified. Production remains unchanged.

A reviewed merge to protected `main` authorizes that revision's forward schema
migrations and gated application promotion. Successful automatic CI first runs
the Development database gates. After they pass, one protected Production
approval authorizes staging an unaliased Production candidate; the same immutable
SHA must then pass the Production database gates before that exact deployment is
promoted. Online government-ID collection is retired and must remain disabled;
calendar, handoff, and meetup flags are forced false in the staged artifact and
remain a separate activation decision.

## Automated immutable-SHA release

`.github/workflows/release.yml` is the only automated hosted release path. It
uses one non-cancelling concurrency lock and the protected `development` and
`production` GitHub environments. Vercel Git deployment from `main` is disabled
by `vercel.json`; a merge cannot independently move the Production aliases.

The enforced order is CI → automatic Development
dry-run/apply/history/hosted manifest/advisors → protected Production approval →
staged READY/unaliased Production candidate → Production
dry-run/apply/history/read-only hosted manifest/advisors → promote the exact
candidate → public smoke. Every mutation boundary rechecks the exact current
`main` SHA and environment/project identity. A newer `main` SHA supersedes an
older queued release before it can mutate the next environment or promote.

A failed or indeterminate database command is followed by read-only migration
history reconciliation and is never blindly retried. A failed or indeterminate
promotion is reconciled against the live alias. If post-promotion smoke fails,
the workflow restores the previously recorded application deployment while
leaving compatible forward schema and migration history intact. Raw provider
responses, deployment logs, SQL, secrets, and user-linked data are not release
evidence.

`workflow_dispatch` is emergency reconciliation, not a bypass. Dispatch the
workflow from `main`, supply the full current `main` SHA, type
`RELEASE_EXACT_MAIN`, and provide a bounded audit reason. Admission also proves
that exact SHA already has a successful automatic main-push CI run; automatic
Development verification, Production approval, candidate staging, Production
verification, and promotion gates still run. Never edit an applied migration,
repair history to hide a failure,
reset a hosted database, or use a manual Vercel deployment as recovery.

## Scope and authority boundary

This runbook composes the public-registration and catalog controls with the
contract, payment, pickup, return, resolution, and owner-reporting lifecycle.
It records the exact release evidence and forward-only recovery boundary.

The current boundary is deliberately split:

- Production public email registration, OTP confirmation, Managed Turnstile,
  the Canon EOS R50 catalog, public quote, and `FOR_REVIEW` booking request were
  separately authorized and validated on 15 August 2026.
- Production has the first 21 migrations after the authorized remediation run;
  the repository has 22 with the in-person identity replacement.
- Government-ID collection remains disabled. The owner approved the minimized
  Philippine-law physical-check policy and the contract, business, operations,
  release, and security/recovery sign-offs on 16 August 2026 without claiming
  outside-counsel or accounting review.

Never run `supabase db reset --linked` or `supabase config push`. Production
must remain unlinked for routine local work. The automated workflow binds the
Production project ref and exact Development-verified revision; other Production
operations still require explicit authorization and an exact target.

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
prefix, privacy scan, declared decision, and computed blockers agree.
`launch:require-go` returns a non-zero exit until all blockers are removed in
fresh post-release evidence. Never suppress that exit code in a release workflow.

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
   operations, and security/recovery sign-offs, plus proof that online ID
   collection is disabled and the in-person pickup check is required.

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

During the owner-authorized release window:

1. Freeze the before-state evidence while Production remains unchanged. Require
   `launch:verify` to pass and record its decision/blockers. Forward schema
   migration authorization comes from the reviewed `main` merge; hosted setting,
   data, runtime-policy, and deployment mutations still require the separate
   approved window. Do not relabel a before-state `NO_GO` as launch authorization.
2. Prove the existing renter and sole admin can authenticate. Require one
   canonical admin record and correct protected-route ownership/role checks.
3. Confirm the automatic Production workflow applied the exact
   Development-verified `main` SHA after its dry run, and reconcile the remote
   history before and after. Do not substitute a local manual migration.
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

## 2026-08-16 remediation decision

The owner explicitly authorized remediation and launch after the frozen audit:

- Production migrations 14–21 were applied and their history verified;
- the pgTAP-dependent hosted assertion was replaced with a plain SQL check so
  Production validation does not require an optional extension;
- Vercel was reconnected to the GitHub repository because the missing project
  link—not a failed merge—caused the deployed-commit drift;
- migration 22 removes the online-verification prerequisite and requires only a
  physical original-ID check at pickup, without retaining ID details;
- existing Resend credentials are reused for free custom SMTP;
- leaked-password screening is not applicable to the app's passwordless OTP
  surface, while a 15-character hosted minimum remains defense in depth; and
- the owner approved the contract, privacy, tax/business, operations, release,
  and security/recovery states for the MVP, without representing that outside
  legal or accounting counsel reviewed them.

The final decision is written only after the exact merge commit is deployed,
migration 22 is present in both hosted projects, Production Auth is verified,
the public surface is healthy, and `launch:require-go` passes.

## 2026-08-21 calendar, handoff, and meetup preflight

The machine evidence schema now includes a `meetupRelease` gate. It cannot
produce `GO` until the candidate gates, bounded Development provider check,
protected Preview story, privacy review, Production provider/config controls,
at least one owner-approved camera policy, and a disable-first rollback
rehearsal all pass. A provider key value, precise coordinate, venue token,
private lender anchor, raw response, or user-linked address is never evidence.

Follow [`calendar-handoff-meetup-rollout.md`](calendar-handoff-meetup-rollout.md)
for the exact environment order. In the current unauthorized window,
`pnpm launch:verify` must report `NO_GO` and `pnpm launch:require-go` must exit 2.
Do not reinterpret that expected exit as a test failure or bypass it.
