# Government ID Evidence Operations

Status: synthetic-evidence validation only; real-ID collection is not authorized
Policy: `government-id-evidence-v2`
Notice: `government-id-privacy-v2`

## Environment boundary

The migration is forward-only. Local and hosted validation use synthetic files. Before any routine linked hosted database command, require `supabase/.temp/project-ref` to equal Development ref `ekmoiepalelqpmemvrkl`. Production ref `iegcixcevvkryfwfotqz` is never a routine Development target. Production schema deployment is available only through the manually dispatched, protected GitHub Actions environment.

The v2 hardening migration updates the policy to JPEG/PNG only, resets it to disabled, and clears the activation timestamp, so schema deployment cannot start ID collection. Production activation requires every governance, reviewer, processor/location, retention/backup, rights, incident, and legal gate in the v2 notice. There is deliberately no automated activation workflow: activation requires a later, separately reviewed migration after those gates are recorded.

The runtime also requires server-only `SUPABASE_SERVICE_ROLE_KEY` and
`CRON_SECRET` values. The former is used only by authenticated Server Actions
and the retention worker for narrow service-role-only RPCs. The latter must be
a random value of at least 16 characters and protects the internal cron route.
Neither may use a `NEXT_PUBLIC_` prefix. Store them only in Vercel, not GitHub.

## Local validation

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The database harness proves the server-only mutation boundary, exact owner
Storage upload/read/delete boundaries, cross-renter denial, admin raw-byte
denial, suspension and policy revocation, expiry, reconciliation, replacement,
legal hold, automatic retention claims, and verified deletion. Never use a real
government ID in Local, Development, Preview, fixtures, screenshots, or logs.

## Automated deployment and hosted validation

Pull requests and pushes to `main` run application, local database, generated
type, and real-session concurrency checks. After `main` CI succeeds, the
Development workflow links only project `ekmoiepalelqpmemvrkl`, previews and
applies pending migrations, runs the hosted fail-closed and cross-owner Storage
RLS transactions, and runs the Supabase security advisor. The Production
workflow is manual, accepts only project `iegcixcevvkryfwfotqz`, requires the
protected GitHub `production` environment, and verifies that the ID policy is
still disabled after any schema deployment.

The shared Supabase access token is stored only in those GitHub environments.
It was rotated on 15 August 2026, is valid through 14 August 2027 (the current
maximum lifetime offered for a new dashboard token), and was proven by a
successful Development migration/RLS/advisor workflow before the superseded
token was revoked. Rotate both environment secrets before the new deadline.
Credential rotation is operational maintenance, not a feature-acceptance or
Production-activation gate. Vercel owns the runtime service key and cron secret
instead of GitHub.

On 15 August 2026, Development reached 14/14 migrations. Hosted checks confirmed
the policy remained disabled and that the server-only RPC and cross-owner
Storage boundaries held. The security advisor returned no errors; its one
warning was that leaked-password protection is disabled.

That warning cannot be enabled on the current Free projects: the documented
setting requires Supabase Pro, and the Management API returned HTTP 402 when
the Development setting was tested. CamNook's supported authentication flow is
passwordless email OTP (`signInWithOtp` and `verifyOtp`); the repository exposes
no password signup, sign-in, reset, or change flow. The warning is therefore a
documented, non-blocking advisory for the present passwordless application, not
a claim that leaked-password screening is enabled. Enable it before supporting
password authentication, or when the projects move to Pro, and rerun the
hosted advisor workflow.

## Upload and retry lifecycle

1. The account page loads the current database policy and safe account state.
2. The renter reads the exact rendered notice and affirmatively gives purpose-specific consent; the checkbox is required and not preselected.
3. The Server Action validates accepted ID type, JPEG/PNG MIME, magic bytes, and 5 MiB maximum; computes SHA-256; and uses the server-only RPC boundary to create a 15-minute database intent with the exact notice/consent event and time. The legacy database column name uses “acknowledged,” but the recorded UI event is specific consent.
4. The renter session uploads through Storage RLS, which rechecks the exact owner path, expected metadata, active account, current policy/notice, and expiry. Upsert/overwrite remains off.
5. The Server Action downloads the owner-authorized object, verifies size/hash, and uses the server-only RPC boundary to finalize. Finalization independently rechecks active-account and current-policy state. The pending record and current document appear only then. This verifies file integrity, not identity.
6. If an upload response is ambiguous, the same file resumes the existing intent and is downloaded/reconciled even when a new Server Action proposed another UUID. If the renter chooses different evidence while an intent is open, the action prepares and verifies cleanup before issuing the new intent. A byte mismatch or expired intent follows the same exact cleanup path.

Repeated account submissions are safe. Operators must not manually edit intent status, fabricate metadata, upload to a path, or delete Storage rows in the dashboard.

## Replacement

Only a pending decision can be replaced in Sprint 1. Replacement creates a new document UUID/path, updates the pending record’s selected ID type on finalization, marks the prior document superseded, and makes the prior object due for protected cleanup. A verified decision requires a separately designed new-review operation.

## Retention and deletion

Each finalized object receives a 30-day maximum `retention_until`. An owner may withdraw consent or request deletion at any time; if no documented hold exists, the account flow immediately claims and removes the exact object and calls finalization. The database refuses completion if the object remains. Unrequested objects become due at the outside deadline, and superseded objects become due immediately.

Eligibility acquisition is a durable database transition. A pre-existing hold
prevents the claim; once a due deletion is claimed, later hold placement is
rejected so it cannot race server-only Storage removal. Failed Storage or
finalization attempts remain claimed and are returned by every later worker run
until database-verified absence completes the lifecycle. Renter requests retain
the renter as requester; automatic retention uses source `retention`, a null
requester, and a system-actor audit entry.

`vercel.json` schedules `GET
/api/internal/verification-evidence-cleanup` daily at 02:17 UTC. Vercel sends
`Authorization: Bearer $CRON_SECRET`; missing or invalid authorization receives
HTTP 401. Each run claims up to 1,000 due documents and 1,000
expired/cleanup-pending intents, removes exact paths in bounded batches with the
server-only Storage client, and calls a database absence-verifying finalizer for every item. Partial
Storage or finalization failures return 503 and remain retryable on the next
run. The JSON response and application logs contain counts only, never paths,
digests, or owner IDs.

Before a hosted rollout, configure both server-only secrets, apply the migration
to Development, invoke the protected route once with synthetic due evidence,
verify the system-actor audit entries and absence checks, and confirm the Vercel
Cron appears. Vercel does not retry a failed cron invocation, so alert on 5xx and
re-run the same protected route after correcting the dependency failure.

Legal holds may be set or released only by a future narrow audited admin operation. Direct table edits are not an application workflow. Because that operation and procedure do not yet exist, legal hold is an activation blocker, not a Production-ready exception.

## Activation decision record

The current decision is **NOT APPROVABLE YET**. Before any real-ID collection,
complete every governance requirement listed in
[`docs/product/government-id-privacy-notice-v2.md`](../product/government-id-privacy-notice-v2.md),
obtain written Philippine privacy-counsel approval, and implement activation in
a new migration that identifies the approved policy and notice versions. A
Dashboard edit or manual SQL toggle is not an authorized activation path.

## Safe diagnostics

The account RPC intentionally returns document ID, status, ID type, timestamps, media type, size, retention state, deletion state, and a boolean legal-hold indicator. It never returns object path, digest, raw content, hold reason, or administrator identity.

Audit entries may contain opaque record/document/intent UUIDs, media type, byte size, policy version, and outcome. They must never contain the private object path, signed URL, SHA-256, ID number, OCR text, or file contents.
