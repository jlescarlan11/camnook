# Continuous application audit

- Goal: explore, diagnose, fix, verify, and commit useful improvements until stopped.
- Scope: CamNook functionality, journeys, navigation, UI, responsiveness, accessibility, performance, recovery. Preserve established single-owner rental rules. No push, merge, deployment, real payments, or real-user contact authorized.
- Branch: `codex/reliability-audit`; clean at start; starting/latest existing commit `beb1cad`.
- Environment: actual Next.js app at `http://127.0.0.1:3000`, hosted Development only. `pnpm dev` verifies Development credentials, schema discovery, search, and map tiles. Node v25.9.0; installed pnpm reports 11.19.0 (manifest pins 10.33.1).
- Browser: Chrome DevTools is the primary controller, explicitly allowed by the task. Screenshots saved under ignored `.vercel/app-audit/2026-09-25/`; direct tool file writes are unavailable, so returned screenshot bytes are saved locally.
- Baseline: 957 tests passed, two provider integration checks skipped; lint and typecheck passed. Build failed downloading Geist/Geist Mono. Logs: `/tmp/camnook-audit-baseline-{tests,lint,typecheck,build}.log`.
- Latest audit commit: `d98fe5d` (AUD-007).
- Current task: AUD-008 verified; committing checkout read recovery. Stale profile writes time out (ENV-003); valid profile changes persisted.
- Environment finding: initial catalog error coincided with DNS `ENOTFOUND`; later DNS/API succeeded and browser reload recovered. No evidence yet of an application data defect.
- Exact next action: commit AUD-008, then inspect remaining account/profile recovery and catalog edge states. Owner identity question pending; ENV-003 requires backend diagnostics. Dev server session57959 uses ignored DNS fallback after successful standard checks; fault injection is stopped.
- Browser page3: checkout address step after successful read retry; latest saved synthetic booking `3f7bdcc3-357b-4b0b-a048-a194694411e2` from lost-response recovery. Page4: account shows exactly three fixture bookings. `2cca073b-1844-43ac-9085-c701e656a2be` now has pending cancellation; older original fixture unchanged.
- Blockers: owner lifecycle awaits existing Development owner account identity (async question pending). Management connector returns permission denied; dashboard is signed out. No overall blocker. Automated browser fails the real Cloudflare challenge; verify its recovery without bypassing it. Existing supported development session script establishes real Development auth without email.
- Current checks: AUD-008 targeted15 tests, lint, build passed. Prior full suite977 tests passed, two skipped in final full serial suite; lint and build (including type checking) passed. Logs `/tmp/camnook-audit-draft-final-{suite,lint}.log` and `/tmp/camnook-audit-draft-build.log`.
- Fixture: supported `pnpm dev:renter` succeeded; synthetic profile refreshed. Session established using `scripts/development-session.mjs`; no credentials in records.

Historical `.codex-audit/` reports are discovery leads only, not current verification evidence. User supplied current continuous-audit instructions supersede their speculative recommendations.
