# Sprint 1 Government ID Evidence — Acceptance Matrix

Status: v2 privacy hardening implemented locally on 2026-08-15; real-ID collection not authorized
Issues: [#13](https://github.com/jlescarlan11/camnook/issues/13) through [#21](https://github.com/jlescarlan11/camnook/issues/21)
Hosted rollout: not included; the forward migration resets every environment to disabled when applied

## Current technical constraints (not legal approval)

| Decision | Current value |
| --- | --- |
| Evidence policy | `government-id-evidence-v2` |
| Privacy notice | `government-id-privacy-v2` |
| Accepted IDs | Philippine passport, PhilSys ID/ePhilID, driver’s license, UMID |
| Accepted files | JPEG or PNG; PDF rejected |
| Maximum | 5 MiB, one masked side/page |
| Intent lifetime | 15 minutes |
| Live-object retention | Delete when no longer needed and no later than 30 days; owner withdrawal is immediate; superseded evidence becomes due for cleanup |
| Raw-byte readers in Sprint 1 | Owning renter workflow only; anonymous, other renters, and application admin are denied; the server-only retention worker can delete but never returns bytes |
| Replacement | New object and metadata; earlier evidence is superseded, never overwritten |
| Deletion | Request anytime; immediately remove if unheld; verify absence before completion |
| Deliberately excluded metadata | Full ID number, OCR output, private URL/path on account pages, raw content/digest in audit logs |

## Issue-by-issue criteria

| Issue | Acceptance criterion | Implementation evidence |
| --- | --- | --- |
| #13 | Privacy notice, retention schedule, ID types, file types, and limits are explicit. | Versioned policy row, privacy notice, account notice, and policy documentation. |
| #13 | A renter can upload one owner-scoped government ID to private Storage. | Intent RPC, exact Storage `INSERT` policy, Server Action, and account form. |
| #13 | Only the uploader can upload/read document metadata or bytes. | Owner-only document-table RLS, exact private intent helpers, owner-only Storage `SELECT`/`INSERT`, and cross-account/admin SQL tests. Admin access remains limited to decision records needed by existing operations. |
| #13 | No overwrite or public URL exists. | No Storage `UPDATE` policy; opaque private bucket path; no signed/permanent URL returned. |
| #13 | Exit tests cover renter A, renter B, and admin isolation. | `004_verification_evidence_lifecycle.sql`. |
| #14 | Notice appears before upload. | Account verification card renders the full summary before the form and links the versioned notice. |
| #14 | Purpose, access, retention, deletion, legal hold limits, missing controller/DPO facts, and non-approval status are clear. | Account copy plus `government-id-privacy-notice-v2.md` and public draft-notice page. |
| #14 | No intent is issued unless the gate, specific consent, and exact rendered notice version are current. | Server re-reads policy; hidden version tokens and affirmative consent must match; the service-only mutation records the consent event time and checks `enabled`, policy version, and notice version. |
| #15 | Only approved media and size can be uploaded. | Browser `accept`/size check, server MIME/signature/size check, bucket limits, and exact intent metadata RLS. |
| #15 | Path is opaque and owner/record/document scoped. | `{owner_uuid}/{record_uuid}/{document_uuid}.{ext}` generated only in the database. |
| #15 | Other renters cannot create/read/replace/finalize. | Authenticated clients have no mutation-RPC execute grant; Server Actions pass the authenticated owner through a service-only boundary; RLS and negative SQL tests cover metadata, Storage, upload, and finalization. |
| #16 | Pending record exists only after the object is present and verified. | Finalize RPC validates Storage metadata; Server Action downloads and hashes stored bytes first. |
| #16 | Account page exposes safe state without path/digest. | `get_my_verification_upload_state` projection plus Zod stripping and UI regression tests. |
| #16 | Refresh/retry creates no duplicate current records. | Idempotent intent/finalize functions, partial unique indexes, digest reconciliation, and SQL/unit tests. |
| #17 | Abandoned intents expire and objects can be cleaned safely. | Expiry-aware intent state, prepare/remove/finalize RPCs, and the protected daily cleanup worker. |
| #17 | Byte deletion preserves decision/audit history. | Lifecycle updates metadata only; record and audit assertions remain after verified deletion. |
| #17 | Retention audit contains no URL/content/digest. | Minimal actor-aware verification audit metadata and leakage assertions. |
| #18 | Accepted ID/media/maximum are clear to the renter. | Policy-driven account lists and privacy notice. |
| #18 | Client, server, bucket, and Storage RLS restrictions agree. | Shared 5 MiB/JPEG/PNG policy enforced at all four layers; PDF is negatively tested. |
| #18 | No full government ID number is requested or stored. | No form field/API argument; catalog assertion scans verification RPC argument names. |
| #19 | Expired, suspended, or policy-revoked intents cannot accept Storage insert or finalize. | Exact RLS predicates plus independent finalization rechecks with SQL tests. |
| #19 | Retry reconciles an already-present exact object. | Matching owner/file/policy metadata resumes the existing intent even when a new form action proposes another UUID; downloaded size/hash verification and idempotent finalize retry have SQL and unit regression tests. |
| #19 | Ambiguity fails closed with cleanup/restart. | Cleanup-pending state, exact owner delete, database absence verification, and safe client error. |
| #20 | Replacement allocates new object and metadata. | New UUID intent/document path and `supersedes_id`. |
| #20 | Earlier evidence is superseded, never overwritten, and promptly removed. | `superseded_at`, no Storage `UPDATE`, distinct-path SQL assertion, and a trigger that makes the old object due for protected cleanup. |
| #20 | Only one current submission controls account state. | Current-record/document partial unique indexes and replacement concurrency locks. |
| #21 | Retention and legal hold control deletion. | Thirty days is the outside deadline; the request RPC immediately claims an unheld owner object and blocks held evidence. |
| #21 | Completion requires verified object absence. | Account deletion and the scheduled worker both perform exact Storage removal followed by database-side absence checks before `verified_deleted_at`. |
| #21 | Unrequested objects are enforced when retention becomes due. | Daily CRON-secret-protected cleanup claims every due, non-held object plus abandoned intent; batch/unit and SQL tests prove retryable removal and system-audited completion. |
| #21 | Decision and path-free audit history remain. | No row deletion; SQL assertions verify both histories after byte removal. |

## Activation blockers

The implemented storage workflow does not perform identity verification because
no authorized reviewer can read the evidence. Production remains blocked until
the legal controller and address, DPO/privacy lead, Section 13 basis, consent
decline/alternative design, provider roles and regions, cross-border safeguards,
backup facts, metadata schedule, reviewer/read-audit workflow, legal-hold
operation, rights procedure, PIA/ROPA/PMP, NPC registration assessment, breach
plan, and written Philippine privacy-counsel approval are complete. See
[`government-id-privacy-notice-v2.md`](government-id-privacy-notice-v2.md).

## Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The disposable PostgreSQL harness replays every migration and cannot be redirected to a hosted database. Browser smoke testing with synthetic evidence is required only after a separately authorized Development migration and Preview deployment.
