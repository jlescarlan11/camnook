# Continuous application audit

- Goal: explore, diagnose, fix, verify, and commit useful improvements until stopped.
- Scope: CamNook functionality, journeys, navigation, UI, responsiveness, accessibility, performance, recovery. Preserve established single-owner rental rules. No push, merge, deployment, real payments, or real-user contact authorized.
- Branch: `codex/reliability-audit`; clean at start; starting/latest existing commit `beb1cad`.
- Environment: actual Next.js app at `http://127.0.0.1:3000`, hosted Development only. `pnpm dev` verifies Development credentials, schema discovery, search, and map tiles. Node v25.9.0; installed pnpm reports 11.19.0 (manifest pins 10.33.1).
- Browser: Chrome DevTools is the primary controller, explicitly allowed by the task. Screenshots saved under ignored `.vercel/app-audit/2026-09-25/`; direct tool file writes are unavailable, so returned screenshot bytes are saved locally.
- Baseline: 957 tests passed, two provider integration checks skipped; lint and typecheck passed. Build failed downloading Geist/Geist Mono. Logs: `/tmp/camnook-audit-baseline-{tests,lint,typecheck,build}.log`.
- Current task: AUD-001 verified; committing CAPTCHA retry. Then continue authenticated checkout as synthetic renter.
- Environment finding: initial catalog error coincided with DNS `ENOTFOUND`; later DNS/API succeeded and browser reload recovered. No evidence yet of an application data defect.
- Exact next action: browser page 2 has a real synthetic Development renter session; open the selected September 26–28 checkout and verify profile/meetup/request flow.
- Blockers: no overall blocker. Automated browser fails the real Cloudflare challenge; verify its recovery without bypassing it. Existing supported development session script establishes real Development auth without email.
- Current checks: 959 tests passed, two skipped; lint, typecheck, build passed. Unmodified build retry also passed after network recovered. Logs `/tmp/camnook-audit-captcha-{suite,lint,typecheck,build}.log`.
- Fixture: supported `pnpm dev:renter` succeeded; synthetic profile refreshed. Session established using `scripts/development-session.mjs`; no credentials in records.

Historical `.codex-audit/` reports are discovery leads only, not current verification evidence. User supplied current continuous-audit instructions supersede their speculative recommendations.
