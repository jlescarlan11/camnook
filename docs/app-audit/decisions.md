# Decisions

- Resume clean existing `codex/reliability-audit` branch; preserve all existing commits.
- Use `docs/app-audit/` for compact persistent state and ignored `.vercel/app-audit/` for bulky screenshots. Do not save credentials or private user data.
- Treat current README's in-person ID policy as superseding retired online-ID requirements in the original MVP policy. Do not introduce lender onboarding: this is a single-owner business.
- No visual redesign or speculative features. Prioritize reproducible blocked tasks and recovery issues.
- Existing environment and supported development session/fixture scripts are preferred over new infrastructure.
- AUD-001 follows Cloudflare's documented widget reset API; no CAPTCHA bypass or hosted auth setting changes. References: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/ and https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/ .
