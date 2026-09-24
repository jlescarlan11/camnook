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
