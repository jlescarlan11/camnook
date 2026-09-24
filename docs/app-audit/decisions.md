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
