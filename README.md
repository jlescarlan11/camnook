# CamNook

CamNook is a single-owner camera-rental application. This repository currently
contains the approved MVP architecture and its secure implementation foundation;
it is not ready to accept public paid rentals.

## Stack

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS
- Supabase Auth, PostgreSQL 17, Row Level Security, and Storage
- pnpm and Vitest
- Vercel's default Node.js runtime for eventual deployment

All JavaScript package versions are exact-pinned. The linked Supabase project's
`main` database is temporarily serving as both development and production while
the product is private. Repository tests do not seed or reset that hosted
database.

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
`supabase/tests/database/`. The standard local workflow is:

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:types
```

The three foundation migrations, two advisor/lint follow-up migrations, and the
sole-admin bootstrap migration were applied to the linked `main` database on
2026-08-13 after architecture approval and successful dry runs. Future changes
must remain migration-first, pass local database assertions, and be previewed with
`supabase db push --linked --dry-run` before they are applied. Never run a linked
reset against this shared database.

To refresh types from the linked database:

```bash
pnpm db:types:linked
```

## Intentional launch gates

- Booking approval fails closed until the billable-day formula is approved.
- Government-ID uploads fail closed until the privacy notice and retention
  schedule are approved.
- Paid/submitted-payment cancellation acceptance remains disabled until the
  cancellation and refund policy is approved.
- Admin access to private Storage objects remains disabled until an audited,
  server-only signed-URL flow exists.
- Final contract wording and legal, tax, operational, security, and recovery
  readiness remain required before launch.

See `docs/product/mvp-rental-policy-v0.1.md`, `docs/architecture/`, and
`docs/open-decisions.md` for the policy and decision record.
