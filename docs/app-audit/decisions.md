# Decisions

- Resume clean existing `codex/reliability-audit` branch; preserve all existing commits.
- Use `docs/app-audit/` for compact persistent state and ignored `.vercel/app-audit/` for bulky screenshots. Do not save credentials or private user data.
- Treat current README's in-person ID policy as superseding retired online-ID requirements in the original MVP policy. Do not introduce lender onboarding: this is a single-owner business.
- No visual redesign or speculative features. Prioritize reproducible blocked tasks and recovery issues.
- Existing environment and supported development session/fixture scripts are preferred over new infrastructure.
- AUD-001 follows Cloudflare's documented widget reset API; no CAPTCHA bypass or hosted auth setting changes. References: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/ and https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/ .

- Local DNS intermittently returns SERVFAIL for Development while direct public resolver succeeds. Ignored `.vercel/app-audit/dns-fallback.mjs` supplies a process-local fallback only for the verified Development hostname and Geoapify service hostnames after ENOTFOUND/EAI_AGAIN. Ordinary TLS and auth remain intact; no OS resolver or application production configuration changed. Dev/session scripts passed their original checks with this harness.
- AUD-004 reuses established muted ink rather than inventing another palette color. Browser contrast checks serve as regression evidence for this CSS-only correction.

- AUD-007 uses existing one-day, tab-only draft storage convention, isolated by account/camera. Separate schedule snapshots retain operation identity; uncertain submissions preserve their exact payload and meetup snapshot. Pre-booking outages cannot clear prior uncertainty. Storage failure keeps the current form usable; restoration uses a matching main-draft operation when a separate operation write failed. Successful server response returns a validated booking ID so client clears the draft before navigation. Review stays explicit for unsubmitted drafts.

- AUD-008 uses a native GET form for reload recovery with a fixed local action and existing query allowlist. No new client bundle or backend error classification is needed; fresh authoritative context remains required.

- AUD-010 keeps selected-thumbnail styling separate from the accessible meaning of a lightbox trigger. A data attribute is sufficient for the visual outline; `aria-pressed` would misdescribe activation as a toggle.

- AUD-011 does not treat a transient claims failure as an authenticated decision. The proxy only defers its redirect so the existing route-level guards re-verify authorization and can surface the established retry state; missing and invalid claims still redirect to login.

- AUD-012 uses the current `next/image` loading strategy: eagerly request only the initially visible full-size gallery photo, while retaining lazy thumbnails. The older `preload` prop did not produce the intended rendered behavior in this client gallery.

- AUD-013 keeps the existing inline error alerts and focus recovery, then adds explicit control-to-error associations. Stable IDs are adequate because one request form mounts per checkout or listing flow.

- AUD-014 uses the existing KYC Field wrapper to compose an error reference with any description a child already supplies. This preserves the mobile input's country-code guidance while adding validation context.

- AUD-015 keeps PSGC loading and selection status intact by composing its generated status ID with the optional validation-error ID on the semantic fieldset.

- AUD-016 treats the residential pin as a labelled composite region, not a native invalid input. Its active error or reconfirmation instruction is described from that region without applying unsupported invalid state.

- AUD-017 composes a dynamic proof-error ID with the existing static file/privacy guidance so the guidance remains available when validation fails.

- AUD-018 treats the generated security report as the canonical scan artifact and records only the result and its runtime limitations in repository audit notes. It does not copy scan artifacts or secret-related configuration into the repository.

- AUD-019 treats calendar dates as action buttons. The label supplies the chosen pickup/return state, which avoids changing the date selector into a checkbox-like toggle while preserving visible range styling.

- AUD-020 attaches each owner payment-review server error directly to the native control it corrects. Verification and rejection state remain separate, so each form only identifies its own current validation messages.

- AUD-021 composes recipient-account validation with the reusable Philippine mobile control's existing country-code description instead of replacing that required formatting context.

- AUD-022 gives every affected native checkbox its common checklist error rather than attaching the message only to a visual wrapper. The original-ID and accessory errors apply to multiple related confirmations, so their stable message IDs are intentionally shared.

- AUD-023 assigns the file-upload result an ID only for the field-specific photo error. Generic failure and success states remain plain result announcements and do not imply a problem with the file control.

- AUD-024 applies the common terms validation message to every required contract textarea because the server only returns a whole-template terms error, not per-term granularity. It does not claim which individual term failed.

- AUD-025 composes persistent format help with dynamic validation feedback rather than treating them as mutually exclusive. Weekday validation is intentionally shared across each native checkbox because the server evaluates the day set as a whole.

- AUD-026 sends canonical-area validation to the existing semantic PSGC fieldset API rather than exposing the error from a visual section wrapper.

- AUD-027 treats manual latitude and longitude as a jointly validated coordinate pair. A shared transient error is attached to both inputs, then cleared as soon as either value changes or a valid pin source succeeds.

- AUD-028 preserves field-specific return validation from the server instead of reducing it to the generic action result. Accessory validation is shared across the complete required selector set because the server validates it as one collection.

- AUD-029 assigns an error ID and invalid semantics only when the return-evidence action supplies a field-specific photo error. Generic failure and success result announcements remain independent of the file control.

- AUD-030 treats replacement-photo validation as form-specific despite its shared server action. The action returns the already validated superseded-photo ID only for a photo field error, allowing a dynamic but stable error ID to describe one matching native input without marking the primary uploader invalid.

- AUD-031 treats server validation for hidden schedule fields as an authoritative schedule-reselection event, not a renter-detail error. The returned error is shown with the existing picker URL, and the current form is disabled to prevent a repeated invalid operation until a new schedule identity remounts it.

- AUD-032 preserves the server's constrained reload instruction for a hidden camera/version validation error. It does not attach invalid state to a visible control because none is responsible for correcting authoritative identity data.

- AUD-033 preserves the server's constrained refresh instruction for a hidden replacement-contract booking reference. It does not attach invalid state to a visible control because none is responsible for correcting authoritative identity data.

- AUD-034 preserves the server's constrained invalid-reference result for a hidden booking-decision reference. It does not attach invalid state to the rejection-reason control because that control cannot correct authoritative identity data.

- AUD-035 preserves server-provided refresh instructions for hidden booking and contract-version signing references. It keeps the existing consent-specific field state and result fallback, so a visible checkbox remains responsible only for its own validation.

- AUD-036 treats a payment identity as hidden authoritative context rather than a reconciliation fact. Its refresh instruction is presented from the action state without marking amount, reference, or actual-account controls invalid.

- AUD-037 preserves the cancellation action's existing field-specific message instead of classifying it as operational uncertainty. The visible textarea is the sole responsible control; identity/stale recovery stays at the action-result level.

- AUD-038 separates a visible owner decision reason from hidden cancellation identity validation. This preserves a correctable field error without exposing or attributing invalid state to request, booking, or operation references.

- AUD-039 treats external refund details as distinct, operator-confirmed facts. Identity validation remains hidden and generic, while amount, reference, recipient, and time receive their own bounded correction semantics before any financial mutation.

- AUD-040 separates private issue-note text from hidden operation identity. Only the labelled visible textarea receives correction semantics; identity validation remains generic and does not invite edits to an authoritative reference.

- AUD-041 treats issue-decision values as distinct, operator-confirmed facts. Hidden identity remains generic, while the decision kind, deduction, private rationale, and renter-visible explanation receive their own bounded correction semantics before a financial or lifecycle mutation.

- AUD-042 treats a reversal's refund-record ID as hidden, non-editable context. It is echoed only with visible field errors to scope shared UI state to the submitted form; incoming reference, counterparty, reason, and time receive the correction semantics, while malformed hidden IDs remain generic.

- AUD-043 treats the return-review outcome and IDs as hidden authoritative context, while the review note is the only correctable visible fact. The note receives its own bounded error before any return completion or ISSUE_REVIEW transition.

- AUD-044 uses the PSGC selector's existing semantic fieldset API for a current-barangay recovery instruction, preserving the server's generic treatment of invalid official-area context without inventing a new visible field error.

- AUD-045 keeps rejection-reason recovery on the existing labelled textarea and promotes the returned error to an alert; it does not alter the decision action or its persisted state.

- 2026-09-26: current request authorizes local commits only; older promotion instructions in audit records are historical. Use port 3100 because 3000 belongs to another project. Use the requested existing Chrome profile through the extension, with the personal profile preference stored outside Git.
- AUD-046: ignore only the existing local `.worktrees/` container in lint/test discovery. Preserve Vitest default exclusions and root regression coverage; do not change TypeScript exclusions since its parsed file list contains no nested worktree paths.
- AUD-047: store only complete schedules in the current camera URL using Next's documented native history integration. Read current search parameters once per form mount because Back can reuse cached server props. Keep partial edits in component state and remove old complete recovery values; never create extra history entries or bypass current schedule validation.
- Browser evidence takes precedence over redacted text values: the synthetic phone field appeared empty in automation text but a fresh screenshot confirmed its saved value. This was not recorded as an application defect.
- AUD-048 uses the existing required radio's native validation and focus instead of adding parallel validation state. Keep selected-place and availability guards after validity reporting.
- AUD-049 constrains the mobile grid track rather than hiding overflowing content; existing word wrapping handles valid long references while desktop columns remain unchanged.
- ENV-003 normalizes known business conflicts at the API wrapper, matching existing booking API conventions. Preserve true transaction failures and private function behavior; avoid a racy client pre-read or an increased request timeout. Live PostgREST 14.5 metadata and repeated conflict logs match [Supabase's documented retry-loop mechanism](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Apply the tested migration and history atomically to Development only; query active sessions afterward before considering any targeted cleanup.
- AUD-050 preserves replacement form drafts through the existing explicit action-dispatch pattern used by camera editing. Returned validation failures must not trigger React's uncontrolled-input reset; the server still validates every submitted value and refreshes the persisted agreement after success.
- AUD-051 applies the same narrowly scoped business-conflict API boundary to signing: normalize only three exact private-signer messages, keep invoker privileges and genuine transaction errors, and retain legacy client compatibility. Browser verification uses only the synthetic Development agreement and no payment. A targeted cancellation attempt matched no rows; after migration the retry-session count is zero without any backend termination.
- AUD-052 preserves failed template drafts with explicit dispatch and keeps the previous reset semantics only after success. Browser success verification uses the existing API's identical-active-template idempotency, so test recovery does not create or activate a new template.

- AUD-053 uses explicit action dispatch for the controlled assignment form, keeping visible checkboxes synchronized with its ordered ID list through both success and error. Native resets are inappropriate for a saved configuration editor; server validation and the three-place limit remain unchanged.
- AUD-054 preserves explicit confirmation for an unchanged failed draft, but clears it through React state after successful saves and when any place detail changes. This retains the public-pin requirement and keeps checkbox validity aligned with Save availability.
- AUD-055 preserves GCash drafts with the existing explicit dispatch pattern. Treat the valid-number SQL rejection as a separate backend defect (AUD-056); do not hide it by weakening the shared canonical phone schema.
- AUD-056 repairs the SQL literal-plus match with `[+]` rather than weakening canonical phone normalization or rewriting stored accounts. Preserve the prior function body and privileges. [PostgreSQL pattern documentation](https://www.postgresql.org/docs/17/functions-matching.html) confirms the escape/string-literal distinction; the exact faulty live definition and red/green SQL execution are the decisive evidence. Development form verification saves the same recipient in canonical format; no different account or payment is introduced.
- AUD-057 moves final KYC submission to explicit transition dispatch while preserving native account validation and both checkout step gates. Avoid patching PSGC selection state around React's reset; the parent configuration form must retain its draft as a whole. Server-returned errors still choose the appropriate checkout step.

- AUD-058 treats POST plus `next-action` as a protocol signal only. Session refresh still runs, and each Server Action/page retains authoritative authentication. Returning the existing response preserves refresh cookies/cache headers; no client-supplied header grants protected data or mutations. Installed Next request metadata confirms this fetch-action distinction.

- AUD-059 handles authorization acquisition as a recoverable owner-form boundary across the camera action family. Catch only `requireAdmin`; never catch the mutation or successful Next redirect. Generic recovery wording covers both expired sessions and unavailable verification without exposing provider details or treating a failed check as permission.

- AUD-060 preserves each meetup consumer's existing result shape while handling authorization acquisition separately. Failed owner checks return before budget claims or provider search, and search guidance explains access recovery rather than incorrectly presenting it as a location-provider outage.

## 2026-09-26 — Reconcile audit work with newly merged main

User reported new origin/main changes. Fetched accae35 and created an isolated audit worktree from it; preserved original audit commits through6a31ddc and unrelated notes. Retain main's new location autofill, Profile/rentals routes, idempotent mutation recovery, publication identity, and exact migration bytes. Carry only missing runtime behavior (AUD047/049/053/058/search part of060), tooling exclusions, and conflict/rollback regression coverage. Historical audit entries refer to original audit commits, not claims that every original patch is needed on main.

Photo boundary evidence from the old6MB server limit must be reassessed because main now sets11MB. Hosted ingress remains separately constrained; no obsolete patch or production mutation is authorized by this reconciliation.

## User stop checkpoint

Stopped immediately on “stop and finalize.” Preserve carry-forward work uncommitted because remaining browser checks and final suite are incomplete. Goal paused; no background audit, push, merge, or deployment. Leave local development server available for inspection and retain synthetic renter session; no fixture cleanup pending.

## User-authorized integration after stop

User explicitly requested committing and pushing all audit changes to main. Finish only the pending verification/integration; continuous exploration remains stopped. Reconfirmed origin/main is accae35. Carry residual reviewed changes forward rather than merging obsolete audit implementations over newer features. Use GitHub's protected-main and exact-SHA release path, preserving required checks/review. Unrelated original-checkout notes remain outside this change.

### Integration test-runner concurrency

The mandatory pre-push command used Vitest's default nine workers on this ten-core shared development machine. It failed53 tests across26 files, predominantly5s interaction timeouts and downstream cleanup failures; the same full suite had just passed all1139 tests with one worker and unchanged timeouts/assertions. Make file execution serial in Vitest's default configuration so the mandatory hook uses the proven resource profile. Keep file isolation, all assertions, opt-in skips, and existing timeouts unchanged. Real database concurrency tests remain separate and unchanged.

The serial default rerun also encountered interaction timeouts while the16GB host reported about35GB swap use. Stopped only this audit's confirmed port3100 server after browser checks and interrupted the already-failing redundant verification. A focused follow-up passed7/8 tests, with the stale-meetup review test still exceeding5s. Do not claim these attempts passed or relax assertions/timeouts. The mandatory pre-push gate must complete successfully before upload.
