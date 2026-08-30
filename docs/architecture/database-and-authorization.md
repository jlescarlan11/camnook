# Database and Authorization Architecture

Status: approved on 2026-08-12<br>
Policy source: [`docs/product/mvp-rental-policy-v0.1.md`](../product/mvp-rental-policy-v0.1.md)<br>
Production architecture target: Supabase `CamNook`
(`iegcixcevvkryfwfotqz`), PostgreSQL 17, `ap-northeast-1`<br>
Current implementation target: separate Supabase `CamNook Development`
(`ekmoiepalelqpmemvrkl`), PostgreSQL 17, Tokyo / `ap-northeast-1`

## Architecture decision

Confirm the preferred stack: Next.js 16 App Router, strict TypeScript, pnpm, Tailwind CSS, shadcn/ui, Supabase Auth/Postgres/Storage, PostgreSQL RLS, Vercel, and Vitest for pure domain rules. This is sufficient for the MVP; no additional service is justified.

Both Supabase projects already exist outside Vercel Marketplace. The separate
Development project is the only linked target for routine hosted migration and
Preview verification; the live Production project is not linked. Local linkage
is ignored machine state, not committed architecture. Vercel Preview has two
app-owned, Preview-scoped Supabase records for the Development project's
publishable URL/key; Vercel platform-provided variables are separate, and
Production retains its separate application records. Browsers can see every
`NEXT_PUBLIC_` value, so those records must never contain secret/service-role
material. Use Vercel's default Node.js Fluid Compute runtime; streaming or
Server Actions do not require Edge runtime.

The application requests passwordless email OTPs with missing-user creation
enabled. Supabase may provision the Auth identity when it accepts the OTP
request; successful verification is required before the browser receives a
usable local session. Neither step creates an administrator or an application
profile. The renter completes the existing idempotent `api.ensure_profile` flow
after authentication.
Hosted Development Auth has public signup and Cloudflare Turnstile CAPTCHA
enabled after the reviewed Development/Preview activation. It uses a six-digit
email OTP with a 15-minute expiry and proven custom SMTP configuration; the
Development email-send ceiling remains four per hour for protected manual QA.
Production signup, Managed Turnstile, email confirmation, and the code template
were separately activated and validated on 15 August 2026. The 2026-08-16
Sprint 8 audit found custom SMTP and leaked-password protection disabled; those
hosted-state findings block a future paid-lifecycle `GO` but do not authorize a
configuration change. The local `supabase/config.toml` intentionally models
local defaults and differs from hosted Auth; `supabase config push` is
prohibited because it could overwrite hosted behavior. Credentials, SMTP
values, CAPTCHA secrets, provider keys, user UUIDs, and deployment-protection
bypass material are never architecture inputs.

When enabled for a target environment, Cloudflare Turnstile is rendered only on
the OTP request and resend forms. The browser receives the public site key and
submits the short-lived response through `options.captchaToken`; Supabase owns
secret-side validation. Hosted signup, CAPTCHA, rate limits, SMTP capacity, and
the matching public site key are rolled out together per environment using
[`docs/operations/public-renter-registration.md`](../operations/public-renter-registration.md).

Application data flow:

- Server Components perform authenticated reads directly through the Supabase server client.
- Server Actions validate form input, obtain the current user with `getUser()`/equivalent server validation, and invoke narrow database operations.
- Route Handlers are reserved for true HTTP endpoints such as a future scheduled-job entrypoint; they are not an internal CRUD layer.
- Browsers never receive a service-role/secret key.
- State changes, holds, contract issuance, payment verification, allocation balancing, and immutable history are committed inside database transactions, not as a chain of client calls.

Relevant current guidance:

- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Using custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)
- [PostgreSQL: Range types](https://www.postgresql.org/docs/current/rangetypes.html)
- [PostgreSQL: Exclusion constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION)

## Schema boundaries

### `public`

Contains domain tables and privacy-safe views. Every table has RLS enabled before grants are given. Tables are not automatically assumed to be available through the Data API: migrations explicitly grant only required privileges to `anon` and `authenticated`, and project Data API settings must be verified because new Supabase projects may not auto-expose SQL-created tables.

### `api`

Contains the narrow functions exposed to the Data API. Each is a `SECURITY INVOKER` wrapper around one non-exposed implementation function. The schema is explicitly exposed and granted only where required.

PostgreSQL grants function execution to `PUBLIC` by default. Migrations revoke
that default at schema and function level, then grant each exact function
signature only to the roles that require it. `api.quote_booking` is the
deliberate anonymous exception: both `anon` and `authenticated` may request a
public catalog quote.

### `private`

Not exposed through the Data API. Contains the admin singleton, append-only audit log, authorization helpers, deferred constraint triggers, and transactional operation implementations. `SECURITY DEFINER` is permitted only here, with:

- `search_path = ''`;
- fully qualified object names;
- an explicit `auth.uid()` presence and ownership/admin check;
- execution revoked from `PUBLIC`, followed by an explicit per-signature grant
  only where an API wrapper requires invoker access;
- the smallest explicit execution grant; and
- tests for direct-call and cross-account attacks.

The pure `private.calculate_booking_price` helper is `SECURITY INVOKER`, reads
no tables, and receives an exact-signature grant for `anon` and `authenticated`
because the invoker-mode quote wrapper calls it. Transactional private
operations are not trusted merely because `authenticated` can execute them:
each implementation repeats the same ownership/admin and state guards as its
`api` wrapper. The `api` schema remains the supported Data API surface, while
the unexposed `private` schema contains the implementation boundary.

## Identity and sole-admin model

Authorization never trusts `user_metadata` or renter-controlled JWT claims.

`public.profiles`

| Column | Rule |
| --- | --- |
| `user_id uuid` | Primary key; references `auth.users(id)` with `ON DELETE RESTRICT` once history exists |
| `legal_name text` | Private; required before a verification can become `verified` |
| `phone text` | Private; normalized separately from display formatting |
| `account_status` | `active` or `suspended`; default `active` |
| timestamps | `created_at`, `updated_at` |

Profile creation is an idempotent post-signup operation. The design does not depend on adding custom objects to the protected `auth` schema.

`private.admin_accounts`

| Column | Rule |
| --- | --- |
| `singleton boolean` | Primary key and `CHECK (singleton)`; permits at most one row |
| `user_id uuid` | Unique FK to `auth.users`; immutable after bootstrap |
| `created_at` | Audit timestamp |

The initial admin UUID is supplied at migration/bootstrap time. Application roles cannot insert, update, or delete this row. Database constraints enforce at most one admin; deployment verification enforces that the one required row exists. `private.is_admin()` reads this table and is the sole RLS/admin helper.

## Domain enums

Use PostgreSQL enums for closed workflow vocabularies and ordinary `text` plus checks for likely-to-evolve labels.

- `booking_state`: the 12 uppercase values in `BOOK-*`.
- `verification_status`: `pending`, `verified`, `rejected`, `expired`.
- `camera_status`: `draft`, `published`, `archived`.
- `availability_block_kind`: `booking`, `maintenance`, `manual`.
- `contract_version_status`: `issued`, `superseded`, `voided`.
- `payment_direction`: `incoming`, `outgoing`.
- `payment_status`: `submitted`, `verified`, `rejected`. A reversal is a new verified transaction linked to the immutable original, not a status rewrite.
- `payment_allocation_kind`: `rental_payment`, `security_deposit`, `deposit_refund`.
- `handoff_type`: `pickup`, `return`.

## Tables, keys, and invariants

All identifiers are random UUIDs unless sequence order is useful for append-only events. All timestamps are `timestamptz`. All rental periods use the half-open interval `[pickup_at, return_at)`. Money is stored as `numeric(12,2)` with `CHECK (amount >= 0)` and currency fixed to `PHP`; floating point is prohibited.

### Verification

`public.verification_records`

- `id` PK, `user_id` FK, `status`, `id_type`, `document_expiration_date`, decision timestamps, `decided_by`, rejection reason, and `supersedes_id`.
- The decision row contains no storage URL and no full government ID number.
- One partial unique index allows at most one current `pending` or `verified` record per user.
- `verified` requires decision actor/time and an expiration date not earlier than the decision date.
- Expiration is a controlled operation; historical decisions are not rewritten.

`public.verification_documents`

- `id` PK, `verification_record_id`, `owner_user_id`, opaque `object_path` unique, media type, byte size, SHA-256, intent/finalization/notice-specific-consent timestamps, policy/notice versions, retention/deletion/legal-hold timestamps, durable cleanup claim, and optional `supersedes_id`. The physical column retains its legacy `privacy_acknowledged_at` name.
- Ownership is duplicated from the parent intentionally for cheap RLS and Storage-policy checks; a constraint trigger verifies it matches the record owner.
- Rows are append-only after upload finalization. Deleting the Storage object updates lifecycle metadata but never deletes the verification decision.
- Only one unsuperseded, not-yet-deleted document is current per verification record. Replacement of a pending decision uses a new object and updates the pending record’s selected ID type at finalization.

`private.verification_upload_intents`

- Stores one open owner intent at a time with exact owner/record/document path, expected MIME/size/hash, 15-minute expiry, policy/notice/specific-consent evidence, replacement target, cleanup state, and timestamps.
- Authenticated clients can read only policy and path-free account state. Mutation/path RPCs execute only for the server-side service role after a Server Action authenticates and supplies the same owner/actor; direct renter RPC calls are denied.
- Finalization creates the pending verification row only after Storage metadata is present; the application independently downloads and hashes stored bytes before calling it, while the database rechecks active-account and current-policy state. These checks prove file integrity, not identity.

### Inventory and public discovery

`public.cameras`

- `id` PK, unique slug, private unique serial number, name, description, `status`, daily rate, security deposit, acquisition cost, replacement value, and publication/archive timestamps.
- Rates and values are nonnegative; published cameras require complete public content, a rate, and a deposit.
- `DELETE` is revoked. `archive_camera()` is the only removal operation after any booking reference exists.
- Public projections never include serial number, acquisition cost, replacement value, or internal notes.

`public.camera_photos`

- `id` PK, `camera_id` FK, opaque public object path unique, alt text, sort position, and active/archive timestamps.
- Unique `(camera_id, sort_position)` among active photos.

`private.catalog_photo_publications`

- Holds the non-public, immutable expected image type, byte size, SHA-256,
  exact staging/public UUID paths, alt text, sort position, initiating admin,
  short upload-intent expiry, and retryable lifecycle state.
- Narrow admin-only API operations move an intent through staging verification,
  copy verification, active photo metadata, staging cleanup, abort, or archive.
  A database row never claims publication until the destination object exists.
- Application roles cannot read or mutate the table directly. Storage policies
  join the exact path to a current state and `private.is_admin()`; no `UPDATE`
  policy permits object overwrite.

`public.camera_accessories`

- `id` PK, `camera_id` FK, name, quantity (`> 0`), optional replacement value, sort position, and archive timestamp.
- Accessories are inventory descriptions only; no renter-selectable or independent pricing fields exist.

`public.public_cameras`, `public.public_camera_photos`, and `public.public_availability`

- `security_invoker = true` views containing only approved public columns.
- `public_availability` returns active blocks only for currently published cameras, with camera ID plus busy range and generalized reason (`booked` or `unavailable`), never booking ID or renter data. Anonymous and ordinary authenticated direct-table policies enforce the same publication boundary; explicit admins retain private inventory visibility.
- Because RLS controls rows rather than columns, anonymous access also uses explicit column-level grants on the source tables. `anon` receives no privilege on serial, cost/value, booking, renter, or internal-note columns and cannot bypass the projection with a direct Data API query.

### Requests, reservations, and exclusion constraint

`public.bookings`

- `id` PK; `renter_id`, `camera_id`; current `state`; requested `pickup_at`/`return_at`; intended use, expected location, and operator notes; request/approval/deadline timestamps; approver; authoritative pricing snapshots; and current contract version ID.
- `renter_id` is always derived from `auth.uid()` by `request_booking()` and is not accepted as caller input.
- `pickup_at < return_at`; request times are immutable after approval except through the contract-supersession operation.
- `approval_deadline_at = approved_at + interval '24 hours'` and cannot be updated independently.
- Price fields are null in `FOR_REVIEW` and required once approved. `total_due = rental_amount + security_deposit_amount` is generated or constrained.
- `billable_days_snapshot` is positive and present exactly when approval facts are present; `rental_amount = daily_rate_snapshot × billable_days_snapshot`.
- An approval timestamp must precede the immutable pickup timestamp; approval
  rechecks this condition at the transaction boundary.
- OD-01 pricing uses one started 24-hour elapsed duration. Quote and approval call the same pure database pricing function, and approval reads the camera rate itself rather than accepting an authoritative total from a renter.

`public.availability_blocks`

- `id` PK; `camera_id`; optional unique `booking_id`; `kind`; `starts_at`; `ends_at`; generated stored `period = tstzrange(starts_at, ends_at, '[)')`; creator; reason; and `released_at`/`released_by`.
- Kind check: `booking` requires one booking ID; maintenance/manual blocks prohibit one.
- `CHECK (starts_at < ends_at)`.
- Enable `btree_gist`, then enforce:

```sql
EXCLUDE USING gist (
  camera_id WITH =,
  period WITH &&
)
WHERE (released_at IS NULL)
```

The exclusion constraint is the final concurrency guard. Approval first takes a row lock on the booking, validates the camera, then attempts the insert; a conflict aborts the whole transaction. `FOR_REVIEW` never has a block. Terminal transitions set `released_at` in the same transaction as the state change.

The block covers the approved scheduled interval. A late physical return is recorded as an operational issue; changing a past block in a way that collides with an already-confirmed future reservation is not used to falsify history.

`public.booking_state_history`

- `id bigint generated always as identity` PK; booking ID; from/to states; actor user ID; actor type (`renter`, `admin`, `system`); reason code; note; metadata; occurred time; and operation/correlation UUID.
- Inserted by transition operations only. Update and delete are revoked from every application role.

`public.booking_cancellation_requests`

- `id` PK, booking ID, requester, reason, requested time, operation UUID,
  disposition (`pending`, `accepted`, `declined`), decision actor/time, and note.
- A renter creates only for an owned eligible pre-pickup booking. A request does
  not transition state. An admin decision updates its projection only after an
  immutable decision row is inserted.

`public.cancellation_decisions`

- Append-only one-per-request decision with booking/state-at-decision, outcome,
  explicit fee/refund-liability amounts, reason, actor/time, and operation UUID.
- Current policy allows accepted zero-amount decisions only from `FOR_REVIEW`,
  `CONTRACT_PENDING`, and `TO_PAY`; paid/submitted acceptance fails closed.

### Immutable contracts

The proposed model deliberately omits a redundant `contracts` parent: one booking is the contract aggregate, and `contract_versions.booking_id` supplies the relationship.

`public.contract_templates`

- Immutable legal template version, schema version, normalized terms JSON/text, content hash, created/approved timestamps, and activation status.
- An activated template cannot be edited. A change creates a new template version.

`public.contract_versions`

- `id` PK, booking ID, monotonically increasing `version_no`, status, `supersedes_id`, template version, full canonical snapshot JSON, snapshot schema version, SHA-256, optional rendered-PDF path, issued time/actor.
- Unique `(booking_id, version_no)` and at most one `issued` version per booking.
- The canonical snapshot contains every `CONTRACT-02` field, including serial number and inclusions at issue time; it does not read mutable tables when rendered later.
- After insertion, content columns are protected by an immutable-row trigger. Only the controlled supersede operation may change status from `issued` to `superseded` while creating its replacement in the same transaction.

`public.contract_signatures`

- `id` PK, contract version ID, renter ID, signature intent/attestation text, signed time, request IP/user-agent digest where legally approved, and content hash acknowledged.
- Unique `(contract_version_id, renter_id)`. The renter ID must match the booking renter and the version must be current.
- Fully append-only. A new contract version requires a new signature.

### Manual GCash records

`public.payment_transactions`

- `id` PK, booking ID, direction, method fixed to `gcash_manual`, status, amount, normalized reference, sender/recipient display name, submit/decision timestamps and actors, rejection reason, and optional `reversal_of`.
- A partial unique index on normalized `(method, direction, reference)` for `verified` transactions prevents double verification.
- `submitted` transactions may be rejected; `verified` transactions are immutable. Corrections create an opposite/reversal record linked by `reversal_of`.

`public.payment_allocations`

- `id` PK, transaction ID, allocation kind, amount, and booking ID.
- Unique `(transaction_id, allocation_kind)` for MVP.
- Incoming verified transactions allocate to `rental_payment` and `security_deposit`; an outgoing verified refund allocates to `deposit_refund`.
- A deferred constraint trigger verifies every allocation uses the transaction booking and that the allocation sum equals the verified transaction amount before commit. A verified reversal must carry the exact allocation kinds, booking, and amounts of the original transaction. The payment-verification operation creates/validates allocations and changes booking state in one transaction.

`public.payment_proofs`

- `id` PK, transaction ID, owner user ID, opaque private object path, hash and media metadata, upload and retention/deletion timestamps, and `supersedes_id`.
- Optional and never sufficient to verify the transaction.

`public.deposit_settlements`

- Versioned, append-only decision records for a booking's verified deposit allocation.
- Stores held amount, net refund amount, manually decided deduction amount,
  reason, status (`pending`, `final`, `reversed`), decision actor/time, optional
  outgoing verified transaction, linked issue decision, operation UUID, and
  `supersedes_id`.
- A final record requires `refund_amount + deduction_amount = held_amount`; nonzero refund requires an outgoing GCash transaction and reference.
- Dashboard rental revenue sums verified `rental_payment` allocations net of reversals only. Security-deposit and refund allocations are excluded.

### Owner operations and portfolio reporting

`api.get_owner_operations_dashboard()` is one sole-admin, database-clock
snapshot. It owns the nine required queues: booking review, contract signature,
payment review, pickup, active rental, physical return, issue review, held
deposit, and pending refund. Counts are calculated from the exact returned
arrays. Supporting identity and cancellation queues preserve earlier workflows
but omit government-ID type, evidence metadata, and free-form cancellation
reason. Any function or strict DTO failure closes the operations surface; it is
never converted into zero.

Deposit reconciliation uses signed verified security-deposit allocations,
decision-linked deductions, and the immutable external refund/reversal ledger.
Verified deposits minus deductions minus net refunds equals remaining
liability; held and terminal pending-refund queues partition that remaining
liability exactly. Deposit movements never enter rental revenue.

`api.get_owner_portfolio_report(start_date, end_date)` accepts a nonempty Manila
date interval `[start, end)`. Period revenue is signed verified
`rental_payment` allocation value recognized at `payment.decided_at`. Camera
drill-downs attribute through the booking camera and sum to the portfolio
total. Utilization intersects scheduled booking ranges with both the report
period and camera creation/archive window before unioning and measuring
duration. Maintenance/manual ranges use the same lifecycle clipping, ignore
empty early-release intervals, and remain separate. Archived cameras stay
reportable. Acquisition cost and recovery exist only in this sole-admin
projection; null/zero cost returns an explicit unavailable result. Public
catalog/availability projections remain unchanged and exclude unpublished
inventory/private fields.

### Pickup, return, and condition

`public.handoffs`

- `id` PK, booking ID, type, conducted time/admin, named renter present, original ID checked/matched, camera serial checked, accessory checklist completed, actual handoff/return time, notes, idempotency operation ID, and the exact verification/contract/payment references used at pickup.
- Unique `(booking_id, type)`. Pickup completion guards `CONFIRMED → ACTIVE`; return completion guards `ACTIVE → RETURN_REVIEW`.

`public.condition_reports`

- `id` PK, handoff ID unique, camera condition summary, serialized accessory checklist snapshot, damage/missing flags, notes, reporter, and created time.
- Reports are immutable after the associated state transition.

`public.condition_photos`

- `id` PK, condition report ID, opaque private object path, media/hash metadata, evidence category, created time, lifecycle metadata, and `supersedes_id`.
- Corrections add new evidence; objects are never overwritten.

`public.return_issue_notes` and `public.return_issue_decisions`

- Notes are private append-only rows tied to the return report and operation.
- One immutable decision records fact-matching kind, manual deduction amount,
  private evidence basis, separate renter explanation, actor/time, and operation.

`public.deposit_deductions` and `public.deposit_refund_records`

- Every nonzero deduction references one approved return issue decision and
  snapshots its private reason; it cannot exceed the verified deposit.
- The refund ledger records an actual outgoing refund or exact incoming
  reversal, its verified payment transaction, external movement time,
  operation, and immutable `reversal_of` relation.

### Audit

`private.audit_logs`

- Append-only identity PK, occurred time, actor/user and session IDs, operation/correlation ID, action, entity type/ID, outcome, purpose, request metadata digest, and minimal structured metadata.
- Records privileged decisions, rejected operations, sensitive-file URL issuance/access, admin queries of verification evidence, finance reversals, contract supersession, retention actions, and admin bootstrap changes.
- No secret keys, raw tokens, full IDs, GCash references, or evidence URLs are written to logs.

## Transaction boundaries

Each operation locks its aggregate row, rechecks authorization and current state, writes all effects, appends state/audit history, and commits once.

| Operation | Atomic effects |
| --- | --- |
| `ensure_profile` | Idempotently create the authenticated user's profile |
| `request_booking` | Create own `FOR_REVIEW` booking and history; no availability block |
| `approve_booking` | Validate admin, future pickup, active renter, camera, pricing, template, and accessory set; lock booking/camera; calculate approved snapshots; recheck overlap; insert block; set 24-hour deadline; issue contract v1; append history/audit |
| `reject_booking` | Require current `FOR_REVIEW`; transition to `REJECTED`; append reason/history/audit; release any defensive booking hold |
| `authorize_verification_evidence_access` | Re-authorize sole admin and exact `identity_review` purpose; lock current pending retained evidence; append path-free access audit; return a 60-second target only to the Server Action |
| `decide_verification` | Lock latest pending record and the exact document authorized for review; require current evidence and active profile; validate allowed verified metadata or renter-safe rejection code; update projection; append immutable decision/audit history |
| `expire_due_verifications` | Idempotently expire latest verified records after their Asia/Manila document date while preserving the earlier decision facts and appending system history/audit |
| `supersede_contract` | Recheck overlap for material schedule changes; supersede current version; create new snapshot; require new signature; never reset deadline |
| `sign_contract` | Validate current version/renter/deadline; append signature; transition to `TO_PAY` |
| `submit_payment` | Validate owner, `TO_PAY`, current signed contract, versioned recipient, exact amount, and strict deadline; insert one idempotent submitted transaction and enter `PAYMENT_REVIEW` |
| Payment-proof intent/finalize/cleanup operations | Bind exact owner and submitted transaction to a private no-overwrite object; verify stored metadata/digest; preserve correction supersession and interrupted-upload recovery |
| `authorize_payment_proof_access` | Re-authorize sole admin and exact reconciliation purpose; append a path-free access audit; return a 60-second target only to the Server Action |
| `verify_payment` | Confirm actual-account check, amount, timely submission, and normalized unique reference; derive balanced allocations and enter `CONFIRMED` atomically |
| `reject_payment` | Apply a safe reason and choose `TO_PAY` or `EXPIRED` from the database clock; preserve deadline and release the block only on expiry |
| `expire_due_bookings` | Idempotently expire only `CONTRACT_PENDING`/`TO_PAY` past deadline; release blocks; append system history |
| `get_pickup_queue`, `get_pickup_detail` | Return sole-admin, explicit minimized pickup readiness/detail without paths, digests, serial authority, or financial facts |
| `complete_pickup` | Under the booking lock, validate the active profile, signed contract, verified balanced payment, named renter, physical original-ID match, and every typed checklist fact; retain no ID copy or fields; insert one immutable handoff/report; transition `CONFIRMED → ACTIVE` idempotently |
| Condition-photo intent/finalize/cleanup operations | Bind optional pickup evidence to one exact opaque no-overwrite object; verify Storage metadata and caller-confirmed digest; recover unfinished objects |
| Condition-photo access operations | Return an exact private target only to its renter or after a purpose-bound audited admin authorization for a 60-second server-signed URL |
| `get_my_pickup_state`, `get_active_rental_queue` | Return an owned safe handoff/timeline or the sole-admin minimum active-rental contact and schedule urgency; never calculate a late amount |
| `record_return` | Validate observed serial and exact accessory results; insert immutable return handoff/report; transition `ACTIVE → RETURN_REVIEW` idempotently |
| Return condition-photo intent/finalize/access | Bind exact private no-overwrite evidence, allow append-only supersession, and require owner or audited `return_condition_review` purpose |
| `decide_return_review` | Derive clear/issue path from recorded facts; require evidence for damage/missing; create deposit-liability snapshot; enter `COMPLETED` or `ISSUE_REVIEW` |
| `add_return_issue_note`, `resolve_return_issue` | Append private note; record explicit fact-matching decision and bounded linked deduction; transition `ISSUE_REVIEW → COMPLETED` |
| `request_cancellation`, `decide_cancellation` | Append owner request without state change; recheck admin/state/policy; record immutable decision; on approved unpaid acceptance transition to `CANCELLED` and release block |
| `record_external_refund` | After actual external movement, append verified outgoing GCash transaction, deposit-refund allocation/ledger row, and settlement version; never call a payment API |
| `reverse_external_refund` | Append one exact opposite verified movement and reversal ledger row; never edit the original refund |
| Resolution queue/detail/owner projections | Return four admin queues, safe admin detail without paths/digests/serial authority, and an owned final-outcome/amount projection without internal reason or references |
| Owner operations/portfolio projections | Re-authorize the sole admin; return minimized deterministic current queues or Manila half-open immutable-ledger metrics; reject invalid periods and inconsistent liability |
| `create_upload_intent` | Authorize owner/admin, allocate opaque path and metadata row before upload |
| `finalize_upload` | Verify object metadata/hash and freeze evidence row |

The expiration function is safe to invoke on a schedule and opportunistically before approval/availability reads. Prefer the existing Supabase Cron capability if enabled; no new service is required.

## RLS and permission matrix

`anon` and `authenticated` receive no blanket table privileges. Grants and RLS must both pass.

| Resource | Anonymous | Renter | Admin |
| --- | --- | --- | --- |
| Public camera views/photos | Read published | Read published | Read all; mutate through operations |
| Public booking quote | Quote published cameras through `api.quote_booking`; no booking or private-table access | Same public quote; authoritative request/approval rules still apply | Same public quote; approval calculates its own authoritative snapshot |
| Sanitized availability view | Read busy ranges | Read busy ranges | Read full operational schedule |
| Profile | None | Read/update approved own fields | Read accounts; controlled status operations |
| Verification records/docs metadata | None | Read own safe state; create upload intent while feature enabled | Read decision records required for operations; document path/hash metadata remains owner-only until a separate audited review operation |
| Bookings/history/cancellations | None | Read own; request/cancel through operations | Read all; transition through operations |
| Contract versions/signatures | None | Read own; sign current version only | Read all; issue/supersede through operations |
| Payments/proofs/deposit | None | Read narrow own state; submit/finalize only in allowed state | Read narrow queue/detail/accounting/audit projections; access proof and decide/reverse/settle only through audited operations |
| Handoffs/conditions/evidence metadata | None | Read owned safe projections and authorized owned photo bytes | Read minimized pickup/active projections; create through handoff operations; finalized condition-photo paths only through audited authorization |
| Owner operations/performance | None | None | Read only through the two sole-admin API projections; acquisition cost and recovery never enter public/renter views |
| Admin singleton/audit log | None | None | Read via narrow admin views; never mutate directly |

Policy rules:

- `TO authenticated` is always combined with an ownership or `private.is_admin()` predicate.
- Update policies include both `USING` and `WITH CHECK`; most domain updates are revoked entirely in favor of operations.
- RLS ownership uses `(select auth.uid())` and table keys, not user-editable metadata.
- Public views use `security_invoker = true` and have RLS-safe source policies.
- Immutable tables have no application `UPDATE`/`DELETE` grants even if RLS would otherwise filter rows.
- `service_role` exists only in server/ops environments and bypasses RLS; its use is audited and never substitutes for business authorization in user-triggered operations.
- Sensitive authorization verifies the authenticated user server-side; session claims are refreshed before high-risk actions.

## Database-level invariants checklist

- Exactly zero or one admin row structurally; exactly one verified during deployment.
- Camera serial numbers are unique and private.
- Dates and money are valid and currency is PHP.
- No active overlapping block for one camera.
- One booking block per approved booking.
- Deadline is derived once from approval and never reset.
- Only one current contract version; all snapshots/signatures are immutable.
- Verified GCash references cannot be reused.
- Verified allocation sum equals transaction amount at commit.
- Every payment allocation uses its transaction's immutable booking.
- Verified reversal allocations exactly match the original allocation set.
- Period rental revenue equals its per-camera drill-down and excludes every non-rental allocation.
- Deposit liabilities reconcile verified deposits, linked deductions, net external refunds, and their exact work queues.
- Utilization intervals are clipped, half-open, and unioned before duration.
- Final deposit settlement balances the held deposit.
- State history, signatures, verified finance, condition reports, and audit events are append-only.
- Historical verification decisions and automatic Manila-date expiry remain
  append-only, but no online verification record controls booking eligibility.
- Historical foreign keys use `RESTRICT`; no cascade can erase booking or finance history.

## Migration acceptance tests

The repository contains thirty-two forward migrations. On 13 August 2026, the four
booking-milestone migrations were applied to Production through a separately
authorized, database-first rollout after Development/Preview verification,
leaving both hosted projects at 11/11 at that checkpoint. On 14 August 2026, the
catalog-photo publication and unpublished-availability migrations were applied
and exercised in Development. They were separately applied to Production with
the approved catalog on 15 August 2026. The Sprint 1 evidence migration was
applied and tested in Development that day. Development later reached 21/21,
and an authorized Production run applied and verified the same 21 migrations.
Migration 22 retires online KYC and introduces the minimized physical pickup
control. The automatic workflow checks current remote history at every rollout;
these historical counts are not a substitute for that check.

Hosted SQL diagnostics are deliberately allowlist-only. The runner extracts
bounded operational fields from raw responses and removes the temporary response
and curl-error files without logging them. A transport, timeout, rate-limit, or
5xx outcome is indeterminate and requires migration-history and hosted-state
reconciliation before any retry; the runner never automatically resubmits SQL.

Before **each** linked hosted database command, run the target check immediately
before the command and require the exact Development ref:

```bash
cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm dlx supabase@2.114.0 db push --linked --dry-run

cat supabase/.temp/project-ref
# Must print exactly: ekmoiepalelqpmemvrkl
pnpm dlx supabase@2.114.0 db push --linked
```

A missing or different ref is a hard stop. Migration work is forward-only and
migration-first; verify flags against the repository-pinned CLI's `--help`.
Never run `supabase db reset --linked` directly or forward `--linked` through
`pnpm db:reset` (including `pnpm db:reset -- --linked` or any equivalent), link
Production for routine work, or run `supabase config push`. The exact
no-argument `pnpm db:reset` command documented in the README targets Local.
Docker-backed resets are local-only when a healthy local stack is intentionally
in use; Docker reset/prune is not CamNook troubleshooting, and the socket-only
concurrency harness does not require Docker.

Before any future Development migration can be considered for a separately
authorized Production rollout:

1. Run tests as `anon`, renter A, renter B, admin, and service role.
2. Prove renter A cannot enumerate or mutate renter B data or files.
3. Race two approval transactions for overlapping dates and prove exactly one commits.
4. Prove `FOR_REVIEW` creates no block and every terminal state releases one.
5. Prove signing does not change the deadline and a timely payment remains in review past it.
6. Prove direct state updates and immutable-row updates fail.
7. Prove duplicate verified GCash references and unbalanced allocations fail.
8. Prove public views reveal no private identifiers.
9. Run Supabase security and performance advisors and resolve applicable findings.
10. Generate TypeScript database types only after the approved migration is applied.

Run the database, RLS, concurrency, and advisor validation in Local and then
against Development. Protected Vercel Preview is the application/browser smoke
validation target after the Development database is verified; Preview is not a
database-test environment. A reviewed merge to `main` authorizes the same
revision's forward Production migrations after CI and the automatic Development
rollout pass, then promotes only the same prebuilt application candidate after
Production verification. Production environment-variable changes, runtime
activation, and data mutation remain separate release actions.
