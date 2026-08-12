# Database and Authorization Architecture

Status: approved on 2026-08-12<br>
Policy source: [`docs/product/mvp-rental-policy-v0.1.md`](../product/mvp-rental-policy-v0.1.md)<br>
Target project: Supabase `CamNook` (`iegcixcevvkryfwfotqz`), PostgreSQL 17, `ap-northeast-1`

## Architecture decision

Confirm the preferred stack: Next.js 16 App Router, strict TypeScript, pnpm, Tailwind CSS, shadcn/ui, Supabase Auth/Postgres/Storage, PostgreSQL RLS, Vercel, and Vitest for pure domain rules. This is sufficient for the MVP; no additional service is justified.

The Supabase project already exists outside Vercel Marketplace. During the application milestone, connect that existing project and synchronize only its publishable URL/key and server-only secrets. Do not provision a duplicate database. Use Vercel's default Node.js Fluid Compute runtime; streaming or Server Actions do not require Edge runtime.

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

PostgreSQL grants function execution to `PUBLIC` by default. Migrations must revoke that default at schema and function level, then grant individual operations to `authenticated` or `service_role` only.

### `private`

Not exposed through the Data API. Contains the admin singleton, append-only audit log, authorization helpers, deferred constraint triggers, and transactional operation implementations. `SECURITY DEFINER` is permitted only here, with:

- `search_path = ''`;
- fully qualified object names;
- an explicit `auth.uid()` presence and ownership/admin check;
- execution revoked from `PUBLIC` and `anon`;
- the smallest explicit execution grant; and
- tests for direct-call and cross-account attacks.

This keeps privileged code out of `public` while allowing a reviewed `api` wrapper to be the only reachable entrypoint.

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

- `id` PK, `verification_record_id`, `owner_user_id`, opaque `object_path` unique, media type, byte size, SHA-256, created time, retention/deletion timestamps, and optional `supersedes_id`.
- Ownership is duplicated from the parent intentionally for cheap RLS and Storage-policy checks; a constraint trigger verifies it matches the record owner.
- Rows are append-only after upload finalization. Deleting the Storage object updates lifecycle metadata but never deletes the verification decision.

### Inventory and public discovery

`public.cameras`

- `id` PK, unique slug, private unique serial number, name, description, `status`, daily rate, security deposit, acquisition cost, replacement value, and publication/archive timestamps.
- Rates and values are nonnegative; published cameras require complete public content, a rate, and a deposit.
- `DELETE` is revoked. `archive_camera()` is the only removal operation after any booking reference exists.
- Public projections never include serial number, acquisition cost, replacement value, or internal notes.

`public.camera_photos`

- `id` PK, `camera_id` FK, opaque public object path unique, alt text, sort position, and active/archive timestamps.
- Unique `(camera_id, sort_position)` among active photos.

`public.camera_accessories`

- `id` PK, `camera_id` FK, name, quantity (`> 0`), optional replacement value, sort position, and archive timestamp.
- Accessories are inventory descriptions only; no renter-selectable or independent pricing fields exist.

`public.public_cameras`, `public.public_camera_photos`, and `public.public_availability`

- `security_invoker = true` views containing only approved public columns.
- `public_availability` returns camera ID plus busy range and generalized reason (`booked` or `unavailable`), never booking ID or renter data.
- Because RLS controls rows rather than columns, anonymous access also uses explicit column-level grants on the source tables. `anon` receives no privilege on serial, cost/value, booking, renter, or internal-note columns and cannot bypass the projection with a direct Data API query.

### Requests, reservations, and exclusion constraint

`public.bookings`

- `id` PK; `renter_id`, `camera_id`; current `state`; requested `pickup_at`/`return_at`; intended use, expected location, and operator notes; request/approval/deadline timestamps; approver; authoritative pricing snapshots; and current contract version ID.
- `renter_id` is always derived from `auth.uid()` by `request_booking()` and is not accepted as caller input.
- `pickup_at < return_at`; request times are immutable after approval except through the contract-supersession operation.
- `approval_deadline_at = approved_at + interval '24 hours'` and cannot be updated independently.
- Price fields are null in `FOR_REVIEW` and required once approved. `total_due = rental_amount + security_deposit_amount` is generated or constrained.
- No calculator is implemented until the billable-day formula is approved. The future approval function reads the camera rate itself and calls an approved pure pricing function; it never accepts an authoritative total from a renter.

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

- `id` PK, booking ID, requester, reason, requested time, disposition (`pending`, `accepted`, `declined`), decision actor/time, and note.
- A renter creates only for their booking. Acceptance and `CANCELLED` transition occur atomically; declined requests remain as history.

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
- A deferred constraint trigger verifies the allocation sum equals the verified transaction amount before commit. The payment-verification operation creates/validates allocations and changes booking state in one transaction.

`public.payment_proofs`

- `id` PK, transaction ID, owner user ID, opaque private object path, hash and media metadata, upload and retention/deletion timestamps, and `supersedes_id`.
- Optional and never sufficient to verify the transaction.

`public.deposit_settlements`

- Versioned, append-only decision records for a booking's verified deposit allocation.
- Stores held amount, refund amount, manually decided deduction amount, reason, status (`pending`, `final`, `reversed`), decision actor/time, optional outgoing verified transaction, and `supersedes_id`.
- A final record requires `refund_amount + deduction_amount = held_amount`; nonzero refund requires an outgoing GCash transaction and reference.
- Dashboard rental revenue sums verified `rental_payment` allocations net of reversals only. Security-deposit and refund allocations are excluded.

### Pickup, return, and condition

`public.handoffs`

- `id` PK, booking ID, type, conducted time/admin, named renter present, original ID checked/matched, camera serial checked, accessory checklist completed, actual handoff/return time, and notes.
- Unique `(booking_id, type)`. Pickup completion guards `CONFIRMED → ACTIVE`; return completion guards `ACTIVE → RETURN_REVIEW`.

`public.condition_reports`

- `id` PK, handoff ID unique, camera condition summary, serialized accessory checklist snapshot, damage/missing flags, notes, reporter, and created time.
- Reports are immutable after the associated state transition.

`public.condition_photos`

- `id` PK, condition report ID, opaque private object path, media/hash metadata, evidence category, created time, lifecycle metadata, and `supersedes_id`.
- Corrections add new evidence; objects are never overwritten.

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
| `approve_booking` | Validate admin and current verification; lock booking/camera; calculate approved snapshots; recheck overlap; insert block; set 24-hour deadline; issue contract v1; append history/audit |
| `reject_booking` | Transition `FOR_REVIEW → REJECTED`; append reason/history |
| `supersede_contract` | Recheck overlap for material schedule changes; supersede current version; create new snapshot; require new signature; never reset deadline |
| `sign_contract` | Validate current version/renter/deadline; append signature; transition to `TO_PAY` |
| `submit_payment` | Validate `TO_PAY` and deadline; insert submitted transaction/proof metadata; transition to `PAYMENT_REVIEW` |
| `decide_payment` | Verify or reject against real GCash; balance allocations; transition to `CONFIRMED`, `TO_PAY`, or `EXPIRED`; release block when expired |
| `expire_due_bookings` | Idempotently expire only `CONTRACT_PENDING`/`TO_PAY` past deadline; release blocks; append system history |
| `complete_pickup` | Validate verification and all checklist fields; insert immutable handoff/report; transition `CONFIRMED → ACTIVE` |
| `record_return` | Insert return handoff/report; transition `ACTIVE → RETURN_REVIEW` |
| `decide_return` | Transition clear return to `COMPLETED` or issue to `ISSUE_REVIEW`; create/update append-only deposit decision |
| `complete_issue_review` | Finalize manual decision and transition to `COMPLETED` |
| `cancel_booking` | Resolve cancellation request if any; transition eligible pre-pickup state; release block; append history |
| `record_refund` | Record outgoing verified GCash transaction, allocation, and settlement version; never call a payment API |
| `create_upload_intent` | Authorize owner/admin, allocate opaque path and metadata row before upload |
| `finalize_upload` | Verify object metadata/hash and freeze evidence row |

The expiration function is safe to invoke on a schedule and opportunistically before approval/availability reads. Prefer the existing Supabase Cron capability if enabled; no new service is required.

## RLS and permission matrix

`anon` and `authenticated` receive no blanket table privileges. Grants and RLS must both pass.

| Resource | Anonymous | Renter | Admin |
| --- | --- | --- | --- |
| Public camera views/photos | Read published | Read published | Read all; mutate through operations |
| Sanitized availability view | Read busy ranges | Read busy ranges | Read full operational schedule |
| Profile | None | Read/update approved own fields | Read accounts; controlled status operations |
| Verification records/docs metadata | None | Read own; create upload intent while feature enabled | Read all; decide through operation |
| Bookings/history/cancellations | None | Read own; request/cancel through operations | Read all; transition through operations |
| Contract versions/signatures | None | Read own; sign current version only | Read all; issue/supersede through operations |
| Payments/proofs/deposit | None | Read own; submit only in allowed state | Read all; decide/reverse/settle through operations |
| Handoffs/conditions/evidence metadata | None | Read own booking records | Read all; create through handoff operations |
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
- Final deposit settlement balances the held deposit.
- State history, signatures, verified finance, condition reports, and audit events are append-only.
- Historical foreign keys use `RESTRICT`; no cascade can erase booking or finance history.

## Migration acceptance tests

Before any production migration is accepted:

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
