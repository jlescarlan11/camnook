# Public Renter Registration Runbook

Status: Development and protected Preview validated on 2026-08-14; Production pending separate explicit approval
Targets: Development Supabase `ekmoiepalelqpmemvrkl`, protected Vercel Preview;
Production only after separate explicit approval

## Purpose and safety boundary

CamNook uses one public email-OTP flow for registration and sign-in. Supabase may
provision a missing Auth identity when it accepts the OTP request; successful
verification is required before a usable local session exists. No application
profile, booking, or admin record is created by the request or verification
flow. The resulting identity is an ordinary renter. Administrative authorization
continues to require the explicit singleton record in
`private.admin_accounts`; Auth metadata, email, and profile data never grant it.

This runbook does not open government-ID upload or review, private verification
document reads, contract signing/PDF generation, payments, paid/submitted-
payment cancellation acceptance, handoff, refunds, or any other launch gate.

Never run either prohibited command:

- `supabase db reset --linked`
- `supabase config push`

Immediately before every hosted mutation, run:

```bash
cat supabase/.temp/project-ref
```

The only acceptable result for Development/Preview work is exactly
`ekmoiepalelqpmemvrkl`. A missing or different value is a hard stop. Production
must not be locally linked; any authorized Production operation must explicitly
name project ref `iegcixcevvkryfwfotqz`.

Never record an email address, OTP, session token, CAPTCHA response/secret,
SMTP credential, provider body, private object URL, or deployment-protection
bypass value in GitHub, Git, screenshots, logs, or release notes.

## Application contract

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is an optional browser-visible environment
  record. Set it only to the site key created for that environment.
- The Turnstile secret is configured only in the matching hosted Supabase Auth
  project. It does not belong in Vercel or repository environment files.
- With a site key, OTP request and resend remain disabled until the challenge
  succeeds, and each attempt consumes and resets its response.
- Without a site key, the challenge is not rendered. Do not enable hosted
  CAPTCHA until the exact application deployment has the matching site key.
- OTP delivery, throttle, CAPTCHA, and verification failures use constrained UI
  categories. The application logs only error name/code/status metadata.
- The pending-login cookie contains the normalized email and a sanitized return
  destination, is HTTP-only, and is written only after an accepted send request.

## Completed Development and protected Preview activation

The following sequence was completed on 14 August 2026. Retain it as the audit
and recovery order; do not replay hosted mutations without a new authorized
window and fresh before-state checks.

1. Record the exact candidate Git SHA and confirm local lint, typecheck, the
   complete Vitest suite, build, database authorization invariants, database
   lint/advisors, and secret scan results.
2. Confirm the ignored project link using the mandatory command above. Record
   the current hosted Development setting categories without secret values:
   global/email signup, OTP length/expiry, same-user resend interval, project
   OTP-send limit, verification limit, CAPTCHA state/provider, Site URL and
   redirect allowlist, custom SMTP presence, and recent Auth failures.
3. In the SMTP provider surface, confirm the sending domain is authenticated,
   the current plan and daily/monthly capacity can contain the reviewed Supabase
   project limit, recent delivery/bounce events are explainable, and a named
   operator knows where to monitor volume. Do not copy message content.
4. Create or verify a Cloudflare Turnstile widget restricted to the reviewed
   Development/Preview hostnames. Record only the provider and public hostname
   coverage; do not record either key.
5. Add the public site key only to Vercel Preview scope. Re-read all Preview
   application records and confirm Supabase values point only to Development,
   no secret is public, and Deployment Protection remains enabled.
6. Deploy the exact candidate to protected Preview. Confirm READY state, exact
   Git SHA, Development-only environment, and the accessible challenge on both
   request and resend forms before changing hosted Auth.
7. Re-run the mandatory project-ref check. In hosted Development Auth, configure
   the Turnstile secret/provider, reviewed native send/resend/verification
   limits, existing six-digit/15-minute OTP contract, custom SMTP, and reviewed
   URL allowlist. Do not claim an application-defined per-IP OTP-send control;
   this publishable-key Server Action does not forward end-user IPs.
8. Before enabling signup, confirm an unknown email receives the same
   pending-verification response shape as an existing email even though hosted
   Auth sends no message for the unknown account while signup is disabled. This
   temporary fail-closed behavior prevents account enumeration; do not treat it
   as delivery success.
9. Enable hosted Development email signup only after steps 1–8 pass. Re-read the
   setting categories to verify the intended before/after delta.

Completion checkpoint:

- Development public signup and Turnstile CAPTCHA are enabled. The widget is
  restricted to `localhost` and the exact protected Preview hostname; the
  matching secret remains only in Development Supabase Auth.
- Custom SMTP and the six-digit, 15-minute OTP template were proven with actual
  owner-controlled delivery. The Development email-send ceiling remains four
  per hour for protected manual QA.
- Protected Preview remained behind Vercel SSO and passed public registration,
  OTP verification, profile onboarding, authoritative quote, and `FOR_REVIEW`
  booking submission against the published Development Canon EOS R50 fixture.
- The smoke proved one-day pricing of PHP 450 plus a PHP 1,000 refundable
  deposit, no pre-approval inventory hold, owner-only profile/booking reads,
  ordinary-renter admin denial, safe logout redirects, and zero retained Auth
  sessions for the QA renter.
- At the issue #8 checkpoint, Production remained unchanged: signup and CAPTCHA
  were disabled, zero cameras were published, and the confirmation-link
  template still awaited an approved OTP conversion. The final non-sensitive
  checkpoint was posted on 14 August 2026, and issue #8 was closed without
  changing any Production resource.

If any step fails before signup enablement, keep signup disabled. If CAPTCHA is
enabled and the Preview cannot submit a valid response, disable hosted signup
first, then restore the last known-compatible CAPTCHA/app configuration.

## Development/Preview validation matrix

Use owner-controlled, non-production identities and separate browser contexts.
Keep repeated email tests below the reviewed sender capacity.

- Unknown email: request, verify once, confirm exactly one ordinary Auth user and
  session, and confirm the sanitized protected destination.
- Existing renter and sole admin: sign in without duplicate identities; confirm
  the existing admin retains sole authorization.
- OTP failures: malformed input performs no provider call; invalid, expired,
  reused, missing-pending, and wrong-email recovery remain safe.
- Abuse controls: missing/expired/invalid challenge prevents a send; a fresh
  challenge permits it; controlled resend proves the same-user window and safe
  429 UX; retry succeeds only after the documented recovery interval.
- Profile: save legal name and phone, reload, and confirm only the authenticated
  renter's active profile is returned.
- Booking continuity: preserve camera/pickup/return through login and submit/read
  a `FOR_REVIEW` request against a clearly non-production Development fixture.
  No pre-approval hold may be created. If Development inventory is absent, use
  the approved Development rehearsal from the catalog runbook or keep this
  release blocked; do not copy Production data. A recorded blocker is not
  acceptance evidence, and Production rollout cannot begin until this path
  passes end to end.
- Authorization: the new renter cannot access `/admin`, pass `api.is_admin`,
  insert `private.admin_accounts`, execute approval/rejection behavior, or read a
  second renter's profile/booking.
- UX: check narrow mobile and desktop layouts, keyboard order, labels, focus and
  error association, challenge expiry/reset, pending/disabled controls, resend,
  failure, and recovery.
- Observability: inspect browser console/network metadata, Vercel runtime logs,
  Supabase Auth logs, and SMTP provider delivery/quota surfaces for expected
  categories and unexplained failures without copying sensitive content.
- Logout: sign out each test context, confirm protected routes redirect, then
  revoke any remaining test sessions before optional disposable-user cleanup.

After validation, compare Production Auth setting categories, Vercel application
records/deployment SHA, database migration history/counts, and user/session
counts to the recorded pre-check. This is read-only proof that Production did
not change.

## Production rollout gate and rollback

Production activation requires explicit owner approval immediately before any
Production Auth, Vercel, deployment, or data mutation. Issue creation, a merged
PR, or successful Preview validation is not that approval.

The approved release must reuse the exact verified app/CAPTCHA/rate-limit/SMTP
contract and record before state. Order the compatibility boundary exactly:

1. Add only the Production public site key to the Vercel Production scope.
2. Deploy/promote the exact reviewed CAPTCHA-capable SHA while hosted Production
   CAPTCHA and signup remain disabled.
3. Confirm both OTP forms render and can obtain a challenge response, without
   requesting an email.
4. Configure the matching Production hosted CAPTCHA secret/provider. Immediately
   prove the existing admin can request and verify a code through the new app.
5. Enable Production email signup only after admin continuity and all other
   before/after checks pass.
6. Run registration, profile, admin denial, ownership-RLS, booking continuity,
   and logout smoke checks, then revoke every test session.

Never enable hosted CAPTCHA while a deployment that cannot submit its token is
active: that interval would block the sole admin as well as renters.

Rollback has two pre-approved meanings. The ordinary **admission rollback**
disables Production signup first, stops creation of additional identities, and
retains login for renters already created during the public window. It does not
restore an invited-only/private population. Keep the CAPTCHA/app pairing
compatible: disable hosted CAPTCHA before rolling back to an app that cannot
submit it, then restore the last compatible Auth settings and deployment.

If the release owner instead pre-approves **containment to the pre-launch
population**, record the exact non-admin cohort from before/after Auth evidence,
preserve the explicit admin record/account, revoke every cohort session, and
disable/ban those non-admin Auth accounts using the hosted Auth control before
claiming private admission is restored. This impacts real users and must not be
inferred during an incident. Do not delete Auth users as a session-revocation
mechanism. In either rollback mode, confirm the existing admin can sign in and
that unrelated gates remain closed.

The real Production camera catalog remains a separate data release with its own
business-approved inventory, photo inputs, authorization, and rollback control.

## Completed Production rollout and validation

The separately authorized Production rollout completed on 15 August 2026. The
reviewed application candidate at Git SHA
`f4d58360ec4a019957434dd87680bbfb2da33c54` is READY as Vercel deployment
`dpl_DChPZu3dayB9hr9XsiJjix7uWDsE` on the apex and `www` redirect. Deployment
`dpl_Ap9aYHRdCUacr9BbAy59ff8uEWCb` remains the verified application rollback
artifact.

Production Supabase remained explicitly targeted as
`iegcixcevvkryfwfotqz`, while the local CLI link remained Development
`ekmoiepalelqpmemvrkl` before every mutation. Hosted signup, Managed Turnstile,
the six-digit/15-minute code contract, reviewed native limits, custom SMTP, and
the redirect allowlist now match the validated release contract. Both the
first-time confirmation template and existing-user magic-link template render
the code rather than a confirmation URL.

The smoke validation proved one previously unknown owner-controlled identity
could verify once, persist one active renter profile, receive no admin row or
authority, and read only its own records. The existing sole admin retained
access. After the separately authorized real catalog publication, the renter
submitted and read one owner-scoped `FOR_REVIEW` request with a one-day PHP 450
rental estimate, PHP 1,000 deposit, and no pre-approval availability hold.
Invalid/replayed codes, missing CAPTCHA, controlled rate limiting, direct admin
access, private projections, and unrelated launch gates remained fail closed.

The final window showed no Vercel warning/error/fatal event or 5xx and no severe
Supabase Auth, Postgres, or Storage event. Observed Auth warnings were limited to
the deliberately exercised OTP replay/expiry, CAPTCHA refusal, rate limit, and
platform deprecation notices. Both smoke sessions were revoked, Production
reported zero remaining renter/admin smoke sessions, and signed-out protected
routes redirected to login. No renter identity, OTP, token, private object path,
provider payload, or secret is retained in this record.
