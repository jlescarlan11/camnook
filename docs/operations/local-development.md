# Real local development

Run `pnpm dev:setup`, then `pnpm dev:real`. The latter starts the actual Next.js app at http://127.0.0.1:3000 after checking Development authentication, meetup schema discovery, live Geoapify search, and map tiles for localhost and 127.0.0.1. `pnpm dev:check` repeats these dependency checks without starting the app.

Use the repository's required Node version (24 or newer). Run setup through
`pnpm dev:setup`: it uses pnpm's supplied JavaScript entry point so Windows does
not need to execute a package-manager shim. Startup invokes the installed Next.js
CLI with the same Node executable that ran the dependency checks.

The setup command uses Vercel CLI 59.23.2, downloads Development variables into ignored `.vercel/local-development/downloaded.env`, and writes a private `.env.development.local`. It preserves the verified Development public Supabase URL/key from `.env.local` and the separately provisioned browser map key from `.env.development.local`. It only imports an allowlist of server settings; downloaded public Supabase values and unrelated tokens are excluded. Production and lookalike database URLs fail closed. Never substitute the server Geoapify key for the browser key.

The existing Vercel Development public Supabase settings were found to identify Production on 2026-09-20. Local setup avoids those incorrect values. This does not change hosted Vercel settings. Development project: `ekmoiepalelqpmemvrkl`. Production project: `iegcixcevvkryfwfotqz`.

For a fresh machine, configure `.env.local` with the Development public URL and publishable key, and put the separate non-production browser map key in `.env.development.local`. This machine's existing Geoapify non-production browser key was recovered from its provider dashboard; both local origins successfully served tiles. The key's dashboard restrictions should be reviewed before any public deployment.

To authenticate without sending test emails, run `node scripts/development-session.mjs <existing-development-user-uuid>`. Open the URL written to `.vercel/local-development/session-url`. It is a one-use link served only on loopback port 3001, expires after two minutes, and establishes a real Supabase session on 127.0.0.1. It never changes the application's authentication behavior. Treat that ignored file as a credential.

Dependency checks are not end-to-end tests. Verify the owner search, pin selection, save/reload, camera assignment, renter selection and booking snapshot using the real app. The database regression in `supabase/tests/database/024_lender_meetup_places.sql` runs in a transaction and rolls its fixtures back. Never run development fixtures against Production.

`pnpm dev:renter` creates or refreshes a synthetic renter owned by this test workflow. It uses an `.example` address, sends no email, and refuses to alter an existing account without the fixture marker. Its UUID is saved in `.vercel/local-development/renter.json` for `pnpm dev:session <uuid>`. Do not enter real identity documents or send payments during development checks.

On 2026-09-20 the pending meetup migration was applied transactionally through the authenticated Development dashboard and recorded in `supabase_migrations.schema_migrations`. The CLI's current Supabase account lacked CamNook management access; the dashboard had the correct account. Setup does not run arbitrary pending migrations automatically. Schema discovery fails with a clear error if a future migration is missing.

Verified on 2026-09-20: real owner search returned Geoapify results; selected coordinates were saved and survived reload; the place was assigned to the Development Canon EOS R50; the synthetic renter selected it in the actual checkout and submitted booking `9000e739-2292-4bea-a118-7994ba724c3d`. The booking displays the saved coordinates `10.318116, 123.904833` in its directions link. The Development database regression also passed permissions, stale-version rejection, immutable booking/contract snapshots, retries and archive recovery, with its fixtures rolled back. One clearly labelled place and the synthetic booking remain available for inspection in Development.
