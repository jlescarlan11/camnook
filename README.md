# CamNook

CamNook is a single-owner camera-rental application. This repository currently
contains the approved MVP architecture and its secure implementation foundation;
it is not ready to accept public paid rentals.

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
| Production | Supabase `CamNook` (`iegcixcevvkryfwfotqz`) and [camnook.shop](https://camnook.shop) | Live and isolated. Production migrations, variables, and deployments require separate explicit authorization. |

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
approval races, and removes the cluster on exit. It refuses a caller-supplied
`DATABASE_URL`, so it cannot be redirected to a developer or hosted database.

The repository currently contains thirteen forward migrations. On 13 August 2026,
the four booking-milestone migrations were applied to Production through a
separately authorized, database-first rollout after Development/Preview
verification, leaving both hosted projects at 11/11 at that checkpoint. On 14
August 2026, the catalog-photo publication and unpublished-availability
migrations were applied and exercised only in Development. Development is now
recorded at 13/13 while Production remains at 11/13. Treat those counts as
recorded release evidence, not a substitute for checking current remote
migration history before any future action.

For a hosted Development migration, keep the change migration-first and
forward-only. Immediately before **each** command that can inspect or mutate
the linked hosted database, verify the ignored local link:

```bash
cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm dlx supabase@2.113.0 db push --linked --dry-run

cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm dlx supabase@2.113.0 db push --linked
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
`private.admin_accounts`; signup never grants it. Hosted Development Auth now
has public email signup and Cloudflare Turnstile CAPTCHA enabled after the
protected-Preview activation and smoke test. It sends a six-digit email OTP with
a 15-minute expiry through proven custom SMTP; the Development email-send
ceiling remains four per hour for protected manual QA. Production remains
fail-closed with signup and CAPTCHA disabled and has not yet been moved from its
confirmation-link template to the OTP template. Hosted settings are the
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
in Development on 14 August 2026; it remains unavailable in Production until a
separately approved migration and catalog release. Do not place real inventory
manifests or private serial/cost values in Git, and do not bypass private staging
with a direct public-bucket upload.

To refresh types from the linked database:

```bash
cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm db:types:linked
```

No Production migration, environment-variable change, deployment, or promotion
is part of Development/Preview work without separate explicit authorization.

## Intentional launch gates

- Booking quote and approval pricing use the database-authoritative OD-01
  started-24-hour formula approved in `docs/open-decisions.md` and implemented
  by [GitHub issue #1](https://github.com/jlescarlan11/camnook/issues/1).
- Government-ID uploads fail closed until the privacy notice and retention
  schedule are approved; verification decisions remain outside the current
  milestone.
- Paid/submitted-payment cancellation acceptance remains disabled until the
  cancellation and refund policy is approved.
- Admin access to private Storage objects remains disabled until an audited,
  server-only signed-URL flow exists.
- Final contract wording and legal, tax, operational, security, and recovery
  readiness remain required before launch. Public paid launch remains closed.

See `docs/product/mvp-rental-policy-v0.1.md`, `docs/architecture/`, and
`docs/open-decisions.md` for the policy and decision record.
