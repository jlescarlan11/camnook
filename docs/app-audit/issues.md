# Issues

## ENV-001 — Intermittent external DNS failure
- Evidence: first catalog browser render showed a loading error; direct public RPC request failed with `ENOTFOUND`. Subsequent DNS lookup and same RPC returned HTTP 200, and browser reload displayed catalog.
- Impact: guest cannot begin booking while network is unavailable.
- Status: environment recovered; investigating retry journey before proposing application changes.
- Acceptance: recovery control performs a fresh request and restores catalog when service recovers.
- Evidence: ignored `.vercel/app-audit/2026-09-25/01-catalog-error.png`.
- Commit: none.

## ENV-002 — Baseline build cannot download Google Fonts
- Reproduction: `pnpm build` at starting revision.
- Evidence: `/tmp/camnook-audit-baseline-build.log`; Geist and Geist Mono network download errors. Development uses fallback fonts.
- Impact: production build verification blocked in this environment.
- Status: recovered with network; unmodified build retry passed. First fix's full build also passed.
- Acceptance: unmodified required build succeeds, or verified maintainable font-loading fix preserves typography.
- Commit: none.

## AUD-001 — CAPTCHA failure requires losing form state on refresh
- Severity: P2. Sign-in and resend share the affected challenge component.
- Reproduction: enter sign-in from selected rental dates; Cloudflare challenge fails; only recovery message instructs full-page refresh, discarding the email draft.
- Cause: widget errors clear the token but expose no existing-widget reset control.
- Acceptance: error/expiry offers an accessible retry; resetting preserves email and checkout destination; stale tokens stay cleared and submission stays disabled until a fresh token arrives. Script-load failure retains refresh guidance because no widget exists to reset.
- Fix: shared reset handler and retry button for rendered widget failures/expiry; expired feedback visible.
- Verification: two regression tests failed before fix and passed after. Full suite 959 passed / two skipped; lint, typecheck, build passed. Independent review found no actionable issues. Real Cloudflare failure/retry exercised: iframe restarted, email and checkout URL preserved, submission disabled. Provider continues rejecting this automated browser; successful provider challenge and OTP delivery are not claimed. Tests simulate fresh-token and expiry callbacks.
- Visuals: `03-signin-challenge-error.png`, `04-signin-retry-mobile.png` (actual 500 CSS px), `05-signin-retry-390.png` (390×844 mobile emulation) under ignored evidence directory. Desktop Lighthouse snapshot 30 passed / zero failed, accessibility 100; this is not a conformance audit.
- Status: verified scoped fix, ready to commit.
- Commit: recorded by `git log --grep='Allow retrying failed security checks without losing sign-in drafts'`.
