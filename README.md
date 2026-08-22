# CamNook

CamNook is a single-owner camera-rental application with a database-authoritative
paid-rental lifecycle, passwordless email sign-in, and an in-person pickup
identity check. The current Production decision is recorded by the
machine-checked launch evidence rather than this overview.

## Stack

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS
- Supabase Auth, PostgreSQL 17, Row Level Security, and Storage
- pnpm and Vitest
- Vercel's default Node.js runtime for Preview and Production deployments

All JavaScript package versions are exact-pinned. Development and Production
are isolated. Repository tests do not seed or reset either hosted database.

## Environment boundaries

| Environment | Supabase/Vercel target | Durable boundary |
| --- | --- | --- |
| Local | Local application and, when intentionally started, local Supabase services | `.env.local`, `supabase/.temp`, and `.vercel` are ignored machine-local state, not committed configuration. |
| Development | Supabase `CamNook Development` (`ekmoiepalelqpmemvrkl`), Tokyo / `ap-northeast-1` | The ignored local project ref points here for hosted migration work. Production must not be linked for routine development. |
| Preview | Vercel Preview backed only by the Development Supabase project | Preview has Deployment Protection. Use an authenticated Vercel session for smoke tests; do not weaken protection. |
| Production | Supabase `CamNook` (`iegcixcevvkryfwfotqz`) and [camnook.shop](https://camnook.shop) | Live and isolated. A reviewed merge to protected `main` authorizes the exact-SHA schema gates and application promotion after CI and Development verification succeed. Hosted configuration and runtime/data activation remain separate controls. |

Vercel Preview has exactly two app-owned, Preview-scoped Supabase records:
`NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; Production keeps separate Production
records. Vercel platform-provided variables are separate from those application
records. `NEXT_PUBLIC_` values are browser-visible and must never contain a
secret/service-role key or other privileged material. Do not store credentials,
user UUIDs, SMTP values, or deployment-protection bypass material in repository
documentation.

## Local application

Copy `.env.example` to `.env.local`, then set the project URL and publishable
key. Never expose a Supabase secret/service-role key with a `NEXT_PUBLIC_`
prefix.

When hosted Auth CAPTCHA is enabled for an environment, also set
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` to that environment's browser-visible
Cloudflare Turnstile site key. The matching secret belongs only in the target
Supabase project's hosted Auth configuration; it must never be placed in Git,
Vercel, or a browser bundle.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Verification commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm install` also configures the tracked `.githooks/pre-push` hook for this
checkout. Before Git sends commits, the hook requires a clean tracked worktree,
checks the outgoing diff for conflict markers and whitespace errors, and runs
`pnpm verify:push`. The verification command executes all four application
checks above and blocks the push on the first failure. Run `pnpm prepare` to
restore the hook configuration if Git settings are reset. The PostgreSQL and
Supabase suites remain mandatory CI checks because their local prerequisites
are platform-specific.

## Database development

Migrations live in `supabase/migrations/`; database assertions live in
`supabase/tests/database/`. Docker-backed local services are optional tools,
not an unconditional prerequisite. In a healthy local Docker setup, this is a
local-only workflow:

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:test:concurrency
pnpm db:types
```

The exact no-argument `pnpm db:reset` command shown above targets Local. Never
forward `--linked` through it (including `pnpm db:reset -- --linked` or any
equivalent), and never run a direct `supabase db reset --linked`; those forms can
reset a hosted project. Do not start, reset, or prune Docker as CamNook
troubleshooting; Docker may contain unrelated local data. The socket-only
`pnpm db:test:concurrency` harness does not require Docker. It requires Homebrew
`postgresql@17`, creates a socket-only disposable cluster, applies all
migrations, runs the domain/authorization invariants and real two-session
approval, contract, payment-submission, payment-decision, and pickup races; it
also runs the return/cancellation/deposit and owner-portfolio acceptance suites
before removing the cluster. It refuses a caller-supplied
`DATABASE_URL`, so it cannot be redirected to a developer or hosted database.

The repository currently contains twenty-two forward migrations. On 13 August 2026,
the four booking-milestone migrations were applied to Production through a
separately authorized, database-first rollout after Development/Preview
verification, leaving both hosted projects at 11/11 at that checkpoint. On 14
August 2026, the catalog-photo publication and unpublished-availability
migrations were applied and exercised in Development. On 15 August 2026, those
two catalog migrations were separately applied and exercised in Production,
bringing it to 13 migrations, while the Sprint 1 government-ID evidence
migration was applied to Development with its policy disabled and verified with
hosted fail-closed and cross-owner RLS tests. Development was recorded at 14/21
while Production was at 13/21. On 16 August 2026, successful `main` CI and the
automatic Development rollout brought Development to 21/21; an authorized
Production run then applied and verified the same 21 migrations. Migration 22
replaces online government-ID collection with a mandatory in-person pickup
check. It remains pending in each hosted project until this release candidate
passes CI and the automatic Development-to-Production migration chain.
Treat those counts as recorded release evidence, not a substitute for checking
current remote migration history before any future action.

Hosted database verification is intentionally separate from the exhaustive
empty-database suites. `supabase/tests/hosted/manifest.json` is the only allowed
hosted SQL manifest. Every entry is transaction-bound, rollback-only, and
validated before network access; Development-safe entries reuse the canonical
administrator rather than inserting another singleton row. The disposable
PostgreSQL 17 harness seeds a production-shaped admin, legacy camera, and legacy
booking, runs the exact Development manifest twice, and proves that durable row
data is identical before and after both passes. Do not add a database invariant
to the hosted manifest merely because it passes after `db reset`; keep exhaustive
fixtures under `supabase/tests/database/` and add only narrowly scoped hosted
smoke coverage.

The hosted runner never prints submitted SQL, raw API responses, curl stderr,
credentials, project refs, or user-linked values. A deterministic failure emits
only allowlisted fields such as HTTP status, SQLSTATE, normalized category, and
a safe constraint name. Transport, timeout, rate-limit, and 5xx failures are
reported as indeterminate with `reconcile_before_retry=true`: inspect linked
migration history and hosted state before rerunning, because an interrupted
request may already have executed. Response material is quarantined in temporary
files and removed on every exit path.

For a hosted Development migration, keep the change migration-first and
forward-only. Immediately before **each** command that can inspect or mutate
the linked hosted database, verify the ignored local link:

```bash
cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm dlx supabase@2.114.0 db push --linked --dry-run

cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm dlx supabase@2.114.0 db push --linked
```

Treat a missing or different result as a hard stop. Recheck changing flags
against the pinned CLI's `--help` before use. Never:

- run `supabase db reset --linked`, because it can destructively reset a hosted
  project;
- run `supabase config push`, because `supabase/config.toml` contains local
  defaults that intentionally differ from hosted Auth;
- link Production for routine development, because a generic linked command can
  then target the live database; or
- reset or prune Docker as part of CamNook work.

The application supports public email-OTP registration and sign-in: a missing
email is eligible for an ordinary renter identity, and successful verification
is required before a usable local session exists.
Administrative authority remains a separate database record in
`private.admin_accounts`; signup never grants it. Hosted Development Auth has
public email signup and Cloudflare Turnstile CAPTCHA enabled after the
protected-Preview activation and smoke test. It sends a six-digit email OTP with
a 15-minute expiry through proven custom SMTP; the Development email-send
ceiling remains four per hour for protected manual QA. Production signup,
Managed Turnstile, email confirmation, and the code-based template were
separately activated and validated on 15 August 2026. Production Auth is
configured through the protected release workflow to use the existing Resend
credential and free SMTP allowance. CamNook uses email OTP only and exposes no
password signup or sign-in path, so paid leaked-password screening is not an
applicable launch dependency; the hosted minimum password length is still set
to 15 as defense in depth. Hosted settings are the
operational truth; the local `supabase/config.toml` is not a pushable copy of
them. SMTP and CAPTCHA secrets remain only in hosted provider configuration.

Use [`docs/operations/public-renter-registration.md`](docs/operations/public-renter-registration.md)
for the environment-specific activation and rollback sequence. Application,
public site-key, hosted CAPTCHA/signup, and SMTP/rate-limit changes must be
validated in Development and protected Preview before a separately approved
Production rollout. Never run `supabase config push` for this flow.

The first real camera catalog is a separate, business-approved data release.
Use [`docs/operations/catalog-publication.md`](docs/operations/catalog-publication.md)
for its Development rehearsal, user-scoped operator commands, publication and
privacy checks, and recovery sequence. The workflow was applied and rehearsed
in Development on 14 August 2026, then separately applied to Production with the
approved Canon inventory on 15 August 2026. Do not place real inventory
manifests or private serial/cost values in Git, and do not bypass private
staging with a direct public-bucket upload.

The earlier online government-ID evidence and review work is retained only as
historical implementation material. Policy `government-id-evidence-v2` stays
disabled, the account and owner UI expose no upload/review workflow, and booking
approval no longer reads a verification record. Use
[`docs/product/sprint-1-government-id-evidence.md`](docs/product/sprint-1-government-id-evidence.md)
for that acceptance matrix,
[`docs/product/sprint-2-admin-identity-review.md`](docs/product/sprint-2-admin-identity-review.md)
for the audited reviewer/decision acceptance matrix,
[`docs/product/sprint-3-versioned-contract-signing.md`](docs/product/sprint-3-versioned-contract-signing.md)
for the versioned contract acceptance matrix,
[`docs/product/sprint-4-manual-gcash-reconciliation.md`](docs/product/sprint-4-manual-gcash-reconciliation.md)
for the manual payment acceptance matrix,
[`docs/product/sprint-5-pickup-and-active-rental.md`](docs/product/sprint-5-pickup-and-active-rental.md)
for the pickup/active-rental acceptance matrix,
[`docs/product/sprint-6-return-cancellation-resolution.md`](docs/product/sprint-6-return-cancellation-resolution.md)
for the return/cancellation/deposit acceptance matrix,
[`docs/product/sprint-7-owner-operations-portfolio-performance.md`](docs/product/sprint-7-owner-operations-portfolio-performance.md)
for the owner dashboard/reporting acceptance matrix,
[`docs/product/government-id-privacy-notice-v2.md`](docs/product/government-id-privacy-notice-v2.md)
for the versioned notice, and
[`docs/operations/government-id-evidence.md`](docs/operations/government-id-evidence.md)
for the retired design and cleanup controls. At pickup, the named renter must
show one original current government ID. The administrator records only that
the renter was present and the ID was checked and matched; no image, number,
type, address, birth date, or expiry is retained. This minimized policy was
approved by the owner on 16 August 2026 under the transparency, legitimate
purpose, and proportionality principles of Republic Act No. 10173. That owner
approval does not claim outside-counsel review.

The public privacy contact is `privacy@camnook.shop`. It uses a
signature-verified Resend inbound webhook and forwards to one existing monitored
inbox; it is not a Hostinger mailbox. See
[`docs/operations/privacy-email.md`](docs/operations/privacy-email.md) for DNS,
server-only `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `PRIVACY_FORWARD_TO`
configuration, activation testing, and rollback. Publishing the address does
not replace monitored delivery and reply handling.

To refresh types from the linked database:

```bash
cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm db:types:linked
```

After a merged `main` revision passes automatic CI, `.github/workflows/release.yml`
runs Development migration/verification automatically. Only after Development
passes does the protected Production approval authorize staging one unaliased
Vercel Production candidate. The same immutable SHA then passes Production
migration/read-only verification before exact-candidate promotion and public
smoke. Vercel Git deployment from `main` is disabled in `vercel.json`, so
application promotion cannot outrun the schema gate. A failed smoke restores the
prior application alias; database recovery remains forward-only. Manual dispatch
is an audited reconciliation path for the exact current `main` SHA and still
requires prior successful CI and every environment gate. Manual local Production
linking remains forbidden. Hosted Auth, catalog, and other data mutations remain
separate controls, and the retired online-ID policy must never be activated by
the release workflow.

Use [`docs/operations/owner-portfolio-reporting.md`](docs/operations/owner-portfolio-reporting.md)
for owner dashboard period semantics, financial reconciliation, fail-closed
behavior, and the forward-only recovery boundary.

Use [`docs/operations/production-launch.md`](docs/operations/production-launch.md)
and
[`docs/product/sprint-8-production-launch-readiness.md`](docs/product/sprint-8-production-launch-readiness.md)
for the machine-checked evidence bundle, monitoring thresholds, independent
admission/catalog rollback, and current Production decision.

Use [`docs/operations/calendar-handoff-meetup-rollout.md`](docs/operations/calendar-handoff-meetup-rollout.md)
for the disabled-first calendar, lender policy, Geoapify, Preview, activation,
privacy evidence, and history-preserving rollback contract.

## Intentional launch gates

- Booking quote and approval pricing use the database-authoritative OD-01
  started-24-hour formula approved in `docs/open-decisions.md` and implemented
  by [GitHub issue #1](https://github.com/jlescarlan11/camnook/issues/1).
- Online government-ID collection is retired and remains disabled. The database
  requires the named renter, original ID check, and match attestations at pickup
  without storing an ID copy or identifying fields.
- Paid/submitted-payment cancellation acceptance remains disabled until the
  cancellation and refund policy is approved. Owner requests, explicit
  declines, and unpaid-state zero-fee acceptance are implemented; use
  [`docs/operations/return-cancellation-resolution.md`](docs/operations/return-cancellation-resolution.md)
  for the exact operating and recovery boundary.
- Manual GCash reconciliation is implemented behind disabled-by-default,
  versioned private recipient configuration. No real recipient is stored in the
  repository, and no hosted rollout is authorized. Use
  [`docs/operations/payment-reconciliation.md`](docs/operations/payment-reconciliation.md)
  for synthetic validation, review controls, and roll-forward recovery.
- Pickup and active-rental monitoring are implemented with an atomic checklist,
  optional private photos, and server-only operating instructions. No real
  pickup facts are committed and no hosted rollout is authorized. Use
  [`docs/operations/pickup-and-active-rentals.md`](docs/operations/pickup-and-active-rentals.md)
  for configuration, handoff, evidence, monitoring, and recovery controls.
- Return inspection, private issue evidence, manual decision-linked deductions,
  deposit-liability tracking, external refund recording, and immutable reversal
  corrections are implemented locally. No hosted rollout or real money
  movement is authorized.
- Direct admin Storage reads remain denied. The retired online verification
  implementation cannot be reactivated without a new reviewed policy migration.
- The owner approved the current contract, Philippine-law privacy approach,
  tax/business, operations, release, and security/recovery posture for this MVP
  launch on 16 August 2026. This is an owner business decision, not a claim of
  outside legal or accounting review.

See `docs/product/mvp-rental-policy-v0.1.md`, `docs/architecture/`, and
`docs/open-decisions.md` for the policy and decision record.
