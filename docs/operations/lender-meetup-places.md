# Lender meetup places: implementation and verification

Implemented and verified on 2026-09-20. The migration was applied to the hosted Development database; Production was not changed.

## Setup and release

- Migration: `20260919162030_lender_managed_meetup_places.sql`.
- Owner library: `/admin/meetup-places`. Save public venues with the exact entrance pin, written address, city, and optional instructions. Provider search uses the existing Geoapify server integration; the map uses the existing public Geoapify map key. No new provider or dependency is required by the application.
- Camera setup: `/admin/cameras/[cameraId]?step=availability`. Assign and order one to three places. Publication checks for an active assigned place in the database as well as the UI.
- New checkout submissions require an active, version-matched assigned place. Existing published cameras with no places cannot accept new requests. Prepare real owner-confirmed place data for the release; never infer pins from legacy area labels. Historical bookings retain their existing snapshots.
- Use the repository's verified release path and exact tested commit, with live verification after promotion. No feature flag was added. Production deployment and production venue setup have not been performed in this task.
- Before release, confirm `GEOAPIFY_API_KEY`, the existing meetup provider/reference configuration, and `NEXT_PUBLIC_GEOAPIFY_MAP_KEY` in the intended environment. The real local Next.js app uses verified Development credentials from ignored `.env.development.local`; live search and localhost map tiles were exercised. See [local development](local-development.md) for repeatable setup. Coordinate entry and external map links remain available during provider outages.

## Verified behavior

- Owners manage the reusable place library through admin-checked RPCs. Renters only receive eligible camera choices and cannot write the library or inspect unassigned library entries through table reads.
- New place forms retain a creation reference across failed or interrupted saves.
  An unchanged retry returns the original place without changing its version.
  A changed retry or a retry after edit/archive fails stale. After confirmed
  creation, the form clears and allocates a new reference for the next place.
  Older callers without a creation reference retain their original create behavior.
- Checkout requires explicit selection and submits only the place ID and version as location authority. The database reads and copies the venue fields itself.
- Latitude/longitude are stored to six decimals. Booking and contract snapshots keep the original pin, address, and arrival instructions after library edits or archive.
- Booking creation and snapshot insertion are atomic. Existing KYC, schedule, account, request-limit, and idempotency checks remain enforced.
- An identical completed retry returns its original booking. A stale new request fails with `meetup_changed`; checkout preserves other answers and requires a new selection.
- A transaction advisory lock serializes place edits, archive, assignment, publication, and saved-place booking creation. This deliberately favors simple correctness for current single-owner inventory; revisit granularity if transaction volume grows substantially.
- Legacy area-only records remain supported. No private residential pin is used or exposed by this feature.

## Evidence

- Full Vitest suite passes; existing opt-in provider tests remain separate from the default suite.
- Lint, TypeScript, production build, and git diff whitespace checks pass.
- `supabase/tests/database/024_lender_meetup_places.sql`: real database assertions for permissions, precision, duplicate assignments, immutable booking/contract snapshots, stale selection, retry idempotency, archive behavior, and absence of orphan bookings.
- `supabase/tests/database/025_meetup_concurrency.py`: two real database sessions verify that booking waits for an in-flight owner edit, then rejects the old version without creating a booking. `pnpm db:test:concurrency` runs it automatically in a dedicated database cloned inside the harness-owned socket-only cluster, including in CI. The test observes the blocking session through `pg_blocking_pids`, bounds waits and queries, and terminates its sessions on failure. It commits synthetic fixtures only in that disposable database; Docker is not required.
- Clean migration replay and the SQL suite passed against an isolated copy of the existing full CamNook test database.
- Standard Supabase local startup failed during database initialization with exit 139. Used task-owned Docker copies instead. The migration was created with the Supabase CLI and contains the SQL applied directly during local iteration; standard local diff/advisor commands were unavailable against that failed stack. No hosted advisor claim is made. Explicit grants, RLS and denial paths are tested in the SQL suite.
- Generated only the affected TypeScript schema sections from the isolated database using the available working Postgres Meta image; unrelated generated sections were preserved.
- Browser checks used actual UI components in the separate sample preview: mobile selection, edit preservation, reviewed venue, precise owner coordinate entry, required pin reconfirmation after edits, and assignment save feedback. No horizontal overflow or console errors observed. Preview actions are simulated; SQL and action tests verify persistence and authorization separately.
- Subsequent real-app verification at `http://127.0.0.1:3000` used live Geoapify search, saved and reloaded a precise pin, assigned it to a Development camera, and submitted checkout as a dedicated synthetic renter. The stored booking snapshot was verified directly in the Development database. The rollback-only hosted regression passed after adapting its fixture to the existing owner/template. Port 4173 is only the earlier sample preview.
- Mobile evidence: `/Users/johnlesterescarlan/.codex/visualizations/2026/09/19/camnook-checkout-preview/meetup-mobile.png`.

Geoapify supports storing results under its terms; provider-sourced entries preserve attribution. References checked: https://www.geoapify.com/ and https://apidocs.geoapify.com/open-api/.
