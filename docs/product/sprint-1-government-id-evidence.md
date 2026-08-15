# Sprint 1 Government ID Evidence — Acceptance Matrix

Status: implemented locally on 2026-08-15
Issues: [#13](https://github.com/jlescarlan11/camnook/issues/13) through [#21](https://github.com/jlescarlan11/camnook/issues/21)
Hosted rollout: not included; Development and Production remain unchanged

## Approved decisions

| Decision | Approved value |
| --- | --- |
| Evidence policy | `government-id-evidence-v1` |
| Privacy notice | `government-id-privacy-v1` |
| Accepted IDs | Philippine passport, PhilSys ID/ePhilID, driver’s license, UMID |
| Accepted files | JPEG, PNG, PDF |
| Maximum | 5 MiB, one file |
| Intent lifetime | 15 minutes |
| Live-object retention | 30 days per finalized object |
| Raw-byte readers in Sprint 1 | Owning renter workflow only; anonymous, other renters, and application admin are denied; the server-only retention worker can delete but never returns bytes |
| Replacement | New object and metadata; earlier evidence is superseded, never overwritten |
| Deletion | Request anytime; remove when retention is due and no legal hold; verify absence before completion |
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
| #14 | Purpose, access, retention, deletion, and legal hold are clear. | Account copy plus `government-id-privacy-notice-v1.md` and public notice page. |
| #14 | No intent is issued unless the gate, acknowledgement, and exact rendered notice version are current. | Server re-reads policy; hidden version tokens and acknowledgement must match; service-only database mutation records acknowledgement time and checks `enabled`, policy version, and notice version. |
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
| #18 | Client, server, bucket, and Storage RLS restrictions agree. | Shared 5 MiB/JPEG/PNG/PDF policy enforced at all four layers. |
| #18 | No full government ID number is requested or stored. | No form field/API argument; catalog assertion scans verification RPC argument names. |
| #19 | Expired, suspended, or policy-revoked intents cannot accept Storage insert or finalize. | Exact RLS predicates plus independent finalization rechecks with SQL tests. |
| #19 | Retry reconciles an already-present exact object. | Matching owner/file/policy metadata resumes the existing intent even when a new form action proposes another UUID; downloaded size/hash verification and idempotent finalize retry have SQL and unit regression tests. |
| #19 | Ambiguity fails closed with cleanup/restart. | Cleanup-pending state, exact owner delete, database absence verification, and safe client error. |
| #20 | Replacement allocates new object and metadata. | New UUID intent/document path and `supersedes_id`. |
| #20 | Earlier evidence is superseded, never overwritten. | `superseded_at`, no Storage `UPDATE`, distinct-path SQL assertion. |
| #20 | Only one current submission controls account state. | Current-record/document partial unique indexes and replacement concurrency locks. |
| #21 | Retention and legal hold control deletion. | Request RPC schedules early requests and blocks held evidence. |
| #21 | Completion requires verified object absence. | Account deletion and the scheduled worker both perform exact Storage removal followed by database-side absence checks before `verified_deleted_at`. |
| #21 | Scheduled requests and unrequested objects are enforced when retention becomes due. | Daily CRON-secret-protected cleanup claims every due, non-held object plus abandoned intent; batch/unit and SQL tests prove retryable removal and system-audited completion. |
| #21 | Decision and path-free audit history remain. | No row deletion; SQL assertions verify both histories after byte removal. |

## Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:concurrency
```

The disposable PostgreSQL harness replays every migration and cannot be redirected to a hosted database. Browser smoke testing with synthetic evidence is required only after a separately authorized Development migration and Preview deployment.
