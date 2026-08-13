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
migrations, runs the real two-session approval races, and removes the cluster on
exit. It refuses a caller-supplied `DATABASE_URL`, so it cannot be redirected to
a developer or hosted database.

The repository currently contains eleven forward migrations. On 13 August 2026,
the four booking-milestone migrations were applied to Production through a
separately authorized, database-first rollout after Development/Preview
verification. Development and Production both had an exact 11/11 migration
history after that rollout. Treat this as a recorded release result, not a
substitute for checking current remote migration history before any future
action.

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

Hosted Development Auth is invite-only (signup disabled), sends a six-digit
email OTP with a 15-minute expiry, and uses hosted SMTP configuration. Those
hosted settings are the operational truth; the local `supabase/config.toml` is
not a pushable copy of them. SMTP credentials and provider keys remain only in
hosted configuration.

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
